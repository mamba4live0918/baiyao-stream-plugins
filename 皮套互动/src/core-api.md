# PuppetCore 接口（V1）

V2 补充：动作 settings 增加 `variant: 'shoe' | 'barefoot'`，缺失时按旧穿鞋素材补 `shoe`。踢礼物规则也保存独立的 `variant`，旧规则缺失时补 `shoe`；打/捏规则不增加此字段。配置文档版本号继续为 1，保留此前配置兼容，未知枚举拒绝。

捏痕更新：`settings.pinch` 默认时长改为 4 秒，新版时长范围 0.1–15 秒，并增加下述专有字段与一次性迁移标记。打/踢仍默认 1 秒、范围 0.1–5 秒。配置文档 `version` 仍为 1。

原生 UMD：浏览器 `PuppetCore`，Node.js `require('./core.js')`。除存储适配函数外全部不修改输入。

## 坐标和模型

- `validateResolution(width,height)` → boolean。只接受 320–7680 的整数数字，不隐式转换字符串。
- `aspectKey(width,height)` → 最简比例字符串，例如 `16:9`；非法分辨率抛 `RangeError`。
- `fitRect(logicalWidth,logicalHeight,viewportWidth,viewportHeight)` → `{left,top,width,height,scale}`。宽高必须是有限正数；left/top 是居中 contain 留白。
- `clientToNormalized(clientX,clientY,rect)` → `{x,y}`。rect 使用 CSS client 坐标的 `{left,top,width,height}`，返回值 clamp 到 0–1。不要再乘 DPR。
- `pointToPixels(point,width,height)` → `{x,y}`。比例 clamp 到 0–1；宽高须有限正数。
- `defaultProfile(modelID,name)` → `{modelID,name,layouts:{}}`。
- `ensureLayout(profile,width,height)` → **布局的独立拷贝**；存在同一比例时保留校准，否则返回默认未校准布局。不修改 profile。持久化时明确执行 `profile.layouts[PuppetCore.aspectKey(w,h)] = layout`。

布局：
```js
{
  calibrated: false,
  anchors: {
    hit: {x:0.5,y:0.35},
    pinchLeft: {x:0.4,y:0.4},
    pinchRight: {x:0.6,y:0.4},
    kick: {x:0.5,y:0.75}
  },
  settings: {
    hit:   {size:0.16,intensity:1,duration:1,direction:'left',variant:'shoe',hotkeyID:'',parameter:'',parameterValue:0},
    pinch: {size:0.16,intensity:1,duration:4,direction:'left',variant:'shoe',hotkeyID:'',parameter:'',parameterValue:0,
            skinColor:'#ffe3d5',pinchMarkScale:1,pinchMarkOpacity:0.85,pinchStyleVersion:1},
    kick:  {size:0.16,intensity:1,duration:1,direction:'left',variant:'shoe',hotkeyID:'',parameter:'',parameterValue:0}
  }
}
```

通用参数范围：size 0.02–1（短边比例）；intensity 0–3；parameterValue -1000000–1000000；hotkeyID/parameter 最大 256 字符。duration：新版捏动作 0.1–15 秒，打/踢 0.1–5 秒。

### 捏动作专有字段与旧配置迁移

| 字段 | 默认值 | 校验 |
| --- | --- | --- |
| `skinColor` | `'#ffe3d5'` | 必须是 `#` 加六位十六进制；大小写均可输入，返回小写；不接受命名色、三位色、URL、脚本、首尾空格或其他类型。 |
| `pinchMarkScale` | `1` | 有限数字，0.5–2。 |
| `pinchMarkOpacity` | `0.85` | 有限数字，0–1，允许 0。 |
| `pinchStyleVersion` | `1` | 显式存在时只能是数字 `1`。 |

以上四个字段只在 `settings.pinch` 返回；打/踢中的同名未知字段按白名单忽略。

