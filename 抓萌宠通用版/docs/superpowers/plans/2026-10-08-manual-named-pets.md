# Manual Named Pets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在抓萌宠中增加本场手动观众名额、单只命名与名牌、单只大小、不可收走的专属宠物，以及二次确认结束本场清空。

**Architecture:** 专属使用独立命名扩展和场景集合，复用现有角色渲染与运动，不进入普通人口/候场/回窝历史。原子提交使用现有 localStorage 本场保存信封，名单与晋升一起保存；界面控制器只通过注入回调访问本场状态。没有自动计数、礼物身份适配或宿主补丁。

**Tech Stack:** 原生 HTML/CSS/JavaScript、现有 UMD/CommonJS 模块、Node.js node:test/vm、Python 交付工具；全部运行资源内嵌 HTML。

**Spec:** [已批准设计](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/docs/superpowers/specs/2026-10-08-current-broadcast-named-pets-design.md)

## Global Constraints

- 工作目录：C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版。所有下述命令均在该目录执行。
- 外部人工计数、插件内手动授予资格；250 不由软件验证，不新增软件计数或门槛设置；白曜和菘蓝均不改宿主。
- 每个手动观众条目每场最多一只；改备注不新增名额；备注 40 个用户感知字符、宠物名 30 个；NFKC/去首尾空格/英文大小写折叠仅用于备注查重。
- 个体比例默认 100%，编辑 25–1000%，最多两位小数；首次命名预填当前比例 ×1.5，主播显式输入优先，提交及改名不再累乘。
- 专属保持原品种、不候场、不回窝、不复制、不被普通清场收走；结束本场清除全部本场数据、保留全部配置；刷新保留同场。
- 名牌必须可见、原生文字、完整显示、正向、跟随宠物、不拦截鼠标，只公开宠物名字，不公开人工观众备注。
- body/场景透明，原 107 个内置品种及配饰素材不改；V1.0.20 和旧 ZIP/PDF 不覆盖。
- 不创建 Git 仓库或 worktree，本目录无 Git；步骤结束记录测试证据代替提交。手工改文件只用 apply_patch。
- 计划待用户审阅及选择执行方式；此前批准设计不代表本计划已获实施批准。

## Review Focus

- 名字含家庭表情、组合音符、HTML 或全角同名备注：完整安全显示且查重不绕过，Task 1/3 测试。
- 晋升时实例已回窝、球内未落地、拖拽尚未结束或名额被占用：拒绝失效提交，Task 4 测试。
- 坏扩展的归属不明确，随后普通自动保存并刷新：冻结名额和原始坏数据仍保留，Task 2/4 测试。
- 结束本场发生在回窝历史、开盒、球内和异步加载同时存在时：旧场不能从回调/爆窝重新生成，Task 5 测试。
- 已命名自定义素材被删除/头像编号被回收，或切鸭吉吉主题：不换错宠物、不失名牌，Task 4 测试。

## File Map

| 文件 | 职责 |
| --- | --- |
| 新建 [named-pets.js](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/named-pets.js) | 无 DOM 的本场名单、专属记录、校验和恢复模型 |
| 新建 [pet-controls.js](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/pet-controls.js) | 名单/单只面板、名牌，全部数据操作走回调 |
| 新建 [pet-controls.html](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/pet-controls.html)、[pet-controls.css](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/pet-controls.css) | 场内局部面板与名牌样式 |
| 修改 [core.js](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/core.js)、[population-view.js](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/population-view.js) | 命名扩展恢复、头像引用、普通个体比例快照 |
| 修改 [app.js](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/app.js) | 独立专属集合、运动/尺寸/面板接入、同步保存事务、结束本场 |
| 修改 [customize.js](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/customize.js)、[settings.html](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/settings.html) | 素材删除前保护、名单页、管理按钮与快捷键保护 |
| 修改 [hud.js](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/hud.js)、[hud.html](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/hud.html)、[hud.css](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/src/hud.css) | 单独专属数量，保持普通数量含义与固定布局 |
| 修改 [build.cjs](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/开发/V1/build.cjs) | 新模块/面板/CSS 内嵌，模型在 core 前、控件在 app 前 |
| 新建 [app-harness.cjs](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/tests/helpers/app-harness.cjs)；修改 [full-bootstrap.test.cjs](C:/Users/Mamba4live/Desktop/直播/自定义插件/抓萌宠通用版/tests/full-bootstrap.test.cjs) | 提取当前 fixture，支持真实 interactions、故障存储、事件/回调推进 |
| 新建命名测试 | tests/named-pets-model.test.cjs、named-pets-restore.test.cjs、individual-size.test.cjs、pet-controls.test.cjs、named-pets-runtime.test.cjs、end-session.test.cjs |
| 修改交付工具/说明 | 开发/V1/package.py、package-share.py、make_manual.py；使用说明.txt；相关 release-validator/share-package 测试 |
| 新建取名证据目录 | 开发/取名功能-2026-10-08，保存保全基线与测试/实际包校验报告 |

