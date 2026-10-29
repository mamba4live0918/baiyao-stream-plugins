# PuppetVTS 接口

原生 JavaScript UMD：浏览器 `PuppetVTS`，Node.js `require('./vts.js')`。无外部运行时依赖。

## Client

```js
const client = new PuppetVTS.Client({
  onStatus(status, text) {},
  onModel(model) {},
  onError(error) {}
});
await client.connect(8001);
```

- `connect(port = 8001)`：只连接 `ws://127.0.0.1:<port>`，不自动重连或重放。端口 1–65535。
- `disconnect()`：关闭连接、停止刷新、拒绝全部待响应请求、清空模型／参数／热键。重复调用安全。
- `request(type, data)`：Promise resolve 为协议响应的 `data`，不是整个响应信封。错误 reject Error，协议错误号在 `.code`。按 requestID、响应类型、连接代数核对。
- `refresh()`：刷新当前模型、热键、输入参数；并发刷新合并。无模型返回 null，连接仍保持认证。
- `authenticated`：布尔值。
- `model`：`CurrentModelResponse.data` 或 null。含 `modelID`、`modelName`、`modelPosition`。刚收到模型事件时暂时只有 ID、名称，随后刷新补全。
- `hotkeys`：`availableHotkeys` 数组，选择时保存 `hotkeyID`。
- `inputs`：`defaultParameters` 与 `customParameters` 去重合并，保留 `name/value/min/max/defaultValue/addedBy` 等原字段。此列表是 **VTS 输入参数**，不是 Live2D 输出参数。
- `sessionId`、`modelRevision`：动作内部防止旧连接／旧模型迟到结果使用；UI 不应修改。

回调 `onStatus` 状态为 `connecting / authorizing / connected / no-model / disconnected / error`。`onModel` 仅模型 ID 改变（含清空）触发，先于该模型的元数据刷新；UI 可立即切换模型配置并取消礼物队列，在随后 `connected` 状态刷新参数选择器。每次定期刷新也会发 `connected`，不要据此自动开启礼物控制。

默认每 1000ms 在前次请求完成后刷新；订阅官方 `ModelLoadedEvent`，切模型立即更新 ID 并通知动作取消。API 订阅不可用时连接报错，避免在缺乏切模型通知时继续控制。正常请求超时 3500ms，连接 6000ms，首次授权弹窗 60000ms。测试可注入 `WebSocket`、`storage`，及 `requestTimeout / connectTimeout / authorizationTimeout / refreshInterval`（0 禁用轮询）。

独立插件身份为“皮套互动整蛊”，开发者 `PuppetInteraction`。令牌只由 Client 存在专用 localStorage 键中，不放入模型配置、不导出，不读取其他插件身份。失效令牌会重新请求用户授权；存储失败通过 `onError` 报告，本页可暂用。

## 动作

```js
await PuppetVTS.runAction(client, 'hit', settings, {
  signal: abortController.signal,
  onImpact() { /* 在已核对模型后立即播放网页手脚、音效 */ }
});
```

- kind：`hit`、`pinch`、`pinch-left`、`pinch-right`、`kick`。
- settings：`{size:.16,intensity:1,duration:1,direction:'left',hotkeyID:'',parameter:'',parameterValue:0}`。`size` 由网页素材使用，VTS 模块不读取。强度 0–3。打省略 `duration` 时默认 1 秒，踢默认 3.2 秒，接受 0.05–5 秒；`pinch / pinch-left / pinch-right` 省略时默认 **4 秒**，接受 **0.05–15 秒**（产品 UI 可采用 0.1 秒下限）。明确传入的合法时长保留；旧配置的一次性时长迁移由配置层负责。
- `direction` 只接受 `left / right`，缺失时为 `left`；无效值拒绝动作。右侧来击反转通用头部 `FaceAngleX/Z` 的方向，以及踢的 X 位移、旋转；踢的向上 Y 位移不反转。`pinch` 与 `pinch-left` 服从此设置，显式 `pinch-right` 始终采用右侧行为，兼容原调用。自定义输入 `parameterValue` 保留用户所填符号，不自动反转。
- 同一 Client 只允许一个动作；UI 负责按礼物顺序串行调用。完成 resolve `{kind,modelID}`。停止会先清理再 reject `AbortError`；其他错误须显示给用户。
- 打、捏使用 `InjectParameterDataRequest` 的 `mode:'add'` 与 `faceFound:false`，只写入输入列表中存在的 `FaceAngleX/Z`、`EyeOpenLeft/Right`，以及可选的 `FacePositionX/Y`。捏的通用 `FacePositionX/Y` 始终为 0，不平移脸部，便于网页捏痕贴片保持位置。约 30Hz 串行发送，网络较慢时自然降低频率，没有无限积压。通用头部角度限制在 ±30；打的眼睛范围 -1–0，捏的通用眯眼范围 -0.65–0。结束向本次写过的所有参数发 0，绝不叠加 1。
- 捏可选 `parameter`，须精确匹配已有输入 name，`parameterValue` 必须是该输入公开 min/max 范围内的有限数值，作为 additive 偏移使用；不会乘动作强度。自定义值只乘 0–1 的夹紧／释放包络，保留用户所填符号，头部反向回弹不会让它变号。如果选中通用参数同名，自定义值优先。正数眼睛偏移拒绝。需要先在 VTS 中映射此输入，模块不创建脸颊变形。
- 打、捏、踢均可选 `hotkeyID`，必须存在于本模型热键表，在网页 `onImpact` 后、模型参数／位置动作前触发一次。触发后再次读取并核对当前模型，配合模型事件及连接代数检查，切模型则终止后续参数／位置操作。**切换表情热键可能持续生效，需要用户用 VTS 热键关闭；停止不保证撤销表情。** 该 API 可执行的热键也可能是动画、移动等动作，UI应显示实际名称和类型。
- 踢先读取当前模型原位置，以约30Hz发送绝对 VTS 坐标：向屏幕内远点飞出、转两圈、缩小，随后飞回；最后再次精确恢复原位置。所有段均从同一份原 `positionX / positionY / rotation / size` 推导，不累加偏移。正常结束和停止均恢复，切模型不恢复到新模型，断线无法恢复时报告错误。恢复前重新核对当前模型；不根据网页像素计算模型位移。强度 0 时各目标都等于原位置。
- `AbortSignal` 会中断等候（包括等候普通动作请求响应），进入清理；迟到响应只完成旧请求，不发起新动作。清理本身仍需 VTS 返回，超时会明确报错。
- 模型切换、断线、状态轮询失败均停止控制，不会把历史礼物留到新连接重放。VTS 对模型操作没有原子“仅当 modelID 相同”条件；模块通过实时切模型事件及操作前／恢复前读模型阻断已观察到的切换，不承诺跨进程时序的绝对原子性。

