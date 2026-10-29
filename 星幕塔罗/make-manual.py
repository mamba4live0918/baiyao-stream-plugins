from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
ROOT=Path(__file__).resolve().parent
pdfmetrics.registerFont(TTFont('CN','C:/Windows/Fonts/simsun.ttc',subfontIndex=0))
W,H=595.28,841.89
c=canvas.Canvas(str(ROOT/'星幕塔罗-3-使用说明.pdf'),pagesize=(W,H))
c.setTitle('星幕塔罗 1.2 使用说明')
c.setAuthor('星幕塔罗')
style=ParagraphStyle('body',fontName='CN',fontSize=10.5,leading=18,textColor=HexColor('#362e40'),wordWrap='CJK',spaceAfter=8)
small=ParagraphStyle('small',parent=style,fontSize=9,leading=15,textColor=HexColor('#6a5a72'))
y=0
def base(n,title,sub):
    global y
    c.setFillColor(HexColor('#171221'));c.rect(0,H-145,W,145,fill=1,stroke=0)
    c.setFillColor(HexColor('#dcc190'));c.setFont('CN',12);c.drawString(42,H-37,'星幕塔罗  /  1.2')
    c.setFillColor(HexColor('#f8f2e7'));c.setFont('CN',25);c.drawString(42,H-82,title)
    c.setFillColor(HexColor('#c9bacf'));c.setFont('CN',10);c.drawString(42,H-111,sub)
    c.setStrokeColor(HexColor('#d6c6b0'));c.line(42,42,W-42,42)
    c.setFillColor(HexColor('#81718a'));c.setFont('CN',9);c.drawString(42,27,'星幕塔罗 · 单文件直播牌桌 · 2026-09-12');c.drawRightString(W-42,27,f'{n} / 3')
    y=H-173
def heading(t):
    global y
    y-=8;c.setFillColor(HexColor('#564168'));c.setFont('CN',15);c.drawString(42,y,t);y-=28
def para(t,sm=False):
    global y
    p=Paragraph(t,small if sm else style);pw,ph=p.wrap(W-84,y-55);assert y-ph>52,(t,y,ph);p.drawOn(c,42,y-ph);y-=ph+9
