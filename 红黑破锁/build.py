from pathlib import Path
import base64
from io import BytesIO
import re
from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'src'
ASSETS = ROOT.parent / '开发资料' / 'typing-ui' / 'scenes' / 'typing-lock' / 'assets'
OUTPUT = ROOT / '红黑破锁-1.html'
LOSSLESS_THEMES = {'pixel', 'horror', 'terminal'}


def asset_css():
    themes = ['fufu', 'horror', 'cyber', 'typewriter', 'notebook', 'pixel', 'chalk', 'terminal', 'cream']
    splits = {'cyber': 45, 'typewriter': 48, 'notebook': 45, 'pixel': 45.3,
              'chalk': 46, 'terminal': 51, 'horror': 46, 'cream': 38, 'fufu': 100}
    glows = {'cyber': '#18e6fa', 'typewriter': '#b89a61', 'notebook': '#45627b',
             'pixel': '#7a629d', 'chalk': '#a7b99c', 'terminal': '#9bed66',
             'horror': '#b43b58', 'cream': '#e9bfa9', 'fufu': '#A9D8F5'}
    blocks = []
    for theme in themes:
        entries = []
        source_dir = ROOT / 'assets' / 'themes' if theme == 'fufu' else ASSETS
        chain = Image.open(source_dir / f'{theme}-chain.png').convert('RGBA')
        alpha = chain.getchannel('A').point(lambda value: 255 if value > 8 else 0)
        box = alpha.getbbox()
        if box is None:
            raise ValueError(f'{theme} chain image has no visible pixels')
        painted_height = box[3] - box[1]
        for kind in ('chain', 'padlock'):
            art = Image.open(source_dir / f'{theme}-{kind}.png').convert('RGBA')
            # Chromium drops CSS values above its practical per-declaration limit.
            # The chalk lock is shown at <=250 px; a 768 px copy preserves detail.
            if theme == 'chalk' and kind == 'padlock':
                art.thumbnail((768, 768), Image.Resampling.LANCZOS)
            # WebP keeps alpha and cuts the single-file size ~5x. Pixel-art themes stay lossless
            # so their stepped edges are not smeared; the painted themes use high-quality lossy.
            buffer = BytesIO()
            if theme in LOSSLESS_THEMES:
                art.save(buffer, format='WEBP', lossless=True, quality=100, method=6)
            else:
                art.save(buffer, format='WEBP', quality=90, alpha_quality=100, method=6)
            data = base64.b64encode(buffer.getvalue()).decode('ascii')
            entries.append(f'--typing-lock-{kind}:url("data:image/webp;base64,{data}")')
        entries += [
            f'--lock-chain-ratio-x:{chain.width / painted_height}',
            f'--lock-chain-ratio-y:{chain.height / painted_height}',
            f'--lock-chain-offset:{-box[1] / painted_height}',
            f'--lock-art-split:{splits[theme]}%',
            f'--lock-art-bottom:{100-splits[theme]}%',
            f'--theme-glow:{glows[theme]}',
        ]
        blocks.append(f'html[data-theme={theme}] #typing-lock-overlay, .theme-card[data-value={theme}]'+'{'+ ';'.join(entries) + '}')
    return '\n'.join(blocks)


def material_bank():
    import json
    result = {}
    for ident, name in [('forged-steel', '写实 · 锻钢监牢'), ('antique-brass', '写实 · 旧黄铜锁'), ('arcane-anime', '动画 · 秘法封印'), ('candy-toon', '动画 · 奶油玩具')]:
        files = {kind: ROOT / 'assets' / 'materials-v2' / f'{ident}-{kind}.png' for kind in ('chain', 'padlock')}
        if not all(path.is_file() for path in files.values()):
            continue
        entry = {'name': name}
        for kind, path in files.items():
            art = Image.open(path).convert('RGBA')
            art.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            if kind == 'chain':
                box = art.getchannel('A').point(lambda value: 255 if value > 8 else 0).getbbox()
                if not box:
                    raise ValueError(f'{ident} empty chain')
                painted = box[3] - box[1]
                entry.update(chainRatioX=art.width/painted, chainRatioY=art.height/painted, chainOffset=-box[1]/painted)
            buffer = BytesIO()
            art.save(buffer, format='WEBP', quality=92, alpha_quality=100, method=4)
            entry[kind] = 'data:image/webp;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')
        result[ident] = entry
    return 'window.LockMaterialBank=' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';'