- 旧捏配置缺少 `pinchStyleVersion`：**先**校验原 `duration` 为有限数字且在旧范围 0.1–5 秒，再将时长改为 `Math.max(duration,4)`，并写入迁移标记 `1`。0、NaN、无穷、字符串和超限旧时长均拒绝，不通过迁移掩盖坏数据。
- 新版 `pinchStyleVersion:1`：保留 0.1–15 秒的用户时长，包括用户主动调短到 0.1 秒；之后加载、导入、保存不会再次抬高时长。
- 肤色、大小和不透明度**缺字段**时取默认；显式错误值（包括 null / undefined）整份拒绝，不能默认吞掉。合法显式值保留并规范化。
- `ensureLayout`、`validateConfig`、导入与加载共用上述迁移；返回独立拷贝，保留原 anchors、calibrated、variant 和礼物规则，不修改传入配置。`loadConfig` 只返回迁移结果，不自动覆盖浏览器旧记录；导出/保存会包含新字段和标记，仍排除令牌。

`direction` 只接受 `'left'` / `'right'`，默认 `'left'`。旧 V1 配置缺少该字段时，`validateConfig` / 导入 / 加载 / `ensureLayout` 自动补为 `'left'`，不修改原输入；字段存在但值非法则拒绝。

## 配置与存储

- `defaultConfig()` → 新的 `{version:1,scene:{width:1920,height:1080},profiles:{},rules:[{name:'',action:'hit',count:1}],volume:0.4,port:8001}`。空礼物名表示未绑定。
- `validateConfig(object)` → `{ok:true,value,error:null}` 或 `{ok:false,value:null,error:string}`。返回值深拷贝并只保留定义字段，未知字段（包括任何层的令牌）不会导出。已知字段缺失、错误类型/范围、危险键、无效比例、modelID 与索引不匹配均整份拒绝。
- `importConfig(jsonText)` → 相同结果；JSON 文本最多 1 MiB，必须是完整 V1 配置。
- `exportConfig(config)` → `{ok:true,text,error:null}` 或 `{ok:false,text:null,error}`。格式化 JSON，不含连接令牌。
- `loadConfig(storage,key?)`（别名 `load`）→ `{ok,value,error,found}`。首次没有记录时 ok=true、found=false、value 为默认配置。访问被拒、坏 JSON、坏配置时 ok=false，value 为新默认配置，保留已有存储不改写。
- `saveConfig(storage,config,key?)`（别名 `save`）→ `{ok,error}`。先验证后写入，再读取核对；失败返回错误，不能显示“已保存”。
- storage 可传浏览器 localStorage 或同接口对象；传 null/undefined 时尝试当前环境 localStorage，访问异常会被捕获。默认 key 为导出的 `STORAGE_KEY`。

最多 100 个模型、每模型 64 个布局、100 条规则。规则 `{name,action,count}`：name 去首尾空格，最大 128 字符；action 为 hit/pinch/kick；count 为 1–100 整数。volume 0–1；port 1–65535 整数。输入大小也受 1 MiB 上限限制。

## 礼物

- `normalizeGift(raw)` → `{ok,value,error}`。输入为 `{name,count,eventId?}` 或 `{giftName,count,eventId?}`；也接受 `{gift:{name},count,eventId?}`。
- 输出 `{name,count,eventId?}`：名称去首尾空格且非空，count 必须是 1–100 整数数字，代表**本次增量**。绝不读取连击累计字段。eventId 为非空字符串或非负安全整数（规范化为字符串）；没有可靠 ID 则不增加字段。
- 核心不保留去重状态、不使用昵称或礼物名称代替 ID。UI 仅在有 eventId 时去重，并负责串行队列与 200 次动作容量。

V4 接口补充：settings.effectScale 控制冲击图形大小（0.25–3）。hitTarget 为 face/head，contactScale 为接触图形大小（0.25–3），打脸 skinColor 为六位 HEX。hitHead 是独立归一化准星，旧配置从打脸点向上0.16生成初始参考点，需要用户校准。kickShrink 为0–0.95，独立于飞行位置和旋转；0仍会踢飞旋转，但不缩小。手脚 size 支持0.02–1，并有滑块、精确输入及保存动作按钮。
