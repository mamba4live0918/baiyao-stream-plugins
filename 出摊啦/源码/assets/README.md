# 出摊啦 · 第 1 批图片素材

## 第4批补充（第5步：捣乱和帮忙）

新增45张事件素材，全清单165张。角色16张、FX与杂项29张，内置image_gen逐张生成/编辑，透明无字；raw/events保留完整原图，src/events为2倍PNG，webp/events为质量85输出，共812,674字节。提示词/来源在prompts/events-actors-batch4.json与events-fx-batch4.json，events-meta.mjs记录source-px锚点、附件与空白文字框。规范保留完整画布等比缩放，不按单帧可见边界重新裁。

导出命令为node scripts/prepare-event-assets.mjs；approved-through-batch3-hashes.json冻结366个既有raw/PNG/WebP文件，导出与回归均验证字节未变。新版素材预算提高到10,000,000字节，最终整份HTML上限由构建验收。旧批说明中的3MB目标仅保留为历史记录。

预览新增45张卡片和16个组合，window.chutanAssetPreview.eventState()/renderEventPreviews()可查看就绪状态。PNG/WebP与棋盘/皮套均已离线验证165/165，8张截图和20项素材单测证据见qa/步骤5/第4批素材说明.md。运行选择变动后再跑prepare-assets刷新体积报告；不要覆写旧批准图片。

## 第3批补充（第4步：交租和加班）

本轮新增5张：`landlady_stand`、`landlady_stamp`、`landlady_book`、`rent_sign`、`overtime_clock`，全清单现为120张。全部由内置image_gen生成真实透明PNG；原图逐字节复制至`raw/rent`，不程序绘制、不改色。完整调用提示词和来源在`prompts/rent-batch3.json`，合并记录在`prompts/generation-records.json`。

两态包租婆共用200×260显示帧（400×520源PNG），保留完整生成画布、相同脚底和持本子锚点；本子70×65，独立叠在手心。交租牌240×100，小钟320×150，空白文字区域分别记录为`textRect`和`screenRect`。`rent-meta.mjs`导出运行用尺寸/锚点/文本框，所有坐标均为source-px，按建议显示尺寸渲染除以2。

`node scripts/prepare-rent-assets.mjs`按记录复制原图、登记清单并调用公共导出；标准PNG/WebP85首次创建后保留字节。5张WebP总99,590字节。新增`approved-through-batch2-hashes.json`在生成本批前冻结raw/src/webp全部351个既有文件（含未选用原图），导出前后和单测均核验原字节。原来的271项批准基线也保留不变。

预览页新增“交租和加班”分组与`rentState()/renderRentPreviews()`，含两态+独立本子组合、代码写字的交租牌/小钟组合；PNG/WebP和棋盘/皮套底均可切换。`qa/rent-assets-shoot.cjs`离线截图，证据见`qa/步骤4/第3批素材浏览器.json`及8张预览图。素材相关单测为`tests/rent-assets.test.mjs`；运行图片选择变化后需重新执行公共素材处理，使处理报告的体积和运行选择一致。

以下保留第1、2批说明。

共 93 张。顾客及全部小道具共 77 张已经由用户认可，原画不得重做或覆盖；本轮只重绘 16 张柜台分片与店招。`manifest.json` 是尺寸、锚点、帧序列、文件路径和生成出处的唯一清单。`manifest.js` 是内容一致的浏览器脚本镜像，让 `预览.html` 直接通过 `file://` 打开，无需启动服务器或读取 JSON 网络请求。

```text
assets/
  manifest.json / manifest.js
  预览.html / preview.js / preview.css
  preview-avatar.webp                 复制的白曜皮套底图，仅用于验收
  prompts/first-batch.md              共用风格与生成要求
  prompts/generation-records.json     实际生成调用、prompt、源图、分图映射
  prompts/counters.json               被拒绝的第一版柜台记录，仅保留追溯
  prompts/counters-v2-*.json          重绘柜台与店招的实际生成记录
  raw/customers/<id>.png              顾客、烟、小偷的完整生成原画布
  raw/props/<id>.png / raw/ui/<id>.png 通用道具、UI 的完整生成原画布
  raw/counters-v2/counter_<店>_master.png 重绘的真实摊位母图，保留木纹与店面纹样
  raw/counters-v2/counter_<店>_sign.png   独立生成的空白店招
  src/customers/customer_01_happy.png # 01–16 × happy/neutral/impatient/angry
  src/customers/customer_steam.png
  src/customers/thief_crowd_normal.png
  src/customers/thief_crowd_stunned.png
  src/counters/counter_noodle_left.png # noodle/pancake/tea/sushi × left/mid/right/sign
  src/props/coin_jar.png
  src/props/coin_jar_top.png
  src/props/coin.png
  src/props/extinguisher.png
  src/props/trash_can.png
  src/ui/badge.png
  src/ui/bubble.png
  src/ui/stamp_frame_green.png         # green/red/purple
  webp/<同组>/<同名>.webp              转换时生成
  inline-assets.mjs                   转换时生成，供主页面离线打包导入
  processing-report.json              转换或核验时生成
```

源 PNG 必须是带透明通道的生成图片，目标画布是建议显示尺寸的 2 倍：顾客 220×260，烟 100×80，小偷 220×260，胸牌 140×48，泡泡 180×100；柜台左右片 256×420、中片 512×420、店招 240×240；钱罐两层均为 280×300、铜钱 52×52、灭火器 100×280、垃圾桶 160×200、印章 400×160。

顾客四个表情共享人物位置；钱罐两层共享透明画布和罐口位置。锚点使用源画布像素，按建议显示尺寸渲染时除以 2。清单中的锚点是生成构图的目标位置，生成后必须在预览页检查实际图形是否准确对齐。

