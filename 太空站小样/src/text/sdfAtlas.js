// Signed-distance-field glyph atlas generated at runtime from loaded web fonts.
// Swapping a glyph is just a UV change, which is what makes the scramble cheap.
import TinySDF from '@mapbox/tiny-sdf';
import { DataTexture, LinearFilter, RedFormat, UnsignedByteType } from 'three';

const ATLAS_SIZE = 2048;
const BUFFER = 10;
const RADIUS = 12;
const CUTOFF = 0.25; // edge sits at 1 - CUTOFF = 0.75 in the shader

export class SdfAtlas {
  constructor(fonts) {
    this.data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE);
    this.texture = new DataTexture(this.data, ATLAS_SIZE, ATLAS_SIZE, RedFormat, UnsignedByteType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    this.fonts = {};
    for (const [key, font] of Object.entries(fonts)) {
      this.fonts[key] = {
        fontSize: font.fontSize,
        sdf: new TinySDF({
          fontSize: font.fontSize,
          buffer: BUFFER,
          radius: RADIUS,
          cutoff: CUTOFF,
          fontFamily: font.family,
          fontWeight: font.weight || '400',
        }),
      };
    }
    this.glyphs = new Map();
    this.cursorX = 1;
    this.cursorY = 1;
    this.rowHeight = 0;
    this.dirty = false;
  }

  glyph(fontKey, char) {
    const id = `${fontKey}\u0000${char}`;
    const cached = this.glyphs.get(id);
    if (cached) return cached;

    const font = this.fonts[fontKey];
    if (!font) throw new Error(`Unknown font "${fontKey}"`);
    const raw = font.sdf.draw(char);
    const g = {
      width: raw.width,
      height: raw.height,
      glyphTop: raw.glyphTop,
      glyphLeft: raw.glyphLeft,
      advance: raw.glyphAdvance,
      fontSize: font.fontSize,
      buffer: BUFFER,
      empty: raw.glyphWidth === 0 || raw.glyphHeight === 0,
      u0: 0,
      v0: 0,
      u1: 0,
      v1: 0,
    };
    if (!g.empty) this.pack(raw, g);
    this.glyphs.set(id, g);
    return g;
  }

  pack(raw, g) {
    if (this.cursorX + raw.width + 1 > ATLAS_SIZE) {
      this.cursorX = 1;
      this.cursorY += this.rowHeight + 1;
      this.rowHeight = 0;
    }
    if (this.cursorY + raw.height + 1 > ATLAS_SIZE) {
      console.warn('SDF atlas is full; glyph skipped');
      g.empty = true;
      return;
    }
    for (let row = 0; row < raw.height; row++) {
      const src = raw.data.subarray(row * raw.width, (row + 1) * raw.width);
      this.data.set(src, (this.cursorY + row) * ATLAS_SIZE + this.cursorX);
    }
    g.u0 = this.cursorX / ATLAS_SIZE;
    g.v0 = this.cursorY / ATLAS_SIZE;
    g.u1 = (this.cursorX + raw.width) / ATLAS_SIZE;
    g.v1 = (this.cursorY + raw.height) / ATLAS_SIZE;
    this.cursorX += raw.width + 1;
    this.rowHeight = Math.max(this.rowHeight, raw.height);
    this.dirty = true;
  }

  ensure(fontKey, text) {
    for (const char of text) this.glyph(fontKey, char);
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }
}
