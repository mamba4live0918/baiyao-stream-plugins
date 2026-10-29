from argparse import ArgumentParser
from html import escape
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parent
VERSION = 'V2.3.3'
RELEASE_DATE = '2026-10-16'
PAGES = 10
QA_VERIFIED = True
QA_SUMMARY = '本次验收数字见随交付提供的自测报告；真实直播与 OBS 客户端未测试。'
# 只放经过检查的实际界面截图；键名见下方 screenshot() 调用。
SCREENSHOT_MAP = ROOT / 'qa/2026-10-15-V2.3.1-自测/guide-shots.json'
SCREENSHOTS = json.loads(SCREENSHOT_MAP.read_text(encoding='utf-8')) if SCREENSHOT_MAP.is_file() else {}
SCREENSHOTS.update({'layer_rules':str(ROOT/'qa/2026-10-15-V2.3.2-自测/guide-cage.png'),'count_rules':str(ROOT/'qa/2026-10-15-V2.3.2-自测/guide-count.png')})
SCREENSHOTS.update({key:str(ROOT/'qa/2026-10-16-V2.3.3-自测'/name) for key,name in [('modes','guide-modes.png'),('layer_rules','guide-cage.png'),('count_rules','guide-count.png')]})
SCREENSHOT_CROPS = {}
SCREENSHOTS['asset_example']=str(ROOT/'qa/2026-10-15-V2.3.1-自测/menu-lock-example.png')

parser = ArgumentParser(description='生成红黑破锁 V2.3.3 使用说明')
parser.add_argument('--output', type=Path, default=ROOT / '使用说明.pdf')
parser.add_argument('--draft', action='store_true', help='生成文稿预览，不能用于正式交付')
parser.add_argument('--qa-text', type=Path, help='本次已核实验收说明的 UTF-8 文本文件')
parser.add_argument('--screenshots-json', type=Path, help='实际截图键到绝对路径的 JSON 字典')
args = parser.parse_args()
OUTPUT = args.output.resolve()
if not args.draft and not QA_VERIFIED and not args.qa_text:
    raise SystemExit('正式 PDF 等待本次验收结论；文稿预览请加 --draft 并指定临时 --output')
if args.draft and OUTPUT == (ROOT / '使用说明.pdf').resolve():
    raise SystemExit('文稿不得覆盖正式 使用说明.pdf；请指定临时 --output')
if args.qa_text:
    QA_SUMMARY = escape(args.qa_text.read_text(encoding='utf-8-sig').strip()).replace('\n', '<br/>')
    if not QA_SUMMARY:
        raise SystemExit('验收说明文件为空，不生成说明书')
if args.screenshots_json:
    supplied = json.loads(args.screenshots_json.read_text(encoding='utf-8-sig'))
    if not isinstance(supplied, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in supplied.items()):
        raise SystemExit('截图清单必须为键名到路径的 JSON 字典')
    SCREENSHOTS.update(supplied)

# Redistributable OFL font; do not embed proprietary Windows font files.
FONT = ROOT / 'assets/fonts/ZCOOLKuaiLe-Regular.ttf'
pdfmetrics.registerFont(TTFont('MSYH', str(FONT)))
pdfmetrics.registerFont(TTFont('MSYH-BOLD', str(FONT)))
pdfmetrics.registerFontFamily('MSYH', normal='MSYH', bold='MSYH-BOLD', italic='MSYH', boldItalic='MSYH-BOLD')
W, H = A4
RED, DARK = HexColor('#9B2740'), HexColor('#241721')
MUTED, PALE, LINE = HexColor('#6E5A63'), HexColor('#F7EFF1'), HexColor('#E2D0D6')
LOWEST_CONTENT = 64
page_bottoms = []


def text(c, value, x, top, width, size=10.5, leading=18, color=DARK, bold=False):
    style = ParagraphStyle('body', fontName='MSYH-BOLD' if bold else 'MSYH', fontSize=size,
                           leading=leading, textColor=color, wordWrap='CJK')
    block = Paragraph(value, style)
    _, height = block.wrap(width, H)
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
    text(c, label, 63, top, W-111, 14, 22, DARK, True)
    return top-40


