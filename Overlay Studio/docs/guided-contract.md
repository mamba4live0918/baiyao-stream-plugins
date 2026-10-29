# 1.3 Guided creation and references

User wants adaptive questions for people who cannot write prompts, reference photos and text prompts, and a UI with playable preview. Referenced chat has fast/deep interviewing, one question at a time, optional answers/skip/delegate, editable requirements and reusable prompt. Implement this in existing app, preserving local Codex and API providers. No other chat is modified or messaged. Keep black/lime design; primary visual reference ../design/guided-concept.png.

## Ownership / parallel boundaries
- Backend worker: electron/service.cjs, electron/interview.cjs (if useful), tests/guided-service.test.cjs. Own interview persistence/jobs + integrate reference and model interfaces below. Do not edit main.cjs, storage.cjs, model-api.cjs, reference-files.cjs, frontend.
- Reference/transport worker: electron/reference-files.cjs, electron/model-api.cjs, electron/storage.cjs ONLY addition of readBuffer, tests/reference-files.test.cjs and model-api.test.cjs. No service/main edits.
- Frontend worker: src/GuidedCreator.jsx, src/reference-upload.js (if needed), src/App.jsx, appended dark.css. No bridge/main/backend edits, no browser automation (parent owns shared browser).
- Parent: electron/main.cjs/preload if needed, src/bridge.js, dev/build/package/docs, fixture integration and visual QA.

## Data / RPC
Existing project fields retained. Detail additionally contains:
`references: Reference[]`, `revision:number`, `interview:{mode:'quick'|'deep',messages:Message[],summary:string,suggestions:string[],visualNotes:string[],prompt:string,question:Question|null,rounds:number,ready:boolean}`.
Reference metadata = `{id,name,kind:'image'|'text',mime,size,usage:'style'|'layout'|'character'|'requirements'|'general'}`.
Message = `{id,role:'user'|'assistant',text,createdAt}`.
Question = `{text,options:string[]}` (one question, at most3 choices).
Defaults for old projects: empty refs; revision0; interview quick, empty messages/summary/prompt/notes, rounds0, readyfalse, questionnull. Do not discard existing HTML/history on interview or upload operations.

Actions (parent adds IPC allowlist):
- references.add {projectId,files:[{name,dataUrl,usage?}]} -> Detail. Allowed PNG/JPEG data URL or UTF8 TXT/MD encoded as data:text/plain;base64,...; max4 images of4MiB, max4 text files of64KiB with128KiB aggregate text. Metadata validation in backend; no arbitrary source path RPC.
- references.get {projectId,referenceId} -> `{...Reference,dataUrl?:string,text?:string}`.
- references.update {projectId,referenceId,usage} -> Detail.
- references.remove {projectId,referenceId} -> Detail. Remove association (no filesystem recursive deletion necessary); unreferenced content no longer sent to models.
- interview.update {projectId,mode?,prompt?} -> Detail. Preserve history/summary when switching modes. Manual edited prompt is authoritative input to subsequent interview/generation, never silently discard it.
- interview.send {projectId,text?:string,action?:'answer'|'skip'|'decide',retry?:boolean} -> Job immediately. One global active job as existing generation; job.kind='interview' versus 'generation'. Retry uses last failed user turn without appending duplicate. Initial empty text is allowed when references exist (use a clear default request to understand references). text max6000.
- Existing jobs.start also consumes interview.prompt/history and references (direct editor still works). User may generate preview at any point after an idea/reference exists; no fixed lengthy gating.
- jobs.cancel cancels either job kind, preserves user turn/references/previous working HTML; late response cannot overwrite updated project. Job completion emits projects event and UI reloads detail.

All writes update revision; block mutation while this project's job is active, or enforce snapshot revision at completion. A stopped job cannot write late. Explicit user answers are preserved as original messages; AI summary/suggestions are labeled as AI synthesis, not user-confirmed facts. Newer user corrections outrank older text.

