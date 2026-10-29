// Pure text layout. Units are whatever `size` is in (CSS pixels for the HUD).
// y points up and the top edge of the block is y = 0, so lines go negative.

export function layoutText(text, { glyph, size, letterSpacing = 0, lineHeight = 1.3, align = 'left' }) {
  const chars = [];
  const lines = String(text).split('\n');
  const advanceY = size * lineHeight;
  const spacing = letterSpacing * size;
  let width = 0;

  lines.forEach((line, lineIndex) => {
    const start = chars.length;
    const baseline = -size * 0.9 - lineIndex * advanceY;
    let pen = 0;
    for (const char of line) {
      const g = glyph(char);
      const scale = size / g.fontSize;
      chars.push({ char, pen, baseline, scale, line: lineIndex, glyph: g });
      pen += g.advance * scale + spacing;
    }
    const lineWidth = chars.length > start ? pen - spacing : 0;
    const shift = align === 'right' ? -lineWidth : align === 'center' ? -lineWidth / 2 : 0;
    for (let i = start; i < chars.length; i++) chars[i].pen += shift;
    width = Math.max(width, lineWidth);
  });

  return { chars, width, height: lines.length * advanceY };
}

// Quad (top-left x/y, width, height) that holds a glyph's SDF bitmap, which
// includes `buffer` pixels of padding on every side.
export function glyphQuad(pen, baseline, scale, g) {
  return {
    x: pen + (g.glyphLeft - g.buffer) * scale,
    y: baseline + (g.glyphTop + g.buffer) * scale,
    w: g.width * scale,
    h: g.height * scale,
  };
}