def start(c, title, subtitle=None):
    y = heading(c, title, H-61)
    if subtitle:
        y = para(c, subtitle, y, 18, 10, 17)
    return y


def finish(c, page, bottom):
    page_bottoms.append(round(bottom, 1))
    c.setStrokeColor(LINE)
    c.line(48, 47, W-48, 47)
    c.setFont('MSYH', 8)
    c.setFillColor(MUTED)
    suffix = ' · 文稿预览' if args.draft else ''
    c.drawString(48, 30, f'红黑破锁 · {VERSION} · {RELEASE_DATE}{suffix}')
    c.drawRightString(W-48, 30, f'{page} / {PAGES}')
    if page < PAGES:
        c.showPage()


def note(c, label, value, y):
    style = ParagraphStyle('note', fontName='MSYH', fontSize=10, leading=17, textColor=DARK, wordWrap='CJK')
    block = Paragraph(value, style)
    _, height = block.wrap(W-202, H)
    box_height = max(50, height+26)
    bottom = y-box_height
    if bottom < LOWEST_CONTENT:
        raise ValueError(f'第 {len(page_bottoms)+1} 页提示框溢出：{bottom:.1f}')
    c.setFillColor(PALE)
    c.roundRect(48, bottom, W-96, box_height, 7, stroke=0, fill=1)
    text(c, label, 62, y-12, 80, 10, 17, RED, True)
    block.drawOn(c, 137, y-12-height)
    return bottom-16


def screenshot(c, key, caption, y, height=185):
    source = SCREENSHOTS.get(key)
    if not source:
        if not args.draft:
            return y
        if y-height-35 < LOWEST_CONTENT:
            raise ValueError(f'第 {len(page_bottoms)+1} 页截图预留区域溢出')
        c.setStrokeColor(LINE)
        c.setFillColor(HexColor('#FBF8F9'))
        c.roundRect(48, y-height, W-96, height, 7, stroke=1, fill=1)
        text(c, '实际界面截图预留', 64, y-22, W-128, 10, 17, MUTED)
        text(c, f'截图键：{escape(key)}', 64, y-46, W-128, 9, 16, MUTED)
    else:
        path = Path(source)
        if not path.is_file():
            raise FileNotFoundError(f'实际截图不存在：{path}')
        if y-height-35 < LOWEST_CONTENT:
            raise ValueError(f'第 {len(page_bottoms)+1} 页截图区域溢出')
        image = ImageReader(str(path))
        iw, ih = image.getSize()
        crop = SCREENSHOT_CROPS.get(key, (0, 0, iw, ih))
        left, top, right, lower = crop
        if not 0 <= left < right <= iw or not 0 <= top < lower <= ih:
            raise ValueError(f'截图裁取范围无效：{key} {crop}，原图 {iw} × {ih}')
        cw, ch = right-left, lower-top
        scale = min((W-96)/cw, height/ch)
        dw, dh = cw*scale, ch*scale
        c.setFillColor(HexColor('#F1ECEF'))
        c.roundRect(48, y-height, W-96, height, 7, stroke=0, fill=1)
        x, bottom = 48+(W-96-dw)/2, y-height+(height-dh)/2
        # 以浅灰棋盘格标明真正 alpha 空隙，不给直播插件添背景。
        if key in {'overview', 'count', 'cage'}:
            tile = 10
            c.saveState()
            clip = c.beginPath(); clip.rect(x, bottom, dw, dh); c.clipPath(clip, stroke=0, fill=0)
            for col in range(int(dw/tile)+1):
                for row in range(int(dh/tile)+1):
                    if (col+row) % 2 == 0:
                        c.setFillColor(HexColor('#E6E2E5'))
                        c.rect(x+col*tile, bottom+row*tile, tile, tile, stroke=0, fill=1)
            c.restoreState()
        c.saveState()
        clip = c.beginPath(); clip.rect(x, bottom, dw, dh); c.clipPath(clip, stroke=0, fill=0)
        c.drawImage(image, x-left*scale, bottom-(ih-lower)*scale, iw*scale, ih*scale, mask='auto')
        c.restoreState()
    return text(c, caption, 48, y-height-8, W-96, 9, 15, MUTED)-18


