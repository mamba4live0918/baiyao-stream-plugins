# 白曜轨道站 · 插件服务器

仿 igloo.inc 风格的滚动叙事 WebGL 页面：空间站像爆炸图一样展开，零件排成一圈，露出核心的插件服务器；机柜每一格是一个直播插件，重点插件会像抽屉一样滑出、弹起预览屏；最后信号中断，切到社区屏幕，粒子聚成"白曜"。

## 打开

双击 `dist/index.html`。整个页面是一个文件（约 16 MB），模型、贴图、字体都内嵌在里面，不需要联网，也不需要服务器。建议用最新版 Chrome 或 Edge。

在地址后面加 `?p=0.42` 可以直接跳到故事的某个位置（0 到 1）。

## 改内容（都在 `src/content.js`）

| 要改的 | 位置 |
|---|---|
| 插件名称、标签、一句话介绍、强调色、是否重点展示 | `PLUGINS`（与白曜重工官网的首发六件一致：id 用官网 slug，介绍用官网 tagline；增删时两边一起改） |
| 社区屏幕：标题、抖音号、陪伴时间、二维码下的文字、动态墙 | `COMMUNITY`（抖音号、陪伴时间、二维码是白曜的真实信息；动态墙和常亮的 LIVE 还是演示内容） |
| 各段的标题和正文 | `SECTIONS` |
| 结尾粒子组成的字 | `PARTICLE_TEXT` |

改完文字要重新裁剪字体，否则新字显示不出来（完整字体在 `assets-src/fonts`，不需要原始下载）：

```bash
npm run fonts
```

**换成真实预览图：** 把截图按插件 id 命名放进 `src/assets/previews/`，例如 `src/assets/previews/pitao.webp`（也支持 png、jpg，建议 16:9），重新打包后就会替换占位图。插件 id 见 `PLUGINS` 里的 `id` 字段。

**二维码：** 社区屏上是白曜的抖音码，文件是 `src/assets/community/douyin-qr.webp`（从抖音名片裁出的圆形码，四角透明）。换码就替换这个文件，再重新打包。

## 开发

```bash
npm install
npm run dev      # http://localhost:5179
npm test         # 镜头路径、插槽布局、滚动分段、文字排版的单元测试
npm run build    # 生成 dist/index.html
npm run site     # 打包并复制到白曜重工官网：plugin-library-site/public/space-station.html
```

官网（`../plugin-library-site`，Next.js）运行时访问 `/space-station.html` 就能打开这个页面。改完内容后跑一次 `npm run site`，官网里的那份就会更新。

## 结构

| 位置 | 内容 |
|---|---|
| `src/content.js` | 页面上所有文字和插件列表 |
| `src/story.js` | 机柜插槽布局、每个重点插件的滚动区间、HUD 分段（纯函数，有测试） |
| `src/config.js` | 时间轴、圆环、屏幕位置、配色 |
| `src/core/` | 滚动平滑、镜头路径（director）、素材加载 |
| `src/world/station.js` | 空间站展开、成环、全息蓝图 |
| `src/world/bolts.js` | 舱段分离时的火花 |
| `src/world/server.js`、`previews.js` | 插件服务器机柜、面板和预览图 |
| `src/world/community.js`、`particles.js` | 社区屏幕和"白曜"粒子 |
| `src/text/` | WebGL SDF 文字、乱码解码效果、HUD |
| `src/post/` | 双镜头渲染、"信号中断"转场、泛光、调色 |
| `tools/` | 素材处理、VDB 渲染和截图脚本 |
| `legacy/meteors.js` | 旧版陨石撞击代码，已不再使用，留作参考 |

## 素材与许可

| 素材 | 来源 | 许可 |
|---|---|---|
| 国际空间站模型 | NASA 3D Resources | NASA 素材在美国一般不受版权保护；已涂掉贴图里的 NASA/ESA 标志、"Canada" 字标、任务徽章和舷窗里的真人照片 |
| 星图 Deep Star Maps 2020 | NASA SVS | 同上 |
| 地球昼面、夜面、云层贴图 | Solar System Scope | CC BY 4.0（页面结尾已署名） |
| 分离火花 Explosion01/02 | Unity Labs 免费 VFX 序列帧 | CC0 |
| 得意黑 Smiley Sans | atelierAnchor | OFL 1.1（已按页面用字裁剪） |
| Space Mono | Google Fonts / Colophon | OFL 1.1 |

旧版用过、现在不打包的素材（仍在 `src/assets`）：贝努和月岩模型、JangaFX 体积爆炸序列帧、Unity 火球序列帧。

## 重新生成素材

处理好的模型、贴图都已经在 `src/assets` 里，平时不需要重新生成。

原始下载（约 4.3 GB）已于 2026-10-20 移到 `C:\tmp\待删除\`，准备删除。删掉以后，如果要重新生成模型或贴图，按上面"素材与许可"表格里的来源重新下载，放进一个文件夹，每个素材一个子文件夹（iss/、earth/、starmap/、unity-Explosion01/x/ 等，与 `tools/process-assets.mjs` 开头的说明一致），然后：

```bash
# 全部处理（需要 ffmpeg，路径通过 FFMPEG 环境变量传入）
node tools/process-assets.mjs <原始下载文件夹> src/assets

# 只处理一部分
ONLY=unity node tools/process-assets.mjs <原始下载文件夹> src/assets
```

## 截图检查

```bash
node tools/shoot.mjs <输出文件夹> 0,0.2,0.42,0.9,0.995                 # 指定位置截图
node tools/shoot.mjs <输出文件夹> 0.37 --mouse 780,410                 # 悬停在某格刀片上
node tools/shoot.mjs <输出文件夹> --scrub 0.12:0.17:1 --hold 3:300      # 滚过展开段后连拍分离火花
node tools/shoot.mjs <输出文件夹> 0.42,0.9 --size 390x844              # 手机竖屏
node tools/shoot.mjs <输出文件夹> 0.6 --reduced                        # 减少动态模式
```

用的是系统里装的 Chrome（playwright-core），会调用真显卡。内置浏览器面板隐藏时页面不刷新画面，所以截图靠这个脚本。
