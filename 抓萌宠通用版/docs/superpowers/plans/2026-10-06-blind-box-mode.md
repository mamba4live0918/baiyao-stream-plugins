# Blind Box Mode Implementation Plan

**Authorized brief:** User confirmed all themes must replace the catch/chant/count sequence with blind boxes, retaining all themes and existing pets. The latest clarification supersedes the initial shared-probability-pool approach: each gift binds its own editable tier; a physical surprise box falls into the screen center, bounces, bursts, and releases pets at that location. User explicitly requested continued execution without waiting for more questions.

## Revised Rulings

- Tiers have no fixed row-count limit. Keep separate existing population safety capacity and visible-pet limit; do not silently remove either. Support fixed or random min/max amounts, positive integers up to the existing 100000 total-population capacity. Exceeding available capacity blocks that box until space is freed, preserving its queued source.
- Canonical new rows are `{id,name,gift,mode,count,min,max,enabled}`. Gift names are normalized for matching, enabled nonempty gift bindings must be unique. Blank gifts permit manual testing. Shared chance controls are removed from the live UI; old default quantity tiers migrate as unbound fixed rows.
- Gift arrival snapshots its tier's name, amount mode/range and avatar source into the ordered queue. Editing or deleting a tier must not change queued boxes. Random quantity rolls once when that snapshotted box starts, and the chosen count/name persist across reload.
- Add `enqueueBox(state,n,avatarKind,tier,boxModule)` and optional `box` snapshot to `roundSources` and `pendingGifts`. Generic enqueue must not merge into a bound-tier source. Box-bound gifts take precedence over matching old interaction rules; unrelated interaction rules continue immediately.
- `startBox` consumes the front snapshotted source, or a selected/manual unbound tier when no bound source exists. Keep current serial/source/applied protections. No old miss probability for new boxes.
- `PetBoxMotion` reuses `CowCore.stepBall` for falling, contact and damped rebounds. A box bursts only after its physical flight settles. Persist phase/fall state and reveal age, scaling restored flight to the current viewport. Reduced motion resolves safely without unnecessary flight.
- Pet release is a separate short ballistic state. Use `replenish(true)` and animate only newly visible members from the burst point to legal activity-area targets; bypass roam clipping while in this transient flight. Water pets must also fly out, then resume swimming. Waiting animals stay in waiting, not additional DOM.
- The old five-node time-based presentation remains a compatibility path for legacy records/tests; actual new openings use physical completion and reveal age. A restored already-applied box never releases its quantity a second time.
- Final acceptance follows the revised gift/physics interfaces below, not the superseded probability-pool tasks further down. The new code can retain pure legacy probability adapters for reading interim records, but the user-facing workflow is per-gift tiers.

**Architecture:** Reuse the existing population, queue, avatar source and applied-result protections. Add a small pure tier/probability module; retain legacy tiers for migration but use a separate `boxTiers` configuration for new openings. New current rounds snapshot their selected name/count and use the existing four-stage five-node timer for closed, shake, reveal and result. All existing pet assets and three themes remain untouched.

## Interfaces