def table(c, headers, rows, widths, y):
    x0 = 48
    for index, row in enumerate([headers]+rows):
        fonts = ['MSYH-BOLD']*len(row) if index == 0 else ['MSYH']*len(row)
        blocks = []
        heights = []
        for value, width, font in zip(row, widths, fonts):
            style = ParagraphStyle('cell', fontName=font, fontSize=10, leading=17, textColor=DARK, wordWrap='CJK')
            block = Paragraph(value, style)
            _, height = block.wrap(width-20, H)
            blocks.append(block); heights.append(height)
        row_height = max(heights)+20
        if y-row_height < LOWEST_CONTENT:
            raise ValueError(f'第 {len(page_bottoms)+1} 页表格溢出')
        c.setFillColor(PALE if index == 0 else HexColor('#FFFFFF'))
        c.rect(x0, y-row_height, sum(widths), row_height, stroke=0, fill=1)
        c.setStrokeColor(LINE)
        c.line(x0, y-row_height, x0+sum(widths), y-row_height)
        x = x0
        for block, height, width in zip(blocks, heights, widths):
            block.drawOn(c, x+10, y-10-height)
            x += width
        y -= row_height
    return y-20


OUTPUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUTPUT), pagesize=A4)
c.setTitle(f'红黑破锁 {VERSION} 使用说明')
c.setAuthor('红黑破锁')
c.setSubject('透明直播互动：每条礼物直接设置固定值或随机范围、锁链与牢笼、累计计数')

# 1: introduction
y=start(c,'红黑破锁 V2.3.3','三模式独立设置 · 九套原创双开门牢笼 · 啃锁与拍门反馈')
y=para(c,'观众送礼增加挑战，主播连按指定单键解除。菜单分为「多条进度」「牢笼拍门」「累计次数」三种独立模式：每种模式各自保存规则、主题、按键、画面大小和音效选项。',y)
y=heading(c,'第一次使用',y)
y=para(c,'1. 在菘蓝自定义插件里加载包内「红黑破锁-1.html」，或独立打开 HTML。<br/>2. 双击画面打开设置，在「玩法」顶部选择模式。<br/>3. 到「进度礼物 / 关笼礼物 / 次数礼物」编辑当前模式的规则，用该行「测试」演练。<br/>4. 关闭设置后连按画面提示的键。长按不会计数。',y)
y=screenshot(c,'overview','鼠鼠主题锁链模式；透明区域用于叠加直播画面。',y,240)
y=note(c,'只需两个文件','交付 ZIP 只有 HTML 与本说明书。图片、字体、脚本内置 HTML，可离线显示；收到真实礼物仍需本机菘蓝服务或宿主 SDK。',y)
finish(c,1,y)

y=start(c,'先选模式，再编辑它的菜单')
y=screenshot(c,'modes','玩法顶部的三张模式卡片，只有一张启用。',y,140)
y=table(c,['模式','画面与计数'],[
 ['多条进度','填满一条消一条。×N 是剩余条数；每条按几次只设置这一条的难度，可设置停手回落。'],
 ['牢笼拍门','九主题双开门，锁头与信息板居中。逐层拍门逃离，按道解除封锁。'],
 ['累计次数','没有层数。礼物不断增加剩余次数，每次有效按键减 1，降到 0 完成本轮。停手不回落。'],
], [80,W-176],y)
y=para(c,'「玩法」、当前模式的礼物页与「试玩」都只编辑当前启用模式。切走再回来会保留这一模式的设置；收到礼物只匹配当前模式的规则，不会同时触发其他两套规则。',y)
y=note(c,'挑战中不能切','还有挑战或按键禁用未结束时，模式卡会提示先在「试玩」清空或等待结束。不会偷偷清除观众送来的挑战。导入另一种活动模式也受此保护。',y)
finish(c,2,y)

