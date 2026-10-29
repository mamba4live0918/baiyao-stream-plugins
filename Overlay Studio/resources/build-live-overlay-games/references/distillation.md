# 来源与取舍

2026-10-19为透明直播小游戏独立编写。参考[Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)的README和[prototype技能](https://github.com/Donchitos/Claude-Code-Game-Studios/blob/main/.claude/skills/prototype/SKILL.md)，未复制其代码、角色库或技能全文，不依赖它运行。

保留：核心玩法先行、快速试玩、可见反馈、数值与性能边界、运行观察、按证据交付。

改写：工作室缩为单插件流程；通用引擎转为透明HTML；原型强制重写转为验证后迭代；角色层级与文档门槛转为短需求和实际试玩。

新增：离线打包、透明与预览分离、协议适配、累计连击、暂停候场、旧事件不重播、存储与实例边界、真实宿主验收范围。

本地依据：创建时阅读冰淇淋接球版、快递分拣、透明互动试玩合集的说明和皮套互动的事件校验片段。文件不是未来使用的硬依赖，项目新要求优先。

独立基线方案曾把待生成礼物和球状态一并持久化恢复，没区分游戏进度与事件事务，也没说明真实时间TTL。本技能明确区分这些状态；评估资料不进入日常执行上下文。
