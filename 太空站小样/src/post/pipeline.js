// Render pipeline: camera A and/or B into MSAA HDR targets, signal-loss mix,
// bloom, tone mapping, then the final grade straight to the screen.
import { HalfFloatType, ShaderMaterial, UniformsUtils, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FinalShader, TransitionShader } from './shaders.js';

class DualViewPass extends Pass {
  constructor(scene, cameraA, cameraB) {
    super();
    this.scene = scene;
    this.cameraA = cameraA;
    this.cameraB = cameraB;
    const options = { type: HalfFloatType, samples: 4 };
    this.targetA = new WebGLRenderTarget(1, 1, options);
    this.targetB = new WebGLRenderTarget(1, 1, options);
    this.material = new ShaderMaterial({
      uniforms: UniformsUtils.clone(TransitionShader.uniforms),
      vertexShader: TransitionShader.vertexShader,
      fragmentShader: TransitionShader.fragmentShader,
    });
    this.quad = new FullScreenQuad(this.material);
    this.needsSwap = false; // writes into readBuffer, like RenderPass
    this.state = { transition: 0, needA: true, needB: false, time: 0, strength: 1 };
  }

  setSize(width, height) {
    this.targetA.setSize(width, height);
    this.targetB.setSize(width, height);
    this.material.uniforms.uResolution.value.set(width, height);
  }

  render(renderer, writeBuffer, readBuffer) {
    const s = this.state;
    if (s.needA) {
      renderer.setRenderTarget(this.targetA);
      renderer.clear();
      renderer.render(this.scene, this.cameraA);
    }
    if (s.needB) {
      renderer.setRenderTarget(this.targetB);
      renderer.clear();
      renderer.render(this.scene, this.cameraB);
    }
    const u = this.material.uniforms;
    u.tA.value = this.targetA.texture;
    u.tB.value = this.targetB.texture;
    u.uT.value = s.transition;
    u.uTime.value = s.time;
    u.uStrength.value = s.strength;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.targetA.dispose();
    this.targetB.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

export function createPipeline(renderer, scene, cameraA, cameraB) {
  const composer = new EffectComposer(renderer);
  const dual = new DualViewPass(scene, cameraA, cameraB);
  // Threshold 1.0: only genuinely HDR pixels (sun, fire cores, emissive) bloom.
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.5, 1.0);
  const output = new OutputPass();
  const final = new ShaderPass(FinalShader);
  composer.addPass(dual);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(final);

  return {
    // HDR target the scene renders into; compile shaders against it so the
    // precompiled variants (linear, no tone mapping) are the ones actually used.
    sceneTarget: dual.targetA,
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      final.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    },
    render({ transition, needA, needB, time, flash, alert, strength }) {
      Object.assign(dual.state, { transition, needA, needB, time, strength });
      final.uniforms.uTime.value = time;
      final.uniforms.uFlash.value = flash;
      final.uniforms.uAlert.value = alert;
      composer.render();
    },
  };
}