y=start(c,'多条进度与牢笼拍门：按条 / 道设置')
y=para(c,'选「多条进度」后进入「进度礼物」，填加几条进度、每条按几次；选「牢笼拍门」后进入「关笼礼物」，填加几道封锁、每道拍门几次。每行下方显示送 1 个礼物的效果。上下限相同固定，不同随机；改完自动保存。',y)
y=table(c,['效果','规则'],[
 ['加进度 / 加封锁','进度条数 / 封锁道数 1–20000；每条按键 / 每道拍门 1–99999 次；次数倍率 1–1000。'],
 ['加固 / 翻倍','剩余次数乘倍率，保留已按与永久援助；可设置重复次数。每层有效目标上限 10 亿。'],
 ['援助 / 减次','直接抵扣，超出当前层继续用于后续层；超出全部挑战的余点不留给未来。'],
 ['释放 / 清空','清除当前、排队挑战和禁用状态，不伪造主播按键。'],
 ['禁用按键','每份秒数乘礼物份数，总剩余禁用最多 1 小时。'],
], [105,W-201],y)
y=screenshot(c,'layer_rules','关笼礼物：设置封锁与拍门次数，下方直接读出送礼效果。',y,160)
y=note(c,'随机怎样抽','数量每次消息抽一次，再乘礼物份数；倍率整批共用；每层基础次数独立抽取。已收到的挑战保存快照，改规则和刷新都不会重抽。',y)
finish(c,3,y)

y=start(c,'累计次数：只有一个剩余总数')
y=para(c,'主数字是「还需 N 次」，小字是「已按 M 次」；鼠鼠写「已啃 M 次」。礼物继续往剩余数相加，每按一下减一。进度按已按 ÷（已按 + 剩余）计算；新礼物加进来后比例可能下降，这是总工作量增加的结果。',y)
y=table(c,['效果','次数模式含义'],[
 ['增加剩余次数','每份次数抽一次，再乘礼物份数。在「次数礼物」中填写增加多少次，没有层数或每层目标。'],
 ['剩余次数翻倍','将剩余数乘以倍率，已经按过的数保留。'],
 ['减少剩余次数','直接减少剩余数，已按数不增加。'],
 ['清空 / 禁用','清掉本轮与禁用，或暂时让按键不计数。'],
], [100,W-196],y)
y=screenshot(c,'count_rules','次数模式的规则卡片只显示适用的参数。',y,140)
y=para(c,'本轮降到零后破锁退场并清零历史；退场期间收到加次数礼物，会立即开启新一轮，旧退场计时不会把新挑战隐藏。次数使用安全整数，达到上限时会明确提示。',y)
y=note(c,'旧倍率可见','旧版规则迁移成每份层数 × 每层次数的范围。若原规则还有非 1 倍率，会显示「原规则次数乘几倍」，保留原礼物强度；改为 1 后隐藏该额外项。',y)
finish(c,4,y)

y=start(c,'双开门牢笼：按一次，拍一次门')
y=para(c,'锁头水平居中，中心约在画面三分之二高度；短链左右对称，信息板仍在锁下方。横屏或较矮画布会自动缩小，竖屏优先保留文字大小、调整锁头尺寸，避免面板出界。框架、栏杆、双门、链条和锁依次关上；逃脱时锁掉落、链条滑落、门向两边打开、栏杆收起。',y)
y=screenshot(c,'cage','鼠鼠主题粉蓝仓鼠笼；横屏和竖屏均保持中线对齐。',y,270)
y=para(c,'每次有效点按，两扇门向外鼓一下再弹回，锁与短链哐啷晃动，门缝附近出现随机冲击波纹。鼠鼠额外闪现小爪印，声音是软拍加吱声；其他主题分别使用各自的金属、纸张、像素或电子质感拍门声。',y)
y=note(c,'九套独立素材','鼠鼠粉蓝、暗红铸铁、赛博能量、旧黄铜墨绿、钢笔线稿、像素、粉笔、绿色荧光线框、奶油糖果。均为原创透明图组件，按头、中段、尾拼接，复用当前主题的锁链。',y)
finish(c,5,y)

