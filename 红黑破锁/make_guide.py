from argparse import ArgumentParser
from io import BytesIO
from pathlib import Path
from unicodedata import category
import json
import re

import matplotlib
from fontTools.ttLib import TTFont as FontFile
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.textsplit import ALL_CANNOT_END, ALL_CANNOT_START
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.platypus import paragraph as rl_paragraph

ROOT = Path(__file__).resolve().parent
VERSION = 'V2.4'
RELEASE_DATE = '2026-10-30'
PAGES = 12
# 配图由 E:/红黑破锁QA临时/菜单重做/scripts/guide-shots.cjs 从 V2.4 的 HTML 拍（没有光标；直播画面是透明底）
SHOT_DIR = ROOT / 'qa/2026-10-30-V2.4-说明书配图'
SCREENSHOTS = json.loads((SHOT_DIR / 'guide-shots.json').read_text(encoding='utf-8'))

parser = ArgumentParser(description='生成红黑破锁 V2.4 使用说明')
parser.add_argument('--output', type=Path, default=ROOT / '使用说明.pdf')
parser.add_argument('--draft', action='store_true', help='文稿预览：页脚标「文稿预览」，不能覆盖正式 使用说明.pdf')
args = parser.parse_args()
OUTPUT = args.output.resolve()
if args.draft and OUTPUT == (ROOT / '使用说明.pdf').resolve():
    raise SystemExit('文稿不得覆盖正式 使用说明.pdf；请指定临时 --output')

# 正文用站酷快乐体（OFL，可以分发，不嵌 Windows 自带字体）。
# 它没有 ①～⑧ ▶ ✕ →，这几个符号换 DejaVu Sans 画（许可允许嵌入，许可证附在 PDF 里）。
FONT = ROOT / 'assets/fonts/ZCOOLKuaiLe-Regular.ttf'
FONT_LICENSE = ROOT / 'assets/fonts/ZCOOLKuaiLe-OFL.txt'
SYMBOL_FONT = Path(matplotlib.get_data_path()) / 'fonts/ttf/DejaVuSans.ttf'
SYMBOL_LICENSE = Path(matplotlib.get_data_path()) / 'fonts/ttf/LICENSE_DEJAVU'
pdfmetrics.registerFont(TTFont('KUAILE', str(FONT)))
pdfmetrics.registerFontFamily('KUAILE', normal='KUAILE', bold='KUAILE', italic='KUAILE', boldItalic='KUAILE')
pdfmetrics.registerFont(TTFont('SYM', str(SYMBOL_FONT)))
SYMBOLS = '①②③④⑤⑥⑦⑧▶✕→'
BODY_GLYPHS = set(FontFile(str(FONT)).getBestCmap())
SYMBOL_GLYPHS = set(FontFile(str(SYMBOL_FONT)).getBestCmap())
TAGS = re.compile(r'<[^>]+>')

W, H = A4
RED, DARK = HexColor('#9B2740'), HexColor('#241721')
MUTED, PALE, LINE = HexColor('#6E5A63'), HexColor('#F7EFF1'), HexColor('#E2D0D6')
LOWEST_CONTENT = 64
page_bottoms = []


def markup(value):
    """检查每个字两种字体里至少有一个有（缺字会印成空白），再把符号换成 DejaVu Sans。"""
    for ch in TAGS.sub('', value).replace('&amp;', '&'):
        if ch in SYMBOLS:
            if ord(ch) not in SYMBOL_GLYPHS:
                raise ValueError(f'符号字体里没有：{ch}')
        elif ord(ch) not in BODY_GLYPHS and not ch.isspace():
            raise ValueError(f'正文字体里没有这个字：{ch}（U+{ord(ch):04X}）')
    return re.sub(f'[{SYMBOLS}]', lambda m: f'<font name="SYM">{m.group(0)}</font>', value)


