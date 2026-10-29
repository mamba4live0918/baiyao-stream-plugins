"""Render a VDB explosion sequence into flipbook frames with Blender (Cycles).

Usage (run from the project folder):
  blender -b --factory-startup --python-exit-code 1 -P tools/render-vdb-flipbook.py -- \
      <vdb-dir> <out-dir> [--inspect] [--frames 64] [--size 256] [--samples 64] [--only 0,20,40]
      [--range 2,72] [--ortho 320] [--lift 0.12]

Settings used for the demo: --range 2,72 --ortho 320 --lift 0.12 (env VDB_SMOKE=0.3).

--inspect prints grid names, value ranges and bounds for a few frames and exits.
Frames are written as frame_000.png ... with a transparent background.
"""
import math
import os
import re
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:]
    opts = {"vdb_dir": argv[0], "out_dir": argv[1], "inspect": "--inspect" in argv,
            "frames": 64, "size": 256, "samples": 64, "only": None, "ortho": 0.0}
    for key in ("frames", "size", "samples"):
        flag = f"--{key}"
        if flag in argv:
            opts[key] = int(argv[argv.index(flag) + 1])
    if "--ortho" in argv:
        opts["ortho"] = float(argv[argv.index("--ortho") + 1])
    # Smoke rises, so the camera can be lifted by a fraction of the frame height.
    opts["lift"] = float(argv[argv.index("--lift") + 1]) if "--lift" in argv else 0.0
    # Use only part of the simulation, e.g. --range 2,72 (late frames hit the sim box).
    opts["range"] = [int(v) for v in argv[argv.index("--range") + 1].split(",")] if "--range" in argv else None
    if "--only" in argv:
        opts["only"] = [int(v) for v in argv[argv.index("--only") + 1].split(",")]
    return opts


def frame_files(vdb_dir):
    files = [f for f in os.listdir(vdb_dir) if f.lower().endswith(".vdb")]
    number = lambda f: int(re.findall(r"(\d+)\.vdb$", f, re.IGNORECASE)[0])
    return [os.path.join(vdb_dir, f) for f in sorted(files, key=number)]


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return lo, hi


def load_frame(volume, obj, path):
    volume.filepath = path
    volume.grids.load()
    bpy.context.view_layer.update()
    return world_bounds(obj)


def inspect(files, volume, obj):
    for index in sorted({0, len(files) // 8, len(files) // 4, len(files) // 2, len(files) - 1}):
        lo, hi = load_frame(volume, obj, files[index])
        print(f"frame {index}: bounds {tuple(round(v, 2) for v in lo)} .. {tuple(round(v, 2) for v in hi)}")
        for grid in volume.grids:
            grid.load()
            print(f"   grid {grid.name!r} type={grid.data_type} channels={grid.channels}")


def build_material():
    mat = bpy.data.materials.new("explosion")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    vol = nodes.new("ShaderNodeVolumePrincipled")
    grey = float(os.environ.get("VDB_SMOKE", "0.22"))
    vol.inputs["Color"].default_value = (grey, grey * 0.93, grey * 0.86, 1.0)
    vol.inputs["Density"].default_value = 6.0
    vol.inputs["Density Attribute"].default_value = "density"
    vol.inputs["Anisotropy"].default_value = 0.25

    heat = nodes.new("ShaderNodeAttribute")
    heat.attribute_type = "GEOMETRY"
    heat.attribute_name = os.environ.get("VDB_HEAT_GRID", "temperature")
    remap = nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = float(os.environ.get("VDB_HEAT_MIN", "0.15"))
    remap.inputs["From Max"].default_value = float(os.environ.get("VDB_HEAT_MAX", "1.0"))
    ramp = nodes.new("ShaderNodeValToRGB")
    stops = ramp.color_ramp.elements
    stops[0].position = 0.0
    stops[0].color = (0.0, 0.0, 0.0, 1.0)
    stops[1].position = 1.0
    stops[1].color = (1.0, 0.95, 0.85, 1.0)
    for pos, color in ((0.25, (0.45, 0.04, 0.0, 1.0)), (0.5, (1.0, 0.28, 0.02, 1.0)), (0.75, (1.0, 0.62, 0.15, 1.0))):
        stop = stops.new(pos)
        stop.color = color
    strength = nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = float(os.environ.get("VDB_EMISSION", "40"))

    links.new(heat.outputs["Fac"], remap.inputs["Value"])
    links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], vol.inputs["Emission Color"])
    links.new(remap.outputs["Result"], strength.inputs[0])
    links.new(strength.outputs["Value"], vol.inputs["Emission Strength"])
    links.new(vol.outputs["Volume"], out.inputs["Volume"])
    return mat


def enable_gpu(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for device_type in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = device_type
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == device_type]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == device_type
            scene.cycles.device = "GPU"
            print(f"render device: {device_type} ({', '.join(d.name for d in gpus)})")
            return
    scene.cycles.device = "CPU"
    print("render device: CPU")


def main():
    opts = parse_args()
    files = frame_files(opts["vdb_dir"])
    if not files:
        raise SystemExit(f"no .vdb files in {opts['vdb_dir']}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    volume = bpy.data.volumes.new("explosion")
    obj = bpy.data.objects.new("explosion", volume)
    scene.collection.objects.link(obj)

    if opts["inspect"]:
        inspect(files, volume, obj)
        return

    count = opts["frames"]
    first, last = opts["range"] or (0, len(files) - 1)
    picks = [round(first + i * (last - first) / (count - 1)) for i in range(count)]

    # Frame the camera on where the explosion starts, wide enough for every frame.
    origin_lo, origin_hi = load_frame(volume, obj, files[picks[1]])
    origin = (origin_lo + origin_hi) / 2
    reach = 0.0
    for index in picks:
        lo, hi = load_frame(volume, obj, files[index])
        reach = max(reach, *(abs(v) for v in (lo - origin)), *(abs(v) for v in (hi - origin)))
    print(f"origin {tuple(round(v, 2) for v in origin)} reach {reach:.2f}")

    obj.data.materials.append(build_material())

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    # Volume bounds include near-empty voxels, so an explicit --ortho frames tighter.
    cam_data.ortho_scale = opts["ortho"] or reach * 2.1
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = origin + Vector((0.0, -reach * 6.0, cam_data.ortho_scale * opts["lift"]))
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    cam_data.clip_end = reach * 20
    scene.camera = cam

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 4.0
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(55), math.radians(-35), math.radians(25))
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new("world")
    world.color = (0.0, 0.0, 0.0)
    scene.world = world

    scene.render.engine = "CYCLES"
    enable_gpu(scene)
    scene.cycles.samples = opts["samples"]
    scene.cycles.use_denoising = True
    scene.cycles.volume_max_steps = 1024
    scene.render.film_transparent = True
    scene.render.resolution_x = opts["size"]
    scene.render.resolution_y = opts["size"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    os.makedirs(opts["out_dir"], exist_ok=True)

    targets = opts["only"] if opts["only"] is not None else range(count)
    for i in targets:
        load_frame(volume, obj, files[picks[i]])
        scene.render.filepath = os.path.join(opts["out_dir"], f"frame_{i:03d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered frame {i} (vdb {picks[i]})")


main()