- `PetBlindBox.migrate(legacyTiers)` returns normalized `{id,name,count,chance,enabled}` rows. `chance` is integer basis points, 0–10000; enabled entries total 10000. Legacy enabled rows receive equal shares using largest remainders. Disabled rows remain disabled.
- `PetBlindBox.validateTiers(rows)` returns safe cloned rows; up to 1000 rows, safe stable IDs, names up to 40 characters, integer counts 1–10000, duplicate counts allowed, unique IDs, at least one positive enabled probability, enabled total exactly 10000.
- `PetBlindBox.normalizeProbabilities(rows)` rescales only enabled entries to total 10000 by largest remainders; zero enabled sum uses equal odds. Does not mutate input.
- `PetBlindBox.choose(rows,capacity,forcedId,rng)` returns a selected eligible row or null. Exclude counts beyond current population capacity and zero/disabled odds, renormalize remaining weights; forced preview ignores chance but still validates ID, enabled state and capacity.
- `CowCore.startBox(state,rng,rows,forcedId,boxModule)` chooses once then uses the existing one-row `start` to reserve capacity and consume the queue/source. New rounds have `presentation:'blindbox'`, snapshot `boxName` and `times:[0,200,850,1550,2500]`; success always true. Existing miss preference is not used for new boxes.
- `CowCore.upgradeCurrentBox(state,rows)` updates an old current presentation/name/timing without changing its count, success, applied status, source or serial; restored box fields survive reload. Legacy failed current rounds may finish without rewards, not be rewritten into success.
- `CowCustomizer` takes optional `blindBox` and `boxSettings` UI factory, initializes/migrates `cfg.boxTiers`, stages row edits until explicit apply, preserves all unrelated old configuration and IndexedDB records.
- New UI: add/remove, name, count, probability with two decimals, enable, normalize to 100%, apply, specific-tier real test and pure visual preview. No old chant/count audio playback. General voice control becomes opening sound; removed legacy audio is retained in storage but no longer shown.
- New `ASSETS.blindBox = {closed,open}` transparent bitmap pair. Existing pet/nest/ball/audio assets remain identical.

## Tasks

- [ ] Write failing probability/migration/capacity tests; implement pure module and core box round snapshot/restore.
- [ ] Generate and inspect a transparent closed/open pair, mechanically split using a shared scale.
- [ ] Build staged tier settings and replace old chanting controls with blind-box controls; test save, invalid drafts, deletion and migration.
- [ ] Replace app showPhase/begin/preview/startup restoration, stop old voices/clapbeat, route opening/reveal sounds through live volume and respect reduced-motion/reduced-mode.
- [ ] Verify gift queue order, avatars/duck display, capacity, once-only reload, settings changes during an active opening and legacy current migration.
- [ ] Build V1.0.15 standalone files, update PDF/TXT/history, inspect offline visuals, verify actual ZIP bytes and all assets.

## Constraints And Review

- Transparent HTML/body; only the box, actual pets, nest, required HUD and local menu appear. No fullscreen opaque backdrop.
- Keep 103 native pets, 8 nests, 4 balls, explicit native IDs, old uploads, all old state/config keys, current counts and collection history.
- No browser/local-server/CDP workaround for the previously denied file access. Report VM/raster/ZIP evidence separately from unperformed browser/OBS tests.
- Test malformed probability precision and sums, capacity exclusion, stale edits/upload, current result snapshot after tier deletion, two reloads and duplicate result application.

## Completed Revised Work

The initial probability-pool interfaces above were superseded by the user clarification and Revised Rulings. All active deliverables follow the per-gift workflow.

- [x] Gift-bound canonical rows, fixed/random counts, unlimited tier row count, queued snapshots, receipt/restore and one-time settlement.
- [x] Transparent closed/open pair with shared mechanical split/scale, embedded without altering existing assets.
- [x] Staged per-gift tier editor, duplicate bindings, invalid drafts, bad-record protection, real tier/gift tests and retired voice UI.
- [x] Physical fall/rebound display, persisted motion, ballistic release including water pets, waiting overflow and reduced-motion safety.
- [x] Actual full-app bootstrap in a strict-ID DOM unit fixture, independent review and red/green fixes for both findings.
- [x] V1.0.15 main/preview, 12-page PDF/TXT, actual ZIP integrity and byte checks, previous-archive asset preservation.

Final verification: 320 tests pass, 23 embedded scripts parse, main and preview are identical. The current HTML SHA-256 is `1e23cce2615e85b13233780fe8e614fb12ce889bbbb9965fcca141594a50a81c`. Evidence and limits are recorded in `开发/V1.0.15验证/验收记录.md`; browser and OBS were not retested.