# 中文换行：逗号句号、右括号不放行首，左括号不放行尾。
# reportlab 自带的规则漏了全角逗号这些，两个标点连着时还会把第二个甩到下一行开头。
NO_LINE_START = set(ALL_CANNOT_START) | set('，；：？！、。）」』】》〉’”…·～')
NO_LINE_END = set(ALL_CANNOT_END) | set('（「『【《〈‘“')


def glyph_width(u, max_width):
    w = u.width
    if hasattr(w, 'normalizedValue'):
        w._normalizer = max_width
        w = w.normalizedValue(max_width)
    return w


def bad_break(chars, cut):
    """在 chars[cut] 前面换行，会不会让标点打头、左括号落单（空格不算）。"""
    after = before = ''
    for ch in chars[cut:]:
        if not ch:  # <br/>
            break
        if not ch.isspace():
            after = ch
            break
    for ch in reversed(chars[:cut]):
        if ch and not ch.isspace():
            before = ch
            break
    return after in NO_LINE_START or before in NO_LINE_END


def kinsoku_split(frags, max_widths):
    """照 reportlab 的 cjkFragSplit 一个字一个字排，只改换行的地方：英文单词整个挪到下一行；
    会让标点打头或左括号落在行尾时，把前面的字一起挪下去（不往页边外挂）。"""
    chars = []
    for frag in frags:
        value = frag.text.decode('utf8') if isinstance(frag.text, bytes) else frag.text
        chars.extend([rl_paragraph.cjkU(ch, frag, 'utf8') for ch in value] if value else [rl_paragraph.cjkU(value, frag, 'utf8')])
    lines, i, start, used, max_width = [], 0, 0, 0, max_widths[0]
    while i < len(chars):
        u = chars[i]
        i += 1
        used += glyph_width(u, max_width)
        line_break = hasattr(u.frag, 'lineBreak')
        if not line_break and not (used > max_width + rl_paragraph._FUZZ and used > 0):
            continue
        if not line_break and i > start + 1:
            cut = i - 1
            if u and ord(u) < 0x3000:  # 英文、数字：退到前一个空格或汉字后面
                for j in range(i - 2, (start + i) >> 1, -1):
                    if chars[j] and (category(chars[j]) == 'Zs' or ord(chars[j]) >= 0x3000):
                        cut = j + 1
                        break
            while cut > start + 1 and bad_break(chars, cut):
                cut -= 1
            i = cut
            used = sum(glyph_width(chars[k], max_width) for k in range(start, i))
        lines.append(rl_paragraph.makeCJKParaLine(chars[start:i], max_width, used, max_width - used, line_break, False))
        max_width = max_widths[min(len(lines), len(max_widths) - 1)]
        start, used = i, 0
    if used > 0:
        lines.append(rl_paragraph.makeCJKParaLine(chars[start:], max_width, used, max_width - used, False, False))
    return rl_paragraph.ParaLines(kind=1, lines=lines)


class KinsokuParagraph(Paragraph):
    """所有段落都用 kinsoku_split 换行（reportlab 对只有一种字体的段落另用一套，也不管标点）。"""

    def breakLinesCJK(self, maxWidths):
        if not self.frags:
            return super().breakLinesCJK(maxWidths)
        self.height = 0
        return kinsoku_split(self.frags, list(maxWidths) if isinstance(maxWidths, (list, tuple)) else [maxWidths])


def paragraph(value, paragraph_style, width):
    """排好一段，再逐行检查换行规则（排不开就报错，不印出来）。"""
    block = KinsokuParagraph(markup(value), paragraph_style)
    _, height = block.wrap(width, H)
    for line in block.blPara.lines:
        shown = ''.join(getattr(word, 'text', '') for word in getattr(line, 'words', [])).strip()
        if shown and (shown[0] in NO_LINE_START or shown[-1] in NO_LINE_END):
            raise ValueError(f'第 {len(page_bottoms)+1} 页换行不对：{shown}')
    return block, height


def style(size, leading, color=DARK, name='body'):
    return ParagraphStyle(name, fontName='KUAILE', fontSize=size, leading=leading, textColor=color, wordWrap='CJK')