## Interface Contract

新模型挂在浏览器 PetNamedPets，并可 CommonJS require。不得依赖 CowCore 或 DOM，避免 core 导入环。

Naming = {schema:1, sessionId, nextOwner, nextResident, owners:Owner[], residents:Resident[], quarantine:null|object}。
Owner = {id,label}；Resident = {id,ownerId,name,kind,individualScale,x,y}，x/y 为 0–1 归一化坐标。
隔离状态保存 original 和 blockedOwnerIds；归属范围未知时设 blockAll=true。未知 raw 不以 HTML 输出。

- fresh(sessionId:string): Naming。sessionId 必须由调用者生成，编号在本场内单调分配，不从备注生成 ID。
- validateText(text:string,max:number): string；返回去首尾空格文本，无效抛异常。采用 Intl.Segmenter；不支持时保守按码点限制并明确能力提示，不截断 ZWJ 表情。
- labelKey(text:string): string；只用于查重。
- validScale(number): boolean；25–1000，最多两位小数。firstNameScale(scale): {value:number,clamped:boolean}。
- apply(naming,command): {next:Naming,resident?:Resident}；无效命令抛异常，不修改输入。
- command 类型：grant{label}、renameOwner{ownerId,label}、revoke{ownerId}、promote{ownerId,name,kind,individualScale,x,y}、editResident{residentId,name,individualScale}。
- restore(raw,sessionId): {value:Naming,issues:string[]}；恢复失败引用进入持久隔离，不重新开放名额。
- validateKinds(naming,hasKind:(kind)=>boolean): {value:Naming,issues:string[]}；加载素材后再次校验，未知引用隔离并冻结名额。

运行期 actor 沿现有结构新增 individualScale、residentId（专属）、petName（专属，来自记录 name）；x/y/size 是场景像素，持久记录 x/y 才是归一化坐标。

PetControls 构造注入 getNaming():Naming、getSessionId():string、onCommand(command):boolean、onSaveSize(actor,scale):boolean、onPromote(actor,ownerId,name,scale):boolean、onEditResident(actor,name,scale):boolean、onEndSession():boolean、toast(text):void、canEdit(actor=null):boolean。公开 refresh()、open(actor)、close()、syncNameplate(actor,{w,h,lift=0})、removeNameplate(actor)。名牌 DOM/测量缓存存在控制器 WeakMap，lift 使用 renderCow 已计算的实际身体位移。控件不操作 localStorage，不修改 actor 或业务状态。

app 使用 runEpoch（仅运行期）和 naming.sessionId（持久）双重守卫；事务 commitNaming(candidateFactory): boolean 在一个同步回调中读取当前 snapshot、验证、写入 KEY、提交与重绘，无 await。

---

### Task 1: 手动名单和专属模型

**Files:** 新建 named-pets.js、tests/named-pets-model.test.cjs。
**Consumes:** 已批准规格，无其他产品模块。**Produces:** Interface Contract 中 fresh/validateText/labelKey/validScale/firstNameScale/apply。

- [ ] **Step 1: 编写红测。** 测试名称与断言：grant creates one stable owner（同名再次 grant 抛错）；rename preserves owner id；revoke only unused owner；promote consumes one slot without mutating input；edit cannot change owner；unsafe text rejected、family emoji counted、孤立不可见格式字符不视为有效名字、NFKC duplicates rejected；firstNameScale returns 150 from 100 and clamps 1000 from 800。

