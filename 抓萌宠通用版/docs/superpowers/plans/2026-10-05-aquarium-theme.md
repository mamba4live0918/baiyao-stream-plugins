# Aquarium Theme Implementation Plan

> **For agentic workers:** Execute the authorized implementation in this session; independent raster asset batches are delegated, runtime integration is owned by the root agent.

**Goal:** Add the approved Q-version aquarium theme, twelve animated members and glass collection pod to the standalone pet-catching plugin.

**Architecture:** Append built-in members without changing existing IDs. Theme selection restores each theme's category/nest choices; aquatic motion shares existing population, collection, boundaries, audio and storage paths.

**Tech Stack:** Existing standalone HTML/CSS/JavaScript, native ImageGen, Sharp for deterministic atlas assembly, Node tests, existing ReportLab/PIL release checks.

**Spec:** `开发/水族馆主题-2026-10-04/Q版动效设计方案.txt` and approved Q-version eye-corrected reference.

## Global Constraints

- Preserve the existing 80 member IDs, custom IDs starting at 100, progress and uploaded assets.
- Append aquarium members at IDs 80–91; one new pod is appended after six nests.
- Keep HTML/body transparent and all final resources embedded.
- All aquarium members have twelve distinct transparent poses and species-specific cycle timing.
- Jellyfish has small round dot eyes; swimming changes fins/tails/tentacles rather than rotating the whole picture.
- Keep visible range editing, menu-only test toolbar, independent audio volume and reduced-motion behavior.
- Earlier browser file-access rejection remains binding; do not bypass with an alternate browser or local-server route.

## Review Focus

- Old saved categories/nests and custom member 100 must retain their identity.
- Switching theme cannot change population or rewrite collected history.
- Imported media wins over built-ins; rejected/failed storage must keep prior records.
- New aquatic pets must not use terrestrial gravity or hopping on entry/release.
- Frame extraction must not clip tails/tentacles, shift the head anchor or add opaque backgrounds.

## Tasks

### Latest User Additions
- [x] Append white lion, white lop rabbit and purple octopus at IDs 92–94; preserve the blue octopus and extend Xiaoyao to 17 native members.
- [x] Support uploaded species in each category, editable category assignment, and remove the fixed personal-species cap and gallery pagination.
- [x] Recall visible members and the additional requested waiting members, preserve actual quantities/kinds, and reject counter underflow.
- [x] Include these additions in the same V1.0.11 delivery and final manual/ZIP checks.

### 1. Formal Raster Assets
- [x] Generate one twelve-pose atlas per approved member in disjoint worker batches.
- [x] Generate a standalone transparent glass collection pod.
- [x] Mechanically assemble horizontal twelve-frame strips and static posters; inspect small-scale and loop previews.
- [x] Append aquarium manifest entries; verify IDs, dimensions, alpha and distinct frames.

### 2. Theme And Swimming Runtime
- [x] Add theme selection, remembered category/nest/cast choices and localized aquatic HUD styling.
- [x] Add swimming motion with per-species cycle timing, stable body orientation and pause/reduced-motion behavior.
- [x] Route entry, drag release, return and population restoration through existing collection and boundary paths.
- [x] Test migration, switching, uploads, new motion and count invariants.

### 3. Release Verification
- [x] Run targeted and full regression tests after integration.
- [x] Update V1.0.11 TXT/PDF documentation and visually inspect rendered pages.
- [x] Build release and preview HTML, verify embedded new assets, package and verify actual ZIP bytes.
- [x] Report verified results and remaining browser/OBS verification limits.

Verified: 206 Node regression tests passed; all 95 twelve-frame assets, old IDs and bytes, 10-page PDF rendering, and actual V1.0.11 ZIP contents checked. Browser/OBS verification was not performed because the earlier file-access restriction remains in force.
