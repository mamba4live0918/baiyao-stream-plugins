"""为说明书生成 TrueType 中文字体（云端没有微软雅黑时使用）。

reportlab 只能嵌入 TrueType 轮廓，思源黑体（Noto Sans CJK）是 CFF 轮廓，所以先按说明书用到的字做子集，
再把曲线转换成 TrueType。用法：python tools/make_guide_fonts.py  （改了说明书文字后重跑一次）。
"""
from pathlib import Path
import sys
from fontTools.ttLib import TTFont, newTable
from fontTools.subset import Subsetter, Options
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {'Regular': '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'Bold': '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'}
text = (ROOT / 'make_guide.py').read_text(encoding='utf-8') + ''.join(chr(i) for i in range(32, 127)) + '…·—–“”「」（）：；，。、？！《》①②③④⑤×→'


def to_truetype(font):
    glyph_order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    glyf = newTable('glyf'); glyf.glyphOrder = glyph_order; glyf.glyphs = {}
    for name in glyph_order:
        pen = TTGlyphPen(None)
        glyph_set[name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        glyf[name] = pen.glyph()
    font['glyf'] = glyf
    font['loca'] = newTable('loca')
    del font['CFF ']
    if 'VORG' in font: del font['VORG']
    font['maxp'] = newTable('maxp'); maxp = font['maxp']
    maxp.tableVersion = 0x00010000
    for attr in ('maxZones', 'maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs', 'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements'):
        setattr(maxp, attr, 0)
    maxp.maxZones = 1
    font['head'].indexToLocFormat = 0
    font['head'].glyphDataFormat = 0
    font['post'].formatType = 2.0
    font['post'].extraNames = []
    font['post'].mapping = {}
    font['post'].glyphOrder = glyph_order
    font.sfntVersion = '\x00\x01\x00\x00'
    return font


for weight, path in SOURCES.items():
    font = TTFont(path, fontNumber=2)  # 2 = 简体中文（SC）
    options = Options(); options.layout_features = []; options.notdef_outline = True; options.name_IDs = ['*']
    subsetter = Subsetter(options); subsetter.populate(text=text); subsetter.subset(font)
    to_truetype(font)
    out = ROOT / 'tools' / 'fonts' / f'GuideSans-{weight}.ttf'
    font.save(out)
    print(out, out.stat().st_size)
