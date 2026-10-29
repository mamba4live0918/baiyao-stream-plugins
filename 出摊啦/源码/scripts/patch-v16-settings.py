# 出摊啦 V1.6：设置③的「加班机」（加班记到哪 + 插件自带加班机 + 白曜连接码）。一次性补丁，跑过就不用再跑。
from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'src/ui/settings-ui.js'
s = p.read_text(encoding='utf-8')


def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new)


rep("#ct-settings .ct-advanced{border-top:1px dashed #d8c8af;padding-top:16px}",
    "#ct-settings .ct-ot-face{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:8px 0;padding:10px 13px;border:2px solid #48372d;border-radius:12px;background:#fff4d9}#ct-settings .ct-ot-face b{font-size:26px;font-variant-numeric:tabular-nums}#ct-settings .ct-ot-face small{color:#8b7765}\n"
    "#ct-settings .ct-ot-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px}#ct-settings .ct-ot-row input[type=text]{width:120px}#ct-settings .ct-ot-row input[type=number]{width:66px}#ct-settings .ct-ot-inline{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}#ct-settings .ct-ot-inline input{width:84px}\n"
    "#ct-settings .ct-advanced{border-top:1px dashed #d8c8af;padding-top:16px}")
rep("el('h2',{text:'出摊啦 V1.5 · 设置'})", "el('h2',{text:'出摊啦 V1.6 · 设置'})")
rep("      note('交租交不上的差额加到白曜加班机上（白曜重工 0.27.0 以上的「加班机」插件），剩余时间也在那里看。礼物加减时间在白曜加班机的礼物列表里设。'),",
    "      note('交租交不上的差额加班，记到下面的「加班机」：插件自带的（交租牌下面显示「距离下播」），或者白曜重工的加班机。'),")
a = s.index("  /* V1.5 白曜加班机：在白曜里不用设；")
b = s.index("  overtimeText(){")
new_block = (Path(__file__).resolve().parent / 'patch-v16-settings.block.js').read_text(encoding='utf-8')
s = s[:a] + new_block + s[b:]
p.write_text(s, encoding='utf-8')
print('settings-ui.js patched')
