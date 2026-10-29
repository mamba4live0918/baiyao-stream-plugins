# Yajiji Theme Implementation Plan

**Goal:** Add a transparent all-Yajiji theme using the eight uploaded forms, iridescent materials and twelve articulated poses per form.

**Authorized Brief:** User supplied eight character images and requested online appearance research, a new Yajiji-only theme, colorful iridescence and frame animation.

## Interfaces And Compatibility

- Native entries 0–94 keep their existing kinds, settings, uploads, metadata and resource bytes.
- Eight appended assets receive explicit stable kinds 2000000–2000007, leaving personal kinds 100–999999 and avatar kinds 1000000–1999999 untouched.
- A kind/index catalog maps logical kinds to native asset/settings indices. Manifest array position must no longer be used as a new character's logical kind.
- The Yajiji theme defaults to its own eight-member pool and new collecting nest. Existing non-Yajiji and avatar residents use a reversible display skin; logical kind, counts and history stay unchanged.
- Personal species assigned to the Yajiji category remain usable, and the theme keeps at least one eligible duck display choice.
- Frames preserve the supplied bill, brow/eyes, body shape, ears/hat/slippers and limb counts. Waddling webbed feet, wing motion and accessory lag supply actual pose changes; no whole-image spinning.
- Iridescence is localized to characters/HUD/nest, with transparent HTML/body and hidden test controls outside the menu.
- Earlier browser file-access refusal remains binding; do not bypass it through another browser, server or URL route.

## Tasks

- [x] Build the stable kind catalog and update core persistence/avatar boundaries with migration tests.
- [x] Generate eight transparent twelve-pose atlases from the user's separate references and one themed nest.
- [x] Mechanically register frames, add transparent padding, pack strips, and inspect the animation loops.
- [x] Integrate catalog lookup, theme selection, reversible all-duck display, gallery/uploads and themed local styling.
- [x] Verify old custom kind100 and highest-avatar records never collide with new native kinds, including recall/history/refresh.
- [x] Update V1.0.13 TXT/PDF, build standalone HTML, and verify actual ZIP resources and bytes.

## Verification

- 243 Node tests pass, including the actual theme-change callback, old/custom/avatar/native identity, waiting recall and twelve distinct transparent poses per member.
- Independent review found a settled-flight/return-ghost theme-switch residue; a red/green callback regression covers the repair, including unchanged counts/history and no duplicate cleanup.
- Main and preview HTML match: 136730710 bytes, SHA-256 `bbe362136cbbd1307ec373ebebebf965768f690efeb62476bf044a577345199e`; all 19 embedded scripts parse without unresolved placeholders.
- Packaging validates actual ZIP member bytes against the final HTML/PDF/TXT. Both archives pass integrity checks. The full archive's older V1.0 video is explicitly labelled as a historical demonstration in the manual.
- All eight twelve-frame contacts and the nest/hit silhouettes were inspected offline. The eleven-page PDF was rendered and reviewed, including the updated upgrade page.
- No browser/OBS retest, no alternate browser/server/CDP access workaround. Offline raster and VM checks are not browser playback evidence.

## Visual References

- Primary: `开发/鸭吉吉主题-2026-10-06/references/ref-1.png` through `ref-8.png`.
- Online supporting reference: https://www.bilibili.com/video/BV1zhTy6LEnX/ (publisher: 洛克王国世界; use only as appearance context, no video redistribution).
- Variant labels are project display names, not claims of official skin names.