def text(c, value, x, top, width, size=10.5, leading=18, color=DARK):
    block, height = paragraph(value, style(size, leading, color), width)
    bottom = top - height
    if bottom < LOWEST_CONTENT:
        raise ValueError(f'第 {len(page_bottoms)+1} 页低于页脚安全线：{bottom:.1f}')
    block.drawOn(c, x, bottom)
    return bottom


def para(c, value, y, gap=13, size=10.5, leading=18):
    return text(c, value, 48, y, W-96, size, leading) - gap


def heading(c, label, top):
    c.setFillColor(RED)
    c.roundRect(48, top-25, 5, 23, 2, stroke=0, fill=1)
    text(c, label, 63, top, W-111, 14, 22, DARK)
    return top-40


def start(c, title, subtitle=None):
    y = heading(c, title, H-61)
    if subtitle:
        y = para(c, subtitle, y, 16, 10, 17)
    return y


def finish(c, page, bottom):
    page_bottoms.append(round(bottom, 1))
    c.setStrokeColor(LINE)
    c.line(48, 47, W-48, 47)
    c.setFont('KUAILE', 8)
    c.setFillColor(MUTED)
    suffix = ' · 文稿预览' if args.draft else ''
    c.drawString(48, 30, f'红黑破锁 · {VERSION} · {RELEASE_DATE}{suffix}')
    c.drawRightString(W-48, 30, f'{page} / {PAGES}')
    if page < PAGES:
        c.showPage()


def note(c, label, value, y):
    block, height = paragraph(value, style(10, 17, name='note'), W-202)
    box_height = max(50, height+26)
    bottom = y-box_height
    if bottom < LOWEST_CONTENT:
        raise ValueError(f'第 {len(page_bottoms)+1} 页提示框溢出：{bottom:.1f}')
    c.setFillColor(PALE)
    c.roundRect(48, bottom, W-96, box_height, 7, stroke=0, fill=1)
    text(c, label, 62, y-12, 80, 10, 17, RED)
    block.drawOn(c, 137, y-12-height)
    return bottom-16


def checker(c, x, bottom, width, height, tile=10):
    """直播画面是透明底：用浅灰棋盘格标出透明的地方，不给插件添背景。"""
    c.saveState()
    clip = c.beginPath()
    clip.rect(x, bottom, width, height)
    c.clipPath(clip, stroke=0, fill=0)
    c.setFillColor(HexColor('#F6F3F5'))
    c.rect(x, bottom, width, height, stroke=0, fill=1)
    c.setFillColor(HexColor('#E4DFE3'))
    for col in range(int(width/tile)+1):
        for row in range(int(height/tile)+1):
            if (col+row) % 2 == 0:
                c.rect(x+col*tile, bottom+row*tile, tile, tile, stroke=0, fill=1)
    c.restoreState()


def place(c, key, x, top, width, height):
    """把一张截图等比缩放、居中放进 (x, top, width, height) 的框里。"""
    path = Path(SCREENSHOTS.get(key, ''))
    if not path.is_file():
        raise FileNotFoundError(f'截图不存在：{key} → {path}')
    if top-height < LOWEST_CONTENT:
        raise ValueError(f'第 {len(page_bottoms)+1} 页截图区域溢出：{key}')
    image = ImageReader(str(path))
    iw, ih = image.getSize()
    scale = min(width/iw, height/ih)
    dw, dh = iw*scale, ih*scale
    dx, bottom = x+(width-dw)/2, top-height+(height-dh)/2
    if key.startswith('stage_'):
        checker(c, dx, bottom, dw, dh)
    c.drawImage(image, dx, bottom, dw, dh, mask='auto')


def screenshot(c, key, caption, y, height):
    c.setFillColor(HexColor('#F1ECEF'))
    c.roundRect(48, y-height, W-96, height, 7, stroke=0, fill=1)
    place(c, key, 52, y-4, W-104, height-8)
    return text(c, caption, 48, y-height-8, W-96, 9, 15, MUTED)-18