def build():
    page = (SOURCE / 'page.html').read_text(encoding='utf-8')
    replacements = {
        '/* APP_CSS */': (SOURCE / 'app.css').read_text(encoding='utf-8'),
        '/* LOCK_CSS */': (SOURCE / 'lock.css').read_text(encoding='utf-8'),
        '/* ARM_CSS */': (SOURCE / 'arms.css').read_text(encoding='utf-8'),
        '/* INLINE_ASSETS */': asset_css(),
        '/* CUSTOM_ART_CSS */': (SOURCE / 'custom-art.css').read_text(encoding='utf-8'),
        '/* CUSTOM_ART_JS */': (SOURCE / 'custom-art.js').read_text(encoding='utf-8'),
        '/* SCENES_CSS */': (SOURCE / 'scenes.css').read_text(encoding='utf-8')+'\n'+(SOURCE / 'cage-assets.css').read_text(encoding='utf-8'),
        '/* SCENES_JS */': (SOURCE / 'scenes.js').read_text(encoding='utf-8'),
        '/* MENU_V2_CSS */': (SOURCE / 'menu-v2.css').read_text(encoding='utf-8'),
        '/* MENU_V2_JS */': (SOURCE / 'menu-v2.js').read_text(encoding='utf-8'),
        '/* MATERIALS_V2_JS */': material_bank(),
        '/* PRESENTATION_JS */': (SOURCE / 'presentation.js').read_text(encoding='utf-8'),
        '/* PRESENTATION_CSS */': (SOURCE / 'presentation.css').read_text(encoding='utf-8'),
        '/* GIFT_CHANNEL_JS */': (SOURCE / 'gift-channel.js').read_text(encoding='utf-8'),
        '/* FUFU_FONT_CSS */': '@font-face{font-family:FufuPanelSubset;src:url("data:font/woff2;base64,' + base64.b64encode((ROOT/'assets/fonts/fufu-panel.woff2').read_bytes()).decode('ascii') + '") format("woff2");font-weight:400;font-style:normal;font-display:swap}',
        '/* FUFU_FONT_LICENSE */': (ROOT/'assets/fonts/ZCOOLKuaiLe-OFL.txt').read_text(encoding='utf-8'),
        '<!-- LOCK_OVERLAY -->': (SOURCE / 'overlay.html').read_text(encoding='utf-8'),
        '/* KEY_SHIM_JS */': (SOURCE / 'obs-key-shim.js').read_text(encoding='utf-8'),
        '/* CORE_JS */': (SOURCE / 'core.js').read_text(encoding='utf-8'),
        '/* RULES_JS */': (SOURCE / 'rules.js').read_text(encoding='utf-8'),
        '/* MODES_JS */': (SOURCE / 'modes.js').read_text(encoding='utf-8'),
        '/* HIT_JS */': (SOURCE / 'hit-feedback.js').read_text(encoding='utf-8'),
        '/* HIT_CSS */': (SOURCE / 'hit-feedback.css').read_text(encoding='utf-8'),
        '/* APP_JS */': (SOURCE / 'app.js').read_text(encoding='utf-8'),
    }
    for marker, contents in replacements.items():
        if page.count(marker) != 1:
            raise ValueError(f'expected exactly one marker: {marker}')
        page = page.replace(marker, contents)
    if re.search(r'<(?:script|link|img)[^>]+(?:src|href)\s*=\s*["\'](?!data:|#)', page, re.I):
        raise ValueError('external resource reference found')
    OUTPUT.write_text(page, encoding='utf-8')
    print(f'Built {OUTPUT.name}: {OUTPUT.stat().st_size:,} bytes')


if __name__ == '__main__':
    build()