## 动作反馈时间线与纯函数

`motionSample(kind, progress, intensity = 1, direction = 'left')` 不发送请求，返回 `{parameters, parameterEnvelope, modelOffset}`。`progress` 是 0–1 的动作进度；强度、方向校验与 `runAction` 一致。`parameters` 提供角度、位置、眼睛的 additive 目标，`parameterEnvelope` 是捏的自定义参数包络，`modelOffset` 是踢相对动作前原位的 `{positionX,positionY,rotation,shrink,recenter}`（位置按 baseline×(1-recenter)+position 混合；size 向 -100 按 shrink 混合）。纯函数返回的参数未筛选，真实动作只发送当前 `inputs` 中存在的项。

`onImpact` 保持在 **t=0** 调用一次，同时启动网页视觉；下面时点按整次 `duration` 的比例计算。打默认 1 秒，踢默认 3.2 秒；捏默认 4 秒时，.12 接触=0.48 秒、.22 夹满=0.88 秒、.78 保持末尾=3.12 秒、.90 完全释放=3.60 秒。热键及 API 延迟可能影响实际画面到达时间，超短动作的参数采样也会少于完整曲线。

| 动作 | 100% 强度的曲线 |
| --- | --- |
| 打 | t=0 有 8% 前摇；.10 达 X=26、Z=22，保持到 .22；.55 反向至峰值的 24%；.72 有 8% 小回摆；.86 有 2.5% 反向余振；1 归零。眼睛独立闭合／睁开，反弹不使眼睛变成正数。 |
| 捏 | t=0 仅 4% 轻微前摇；.12 接触、.22 夹满，头角 X=2.5°、Z=4°；.22–.78 长时间稳定夹持，.32/.52 向上约 4%、.42/.62 向下约 4% 的细微轻揉，.72 仅 2% 起伏。眼睛在 .22–.78 轻眯至 -0.60；.86 松开、.92 头部反向仅 8%（X约-0.20°、Z约-0.32°），1 归零。自定义夹紧包络在 .22–.78 为 1，.90 释放为 0且始终不反号。 |
| 踢 | t=0 发第 1 段，目标在 .10 达 X=0.22、Y=0.10、旋转 16°，保持至 .22；第 2 段在 .55 达到横向／旋转反向 18%、竖向反向 15%；第 3 段回原位，t=1 后再精确恢复。正常全过程固定 4 次位置请求；提前停止时只发送已开始的段及最后恢复。 |

可选 FacePosition 的 100% 峰值：打横向约 0.55、向下约 0.20；捏的通用横向／竖向值均为 0。捏的通用眯眼即使提高强度也封顶 -0.65，以保持轻眯眼。用户主动配置的自定义输入仍按其映射生效。左右方向仅翻转横向与角度，不翻转竖向。显示效果仍受用户模型映射、限幅、平滑和已有表情影响；肤色捏痕是网页视觉，不由该模块创造模型变形。

官方依据：[参数注入](https://github.com/DenchiSoft/VTubeStudio#feeding-in-data-for-default-or-custom-parameters)、[模型位置](https://github.com/DenchiSoft/VTubeStudio#moving-the-currently-loaded-vts-model)、[模型事件](https://github.com/DenchiSoft/VTubeStudio/blob/master/Events/README.md#model-loadedunloaded)、[输入映射](https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings#vts-parameter-setup)。

## 验证边界

`node --test 皮套互动/tests/vts.test.cjs` 只使用注入的假 WebSocket 和受控 Client，不连接真实 VTS、不读取用户令牌。覆盖正常／失败授权、并发请求关联、超时、存储拒绝、自动刷新、切模型事件与旧结果竞争、断线清理、参数归零、停止与位置恢复；真实模型映射和真实礼物联调须单独验收。

V4：打脸接触反馈在100%强度时FaceAngleX峰值12、FaceAngleZ峰值9、FacePositionX峰值0.08，以减少静态接触准星与受击脸颊的错位。hitTarget=head 时采用FaceAngleY峰值-22与少量Z/垂直反馈，不写横向位置；仍只发送模型已有的输入。kickShrink独立控制缩小幅度。演示支持hit-face及hit-head分开播放。

V4.1：所有pinch别名的头部角度、位置采样为0，实际请求完全排除FaceAngle/FacePosition标准输入。去掉头部轻摆和回弹。保留眼睛与自定义脸颊输入；禁止将标准头部输入选作捏脸参数。没有眼睛/脸颊输入时允许仅播放网页特效。此行为不锁定用户面捕或其他控制器。