def grid(c, items, y, cell_height, cols=2, gap=12):
    """几张图排成格子，每张上面一行小标题。"""
    cell_width = (W-96-gap*(cols-1))/cols
    for start_index in range(0, len(items), cols):
        row = items[start_index:start_index+cols]
        for col, (key, label) in enumerate(row):
            x = 48+col*(cell_width+gap)
            text(c, label, x, y, cell_width, 10, 16, RED)
            c.setFillColor(HexColor('#F1ECEF'))
            c.roundRect(x, y-20-cell_height, cell_width, cell_height, 6, stroke=0, fill=1)
            place(c, key, x+3, y-23, cell_width-6, cell_height-6)
        y -= 20+cell_height+gap
    return y-8


def table(c, headers, rows, widths, y, size=10, leading=17, pad=18):
    x0 = 48
    for index, row in enumerate([headers]+rows):
        blocks, heights = [], []
        for value, width in zip(row, widths):
            block, height = paragraph(value, style(size, leading, name='cell'), width-20)
            blocks.append(block)
            heights.append(height)
        row_height = max(heights)+pad
        if y-row_height < LOWEST_CONTENT:
            raise ValueError(f'第 {len(page_bottoms)+1} 页表格溢出')
        c.setFillColor(PALE if index == 0 else HexColor('#FFFFFF'))
        c.rect(x0, y-row_height, sum(widths), row_height, stroke=0, fill=1)
        c.setStrokeColor(LINE)
        c.line(x0, y-row_height, x0+sum(widths), y-row_height)
        x = x0
        for block, height, width in zip(blocks, heights, widths):
            block.drawOn(c, x+10, y-pad/2-height)
            x += width
        y -= row_height
    return y-18


OUTPUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUTPUT), pagesize=A4)
c.setTitle(f'红黑破锁 {VERSION} 使用说明')
c.setAuthor('红黑破锁')
c.setSubject('透明直播互动：观众送礼加挑战，主播连按一个键解开；两种玩法（进度条 / 次数）× 两种画面（锁链 / 牢笼）')

# 1 介绍
y = start(c, '红黑破锁 V2.4', '观众送礼加挑战，你一下一下连按一个键解开 · 两种玩法 × 两种画面，随便搭')
y = para(c, '观众送礼物，你要按的就变多；你一下一下地按同一个键，把锁链或者笼子解开。观众也能送礼捣乱（翻倍、按键失灵），或者送礼帮你（帮按、减半、马上全部解开）。设置只有一页，从上往下照着编号填就行。', y)
y = heading(c, '第一次使用', y)
y = para(c, '1. 把包里的「红黑破锁-1.html」导入白曜或菘蓝（白曜里还要把它设成交互对象才能按键，见第 11 页）。<br/>'
            '2. 双击插件画面，打开设置。<br/>'
            '3. 在 ① 选玩法，在 ② 选画面。<br/>'
            '4. 在 ③ ④ ⑤ 填礼物：礼物名要和抖音里的一模一样；每一行点 ▶ 试一下。<br/>'
            '5. 关掉设置，一下一下地按空格（或者在 ⑥ 换的键）。按住不放不算。', y)
y = screenshot(c, 'stage_bar_lock', '直播画面：进度条 × 锁链，默认的样子「暗黑恐怖 · 红黑」。灰白格子是透明的地方，直播时露出后面的画面。', y, 255)
y = note(c, '包里两个文件', '「红黑破锁-1.html」和这份说明。图片、字体、声音都在 HTML 里，不联网也能显示；要收到观众的礼物，得在白曜或菘蓝里用。', y)
finish(c, 1, y)

