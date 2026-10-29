# Overlay Studio — implementation contract

User request: a beautifully designed locally runnable Windows app around build-live-overlay-games. User explicitly selected using the installed local Codex. Existing Codex executable available on PATH, CLI 0.163.0-alpha.10.2; `codex login status` reports Logged in using ChatGPT. Do not read/copy auth secrets or configure API keys.

Design source: ../design/concept.png. True white sidebar/surfaces, #f6f8fa canvas, #172b27 text, #087d5b emerald accent, cool gray dividers; generous spacing, 12px panels, light line icons. Main composition at 1440x1000: 220px sidebar, toolbar, large Chinese title, left 360px brief, right preview + progress. At 1280x800 adapt spacing and allow content scrolling. No marketing banners or fake project metrics.

Core surfaces: New/editor, project library, skill rules, settings. Editor: brief, project name (necessary addition to concept), canvas select, style select, transparent and offline checked (single-file target always enforced for v1), generate/update, cancel, log, sandboxed preview, background switches, reload, export. Starters are real local demos: dropping balls provided with skill; coin and timer entries can be brief presets explicitly labeled as ideas, not ready code. Import single HTML copies into managed project. Existing live plugin folders untouched.

Architecture: React+Vite renderer, Electron desktop shell, CommonJS core service. Renderer has one capability API: `window.studio.invoke(action,payload)` Promise and `window.studio.subscribe(fn)` -> unsubscribe. Browser development adapter implements same using local HTTP. Packaged app uses IPC only. Core never exposes arbitrary shell, readFile or path input commands. Electron contextIsolation true, sandbox true, nodeIntegration false. Preview iframe sandbox allow-scripts only (plus allow-pointer-lock if useful), without allow-same-origin; srcDoc with injected restrictive CSP blocking network by default. Preview controls document this local/offline behavior.

Service module electron/service.cjs exports async createStudio({root,skillDir,emit,codexPath?}) returning {invoke,dispose}. emit(event) broadcasts {type:'job',job} or {type:'projects'}.

Data contract:
- Project: {id,name,brief,width,height,style,createdAt,updatedAt,status:'draft'|'ready',hasHtml,versions:number}.
- Detail: {...Project,html:string,history:[{id,createdAt,label}]}.
- Job: {id,projectId,state:'running'|'completed'|'failed'|'cancelled',startedAt,endedAt?,logs:[{time,text,kind:'info'|'error'|'success'}],error?}. Expose current/recent job with bounded logs.
- Status: {available,loggedIn,version,path,authLabel,error?,dataDir,skillName}.
- Bootstrap: {projects,status,job,settings:{codexPath:string}}.

Allowed invoke actions:
bootstrap -> Bootstrap
status -> Status
projects.list -> Project[]
projects.create {name,brief,width,height,style} -> Detail (no generated HTML)
projects.get {id} -> Detail
projects.save {id,name,brief,width,height,style} -> Detail
projects.import {name,html} -> Detail (max 20MiB UTF8; save copied HTML)
projects.seed {template:'starter'} -> Detail (copy actual bundled overlay-starter)
projects.export {id} -> {name,html} (Electron renderer calls files.export to choose/save)
projects.restore {id,versionId} -> Detail (preserve current as a version before restore)
jobs.start {projectId,instruction?:string} -> Job (returns immediately; exactly one global active job)
jobs.cancel {} -> Job/null
jobs.current {} -> Job/null
rules.read {} -> {title,content,sections:[{name,content}]} (bundled skill + references)
settings.save {codexPath:string} -> Settings (empty resets autodetection)

Shell-only actions handled by Electron main: files.import -> Detail|null using native HTML file dialog and core projects.import; files.export {id} -> {cancelled,path?} using save dialog and core projects.export; system.openData -> opens managed data folder; system.chooseCodex -> {path}|null. Browser adapter may provide download export via client and file input import; do not fake native actions success.

Core generation: spawn resolved codex.exe with argument array, shell:false, windowsHide:true. Use `-a never exec --json --color never --skip-git-repo-check --sandbox workspace-write -C <isolated job workspace> -o <result.txt> -` (global -a before exec). Preserve user's model/provider config; no hardcoded model and no bypass flags. stdin contains brief, selected parameters, essential skill & references, concise deliverable instruction to produce self-contained index.html. Write current HTML into isolated job workspace when iterating; no generation over user's actual folders. On success check nonempty valid HTML document, preserve old revision, promote generated index atomically. Failure/cancel retains previous HTML. Never promote unfinished file after cancellation. Final message alone not proof a file exists. Disk writes only managed project paths, reject traversal and symlink escape. Keep failed workspace for diagnosis. No automatic external deployment or real livestream connections.

Generation progress: parse JSONL thread/turn/item events; show concise assistant status and failures, not raw tool outputs with potential secrets. stderr bounded and redact obvious auth material. Timeouts/status probing never reads auth files. Cancel terminates process tree on Windows. Handle close during generation cleanly. Same credential sessions as CLI; UI states online service needed for generation, project editing/preview/export local.

Test invariants: path traversal rejects; malformed/big import rejected; files survive restart; versions and restore; failed/cancelled run preserves last artifact; duplicate jobs rejected; parser split chunks; process invocation shell:false and workspace sandbox; artifact promotion only successful valid output. Browser verify primary controls and rendered design with real service, not a screenshot mock. Package a Windows x64 portable folder/zip with exe; user need not npm install. Installed Codex required for AI generation. Build no auto-run jobs on launch.