y=start(c,'啃锁反馈与动画偏好')
y=para(c,'锁链和次数模式每次点按都有约 120 ms 的压扁、回弹和小角度晃动，链条跟着绷紧。快速连点重启动画，不叠加成乱抖。牢笼用约 150 ms 的拍门动作代替。',y)
y=screenshot(c,'bites','鼠鼠锁身边缘的牙印随进度变化，鼠耳与锁梁保持完整。',y,235)
y=para(c,'鼠鼠在 20%、40%、60%、80%、95% 进度依次留下五个牙印；回落时牙印退回，新层换回完整锁。每次啃都掉奶油色与奶酪黄碎屑，进度轨道上的小老鼠做咀嚼点头。次数按整轮进度显示牙印；牢笼只拍门，不啃锁。',y)
y=note(c,'动画关闭','不播放位移、形变和新粒子，只保留轻微亮度反馈；进度和牙印仍静态显示。自定义锁图或替换内置材质的锁体结构未知，因此不挖牙印，以免切掉耳朵或其他装饰；仍保留受击与按键反馈。',y)
finish(c,6,y)

y=start(c,'主题、上传素材、单键与声音')
y=para(c,'九张主题卡片有锁头和链条预览，鼠鼠仍排第一，已去掉「新」标。桌面三列、窄屏两列，可点选或用方向键与 Home / End 选择。选主题会使用其原配素材，但该主题自定义上传仍优先。',y)
y=table(c,['选项','用法'],[
 ['单键录入','点击「录入按键」再按单个键，即可保存。支持字母、数字、方向、功能、小键盘等浏览器能收到的键。纯修饰键、组合键和输入法选词不录入。'],
 ['上传素材与示例','每主题分别保存锁、链，以及栏杆、上下横梁、门框横梁、门扣。牢笼组件在可展开区；各项都有透明 PNG 示例下载。单图最大5 MB、4096×4096，全部图片合计90 MB；失败保旧。'],
 ['音效','当前模式分别选默认 / 自定义 / 关闭与音量。自定义音频最大 3 MB、10 秒。上传失败保留旧音效。'],
 ['个人素材','自定义图片和音频字节由浏览器共享保存；各模式的主题、材质、音效选项独立。通过设置备份携带到另一台电脑。'],
], [100,W-196],y)
y=screenshot(c,'asset_example','素材菜单可查看示例并下载透明 PNG；上传、预览和恢复默认在同一行。',y,165)
y=note(c,'当前挑战的键','按键设置用于新挑战；进行中的挑战保留收到时的按键。菜单内输入不参与破锁，长按和迟到的重复按键不算新点击。音频需浏览器允许播放，首次用户交互前可能静音。',y)
finish(c,7,y)

y=start(c,'画面大小与直播连接')
y=table(c,['画面大小','用途'],[
 ['标准','原有紧凑大小，适合空间有限的画面。'],
 ['大（默认）','锁、链条和信息板一起放大，便于手机观众看清。'],
 ['特大','更醒目的数字与按键提示。小窗口自动缩放，保留受击动作和装饰的边距。'],
], [110,W-206],y)
y=para(c,'在菘蓝里加载时优先使用 SDK；设置的连接状态显示「菘蓝 SDK」。独立运行先连接 ws://127.0.0.1:9910，失败再尝试兼容通道 ws://localhost:10030。无需把文件复制进菘蓝安装目录。',y)
y=note(c,'未连接','先检查菘蓝本机服务。断线按 3、6、12、24、30 秒逐步退避，恢复后自动重连。插件不额外刷错误日志；浏览器自身可能留下少量连接失败记录。未连接时仍可用试玩与单行测试。',y)
y=para(c,'OBS 使用方式沿用浏览器来源加载本地 HTML，透明区域能叠在直播画面上。本轮按用户要求没有启动或操作 OBS；模拟宿主的浏览器测试不能替代真实直播环境验收。',y)
finish(c,8,y)