```js
assert.equal(named.residents.length, 1);
assert.throws(() => PetNamedPets.apply(named, promotion));
assert.equal(PetNamedPets.firstNameScale(100).value, 150);
assert.equal(PetNamedPets.firstNameScale(800).value, 1000);
```
- [ ] **Step 2: 运行红测。** node --test tests/named-pets-model.test.cjs，确认因新 API 缺失或上述断言失败，不是 fixture 错误。
- [ ] **Step 3: 实现最小纯模型。** 数组/Map 不用用户文字作对象键；apply 克隆并验证；promote 的显式 individualScale 直接保存，不在模型再次 ×1.5。已用 owner 的 revoke、重复/隔离 owner 晋升都拒绝。
- [ ] **Step 4: 运行绿测。** 同命令应全部 PASS；加入修改返回对象不会污染输入的断言。
- [ ] **Step 5: 保存证据。** 记录此任务红/绿命令及结果，无 Git 提交。

### Task 2: 恢复与普通单只大小

**Files:** named-pets.js、core.js、population-view.js、app.js；新建 named-pets-restore.test.cjs、individual-size.test.cjs；build.cjs 加模型占位符。
**Consumes:** Task 1 模型。**Produces:** restore/validateKinds；state.naming；普通快照 optional individualScale（缺省 100）；setCowSize 应用个体倍率。

- [ ] **Step 1: 编写红测。** old state restores ordinary totals unchanged；naming roundtrip keeps owner/resident/session；duplicate/missing ownership quarantined across repeated save/restore；raw unknown kind blocks owner；positions and population parking preserve 175% but other same-kind stay 100%；invalid ordinary scale defaults 100 without inventing names。

```js
const saved = CowCore.fresh();
saved.outside = 1;
saved.positions = [{x: .5, y: .5, kind: 72, individualScale: 175}];
assert.equal(CowCore.restore(JSON.stringify(saved)).positions[0].individualScale, 175);
```
- [ ] **Step 2: 运行红测。** node --test tests/named-pets-restore.test.cjs tests/individual-size.test.cjs tests/population-view.test.cjs，捕获预计失败。
- [ ] **Step 3: 实现恢复和大小。** core.restore 仅在原始存档包含 naming 时恢复扩展，旧 fresh 结构不强制改变；浏览器从已内嵌 PetNamedPets 取模型，Node 使用相对 CommonJS require。cowSnapshot、makeCow(saved)、population.position、restorePositions 保留 optional individualScale，100 的旧快照不必新增字段。setCowSize 乘 individualScale/100 后沿用 fit。
- [ ] **Step 4: 运行绿测及现有恢复测试。** 上述命令及 node --test tests/core.test.cjs tests/recall-pending.test.cjs tests/core-native-namespace.test.cjs，全部 PASS。未知/重复专属冻结状态及原始隔离扩展必须被所有后续快照保留。
- [ ] **Step 5: 保存证据。** build 模型在 core 前；CommonJS/browser 两种加载都可用，无宿主修改。

### Task 3: 名单页、单只面板与名牌

**Files:** pet-controls.js/html/css、settings.html、build.cjs；新建 pet-controls.test.cjs、app-harness.cjs，提取 full-bootstrap fixture 并保留原案例；测试 DOM 按需扩充。
**Consumes:** Task 1/2 模型形状。**Produces:** Interface Contract 中 PetControls；设置 tab=named、page=named；局部面板 #pet-panel/#pet-size/#pet-name/#pet-owner/#pet-name-save，名单 #named-owner-list，#grant-owner/#owner-label、#end-session。共享 harness 导出 documentFor、Node、dispatch(node,type,props={})、bootstrap、flushSave、runFrames，沿用现有 fixture 的结构与时钟。

- [ ] **Step 1: 编写红测。** right-click/key-menu opens without changing actor；grant routes once through callback；no owner means size-only；already named has locked owner；select owner pre-fills 150, editing to 200 submits 200 not 300；IME/Esc/input events do not collect；nameplate uses textContent、pointer-events:none、no mirrored transform、updates/removes after rename/end；no owner remark on public plate。

```js
assert.equal(document.getElementById('pet-size').value, '150');
// Local fixture captures onPromote(...args) into submissions.
assert.equal(submissions.at(-1)[3], 200);
assert.equal(plate.textContent, '<b>Echo</b>');
assert.equal(plate.style.pointerEvents, 'none');
```
- [ ] **Step 2: 运行红测。** node --test tests/pet-controls.test.cjs，核对预期失败。
- [ ] **Step 3: 实现控件与内嵌。** 页内 select 沿已有 obs-select 增强；完整长名换行，正向独立名牌随 actor 的实际显示位置移动。尺寸使用百分比数值输入/slider 同步；已保存大小与确认取名分开。面板关闭回焦点，元素移除和场次变更关闭旧面板。
- [ ] **Step 4: 运行绿测。** 新测试 PASS；构建预览脚本均可编译；27 个内嵌脚本（原 25 + 两个新模块），无外部 CSS/JS。名牌位置投影钳位在 360×640、1200×700 场景且全文可见。
- [ ] **Step 5: 保存证据。** UI 只调用注入回调；无业务状态/存储直接写入，无自动计数设置。