# 2 一页设置
y = start(c, '设置只有一页', '双击插件画面打开。改了马上生效，自动保存，不用点保存。')
y = screenshot(c, 'menu_top', '设置的最上面：一行字说连没连上直播间；下面是 ① 玩法、② 画面，选中的卡片是粉色边。', y, 290)
y = table(c, ['从上往下', '管什么'], [
    ['① 玩法', '进度条 / 次数：观众送礼以后怎么算，停手会不会往回掉'],
    ['② 画面', '锁链 / 牢笼：长什么样，和玩法随便搭'],
    ['③ 加进度条 / 加次数礼物', '送了会让你要按的变多；① 选哪种玩法，这里就是哪张表'],
    ['④ 捣乱礼物', '让你更难：剩下的翻倍、按键失灵几秒'],
    ['⑤ 帮忙礼物', '帮你：帮按几下、剩下的减半、马上全部解开'],
    ['⑥ 用哪个键', '换成你顺手的键'],
    ['⑦ 样子', '九种颜色和画风，画面大小'],
    ['⑧ 声音', '总音量'],
    ['最下面', '「清空现在的挑战」「解除按键失灵」，还有收起来的「高级设置（不懂就别动）」'],
], [190, W-286], y, 9.5, 15, 10)
finish(c, 2, y)

# 3 玩法
y = start(c, '① 玩法：进度条还是次数', '两种玩法只差在「观众送礼以后怎么算」。长什么样在 ② 单独选。')
y = table(c, ['', '进度条', '次数'], [
    ['观众送礼', '加几条进度条，每条要按几下是设好的', '往一个总数上加几次，不会多出一条'],
    ['你按一下', '这一条往前走一格，按满一条破一条', '总数少 1'],
    ['停手', '往回掉（快慢在下面选）', '不会往回掉'],
    ['画面上', '进度条，右边的「×N」是还剩几条', '「还需 N 次」'],
    ['什么时候出来', '所有进度条都按完', '减到 0'],
], [92, (W-188)/2, (W-188)/2], y)
y = grid(c, [('stage_bar_lock', '进度条：玫瑰 = 加 1 条，每条按 120 下'), ('stage_count_lock', '次数：玫瑰 = 加 120 次')], y, 140)
y = heading(c, '停手以后往回掉（只有进度条有）', y)
y = para(c, '在 ① 下面选：不掉 / 慢 / 正常（默认）/ 快。下面一行小字会告诉你停手多久开始掉、按满的一条大约几秒掉光。想调得更细，到「高级设置」里填每秒掉多少、停手几秒以后才开始掉。', y)
y = note(c, '换玩法', '正在玩的时候换不了：先点最下面的「清空现在的挑战」，再换。两种玩法各有一张礼物表，换过去以后 ③ 变成那一张；原来那张还在，换回来就回来了。', y)
finish(c, 3, y)

# 4 画面
y = start(c, '② 画面：锁链还是牢笼', '画面只管长什么样，和玩法随便搭，四种搭配都能用。')
y = grid(c, [('stage_bar_lock', '进度条 × 锁链'), ('stage_bar_cage', '进度条 × 牢笼'),
             ('stage_count_lock', '次数 × 锁链'), ('stage_count_cage', '次数 × 牢笼')], y, 138)
y = table(c, ['', '锁链', '牢笼'], [
    ['画面', '锁头加四根锁链', '关进笼子，门上挂着锁'],
    ['按一下', '锁头被敲得一扁一弹，锁链跟着绷紧', '两扇门往外鼓一下再弹回来，锁哐啷晃'],
    ['菜单里的说法', '按、帮你按掉、马上全部解开', '拍、帮你拍掉、马上开门'],
], [92, (W-188)/2, (W-188)/2], y)
y = note(c, '正在玩也能换', '换了画面，那一局接着玩，按到哪里还在哪里。礼物表也不用重新填，锁链和牢笼用同一张。', y)
finish(c, 4, y)

# 5 加进度条礼物
y = start(c, '③ 加进度条礼物', '填「送了会让你要按的变多」的礼物。玩法是进度条的时候，③ 就是这张表。')
y = heading(c, '加一个礼物', y)
y = para(c, '1. 点表下面的「＋ 添加一个加进度条礼物」，多出一行。<br/>'
            '2. 在左边的框里写礼物名，要和抖音里的一模一样，比如「小心心」。<br/>'
            '3. 填「加几条，每条按几下」。两个框一样就是固定数，不一样就每次在中间随机。<br/>'
            '4. 点 ▶ 试一下：就当有人送了 1 个，画面上真的会加上；试完点最下面的「清空现在的挑战」。<br/>'
            '5. 这一行不要了，点 ✕。', y)