y=start(c,'升级、备份与三代存档迁移')
y=para(c,'升级前先保留旧 HTML 和旧 ZIP，并导出一份设置；再用 V2.3 HTML 替换工作副本，刷新宿主。文件名仍是「红黑破锁-1.html」。浏览器位置和宿主不同，存储也可能不同；跨环境请导出再导入。',y)
y=table(c,['旧设置','迁移结果'],[
 ['累计次数 count','迁移到次数模式，正在进行的所有剩余工作量折算为一个总数；保留可证明的已按次数。'],
 ['锁链 / 牢笼 + bar','迁移到对应模式，层数、进度、已抽目标和队列快照保留。'],
 ['旧礼物规则','复制到锁链和牢笼；次数模式按层数范围 × 每层次数范围折算，原倍率保留。'],
 ['未抽的排队盲盒','旧记录若没有随机种子，使用稳定的首次迁移序列结算并保存，避免每次刷新重抽；已有种子的序列保持。'],
], [110,W-206],y)
y=para(c,'新版导出包含三个模式的全部设置和规则、自定义素材与音频。导入先预览、确认后应用；取消不覆盖。当前挑战不会被设置导入清除或重抽，进行中也不能导入成另一活动模式。',y)
y=note(c,'异常恢复','若三模式存档损坏，只能从当前模式镜像恢复可证明的数据；缺失的其他模式规则留空并提示从备份恢复，避免编造规则。无法安全折算的旧挑战保留为不回落的分层挑战，完成或清空后再切换。',y)
finish(c,9,y)

y=start(c,'版本记录、验收与许可证')
y=para(c,'V2.3.3：模式更名为多条进度、牢笼拍门、累计次数；明确 ×N 是剩余条数，累计次数没有层数。<br/>V2.3.2：三种玩法使用各自的礼物名称与字段，每行显示送礼效果，明确独立保存。<br/>V2.3.1：笼锁统一下移、自动避让底部；增加笼子自定义组件和菜单示例下载，支持备份恢复。<br/>V2.3：三模式与独立规则；次数总量挑战；九主题双开门牢笼；啃锁牙印、奶酪碎屑、咀嚼；每次拍门、随机波纹、鼠爪和九种拍门声；主题去新标。V2.2 的 9910、三档大小与鼠鼠主题继续保留。',y)
y=heading(c,'测试范围',y)
y=para(c,'自动测试通过数字、跳过项目和失败记录请看交付回复及自测目录的报告。最终检查从 ZIP 解出 HTML，运行已有回归与新增模式、迁移、牙印、拍门和双门几何测试。真实 OBS 与抖音直播未操作、未实测。',y)
y=heading(c,'素材与字体',y)
y=para(c,'牢笼九主题和鼠鼠锁链为原创生成，未使用主播肖像。生成提示、透明度与轮廓 QA 保存在 assets/cage/prompts.json 及 assets/themes/prompts.json。图片已内嵌 HTML，源码目录原图用于维护，不需要单独安装。',y)
y=para(c,'鼠鼠面板使用站酷快乐体 ZCOOL KuaiLe 的固定字形子集（约 14 KB）；缺字回退系统微软雅黑。PDF 使用同一字体。Copyright 2018 The ZCOOL KuaiLe Project Authors，许可证 SIL Open Font License 1.1；完整许可证随 HTML 内嵌，并作为此 PDF 的附件。系统回退字体仅引用，不分发。',y)
y=note(c,'保留旧版本','本次交付不删除、不移动 V2.2 / V2.1 ZIP 与 V1.8.2 文件夹，不向菘蓝安装目录放文件。旧存档/旧包可供回退，升级前仍请自己保留工作副本与设置备份。',y)
finish(c,10,y)
c.save()
from pypdf import PdfReader,PdfWriter
from io import BytesIO
writer=PdfWriter(clone_from=PdfReader(BytesIO(OUTPUT.read_bytes())))
writer.add_attachment('ZCOOLKuaiLe-OFL.txt',(ROOT/'assets/fonts/ZCOOLKuaiLe-OFL.txt').read_bytes())
with OUTPUT.open('wb') as target:writer.write(target)
print(f'Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes); {PAGES} pages; content bottoms: {page_bottoms}')
