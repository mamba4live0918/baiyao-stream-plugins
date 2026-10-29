"""Generate the illustrated Chinese guide for the self-contained peg-bead plug-in."""

from pathlib import Path
from html import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "交付" / "使用说明.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

# 优先用 Windows 的微软雅黑；没有时（如云端环境）用 tools/fonts 里由思源黑体子集转换的 TrueType 字体。
import os
_regular = Path("C:/Windows/Fonts/msyh.ttc")
if _regular.exists():
    pdfmetrics.registerFont(TTFont("Guide", str(_regular), subfontIndex=0))
    pdfmetrics.registerFont(TTFont("Guide-Bold", "C:/Windows/Fonts/msyhbd.ttc", subfontIndex=0))
else:
    _fonts = Path(os.environ.get("GUIDE_FONT_DIR", ROOT / "tools" / "fonts"))
    pdfmetrics.registerFont(TTFont("Guide", str(_fonts / "GuideSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Guide-Bold", str(_fonts / "GuideSans-Bold.ttf")))
pdfmetrics.registerFontFamily("Guide", normal="Guide", bold="Guide-Bold")

W, H = A4
PINK = colors.HexColor("#F49CBD")
ROSE = colors.HexColor("#B8517F")
INK = colors.HexColor("#46384D")
MUTED = colors.HexColor("#796B7C")
BLUE = colors.HexColor("#4B9BE8")
PALE_BLUE = colors.HexColor("#EAF6FC")
PAPER = colors.HexColor("#FFF9FB")
LINE = colors.HexColor("#E8D8E3")
PURPLE = colors.HexColor("#684F86")
WHITE = colors.white


def para(c, text, x, top, width, *, size=10, leading=16, color=INK, bold=False):
    style = ParagraphStyle(
        "guide", fontName="Guide-Bold" if bold else "Guide", fontSize=size,
        leading=leading, textColor=color, wordWrap="CJK", spaceAfter=0,
    )
    rendered = Paragraph(text, style)
    _, height = rendered.wrap(width, 500)
    rendered.drawOn(c, x, top - height)
    return top - height


def text(c, value, x, baseline, *, size=10, color=INK, bold=False):
    c.setFillColor(color)
    c.setFont("Guide-Bold" if bold else "Guide", size)
    c.drawString(x, baseline, value)


def source_link(c, label, url, x, baseline):
    text(c, label, x, baseline, size=8.2, color=BLUE)
    width = pdfmetrics.stringWidth(label, "Guide", 8.2)
    c.linkURL(url, (x, baseline - 2, x + width, baseline + 11), relative=0)


def rounded(c, x, y, width, height, fill, radius=13, stroke=None):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.roundRect(x, y, width, height, radius, stroke=int(stroke is not None), fill=1)


def section(c, number, title, y):
    rounded(c, 43, y - 26, 26, 26, PINK, 8)
    c.setFillColor(WHITE)
    c.setFont("Guide-Bold", 12)
    c.drawCentredString(56, y - 18, str(number))
    text(c, title, 80, y - 20, size=16, bold=True)
    return y - 42


def page_header(c, title, subtitle, page):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    rounded(c, 35, H - 92, W - 70, 60, WHITE, 20, LINE)
    rounded(c, 48, H - 79, 7, 33, PINK, 3)
    text(c, title, 68, H - 59, size=18, bold=True)
    text(c, subtitle, 69, H - 76, size=9, color=MUTED)
    footer(c, page)


def footer(c, page):
    c.setStrokeColor(LINE)
    c.line(43, 49, W - 43, 49)
    text(c, "拼豆工坊 · 使用说明 V5.6 · 2026-09-26", 43, 31, size=8, color=MUTED)
    c.setFont("Guide", 8)
    c.setFillColor(MUTED)
    c.drawRightString(W - 43, 31, f"{page} / 17")


def board_diagram(c, x, y, cell=14):
    """A vector board illustrating pegs, transparent hints, and fitted beads."""
    size = 8 * cell + 24
    rounded(c, x, y, size, size, colors.HexColor("#D7F0F5"), 16)
    rounded(c, x + 9, y + 9, size - 18, size - 18, colors.HexColor("#E9FCFF"), 10)
    cherry = {(2, 4): PINK, (3, 4): PINK, (2, 5): PINK, (3, 5): PINK,
              (5, 4): ROSE, (6, 4): ROSE, (5, 5): ROSE, (6, 5): ROSE,
              (3, 2): colors.HexColor("#54AD65"), (4, 2): colors.HexColor("#54AD65"),
              (4, 3): colors.HexColor("#327953")}
    for row in range(8):
        for col in range(8):
            cx = x + 17 + col * cell + cell / 2
            cy = y + 17 + (7 - row) * cell + cell / 2
            c.setFillColor(colors.HexColor("#A9D1D6"))
            c.circle(cx, cy, 2.3, stroke=0, fill=1)
            if (col, row) not in cherry:
                continue
            shade = cherry[(col, row)]
            c.setFillColor(shade)
            c.setStrokeColor(colors.HexColor("#746477"))
            c.setLineWidth(.6)
            if row < 5:
                c.circle(cx, cy, 5.7, stroke=1, fill=1)
                c.setFillColor(colors.HexColor("#E9FCFF"))
                c.circle(cx, cy, 2.2, stroke=0, fill=1)
            else:
                c.setFillColor(colors.Color(shade.red, shade.green, shade.blue, alpha=.30))
                c.circle(cx, cy, 5.7, stroke=1, fill=1)


def jar_diagram(c, x, y):
    rounded(c, x, y + 2, 72, 66, colors.HexColor("#D6E4E8"), 3, colors.HexColor("#9BB6BE"))
    rounded(c, x + 4, y + 13, 64, 51, colors.HexColor("#F3FCFC"), 2, colors.HexColor("#B5D9E2"))
    for row in range(4):
        for col in range(5):
            c.setFillColor(PINK if (row + col) % 3 else ROSE)
            c.circle(x + 12 + col * 12, y + 21 + row * 11, 5, stroke=0, fill=1)
            c.setFillColor(WHITE)
            c.circle(x + 12 + col * 12, y + 21 + row * 11, 1.8, stroke=0, fill=1)
    rounded(c, x + 3, y - 4, 66, 17, WHITE, 2, LINE)
    text(c, "P03 草莓红", x + 8, y + 1, size=9, bold=True, color=ROSE)


def step_card(c, number, title, body, x, top, width=157, height=122):
    rounded(c, x, top - height, width, height, WHITE, 14, LINE)
    rounded(c, x + 13, top - 34, 25, 25, PALE_BLUE, 8)
    text(c, str(number), x + 21, top - 27, size=11, bold=True, color=BLUE)
    text(c, title, x + 45, top - 27, size=10.7, bold=True)
    para(c, body, x + 14, top - 46, width - 28, size=8.8, leading=14)


def gift_card(c, title, description, x, top, fill, width=160, height=94):
    rounded(c, x, top - height, width, height, WHITE, 12, LINE)
    rounded(c, x + 12, top - 31, 5, 19, fill, 2)
    text(c, title, x + 25, top - 26, size=10.6, bold=True)
    para(c, description, x + 13, top - 42, width - 26, size=8.6, leading=13)


def line_item(c, heading, description, top, *, x=52, width=490):
    c.setFillColor(PINK)
    c.circle(x + 4, top - 7, 3, stroke=0, fill=1)
    text(c, heading, x + 17, top - 10, size=10, bold=True)
    return para(c, description, x + 17, top - 15, width - 20, size=9, leading=15) - 11


c = canvas.Canvas(str(OUTPUT), pagesize=A4)
c.setTitle("拼豆工坊 V5.6 · 图文使用说明")
c.setAuthor("拼豆工坊")
c.setSubject("菘蓝整蛊插件、白曜重工 0.7.7 与 OBS 拼豆插件使用说明")

# Page 1 - installation and transparent OBS source
c.setFillColor(PAPER)
c.rect(0, 0, W, H, stroke=0, fill=1)
rounded(c, 0, H - 261, W, 261, colors.HexColor("#F6DDEA"), 0)
rounded(c, 27, H - 234, W - 54, 205, WHITE, 26)
text(c, "拼豆工坊", 53, H - 105, size=29, bold=True)
text(c, "透明直播画面 · 3D 柱板 · 逐颗取豆", 54, H - 132, size=11, color=ROSE)
para(c, "先选图，再从带色号的盒子拿豆；观众礼物会帮忙或整蛊。熨烫后生成可旋转、缩放和翻看正反面的 3D 成品。", 54, H - 152, 282, size=10, leading=17)
board_diagram(c, 378, H - 205, 11)
text(c, "V5.6  /  单 HTML 插件", 53, H - 207, size=9, color=MUTED)

y = section(c, 1, "解压与导入插件", H - 281)
step_card(c, 1, "取出 HTML", "解压分享包，选择「拼豆-1.html」导入；ZIP 文件不能直接作为插件导入。", 43, y, 157, 124)
step_card(c, 2, "选择宿主", "菘蓝从顶部「自定义插件」导入；白曜重工 0.7.7 从「插件」页导入。", 219, y, 157, 124)
step_card(c, 3, "先看预览", "菘蓝点「预览」；白曜点右侧「桌面预览」。确认拼豆画面正常显示。", 395, y, 157, 124)
y -= 151

y = section(c, 2, "在 OBS「测试」场景添加浏览器源", y)
rounded(c, 43, y - 101, W - 86, 101, PALE_BLUE, 14)
para(c, "从宿主复制该插件的 OBS 浏览器源地址。在 OBS 的「测试」场景点来源「+」→「浏览器」，粘贴地址，宽高填 1280 × 720，再确定。需要按键时，右键浏览器源选「交互」并点击画面取得焦点。", 57, y - 14, W - 114, size=9.4, leading=16)
para(c, "白曜还需回到软件，把「白曜画面」拨到「已开启」。两套逐步操作见第 17 页；综合演示视频无配音、无字幕，录制时不需开播。", 57, y - 65, W - 114, size=9, leading=15, color=MUTED)
y -= 126
rounded(c, 43, y - 78, W - 86, 78, WHITE, 14, LINE)
text(c, "练习与实际礼物", 57, y - 24, size=11, bold=True)
para(c, "预览和插件内测试可在不开播时演练画面。实时礼物仍要由当前宿主连接直播间；本说明只演示安装，不代表已完成真实直播礼物联调。", 57, y - 38, W - 114, size=9, leading=15)
footer(c, 1)
c.showPage()

# Page 2 - daily operation
page_header(c, "从图案到第一颗豆", "在画板上半透明的颜色位置，对照盒子色号逐颗拼。", 2)
y = H - 112
y = section(c, 1, "选择图案与板格", y)
y = line_item(c, "预设图", "双击空白→图案与成品→选择图案，内含 52 张全新图纸，按猫兔、萌宠、甜品、人物、奇幻和花饰分组；采用 AI 辅助设计并整理为实际豆格。", y)
y = line_item(c, "自己上传", "支持 PNG、JPEG、WebP；图片会采样并匹配内置豆色。透明像素留空，不需要放豆。上传失败时保留当前图案。", y)
y = line_item(c, "选择尺寸", "可自定义 16–64 格；52 张预设会按板格重新取样，换回 46 格即原图。上传图片也按当前板格采样。", y)

y -= 4
y = section(c, 2, "逐颗取豆和放豆", y)
rounded(c, 43, y - 191, W - 86, 191, WHITE, 15, LINE)
jar_diagram(c, 76, y - 116)
c.setStrokeColor(BLUE)
c.setLineWidth(2)
c.line(161, y - 85, 215, y - 85)
c.line(215, y - 85, 207, y - 80)
c.line(215, y - 85, 207, y - 90)
board_diagram(c, 231, y - 165, 11)
text(c, "① 取一颗", 69, y - 34, size=10, bold=True, color=ROSE)
text(c, "② 对准柱位", 224, y - 34, size=10, bold=True, color=BLUE)
text(c, "③ 检查色号", 417, y - 34, size=10, bold=True, color=PURPLE)
para(c, "左侧实体豆盒每页最多 48 色，前沿显示色号。鼠标移入可看色名；左键夹取，再点同色号目标柱位。", 399, y - 51, 128, size=8.5, leading=13)
para(c, "红圈错色、橙圈多余、蓝圈脱位。脱位豆点击移走，错色豆空手取下；清理后高亮消失。自由创作不标错色。", 399, y - 104, 128, size=8.5, leading=13)
y -= 207
y = line_item(c, "看不清格子", "默认按住 M 查看放大镜，也可在设置中改为按一下开、再按一下关。双击部件解锁，拖动移动，拖右下角或滚轮缩放，再双击锁定。", y)
y = line_item(c, "限时拼豆笔", "获得升级拼豆笔后，同色豆可连续放多个柱位；容量与时长按对应互动级别设置。没收的是当前默认工具，礼物升级笔仍可用。", y)
rounded(c, 43, 75, W - 86, 49, PALE_BLUE, 12)
para(c, "完成条件：目标色位都正确，且板上没有多余或错色豆，摇落的豆已点击移走，库存托盘已复原。每遍完成后可烫制留存；若礼物增加了遍数，烫制后会开始同一图案的下一遍。", 56, 112, W - 112, size=9.2, leading=15)
c.showPage()

# Page 3 - gifts and spill recovery
page_header(c, "观众礼物：帮忙与整蛊", "双击空白→红黑互动；九种效果各自管理 0–20 个自定义互动级别。", 3)
y = H - 111
gifts = [
    ("摇桌子", "剧烈晃动会掉豆。逐颗点击直接移走，不放进手里；继续拼须从豆盒取新豆。", ROSE),
    ("随机换色", "随机把已拼豆换成另一色；错色需要重新处理。", PURPLE),
    ("帮拼豆", "随机挑空位或错色位，自动填入正确豆。", BLUE),
    ("减豆子", "随机拿走已拼豆，对应位置重新变为空位。", ROSE),
    ("隐藏提示", "暂时遮住半透明目标豆，不隐藏已放豆。", PURPLE),
    ("打翻托盘", "一次整盘散落，重复礼物合并；已拼板保持原样。", BLUE),
    ("没收工具", "没收设置里的默认工具（镊子或拼豆笔），限时不能取豆；观众送的升级拼豆笔仍可用。", ROSE),
    ("升级拼豆笔", "限时一次取多颗同色豆，并可按住在板上划动连续放豆。", PURPLE),
    ("再拼一遍", "增加当前图案必拼遍数，每遍可烫制留存，随后继续下一遍。", BLUE),
]
for index, (title, description, accent) in enumerate(gifts):
    col, row = index % 3, index // 3
    gift_card(c, title, description, 43 + col * 176, y - row * 108, accent)
y -= 345

y = section(c, 1, "打翻后怎样复原", y)
rounded(c, 43, y - 116, W - 86, 116, PALE_BLUE, 14)
para(c, "打翻的是装豆盒托盘中的库存豆，不会拆散柱板上已拼好的作品。把焦点放在插件交互画面，反复按下并松开空格；长按自动重复不计数，停按后进度缓慢回落。每填满一段，这一段散落的豆会排队飞回原来的盒子，盒子逐渐装满、摆正，直到五段全部完成。", 57, y - 14, W - 114, size=9.4, leading=16)
rounded(c, 58, y - 83, 450, 17, colors.HexColor("#D3E8F3"), 8)
rounded(c, 58, y - 83, 270, 17, BLUE, 8)
text(c, "单次进度会回落 · 库存豆逐段回盒", 58, y - 102, size=8.5, color=MUTED)
y -= 132

y = section(c, 2, "礼物数量如何结算", y)
para(c, "九种效果各有 0–20 个自定义互动级别。除托盘外，礼物数量只乘命中级别用量，不自动切换级别。托盘礼物一次打翻整盘，重复赠送合并；每级别只设连按次数与回落。旧规则迁移见第 16 页。", 54, y - 3, W - 108, size=9.3, leading=15)
rounded(c, 43, 79, W - 86, 53, WHITE, 12, LINE)
para(c, "提示：真实礼物名称可能与预填示例不同。首次开播前，请在自己的测试直播间发一份礼物，核对连接状态、名称匹配和实际效果。", 55, 117, W - 110, size=9, leading=15)
c.showPage()

# Page 4 - five finish materials and 3D archive
page_header(c, "五种熨烫与 3D 成品", "每遍完成后，选择方式、观看熨烫，再旋转检视成品。", 4)
y = H - 111
y = section(c, 1, "选择五种成品质感", y)
finishes = [
    ("澡巾烫", "连续熔面、浅细颗粒与哑光，减弱锐利亮光。"),
    ("褶皱烘焙纸烫", "不规则短折痕与凹凸反光；每件随机，保存后不变。"),
    ("毛巾烫", "较大的圈绒压纹与柔散射，区别于澡巾细颗粒。"),
    ("双面保孔烫", "正反面中心孔开放，保留像素颗粒与厚度。"),
    ("单面无孔烫", "正面平整封孔亮面，背面仍保留凹孔。"),
]
for index, (name, desc) in enumerate(finishes):
    top = y - index * 39
    rounded(c, 43, top - 34, W - 86, 34, WHITE if index % 2 == 0 else PALE_BLUE, 7, LINE)
    text(c, name, 56, top - 22, size=9.4, bold=True)
    para(c, desc, 191, top - 9, W - 248, size=8.6, leading=13)
y -= 209
y = section(c, 2, "预览、熨烫与检视", y)
para(c, "先点选一种方式，窗口内即可预览真实 3D 材质；点「开始熨烫」后，熨斗会在工作台上扫过。完成后拖动旋转、滚轮缩放，查看表面、厚度和背面；点「完成，返回工作台」关闭，再点「检视成品」可重新打开。五种方式按用户给出的质感描述制作，是游戏视觉模拟，不提供实物加热参数。", 54, y - 2, W - 108, size=9.1, leading=15)
y -= 89
y = section(c, 3, "保存纹理和 3D 数据", y)
y = line_item(c, "存入作品库", "当前浏览器保存豆色网格、熨烫方式和纹理种子；点「3D 检视」复看时不会重新随机纹理，最多 50 份。", y)
y = line_item(c, "下载 3D 模型", "导出 GLB，包含实体几何、颜色和材质贴图。其他支持 GLB 的软件可打开查看。", y)
y = line_item(c, "下载 PNG", "导出当前 3D 检视角度的透明图片，纹理与眼前成品一致；PNG 本身不能旋转。", y)
rounded(c, 43, 74, W - 86, 49, WHITE, 10, LINE)
para(c, "作品库只属于当前浏览器，换设备不会自动同步。GLB 和 PNG 是独立本地文件。熨完但尚未存库时刷新，也可以重新打开待存成品。", 56, 111, W - 112, size=8.7, leading=14)
c.showPage()

# Page 5 - troubleshooting and physical limitations
page_header(c, "常见问题与物理说明", "先看连接状态和浏览器提示，再用模拟礼物复现。", 5)
y = H - 111
y = section(c, 1, "操作中常见问题", y)
faq = [
    ("OBS 画面带白底", "双击空白打开设置，确认「透明背景」已勾选（默认开启）；使用 OBS 浏览器来源。浅木桌面是可选展示模式；窗口采集会同时采入浏览器底色。"),
    ("礼物没有反应", "检查当前宿主的插件画面是否开启、直播连接状态、礼物名称和互动级别开关；先用插件内预览核对效果。独立浏览器可检查本机 9910 回退连接。"),
    ("空格没有复原托盘", "先在 OBS 的「交互」窗口或插件页点一下画面取得焦点，再一次次按下、松开空格；长按无效。"),
    ("上传图片不生效", "仅选 PNG/JPEG/WebP；图片需要能正常解码。透明区域会留空，过大或损坏文件会被拒绝。"),
    ("成品库空白或保存失败", "检查是否换了浏览器或设备，以及浏览器存储权限和剩余空间；另下载 GLB 保存 3D 模型，PNG 仅为静态分享图。"),
]
for title, body in faq:
    y = line_item(c, title, body, y)
    y -= 3

y -= 1
y = section(c, 2, "3D 物理的真实性边界", y)
rounded(c, 43, y - 133, W - 86, 133, PALE_BLUE, 14)
para(c, "画面由 Three.js 绘制。豆子以带孔环段和实体柱建模；已套柱的豆保留稳定的套柱状态。摇晃达到释放条件后，脱柱豆由 Rapier 3D 计算碰撞、下落和滚动。", 57, y - 14, W - 114, size=9.4, leading=16)
para(c, "这是一套便于直播交互的混合物理模型，并非逐颗豆全程的材料级精密仿真。成品的熨合形态也是视觉模拟，不预测实物强度。大板同时活动的散落豆有数量上限；运行必须支持 WebGL 2；不可用时显示环境指导页，停止启动游戏。", 57, y - 75, W - 114, size=9.2, leading=15, color=MUTED)
y -= 150
rounded(c, 43, y - 68, W - 86, 68, WHITE, 12, LINE)
text(c, "版本与接入说明", 56, y - 24, size=10.5, bold=True)
para(c, "V5.6：自定义互动级别，旧规则迁入新列表。菘蓝与白曜重工 0.7.7 安装见第 17 页；实时礼物需现场核对。", 56, y - 35, W - 112, size=8.7, leading=14)
rounded(c, 43, 81, W - 86, 100, WHITE, 12, LINE)
text(c, "实物熨烫参考资料", 56, 158, size=10, bold=True)
para(c, "Perler 标准方法要求豆边熨合、中心孔仍开放，并在冷却后翻面熨另一侧；其 FAQ 说明更强热量可能使孔闭合、豆面更平。Hama 也说明逐颗套柱、隔纸打圈熨烫和冷却。保孔与封孔参照这些说明；布面、褶皱与纤维质感按用户的风格描述模拟。", 56, 148, W - 112, size=8.3, leading=12)
source_link(c, "Perler 标准熨合", "https://perler.com/blogs/projects/standard-fusing-method", 56, 98)
source_link(c, "Perler FAQ", "https://perler.com/pages/frequently-asked-questions", 198, 98)
source_link(c, "Hama 使用方法", "https://www.hamabeads.com/how-to-use/", 313, 98)
footer(c, 5)
c.showPage()
page_header(c, "V3 操作速查与升级说明", "2026-09-24 · 本次九项修改", 6)
y=H-111
y=section(c, 1, "按部件调整布局", y)
for heading, body in [
 ("打开菜单", "双击画面空白处；点击菜单外或按 Esc 关闭。菜单不会固定挡住直播画面。"),
 ("移动与缩放", "双击豆板、整组豆盒、停放镊子、熨斗与底垫、参考图或状态条，出现虚线框后可拖动；拖右下角或在框内滚轮缩放。再双击该部件锁定，恢复正常拼豆。"),
 ("保存布局", "六个部件分别保存位置、大小与锁定状态，刷新后恢复。设置内可以恢复默认布局。熨烫后熨斗回到自定义停放位置；跟随鼠标的工具只在操作区域显示，不单独拖拽。"),
 ("放大镜", "放大镜触发方式可选「按住显示、松开关闭」或「按下切换、再按关闭」，默认按住。画面与操作中可修改按键、倍率和镜片大小；选择会保存。Esc、打开菜单或离开插件焦点会关闭放大镜。需要让 OBS 交互窗口取得键盘焦点。"),
 ("紧密豆盒", "画面与操作→豆盒显示→当前图案用色。只保留需要的颜色，并紧密重新排列；P 色号与板上提示一一对应。"),
]:
 y=line_item(c, heading, body, y)
y=line_item(c, "镊子跟随灵敏度", "画面与操作中设置 0.25×—3×，默认 1×；低档跟随慢且平滑，高档更跟手。拼豆笔沿用该设置。点击时工具会对齐鼠标落点。选择随设置与存档保存。", y)
y=section(c, 2, "两类散落的处理", y)
y=line_item(c, "摇桌掉豆：点击移走", "蓝圈会跟随脱位豆移动，落地和刷新后仍保留。点击散落豆直接移走，不会夹到手中，也不会装进拼豆笔。继续拼需要从豆盒重新拿新豆；手中已有的新豆不受影响。散豆不会自动消失，刷新也不会清理。", y)
y=line_item(c, "打翻库存托盘：连按空格", "按下、松开空格，完成五段回落进度条；每段都有库存豆飞回盒子的动画。此操作不会替你清理摇桌掉落的作品豆。", y)
y=section(c, 3, "升级与验证范围", y)
para(c, "沿用原进度与作品库。旧版单条礼物规则保留在中档，轻档与重档可分别编辑；升级首次默认透明背景，之后记住选择。V2 已包含统一 3D 工作台、五种熨烫和纹理保存，V3 在此基础上改进操作。测试覆盖本地 HTTP 浏览器操作、模型与接入模拟；未在真实菘蓝直播间发礼物联调。", 54, y-2, W-108, size=9, leading=15)
c.showPage()
page_header(c, "V4：模式、关卡与色彩精度", "三个模式分别保存进度；从双击菜单的「模式与关卡」进入。", 7)
y=H-111
y=section(c, 1, "单图、关卡、自由创作", y)
for title,body in [
 ("单图拼豆", "沿用原来的选图流程：选择预设或上传图片，按半透明色号提示逐颗完成。"),
 ("关卡模式", "列表中的每一关都可从预设添加或上传自己的图；新增时设置板格，随后可改名、换图、排序和删除，逐关选择颜色精度。至少保留一关，最多 100 关。编辑列表会重置该组的挑战进度。"),
 ("继续下一关", "开始闯关后按列表顺序拼豆。完成本关所需遍数并熨烫，返回工作台点击「下一关」；最后一关点击「完成闯关」。刷新保留当前关卡，已保存的成品留在作品库。"),
 ("自由拼豆", "从空板开始，全色库可用；可输入作品名、自选颜色并加入豆盒，再逐颗取用。没有标准答案，放好至少一颗即可主动完成，成品取自实际放下的豆。"),
 ("自由模式礼物", "帮助拼豆不执行。再拼一个要求复刻本次完成的作品：首次熨烫冻结其颜色和位置，之后按提示重拼。其余干扰、笔和托盘复原照常。切换模式分别保存进度。"),
]:
 y=line_item(c,title,body,y)
y=section(c, 2, "五档颜色精细度", y)
para(c, "单图模式选择 48 / 96 / 144 / 256 色，或「原色保留」。档位越高，可匹配的中间色越多；原色直接保留板格采样得到的 RGB 色值，不把近似色合并。关卡在各自一行选择档位；自由模式开放所有颜色，不受转换色库限制。",54,y-2,W-108,size=9.3,leading=16)
y-=92
y=line_item(c,"豆盒翻页与查色", "每页最多 48 个盒子，托盘下方可翻页。查找栏支持 P 色号、颜色名称或 #RRGGBB，清空恢复全部。当前图案用色仍会紧密排列。",y)
y=line_item(c,"颜色不等于板格", "色彩档位决定可匹配多少颜色，板格决定像素数量；两者分开设置。原色最多受当前板格数量限制。内置 P 色号是本游戏虚拟色库，不代表实物品牌色卡。",y)
c.showPage()
page_header(c, "V4：重新区分五种烫制表面", "根据熔合孔型、表面压纹与反光分别调整，仍为可检视的真实 3D 模型。", 8)
y=H-111
y=section(c, 1, "新版材质对照", y)
for title,body in [
 ("澡巾烫：细密浅纹", "连续的熔合正面上叠加浅细颗粒，表面高粗糙度、弱高光；靠近观察能看出细微起伏。"),
 ("褶皱烘焙纸：不规则折痕", "跨越豆色边界的长短折痕，局部有凸脊、凹槽和不同粗糙度。几何起伏与法线贴图共同表现，纹理种子随作品保存。"),
 ("毛巾烫：圈绒压纹", "比澡巾更大、更明显的织物圈纹，配柔和反光。表现塑料留下的布纹，不把整件模型变成真正的毛绒玩具。"),
 ("双面保孔：圆孔与颗粒", "保留贯穿圆孔、圆润肩部与相邻豆的熔合连接，两面都能检视；厚度比封孔面更明显。"),
 ("单面无孔：平整封面", "正面连续封孔，平整亮面形成较宽的高光；背面仍留凹孔，翻面后可直接看出区别。"),
]:
 y=line_item(c,title,body,y)
y=section(c, 2, "查看与保存", y)
para(c,"五种材质都可先预览。拖动旋转、滚轮靠近查看；熨烫后导出的 GLB 保留几何、法线与粗糙度贴图，PNG 是当前角度。V4 会用新版材质重新呈现旧作品的色格、样式和纹理种子，因此外观会与 V3 略有不同；已经下载的旧 PNG/GLB 不会改变。",54,y-2,W-108,size=9.2,leading=15)
y-=94
y=section(c, 3, "联网参考与取舍", y)
para(c,"Perler 官方说明：标准熔合连接豆边并保留中心孔，更多热量可能使孔闭合，过度按压会压扁豆；Hama 说明熔合让相邻豆连接为整体。布纹与褶皱的名称没有统一外观标准，社区教程对毛巾、澡巾的纹路深浅也有差异。本版按上述孔型原则与用户指定的视觉方向进行模拟，不给出实物温度、压力或安全操作参数。",54,y-2,W-108,size=9,leading=15)
y-=109
source_link(c,"Perler 官方熔合 FAQ","https://perler.com/pages/frequently-asked-questions",54,y)
source_link(c,"Hama 使用方法","https://www.hamabeads.com/how-to-use/",261,y)
source_link(c,"社区纹理对照：PixelBeads","https://www.pixelbeads.io/zh-cn/blog/how-to-iron-perler-beads",54,y-22)
c.showPage()
page_header(c, "V4.1：一次拼不完，存档再继续", "双击空白→存档与继续；进度存档与熨烫成品库分别管理。", 9)
y=H-111
y=section(c,1,"自动保存与命名存档",y)
for title,body in [
 ("自动保存", "每次操作后及定时保存当前进度，关闭页面后在同一浏览器、同一插件地址重新打开可继续。设置页显示最近成功时间；失败时会明确提示。"),
 ("命名保存", "输入存档名，点击「新建存档」。最多同时保留 20 份未完成作品；每份可继续、导出、覆盖为当前进度或删除。覆盖与删除会先确认。"),
 ("继续拼豆", "读取前会把当前进度保存到单独的「读取前的恢复备份」，再读取所选存档；误选时可从这份备份返回。备份写入失败时，不替换当前画板。"),
]: y=line_item(c,title,body,y)
y=section(c,2,"本地文件备份与换设备",y)
for title,body in [
 ("导出", "点击「导出当前进度」，下载 .拼豆存档.json 文件。也能从某份命名存档旁点「导出」。即使浏览器自动保存不可用，也可导出本地文件留存。"),
 ("导入预览", "点击「导入存档文件」，先核对名称、模式、板格、已放豆数量和保存时间。确认只把文件加入存档库，点「继续拼豆」才替换当前画板。取消不影响当前进度。"),
 ("校验与限制", "文件上限 15 MB。损坏文件、无效颜色、错位豆子、重复编号、不匹配的图案、异常遍数或设置会被拒绝。请导入本插件导出的进度文件，不选择图纸 JSON 或 GLB。"),
]: y=line_item(c,title,body,y)
y=section(c,3,"哪些内容会保存",y)
para(c,"包括完整图案、已经放下的豆、等待移走的掉落豆及位置、库存托盘复原阶段与当前进度、关卡列表和所在关、追加遍数、自由重复目标、三个模式的进度、设置和待存成品数据。限时礼物仍按实际时间到期；镊子手中尚未放下的豆不计入已拼进度。作品库中的其他已存成品不包含在进度文件中，需要另行导出 GLB/PNG。",54,y-2,W-108,size=9.2,leading=16)
y-=116
rounded(c,43,y-69,W-86,69,PALE_BLUE,12)
para(c,"V5.0 已把预设列表全部替换为 52 张新图纸。旧版未完成作品继续保留，升级后会打开新图库；建议先存档再换图。保留 V4.7 的镊子跟随灵敏度、错豆与脱位豆高亮。",56,y-14,W-112,size=9,leading=15)
c.showPage()
page_header(c, "V4.4：分享文件与 OBS 下拉兼容", "所有下拉选项改为网页内绘制，脚本和样式都在交付 HTML 中。", 10)
y=H-111
y=section(c,1,"这次检查了哪些依赖",y)
for title,body in [
 ("下拉控件", "全部静态下拉与每关动态生成的颜色下拉使用内置 HTML/CSS/JavaScript。浏览器原生 select 只保留为隐藏的数据状态，不再用它弹出选项窗口。"),
 ("游戏资源", "Three.js、Rapier 及 WASM、图案、材质生成和页面样式均包含在单个 HTML。显示文字使用系统字体，不需下载字体或安装前端开发工具。"),
 ("礼物通道", "宿主负责提供实时礼物消息；独立浏览器可尝试本机 9910 WebSocket 回退连接。下拉菜单不依赖礼物连接成功。"),
]:y=line_item(c,title,body,y)
y=section(c,2,"怎样发给别人使用",y)
for title,body in [
 ("发送交付文件", "发送最新版 ZIP，接收者解压后把「拼豆-1.html」导入自己的菘蓝整蛊插件或白曜重工 0.7.7，并复制自己宿主生成的 OBS 地址。开发预览 http://localhost:8137 只在开发机运行，不是可分享的网站地址。"),
 ("替换旧版本", "接收者需要重新导入或更新 HTML，并刷新 OBS 浏览器来源。检查设置里的下拉是否在页面内展开；只刷新旧文件不会得到新功能。"),
 ("操作", "在 OBS 浏览器源的「交互」窗口点击下拉，再点选项。方向键可移动、回车确认、Esc 关闭选项，点击外部也会收起。选项靠近底部时向上展开，窗口内滚动不会被设置面板裁掉。"),
]:y=line_item(c,title,body,y)
y=section(c,3,"实测与适用边界",y)
para(c,"已在全新 Chrome 环境使用交付 HTML 进行测试：外网素材请求被阻止、全新存储、localStorage 与 IndexedDB 不可用、iframe 嵌套，以及普通和较小窗口。检查了全部静态下拉、每关动态下拉、禁用状态、键盘和刷新恢复。原生下拉弹层调用为 0。未在接收者的具体 OBS/CEF 版本上实机测试。",54,y-2,W-108,size=9.2,leading=16)
y-=118
para(c,"OBS 项目历史问题记录 #5498 报告过原生 select 弹层不显示。本次针对这种宿主依赖改为页面内控件；该历史记录不表示所有现行 OBS 版本都会出错。",54,y-2,W-108,size=8.7,leading=14)
source_link(c,"OBS #5498 原生下拉问题记录","https://github.com/obsproject/obs-studio/issues/5498",54,y-52)
c.showPage()
page_header(c, "V5.0：52 张新图纸", "预设已经替换；当前旧作品与历史存档仍能继续。", 11)
y=H-111
y=section(c,1,"新图库与色号",y)
for title,body in [
 ("52 款新设计", "猫猫与兔兔 8 款、治愈萌宠 8 款、甜品咖啡馆 16 款、小小人物 4 款、奇幻世界 12 款、花束与挂饰 4 款。图纸为 AI 辅助生成并转成逐格数据，不标称小红书热榜排名。"),
 ("逐格保留细节", "每款显示原生尺寸、颜色数和用豆量。选择时若板格不足，会扩大到能放下整张图；更大板格只增加留白，不把一颗豆放大成多颗。新图约 831–1788 颗，适合存档分次拼。"),
 ("颜色精细档位", "仍可选 48、96、144、256 色库或原色保留。P 开头是内置色库，G 开头是新图纸专用色，自选颜色使用十六进制标识；这些是游戏色号，不是实体豆品牌色号。提示与瓶子使用相同编号。"),
 ("更方便取豆", "全部颜色下，本图用色优先排在前面；选择「当前图案用色」只显示本图所需色，紧密排列。新用户默认原色保留；老用户保留之前选择的档位。"),
]:y=line_item(c,title,body,y)
y=section(c,2,"升级与兼容",y)
for title,body in [
 ("旧画板不会被清空", "升级时新图库自动展示；正在拼的旧图标注「旧版进度」。先命名保存或导出 JSON，再选新图。预设列表已移除旧款，但旧存档仍有自己的图案格子和进度。"),
 ("重新导入 HTML", "接收者需用 V5.6 的 HTML 更新菘蓝或白曜中的自定义插件，并刷新 OBS 来源。新图库与色号都内置在 HTML 中，不依赖图片网站、小红书登录或素材服务器。"),
 ("生成与验证", "4 张透明图集经取格、限色、边缘清理与连通检查形成 52 张数据图纸。已检查唯一性、透明留边、用豆统计、手工取放、保存刷新、3D 熨烫与 GLB 导出。"),
]:y=line_item(c,title,body,y)
para(c,"检索状态：本轮尝试访问小红书搜索页，但需要登录；用户随后选择暂不登录，因此未核实站内点赞、收藏或排名。图库采用自行生成的题材设计，未把未核实热度标在图纸上。",54,y-5,W-108,size=9,leading=15)
c.showPage()
page_header(c, "V5.0.1：换电脑与离线使用", "解压后只需一个 HTML；不需要开发服务器、素材目录或编程环境。", 12)
y=H-111
y=section(c,1,"完全离线怎样打开",y)
for title,body in [
 ("发送文件", "将最新 ZIP 发给对方并解压。浏览器直接打开其中的「拼豆-1.html」即可玩，建议使用较新的 Chrome 或 Edge。不要把开发预览 localhost:8137 地址发给对方。"),
 ("离线功能", "52 张预设、导入本地图片、单图/关卡/自由模式、取放豆、布局、色号、放大镜、手动测试互动、进度存档、五种熨烫和 PNG/GLB 导出均在本地完成。"),
 ("OBS 与礼物", "纯离线展示可尝试 OBS 浏览器来源的「本地文件」，选择 HTML，再在「交互」窗口操作。要接收实时观众礼物，需运行并连接对应的菘蓝或白曜宿主；断网不影响本地拼豆。具体 OBS/CEF 环境仍需现场验证。"),
]:y=line_item(c,title,body,y)
y=section(c,2,"换电脑继续未完成作品",y)
for title,body in [
 ("旧电脑导出", "双击空白→存档与继续→导出当前进度，取得 .拼豆存档.json。HTML 本身不包含你在浏览器里保存的作品和进度。"),
 ("新电脑导入", "打开 HTML→存档与继续→导入存档文件→核对预览→加入存档库→继续拼豆。只复制 HTML 能开始玩新作品，继续旧进度还需要 JSON。"),
 ("避免丢档", "浏览器存储受浏览器配置和文件地址影响，移动 HTML 或清理浏览器可能改变存档位置。重要作品请保留 JSON，成品另存 PNG 或 GLB。存储不可用时页面会提示，仍可导出文件。"),
]:y=line_item(c,title,body,y)
y=section(c,3,"本次修复与实测范围",y)
para(c,"V5.0.1 曾修复 2D 降级的 G 色号；V5.1 按用户要求取消整个 2D 降级模式，改为 WebGL 2 必需。单图/关卡/自由创作、存档、放大镜两种模式、工具布局、脱位高亮与点击清除均已回归。",54,y-2,W-108,size=9.2,leading=16)
y-=68
para(c,"离线验收采用从分享包提取的 HTML，放到仅含该文件的新目录，以全新 Chrome / Edge 配置直接通过 file: 打开并禁用网络。已验证本地 3D 操作、菜单、存档、熨烫与文件导出；外部资源与其他文件依赖为 0。并非在另一台实体电脑测试，不承诺任意旧浏览器或关闭图形加速的设备都能显示 3D。",54,y-2,W-108,size=9.2,leading=16)
c.showPage()
page_header(c, "V5.1：WebGL 为必需条件", "取消 2D 降级；缺少图形支持时只显示轻量的环境指导页。", 13)
y=H-111
y=section(c,1,"启动前需要什么",y)
para(c,"使用支持 WebGL 2 的新版 Chrome、Edge 或 OBS 浏览器来源。WebGL 是浏览器自带的图形功能，不是需要另装的插件。环境满足后，本插件仍可单文件、离线运行。",54,y-2,W-108,size=9.5,leading=16)
y-=76
y=section(c,2,"无法启动时按顺序检查",y)
for title,body in [
 ("浏览器", "更新 Chrome 或 Edge。在浏览器设置中搜索「图形加速」或「硬件加速」，开启可用时使用图形加速，再重启浏览器。"),
 ("OBS", "更新 OBS，并检查当前版本是否提供浏览器来源的硬件加速设置，调整后重启 OBS。独立浏览器与 OBS 是不同运行环境，修改 Chrome 不会自动修改 OBS。"),
 ("显卡驱动", "从电脑或显卡厂商官网更新显卡驱动并重启电脑。远程桌面和虚拟机可能限制图形功能，可改在本机桌面打开。"),
 ("重新检测", "指导页提供「已设置好，重新检测」按钮。页面会重新加载并检测；条件仍不满足时继续显示指导，不生成数千个平面格子。"),
]:y=line_item(c,title,body,y)
y=section(c,3,"进度与本次验证",y)
para(c,"缺少 WebGL 时不会启动拼豆物理、游戏动画或礼物连接，不会覆盖已有存档。运行中图形连接中断也会停止游戏并提示；重新加载后从最近成功保存的进度继续。",54,y-2,W-108,size=9.2,leading=16)
y-=82
para(c,"已模拟启动时 WebGL 不可用、正常离线 3D、运行时图形连接丢失、重新检测及 8 颗已拼豆的恢复；67 项自动测试通过。OBS/CEF 和其他实体电脑尚未实机验证。",54,y-2,W-108,size=9.2,leading=16)
y-=74
source_link(c,"Chrome 官方安装说明","https://support.google.com/chrome/answer/95346",54,y)
source_link(c,"Edge 官网","https://www.microsoft.com/edge/download",260,y)
source_link(c,"OBS 浏览器源说明","https://obsproject.com/kb/browser-source",370,y)
c.showPage()

# Page 14 - V5.2 / V5.3
page_header(c, "V5.2–V5.3：拼豆笔、礼物播报与画质", "双击空白→画面与操作，可设置默认工具、画质和播报位置。", 14)
y=H-111
y=section(c,1,"默认工具与升级拼豆笔",y)
for title,body in [
 ("默认工具", "「拼豆工具」里选镊子（一次一颗，默认）或拼豆笔（一次取 2–20 颗同色豆，默认 3 颗）。拼豆笔每颗仍要点到柱位。"),
 ("升级拼豆笔", "观众送「拼豆笔」后限时升级：容量变大，并可按住鼠标在板上划过去连续放豆。放错一颗（照样圈红）、划出图案或豆用完时自动停笔。"),
 ("没收工具", "没收的是默认工具；升级拼豆笔生效时仍可继续拼。"),
]:y=line_item(c,title,body,y)
y-=4
y=section(c,2,"礼物排队、播报与确认框",y)
for title,body in [
 ("逐条结算", "多个礼物同时到达时约一秒结算一条，画面上方叠放最近 4 条播报。「调整礼物播报位置」会先显示示例，可拖动、缩放，双击锁定。"),
 ("连续摇桌", "礼物数量为 N 时连摇 N 次；每次摇都会重新判断，没摇掉的豆下次仍可能被摇掉。"),
 ("页面内确认", "换图、改板格、清空、删除成品、读取存档等操作改用插件自己的确认框。OBS 浏览器源不显示浏览器自带的弹窗，旧版在 OBS 里点了可能没反应。"),
]:y=line_item(c,title,body,y)
y-=4
y=section(c,3,"画质设置",y)
para(c,"「成品 3D 画质」与「工作台画质」各有标准、高、超高三档，默认高。成品：高档的孔和边更圆，表面纹理约 2K；超高档分段最细，最高 4K 纹理，并 1.5 倍超采样。熔面款能看出豆缝，颜色接近色号。工作台的「高」与旧版相同；OBS 掉帧时可选「标准」。下载的 GLB 模型按所选精度生成，超高档文件约 50 MB。",54,y-2,W-108,size=9.2,leading=16)
c.showPage()

# Page 15 - V5.4 / V5.5
page_header(c, "V5.4–V5.5：图纸缩放、位置提示与成品生成", "板格上限 64；换板格时图纸自动换成对应尺寸的版本。", 15)
y=H-111
y=section(c,1,"换板格自动缩小或放大图纸",y)
para(c,"在「豆板格数」里换板格，52 张图纸会换成从高清原图重新取样的版本：缩小时省豆，描边优先保留；放大时加入原图里的嘴、腮红、籽等细节。确认框显示预览和豆数，换回 46 格就是原图。色号不变，每个尺寸都连成一整块。",54,y-2,W-108,size=9.2,leading=16)
y-=84
rows=[("板格","16","20","24","30","36","40","46（原图）","48","56","64"),("草莓抱抱猫豆数","131","224","333","544","799","1001","1304","1437","1995","2642")]
widths=[80]+[36]*6+[52]+[36]*3
for r,row in enumerate(rows):
    x=54
    for i,value in enumerate(row):
        rounded(c,x,y-20-r*24,widths[i],20,PALE_BLUE if r==0 else WHITE,5,LINE)
        text(c,value,x+5,y-14-r*24,size=7.8,bold=(i==0))
        x+=widths[i]+2
y-=66
y=section(c,2,"拿豆时位置提示",y)
para(c,"手里拿着某个颜色时，板上还空着、需要这个颜色的位置会闪烁白边加色圈，大板上更容易找到位置。遮图纸或关闭「半透明提示」时不亮；可在「拿豆时提示对应位置」关闭。",54,y-2,W-108,size=9.2,leading=16)
y-=68
y=section(c,3,"豆盒打翻动画与成品后台生成",y)
for title,body in [
 ("打翻与复原", "豆盒依次被掀歪，豆撒到托盘前方的桌上；每复原一段，这一段的豆飞回盒子。刷新后保持散落状态。"),
 ("成品后台生成", "熨烫动画一开始就在后台线程生成成品模型，高画质、超高画质也不会让动画或工作台停住；还没算完时显示「正在生成成品 3D 模型…」。"),
 ("大板性能", "已拼好的豆合并绘制，46 格拼满时每帧绘制次数约为原来的十分之一。64 格每颗豆很小，建议按 M 使用放大镜。"),
]:y=line_item(c,title,body,y)
c.showPage()

# Page 16 - V5.6 interaction levels
page_header(c, "V5.6：自定义互动级别", "九种效果分别配置；每种效果可有 0–20 个级别。", 16)
y=H-111
y=section(c,1,"添加、命名和启停",y)
for title,body in [
 ("从零开始", "打开「红黑互动」，选择一种效果，可添加级别；该效果也允许没有级别。每种效果最多 20 个，其他效果的数量不受影响。"),
 ("逐级别管理", "每级别都可改名称、关闭或重新启用；不再使用的级别可以删除。关闭的级别保留规则，删除前应确认不再需要。"),
 ("先预览", "编辑后用对应级别的预览检查效果，再在自己的测试直播间核对礼物名称与实际数量。预览不需要开播。"),
]:y=line_item(c,title,body,y)
y-=2
y=section(c,2,"礼物与专属参数",y)
for title,body in [
 ("礼物绑定", "每级别填写匹配的礼物名称；除托盘外，还可设置每份礼物的基础用量。收到多份时，数量只乘命中级别的用量，不自动切换级别。"),
 ("按效果细调", "摇桌可调力度、时长，升级拼豆笔可调容量。打翻托盘一次触发整盘散落，每级别只设每段连按次数与进度回落，不使用数量倍率。"),
 ("逐条结算", "礼物同时到达时按顺序处理和播报；已有计时效果分开送会累加。重复赠送打翻托盘时合并为同一次整盘事件。"),
]:y=line_item(c,title,body,y)
y-=2
y=section(c,3,"从旧版升级",y)
for title,body in [
 ("旧轻、中、重三档迁移", "旧规则迁为可编辑互动级别，保留礼物名称、基础用量和效果专属参数；原本启用但礼物名为空时，迁移后关闭，以保持不触发。升级后仍可增删和重命名。"),
 ("保留作品", "更新 HTML 后先检查已有进度与成品库，再逐种效果复核礼物配置。移动 HTML 或换浏览器可能改变本地存储位置，重要进度先导出 JSON。"),
]:y=line_item(c,title,body,y)
rounded(c,43,68,W-86,49,PALE_BLUE,12)
para(c,"升级注意：不要仅刷新旧 OBS 来源而继续使用旧 HTML。应先在宿主导入 V5.6 的「拼豆-1.html」，再刷新浏览器源。",56,105,W-112,size=9.2,leading=15)
c.showPage()

# Page 17 - host installation and silent demo
page_header(c, "V5.6：菘蓝与白曜重工安装", "两个宿主分别使用自己生成的 OBS 地址；只在「测试」场景演练。", 17)
y=H-111
y=section(c,1,"菘蓝整蛊插件",y)
for title,body in [
 ("1  打开插件页", "打开菘蓝，点顶部「自定义插件」。"),
 ("2  导入", "在插件列表导入交付目录中的「拼豆-1.html」。"),
 ("3  预览", "点「预览」，确认拼豆画面显示。"),
 ("4  复制地址", "复制该插件的 OBS 源地址。"),
 ("5  加入 OBS", "在 OBS「测试」场景点来源「+」→「浏览器」，粘贴地址，宽高填 1280 × 720，确定。"),
]:y=line_item(c,title,body,y)
y-=4
y=section(c,2,"白曜重工 0.7.7",y)
for title,body in [
 ("1  打开插件页", "运行白曜重工 0.7.7，进入「插件」页。"),
 ("2  导入", "点底部「更多插件与高级说明」，导入同一份「拼豆-1.html」。"),
 ("3  桌面预览", "点右侧「桌面预览」，确认拼豆画面显示。"),
 ("4  复制地址", "点「OBS 浏览器源」，复制链接。"),
 ("5  加入 OBS", "在 OBS「测试」场景添加浏览器源，粘贴链接，宽高填 1280 × 720。"),
 ("6  开启画面", "回到白曜，把「白曜画面」胶囊拨到「已开启」。"),
]:y=line_item(c,title,body,y)
rounded(c,43,58,W-86,49,WHITE,12,LINE)
para(c,"随包是一条连续视频：先演示菘蓝、再演示白曜，随后展示主要功能与九种互动。原片无配音、无字幕；操作间留 1–2 秒，全程不需开播。",56,95,W-112,size=9.2,leading=15)
c.save()
print(f"Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