图片生成完成后，先把实际调用填入 `prompts/generation-records.json` 的 `records`。每条记录建议包含 `id`、`createdAt`、`tool`、完整 `prompt`、`originalImages`、`assetIds` 和 `derivedFiles`；裁切和缩放另记操作，不冒充新的生成调用。保留图像生成工具返回的原始图，方便回查。

素材处理属于构建。直播保护时段（北京时间 07:01–09:01、18:01–20:01）禁止执行下列处理或测试命令。时段外，在源码目录执行：

```powershell
node scripts/prepare-assets.mjs
node --test tests/assets.test.mjs
```

处理脚本从 `raw` 生成 `src`，再转换质量 85 的 WebP，生成内联模块与体积报告。已批准素材的现有 raw、PNG、WebP 都禁止重写；脚本会核对固定的 `qa/步骤1复审/已批准原图哈希.json`，并记录运行前后的文件 SHA256。尚未创建的 PNG/WebP 可以首次派生：普通素材不单独裁去透明边，保留完整已批准画布，按比例补透明边；这样不会把四个表情或钱罐两层分别拉成不同构图。脚本从不覆盖固定哈希基线。

柜台 v2 只裁完整母图的外围透明边，统一原画高度 404，并留上下各 8 像素透明边，得到高 420 的规范画布。左端直接取 x=0..255 的原尺度画面，中片取 x=255..510 的 256 像素图案条带接上其水平镜像，右端取左端的水平镜像；不再压缩两端花纹。接口图案相位和后续像素方向连续，保留木纹与布帘。不能把一列像素拉伸成整片柜台，不能程序画图案或改色。真实裁切矩形、镜像关系和原图 SHA256 写入每个柜台的 manifest 派生记录。

PNG 检查只比较中片首尾列与端片接口，不要求内部纯色；同时计算不同列哈希数量、内部变化列数及镜像对称误差。旧版单列拉伸会因没有图案变化而失败。默认 WebP85 另核验可见 RGBA 接口误差；如果误差超过3，仅柜台三片采用有界近无损编码：端片最大通道误差2/255，中片4/255。此处近无损级别与普通有损质量数字含义不同；所有PNG原图不变，其它图片仍为质量85。报告保存实测像素误差与再次解码后的接缝结果，实际内联模块和预计体积均须低于3MiB。新版本实际导出前，预览不会把旧柜台冒充为v2就绪。

报告还比较每位顾客四张源 PNG 的可见边界；边界偏移超过 4 个源像素时标记 `needs-visual-review`，这只是可见边界检查，不能证明人物身份、表情或构图一致，必须看预览。脚本不会自动重绘或移动人物来假装对齐。

脚本复用项目内或同工作区已有的 sharp，不会安装依赖。需要指定库时设置 `CHUTAN_SHARP_PATH` 为 sharp 文件夹绝对路径。已有 PNG 画布已精确准备好时，可以加 `--strict-source-size` 阻止自动尺寸规范。`--verify` 核验已有图片并刷新报告，不重新裁切或转码；`--allow-missing` 仅供检查中间进度，完整交付须去掉。

双击 `预览.html` 后，默认按 100% 建议显示尺寸展示全部图片，可切换棋盘格、皮套底图、PNG/WebP 和四种表情。“随机摆 200 个人”会打开充满视口的密度画布，加载图片缓存后一次绘制，无持续动画循环；支持固定随机种子。该布局只验收人海密度，正式游戏的脸部避让规则由游戏实现。

供浏览器验收使用的接口：

```js
await window.chutanAssetPreview.ready;
window.chutanAssetPreview.state();
await window.chutanAssetPreview.randomize200(20261022);
window.chutanAssetPreview.setBackground('avatar'); // 'grid' 或 'avatar'
await window.chutanAssetPreview.setCrowdExpression('angry');
window.chutanAssetPreview.closeCrowd();
```

每张图片元素有 `data-asset-id`。画布有 `data-people-count`（固定 200）、`data-drawn-count`（素材齐时 200）、`data-render-complete`。柜台中片以原始建议尺寸横向重复；店招另层叠加，接缝问题应重做源图。

四店各有两张高 210 的实际宽度画布，原始宽度分别为 1920 和 2560，可横向滚动，也可只缩放视图来总览。两端固定各 128；1920 的中段由 7 个完整图案片等宽铺满（237/238 像素），2560 的中段由 9 个完整片铺满（256 像素）。不裁半块图案，不把一个余块单独压扁。

```js
window.chutanAssetPreview.counterState(); // 8 张实际画布的 backing 尺寸、完整片宽和就绪状态
window.chutanAssetPreview.setCounterView('fit'); // 或 'actual'，不改变 backing 尺寸
await window.chutanAssetPreview.showCounterPreview('noodle', 2560);
window.chutanAssetPreview.closeCounterPreview();
```

允许时段运行 `qa/review-shoot.cjs` 后，每店会有 1920×210、2560×210 两张 WebP 渲染截图，共 8 张；截图前将浏览器视口设为同宽、DPR 1，并核对截图 PNG 的实际宽高，防止横向裁切或缩小。另附四店概览和两种宽度的完整适合视图。必须实际查看这些截图，数字检查不能代替木纹、布帘、接缝和整体自然程度的审阅。
# 第5批补充

煎饼和奶茶20张素材在raw/shops、src/shops、webp/shops；提示词和来源在prompts/shops-batch5.json。shops-meta.mjs记录source-px锚点与layerRect，杯/面糊组合预览使用相同数据。整份HTML预算10MB，画质优先；全部既有501个图片文件由approved-through-batch4-hashes.json冻结保护。素材说明见qa/步骤6/第5批素材说明.md。

