# Overlay Studio Implementation Plan

> For agentic workers: implement isolated tasks with supplied contract; use test-driven-development for core behavior and verification-before-completion.

Goal: deliver a local Windows desktop app that invokes existing Codex, previews and exports transparent HTML games.
Architecture: Electron IPC shell, isolated service, React renderer. Contract: design-and-contract.md. Design: ../design/concept.png.

## Tasks
- [x] Core: electron/service.cjs, codex runner/storage helpers and tests/*.test.cjs. First pin persistence, bad paths, version preservation and failed/cancelled job semantics; implement and run Node tests. No renderer edits.
- [x] Renderer: src/App.jsx, src/styles.css, src/main.jsx, index.html. Match concept and implement all actions through contract. Test actual user interactions after backend ready. No Electron edits.
- [x] Integration: electron/main.cjs/preload.cjs, scripts/dev.mjs/package.mjs. Native dialogs, constrained IPC, no privileged preview, portable Windows output. Parent owns integration and package.json.
- [x] Verify: Node tests, Vite production build, real Codex smoke in isolated QA project, browser interaction and screenshots, packaged executable launch smoke. Report actual limits, no claimed live-host testing.

Review focus: user text cannot become shell syntax; generated/imported HTML cannot access main app privileges; cancellation cannot promote partial output; revisions preserve old work; missing login/binary produces usable error instead of fake completion.

No existing repository was present in the new app directory; work is isolated in overlay-studio without touching current plugins. No remote push or publish.