y = screenshot(c, 'gift_bar', '进度条玩法：送 1 个玫瑰 → 加 1 条，每条按 120 下。', y, 270)
y = note(c, '一次送好几个', '观众一次送 3 个就是 3 倍：比如「加 1～2 条」抽到 2，就加 6 条。每条按几下是每一条单独随机。同一个礼物在 ③ ④ ⑤ 里只能填一行，填重了那一行会提示。', y)
finish(c, 5, y)

# 6 加次数礼物
y = start(c, '③ 加次数礼物', '玩法换成「次数」以后，③ 就变成这张表。它和进度条那张各存各的，换回去那张也还在。')
y = para(c, '每一行只填「加几次」：两个框一样就是固定数，不一样就每次在中间随机。观众送的次数都加到同一个总数上，画面上只有一个「还需 N 次」。添加一行、点 ▶ 试一下、点 ✕ 删掉，都和进度条那张一样。', y)
y = screenshot(c, 'gift_count', '次数玩法：送 1 个玫瑰 → 加 120 次。', y, 255)
y = heading(c, '次数玩法里，④ ⑤ 的说法也跟着变', y)
y = table(c, ['进度条玩法', '次数玩法'], [
    ['剩下要按的 × 几 / ÷ 几', '剩下的次数 × 几 / ÷ 几'],
    ['「＋ 帮按礼物」：帮你按掉几下', '「＋ 减次数礼物」：帮你减掉几次'],
    ['「＋ 全部解开礼物」：马上全部解开', '「＋ 清零礼物」：次数直接清零'],
], [(W-96)/2, (W-96)/2], y)
finish(c, 6, y)

# 7 捣乱礼物
y = start(c, '④ 捣乱礼物', '让你更难的礼物。点表下面的按钮加一行，写礼物名、填数字；▶ 试一下，✕ 删掉。')
y = table(c, ['表下面的按钮', '观众送 1 个会怎样'], [
    ['「＋ 翻倍礼物」', '剩下要按的 × 几，所有没按完的进度条都乘（次数玩法乘剩下的次数）。送 2 个就乘两次。只对正在玩的挑战有用。'],
    ['「＋ 按键失灵礼物」', '几秒内按了不算。送 2 个秒数翻倍，接着上一次往后加，最多 1 小时。'],
], [128, W-224], y)
y = screenshot(c, 'gift_mess', '例子：人气票 → 剩下要按的 × 2；大啤酒 → 按键失灵 10 秒。', y, 195)
y = para(c, '按键失灵的时候，画面上写着「按键失灵 · 还剩 N 秒」。想马上恢复，点设置最下面的「解除按键失灵」；⑤ 里的全部解开礼物也会一起解除。', y)
finish(c, 7, y)

# 8 帮忙礼物
y = start(c, '⑤ 帮忙礼物', '帮你的礼物，添加一行、试一下、删掉都和 ④ 一样。牢笼里「按」都说成「拍」。')
y = table(c, ['表下面的按钮', '观众送 1 个会怎样'], [
    ['「＋ 帮按礼物」', '帮你按掉几下，先抵前面的进度条，多的接着抵后面的。'],
    ['「＋ 减半礼物」', '剩下要按的 ÷ 几，除不尽往上取，至少留 1 下。送 2 个就除两次。'],
    ['「＋ 全部解开礼物」', '马上全部解开，按键失灵也一起解除。牢笼里叫「开门礼物」。'],
], [128, W-224], y)
y = screenshot(c, 'gift_help', '例子：破锁钥匙 → 帮你按掉 60 下；比心兔兔 → 剩下要按的 ÷ 2；跑车 → 马上全部解开。', y, 265)
y = note(c, '记得改名', '⑤ 里自带的「破锁钥匙」抖音里没有，只是个例子，换成你要用的礼物名。帮忙、翻倍、减半的礼物只在有挑战的时候才有用。', y)
finish(c, 8, y)