base(1,'从排队到展牌','观众排队参与，主播掌控每一步。')
heading('01  打开牌桌')
para('解压分享包，打开“星幕塔罗-3.html”。牌面、牌义、样式与交互均内置，无需开发服务器。开局页面中央直接列出全部牌阵、张数和排列预览。先选牌阵，再点“自由占卜”，或从右侧队列开始下一位。')
heading('02  观众排队与 HUD')
para('右侧填写昵称、主题和“算什么”，点击“加入队列”。HUD 同时显示当前观众及问题、下一位及问题、等待人数。点击名单中的铅笔编辑；上下箭头调整顺序；× 移出名单。')
para('点击“开始下一位”取队首。礼物入列默认没有具体问题，显示“问题待补充”；主播点击“编辑问题”补填。问题和昵称会出现在直播 HUD 中。')
heading('03  默认快捷流程')
para('<b>接待：</b>选好牌阵，点“自由占卜”或“开始下一位”。插件自动洗好牌并展开待选牌堆，直接进入抽牌。')
para('<b>抽牌：</b>最快的方式是点“一键抽牌并翻开”，立即摆出完整牌阵。也可以逐张点击扇形牌背，抽齐后自动进入翻牌，再点击牌面或“全部翻开”。')
para('<b>解读：</b>点击牌面看牌义；“解读与笔记”可记录自己的判断、导出 TXT。需要更多参考时可补充最多 5 张牌。')
para('<b>下一位：</b>点“完成并接下一位”，本次自动归档，队首直接进入抽牌，沿用已选牌阵。没人排队时“保存本次 · 收牌”，返回开局页面。')
heading('想保留洗牌仪式感时')
para('设置 → 操作方式 → 开启“仪式模式”。下一轮恢复“准备 → 洗牌/停牌 → 手动或随机切牌 → 抽牌 → 开始翻牌 → 解读”。切牌仍可跳过，所有原有流程保留。',True)
para('模式开关只影响下一轮。升级前已经开始的占卜沿用原步骤，保证已洗好、已抽出和已翻开的牌不改变。快捷模式的随机抽牌规则与牌库一致，同一轮不会重复抽到同一张牌。',True)
c.showPage()
base(2,'直播与牌阵设置','把操作留给主播，把牌桌留给观众。')
heading('04  礼物只负责排队')
para('在“设置”里开启礼物排队，填写礼物名称、单条消息数量门槛和默认主题。默认“小心心 ×1”入列；“模拟一位观众送礼”可验证显示。测试按钮使用已保存的配置。')
para('同一观众在当前轮次或等待队列中只占一个位置，不因连击重复入列，不按礼物数量增加席位，也不会自动插队。数量门槛按单条消息判断，不累计分开发送的零散礼物。队列最多 200 位。')
para('优先使用宿主的 SonglanPlugin.onGift；无 SDK 时尝试本机 ws://localhost:10030，可修改端口。SDK 延迟出现后会关闭备用连接。消息没有观众昵称时提示主播手动补录。有用户 ID 时按 ID 区分；没有 ID 时按昵称判断，重名观众可能需要手动调整。',True)
heading('05  牌桌展示与 HUD')
para('顶部“直播展示”隐藏侧栏和工具栏，保留牌桌、当前与下一位 HUD。右下角“主持控制”可临时展开流程按钮；“退出展示”或 Esc 返回操作界面。显示模式在下次打开时回到操作界面。')
para('在设置中选择“仅显示 HUD”，适合叠加其他画面。直播模式下拖动 HUD 左上角的把手移动位置；设置中可调整 60% 至 160% 缩放并复位。HUD 放大时会收窄布局，尽量保持信息在画面内。')
para('“透明背景”用于支持透明网页的采集源。普通浏览器窗口可能显示底色，实际透明效果取决于宿主或采集方式。请在直播前检查采集画面；本次未实测真实直播宿主和 OBS。',True)
heading('06  牌阵与牌库')
para('内置：单张指引（1）、三张时间流（3）、关系之镜（6）、二选一（5）、七张马蹄（7）、凯尔特十字（10）、十二月展望（12）。十二月展望按日历 1 至 12 月展示。')
para('在牌桌中央点选牌阵，选中项用金色高亮，并显示各牌位含义；顶部“牌阵”按钮也可查看全部选项。自定义牌阵每行填写一个牌位名称，共 1 至 22 位，每位最多 30 字。选择会保存并用于下一位。洗牌开始后本轮牌阵锁定，收牌后再切换。按填写顺序抽牌和摆牌；凯尔特十字使用交叉布局，小屏幕可在牌桌内滚动查看。')
para('“牌库”可按大牌 / 花色筛选，或搜索牌名和关键词。78 张牌均有正位与逆位参考。内置中文牌义是辅助思考的提示，解读由主播完成，不调用 AI，也不把牌面当作确定预测。',True)
c.showPage()
base(3,'存档、交付与版本记录','先备份，再迁移到新的浏览器或宿主。')
heading('07  保存与恢复')
para('在正常允许存储的浏览器中，队列、牌序、已翻牌、问题、笔记和设置会自动保存；刷新后继续本轮。已完成记录最多 200 条，满额时请先导出并删除部分记录，插件不会自动删除旧记录。')
para('设置 → “导出完整 JSON 备份”保存当前进度与历史。导入接受不超过 16 MB 的 JSON 文件，先预览当前观众、队列人数和记录数，再确认替换。无效文件或取消不会替换当前内容；预览后本页变化，需要重新核对。')
para('“记录”可查看完成的占卜，导出单条或全部 TXT。TXT 用于阅读和分享，不能恢复牌桌；迁移进度请使用 JSON。换浏览器、移动文件或更换宿主时，原存储不一定跟随，建议先导出备份。')
para('存储被拒绝或满额时，页面显示提示，并允许临时使用；关闭前导出 JSON。损坏的旧存档会被保护，可在设置中“导出无法读取的原存档”。明确选择“启用本页存档”才会尝试替换旧数据。同一存档被另一个页面更新时，本页暂停保存，避免互相覆盖。',True)
heading('08  测试范围与使用边界')
para('已验证：队列顺序与重复观众、全牌组唯一性、所有内置牌阵、正逆位与切牌、历史记录独立编号、流程边界、SDK / WebSocket 模拟及去重；内置浏览器中测试实际点击、刷新续接、桌面 / 手机尺寸和存储异常隔离场景。')
para('真实直播送礼、宿主差异、OBS 透明采集与所有浏览器版本尚未覆盖。请先手动走一轮，再用模拟礼物，最后在自己的直播环境联调。浏览器工具若限制 file:// 打开，本地网页验证不等于实际文件打开验证。具体交付测试证据见交付消息。',True)
heading('09  版本记录 · 2026-09-12')
para('1.2：默认改为快捷模式，接待后直接选牌；一键抽齐并翻开，手选抽齐自动进入翻牌，完成后直接接下一位。手动洗切牌保留在可选仪式模式。旧存档和进行中的轮次继续兼容。',True)
para('1.1：将牌阵入口移到开局牌桌中央，展示 7 个常用牌阵和自定义入口、张数与排列预览；增加顶部“牌阵”按钮，保留选择供下一位使用；关系、二选一、马蹄和十二月按示意摆放。兼容 1.0 存档，旧存档缺少偏好时默认三张，进行中的牌阵不改变。',True)
para('1.0 首次交付：78 张韦特牌面与中文牌义、六步流程、多牌阵、补充牌、排队 HUD、礼物入列、展示模式、历史记录和备份。',True)
para('持续保留：礼物只排队，抽牌由主播控制；历史版本修复的存档、排版、HUD 问题保持有效。升级建议先导出 JSON 备份，再替换 HTML。',True)
heading('牌面与参考来源')
para('牌面由 Pamela Colman Smith 绘制，使用 Wikimedia Commons 的 Pam-A 扫描牌组，78 个文件页面均标注 Public domain。中文牌义为插件原创参考提示；牌组结构参考 A. E. Waite 的 The Pictorial Key to the Tarot。',True)
para('<link href="https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC)" color="#6d4f80">Wikimedia Commons · 78 张牌面来源</link><br/><link href="https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot" color="#6d4f80">Wikisource · The Pictorial Key to the Tarot</link>',True)
c.save()
print(ROOT/'星幕塔罗-3-使用说明.pdf')