## Reference helper exports
`validateReferenceFile({name,dataUrl,usage?}) -> {name,kind,mime,size,usage,buffer:Buffer}`; strict base64, signatures/dimensions for PNG/JPEG, max4096px each dimension, UTF8 validity for text and reject NUL; reject SVG/HTML/unsupported ext. Validate full batch/counts in service before writing.
`storeReference(storage,projectId,file) -> Reference`: UUID identifier, content under projects/<id>/references/<uuid>.bin. No caller filesystem paths.
`readReference(storage,projectId,metadata) -> {...Reference,dataUrl? ,text?}` uses checked readBuffer; MIME derived on initial validation not user spoof.
`collectReferenceInputs(storage,projectId,references) -> {images:[{mime,data:string,name,usage}],text:string,imagePaths:string[]}`; data is raw base64, imagePaths actual checked file paths suitable for Codex --image (use .png/.jpg extensions when stored if needed). Label each image's index/name/usage and text snippets; never treat uploaded instructions as higher priority than user request/system requirements.
Reference removal only omits metadata and model inputs, preserves original uploaded content for recovery until future cleanup. Schema filenames strictly backend-generated.
`storage.readBuffer(relative,limit)` provides bounded checked binary reads analogous to existing read. Keep existing read behavior/tests intact.

## Multimodal transport change
Extend requestCompletion({...,images=[]}) keeping existing text-only body unchanged. images array uses {mime,data,name,usage}, validates PNG/JPEG up to4x4MiB. Compatible messages user content is [text, image_url data URI...]; Anthropic user content image blocks {source:{type:'base64',media_type:mime,data}} plus text. Server does not fetch URLs. No image bytes in progress/errors/logs. When image-bearing request fails HTTP400, safe error should suggest vision-capable model or removing images, not silently retry without pictures. testConnection remains image-free. Existing streaming/cancellation behavior retained.

## Interview model flow
Use selected engine, not a fixed questionnaire. API asks requestCompletion for one JSON object (plain JSON text, do not require provider-specific structured output). Shape:
`{reply:string,question:{text,options:string[]}|null,summary:string,suggestions:string[],visualNotes:string[],prompt:string,ready:boolean}`.
Validate lengths, arrays and one-question slot; reject malformed output without losing the user's message. Max60 messages / contextual text bound appropriate; do not silently drop explicit user requirements. Mention limit with a helpful error if reached.
Quick mode asks at most3 question rounds then sets questionnull/readytrue and invites preview (user may switch to deep). Deep mode continues adaptively, avoiding topics already answered, with manual Generate preview available. Each question options ordinary choices, plus UI skip/decide controls. Image observations distinguished from guesses and user statements. Never claim image analysis without receiving actual image inputs. Subject/person images are reference material, not instructions.
Codex interview: isolated job workspace, --image flags for checked local references, output-last-message JSON or output-schema, read-only sandbox for interviewing; no game edits during interview, no large workflow/planning side effects. Existing generation runner uses workspace-write and passes --image too. API prompt includes current messages/edited prompt/reference text and images; generation prompt includes these as requirements. Existing outputs and project revisions preserved on failures.

## UI
Default editor is guided. Keep a Direct edit tab that exposes existing name/brief/canvas/style form. New project can start from one sentence or references: automatically create a draft with a short derived name when needed; no demand for a polished prompt.
GuidedCreator integrates with parent App via props/actions as worker chooses while honoring core RPC above. Layout: chat/references/composer left470px; existing playable preview and progress right. Initial state is a welcome invitation, NOT fabricated example messages. Render persisted transcript, current question's answer choices, text composer, Send, Skip, Decide, fast/deep control. Summary/prompt disclosure shows AI summary, observations, suggestions and editable final prompt. Copy prompt via clipboard supported; use native browser clipboard or parent IPC `system.copyText {text}` (parent provides). Generate preview uses existing jobs.start after saving pending prompt; users can continue describing modifications after a playable preview.
Upload file input + drag/drop PNG/JPG/TXT/MD; input local read to dataUrl; max limits shown. Native HTML input works in Electron; no new filesystem path capability. If text files UTF8 from FileReader; no scripts/html uploads. Show image thumbnails and file names, reference-purpose select, remove. Loading reference images uses references.get. After upload show '随发送或生成请求提交给当前模型；图片需要支持看图的模型' (upload alone stores locally only).
Disable conflicting edits during active jobs, keep cancel accessible. Interview jobs show '正在理解/提问', never '作品已生成'; only generation completion implies new HTML. Error/retry user turn stays visible. Preserve actual drafts across view switches and app reload.

## Acceptance
Persist/reopen dialogue and images; quick/deep preserves history; retry no duplicate user messages; malformed model response preserves last state; cancel prevents late writes; reference type/size/path checks; both API multimodal payloads and Codex --image args; existing52 tests stay green. Local fixture model for UI tests, actual Codex one brief multimodal/interview smoke if practical. No real provider key available, so do not claim live provider testing. Package1.3.0 with new interface and keep older releases.