### Task 4: 专属晋升、保护与数量

**Files:** app.js、core.js、customize.js、hud.js/html/css；app-harness.cjs、full-bootstrap.test.cjs；新建 named-pets-runtime.test.cjs。
**Consumes:** 模型 apply/restore、PetControls、普通 snapshots。**Produces:** residentCows 独立集合、commitNaming(candidateFactory)、customizer.canDeleteCow(kind):boolean、HUD residentCount。

- [ ] **Step 1: 扩充 fixture 并编写红测。** 扩充 Task 3 的 bootstrap(savedState,savedPrefs,options)，支持存储失败、预置配置、真实 interactions、可控事件/timeout、布局矩形。捕获真实 PetControls/Customizer/Effects 到 ctx.controlsInstance/customInstance/effectInstance，不向正式 app 导出测试对象。断言晋升普通 outside 减1/home不变/实际个数不变；同种其他大小不变；名牌出现；所有 collect/sweep/wind/recall/clear/double/挑战/候场不收或复制专属；坏扩展普通自动存档后仍隔离。

```js
assert.equal(after.outside, before.outside - 1);
assert.equal(after.home, before.home);
assert.equal(after.naming.residents.length, 1);
assert.equal(after.outside + after.naming.residents.length, before.outside);
```
- [ ] **Step 2: 运行红测和 fixture 基线。** node --test tests/full-bootstrap.test.cjs tests/named-pets-runtime.test.cjs；原 full-bootstrap 案例必须仍能启动，新断言按预期失败。
- [ ] **Step 3: 接入场景与原子提交。** state.naming 只由模型更新；创建晋升候选剔除所选普通位置并转移同一 actor，写入成功后才移动集合。canEdit 拒绝 dead/held/airborne/ballEmerging/旧世代实例；运动/渲染/resize/主题更新循环包含专属，互动 hooks 只给普通。材质引用删除保护在 IndexedDB 删除之前执行；referencedAvatarKinds 计入专属；专属不使用鸭吉吉强制替换。
- [ ] **Step 4: 运行绿测与故障测试。** 新 runtime 和已有 population/grip/pen/roster/HUD 测试 PASS；setItem 抛错时授权/晋升/改名不改变旧数据或集合；恢复后保留同场、名牌与尺寸。HUD 专属计数独立，固定 width 同步 CSS/JS，布局测试覆盖新增项。
- [ ] **Step 5: 保存证据。** 检查右键和 menu-key 不开启拖拽；主动拖专属只拖一只且落窝仍留场。

### Task 5: 结束本场与旧回调守卫

**Files:** app.js、pet-controls.js/html、settings.html；新建 end-session.test.cjs。
**Consumes:** commitNaming、residentCows、PetNamedPets.fresh、现有取消盒子/飞行/拖拽能力。**Produces:** endSession():boolean；现有 reset 管理入口统一到同一二次确认的结束操作，普通 clearOutside 仍保留专属。

- [ ] **Step 1: 编写红测。** first click/cancel leaves state；confirm zeroes outside/home/queue/positions/pendingKinds/recentHomes/current/pendingGifts/avatars/likes/interactions and all naming/quarantine；all config keys byte-identical；old captured frame/asset/box/flight callback cannot add；boom after end cannot restore history；auto stops；confirm-period gift cleared only on confirm；storage failure leaves full old scene。

```js
assert.deepEqual(after.recentHomes, []);
assert.equal(after.naming.owners.length, 0);
assert.notEqual(after.naming.sessionId, before.naming.sessionId);
assert.deepEqual(settingsAfter, settingsBefore);
```
- [ ] **Step 2: 运行红测。** node --test tests/end-session.test.cjs tests/named-pets-runtime.test.cjs，确认新结束行为的断言失败。
- [ ] **Step 3: 实现 endSession。** 同步从当前快照构造 CowCore.fresh + 新 PetNamedPets.fresh，新 sessionId/runEpoch 提交后才取消所有旧异步工作并移除普通、专属与名牌。清空仅写 KEY；保留最近60秒最多1000条去重记录，不留观众备注/授权。所有新回调捕获运行世代，普通自动保存读取当前状态而非旧闭包。主 RAF 取消旧调度并启动唯一新世代循环；旧 token 回调不能安排下一帧，清空后新加宠物仍正常移动。
- [ ] **Step 4: 运行绿测。** 上述新测试与 box/ball/gift queue 回归 PASS；保存空场后再次 bootstrap 仍无宠物/名单，手动新开盒正常。
- [ ] **Step 5: 保存证据。** 不增加自动结束检测，不改未知网络消息来源，不把断连当作直播结束。