# 9 按键和样子
y = start(c, '⑥ 用哪个键和 ⑦ 样子')
y = para(c, '<b>换键</b>：点「换一个键」，再按一下想用的键，「现在用」就变成它；不想换了点「不换了」。常用的空格、F、J、回车可以直接点。要一下一下按，按住不放不算。', y)
y = screenshot(c, 'sec_key', '⑥ 用哪个键：现在用空格。', y, 110)
y = para(c, '换了键以后，已经加上的进度条还用原来的键，新加的才用新键；次数玩法是这一轮用原来的键，下一轮才用新键。画面上一直写着现在要按哪个键。', y)
y = para(c, '<b>样子</b>：九种颜色和画风，锁头、锁链、笼子和面板一起变，默认是「暗黑恐怖 · 红黑」。画面大小有标准、大（默认，手机上看得清）、特大；窗口小了会自己缩。', y)
y = screenshot(c, 'sec_look', '⑦ 样子：点一张卡片就换。', y, 230)
finish(c, 9, y)

# 10 声音、清空、高级设置
y = start(c, '⑧ 声音、清空和高级设置')
y = screenshot(c, 'sound_tools', '⑧ 声音，和设置最下面的两个按钮。', y, 120)
y = para(c, '<b>声音</b>：⑧ 只有一个总音量，拉到 0 就没声音。想单独换、单独关某一种声音，到「高级设置」里的「每种声音」。', y)
y = para(c, '<b>清空现在的挑战</b>：正在玩的和排队的全部清掉。要点两下：第一下按钮会变成「再点一次就清空」，防止手滑。<b>解除按键失灵</b>：马上就能按。', y)
y = heading(c, '高级设置（不懂就别动）', y)
y = table(c, ['里面有什么', '用来干什么'], [
    ['停手往回掉（细调）', '每秒掉多少（满格算 100，0 = 不掉），停手几秒以后才开始掉。<br/>只有进度条玩法有。'],
    ['动画', '开 / 跟随系统 / 关。关了以后不晃、不弹、不冒粒子，进度照样显示。'],
    ['锁链、锁头、笼子的图片', '跟着样子走，或者固定用四套图里的一套。也能换成自己的透明 PNG（每张 5 MB、4096 像素以内）：自己的图优先，点「恢复默认」就回去。'],
    ['每种声音', '每种声音用默认的、换成自己的（3 MB、10 秒以内），或者关掉。'],
    ['自由试玩', '不看礼物表直接试：加几条、× 几、÷ 几、帮按几下、失灵几秒。'],
    ['备份', '「导出设置」存成一个文件；到别的电脑、OBS、白曜、菘蓝里点「导入设置」，先看一眼再点「确认导入」。旧版导出的文件也能导入。'],
    ['直播连接', '现在连没连上直播间，设置存在哪里。'],
], [130, W-226], y)
finish(c, 10, y)

# 11 在哪用、从旧版换过来
y = start(c, '在白曜、菘蓝、OBS 里用', '白曜和菘蓝都会把导入的插件另存一份，所以换新版要重新导入。')
y = table(c, ['在哪用', '怎么做'], [
    ['白曜', '「导入插件」选「红黑破锁-1.html」，礼物会自己接上。要能按键：画布 →「鼠标与键盘交互对象」→ 选中红黑破锁 →「将所选插件设为交互对象」，看到「正在接收交互」就行。'],
    ['菘蓝', '在「自定义插件」里加载「红黑破锁-1.html」，礼物会自己接上。<br/>按键前先点一下插件画面。'],
    ['OBS 浏览器来源', '也可以直接打开这个 HTML：它会去连本机开着的白曜或菘蓝（先 9910，再 10030），断了自己重连。要按键，在 OBS 里右键这个来源，点「交互」，在弹出的窗口里按。'],
], [100, W-196], y)
y = heading(c, '从旧版换成 V2.4', y)
y = para(c, '1. 在白曜或菘蓝里重新导入新的「红黑破锁-1.html」，换掉旧的。<br/>'
            '2. 打开设置看一眼：旧的设置第一次打开时会自己换过来（见下表）。<br/>'
            '3. 点几行 ▶ 试一下，再点「清空现在的挑战」。', y)