### Task 6: 整体验证、V1.0.21 构建与交付

**Files:** build.cjs、package.py/package-share.py/make_manual.py、使用说明.txt；相关 release-validator/share-package 测试；取名证据目录。
**Consumes:** Tasks 1–5 的完整实现。**Produces:** V1.0.21 HTML、说明书、最新版分享包和真实包校验报告，保留 V1.0.20。

- [ ] **Step 1: 建立保全基线并写交付红测。** 正式 HTML 覆盖前保存 V1.0.20 SHA及实际 ZIP/PDF、107 身体和全部配饰/其他 manifest 引用素材哈希；新检查要求新模块/名牌/结束按钮内嵌、27脚本可编译、老资产对象与图片不变。交付 PDF/TXT 不声称自动250计数或SDK补丁。

```js
assert.equal(scripts.length, 27);
for (const source of scripts) assert.doesNotThrow(() => new vm.Script(source));
assert.deepEqual(assets.cows, previousAssets.cows);
assert.deepEqual(assets.accessories, previousAssets.accessories);
```

- [ ] **Step 2: 构建并运行完整测试。** 更新版本为 V1.0.21，保全完成后先执行 node 开发/V1/build.cjs 和 node 开发/V1/build.cjs --release，使读取真实 HTML 的新验证器有当前构建；再 node --test --test-concurrency=4 --test-reporter=spec tests/*.test.cjs。修复真实回归，不只更新断言隐藏错误；每次源码修复后重建。旧 447 项及全部新增测试 PASS 后记录真实总数。
- [ ] **Step 3: 构建与 UI 验证。** node 开发/V1/build.cjs；用允许的浏览器/宿主路径检查透明、深浅底图、360×640和1200×700、长名、右键/IME、拖拽/回窝、真实SDK原礼物功能。若工具拒绝 file://，不得通过另一个浏览器/CDP/临时HTTP绕过；明确记录 UI/OBS 未实测范围，不用 Node 断言冒充截图。
- [ ] **Step 4: 发布版本和验证实际包。** node 开发/V1/build.cjs --release；python 开发/V1/make_manual.py；python 开发/V1/package-share.py --tests-passed <本轮实际通过数>。新 V1.0.21 包只保留既有五项分享 allowlist（HTML、新PDF、TXT、既有隐私修正版教程和SRT），不放开发文件/宿主补丁。实际ZIP CRC、条目、HTML脚本、源码/资源哈希和独立新存档检查全部通过；旧隐私视频hash保持不变。
- [ ] **Step 5: 独立最终复查与交付。** 对实现/实际ZIP执行一次独立审查，修复后重跑相关及完整验证；交付最新包链接、人工授予/取名/结束本场入口和诚实测试范围。不给未经实测的跨浏览器/OBS绝对兼容承诺。

## Plan Self-Review

规格各节覆盖：玩法/操作由 Task 1/3/4，保存由 Task 2/4，结束由 Task 5，保护/大小/素材由 Task 2/4，名牌由 Task 3/4，构建/验证/两个宿主保留由 Task 6。Review Focus 五项均有对应测试。PetNamedPets、PetControls、individualScale、state.naming、commitNaming 和 endSession 名字在所有任务一致；没有自动计数或宿主补丁任务。所有任务按红测、实现、绿测和证据执行，不要求在非 Git 目录提交。

## Execution Handoff

建议 Native：由主代理在当前任务逐项实现，读源码/收集独立证据可委派，末尾做一次独立整体审查。此计划的 app 存档、场景集合与清空接口紧密关联，主代理连续完成可减少交接与返工。

另一选择为 Subagent-driven：每任务新代理实现并逐项独立审查，最后整体审查，审核更细但需要更多上下文与等待。用户审阅此计划并选择方法后才能开始产品实施。