y = table(c, ['旧版里的', '到 V2.4 以后'], [
    ['礼物（V1.8.2，或者 V2.3 的「多条进度」）', '③ 加进度条礼物；帮忙、禁用、清空的礼物分到 ④ ⑤'],
    ['V2.3 当时正在用「牢笼拍门」', '③ 用牢笼那张礼物表，② 画面是牢笼'],
    ['V2.3 的「累计次数」', '③ 加次数礼物（换到次数玩法就能看到）'],
    ['按键、样子、声音', '用当时正在用的那一份'],
    ['正在玩的那一局', '接着玩'],
], [175, W-271], y)
y = note(c, '旧版不会被改', 'V2.4 的设置存在新的地方，旧版的一个字都不动。想退回旧版，重新导入旧的 HTML，它还是原来的样子。V2.3 里多条进度和牢笼拍门各有一张礼物表，V2.4 的进度条只有一张：没在用的那张不会带过来，还留在旧版里。', y)
finish(c, 11, y)

# 12 版本记录、测试、许可证
y = start(c, '版本记录、测试和许可证')
y = para(c, '<b>V2.4（2026-10-30）</b><br/>'
            '1. 设置重做成一页：① 玩法 ② 画面 ③ 加礼物 ④ 捣乱 ⑤ 帮忙 ⑥ 按键 ⑦ 样子 ⑧ 声音，说法都改成大白话。<br/>'
            '2. 玩法（进度条 / 次数）和画面（锁链 / 牢笼）分开选，四种搭配都能用；正在玩也能换画面。<br/>'
            '3. 每个礼物一行「送 1 个 → …」，点 ▶ 就能试。<br/>'
            '4. 新增「减半礼物」：剩下要按的 ÷ 几。<br/>'
            '5. 设置存到新的地方，旧版的设置不受影响，随时能退回去。', y)
y = para(c, '<b>V2.3.3 和更早</b>：三种模式（多条进度、牢笼拍门、累计次数），九套牢笼，啃锁和拍门的反馈，连 9910，三档画面大小，鼠鼠主题。详细的看旧版的说明。', y)
y = heading(c, '测试', y)
y = para(c, '这一版用自动测试点过：四种搭配都实际玩了一遍（送礼、按键、停手往回掉、每种礼物的 ▶、减半、导出导入），也试了从 V1.8.2、V2.3.3 换过来再换回去。礼物是用模拟的礼物消息送的；真的白曜、菘蓝、OBS 和抖音直播还没有试过。', y)
y = heading(c, '素材和字体', y)
y = para(c, '锁链、锁头、九套牢笼和鼠鼠主题的图都是原创生成的，没有用主播的形象。鼠鼠面板的字体是站酷快乐体（ZCOOL KuaiLe，SIL Open Font License 1.1），许可证全文在 HTML 里，也作为附件放在这份 PDF 里。这份说明的正文也用这个字体；①～⑧、▶、✕、→ 这几个符号用的是 DejaVu Sans，许可证同样附在 PDF 里。', y)
y = note(c, '礼物没反应', '先看设置最上面那一行，有没有连上直播间；再看礼物名是不是和抖音里的一模一样。帮忙、翻倍、减半的礼物只在有挑战的时候才有用。还不行就到「高级设置 → 自由试玩」点一下，看画面有没有反应。', y)
finish(c, 12, y)
c.save()

writer = PdfWriter(clone_from=PdfReader(BytesIO(OUTPUT.read_bytes())))
writer.add_attachment('ZCOOLKuaiLe-OFL.txt', FONT_LICENSE.read_bytes())
writer.add_attachment('DejaVu-LICENSE.txt', SYMBOL_LICENSE.read_bytes())
with OUTPUT.open('wb') as target:
    writer.write(target)
print(f'Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes); {PAGES} pages; content bottoms: {page_bottoms}')
