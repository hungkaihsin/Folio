# Folio 0.7.0

A local PDF editor for macOS and Windows, built with Electron, React, TypeScript, and MuPDF WebAssembly. No accounts, uploads, remote fonts, or PDF JavaScript execution.

## Run

Install Node.js 24 LTS or newer, then run:

```sh
npm ci
npm start
```

On macOS, double-click `Launch Folio.command` after installing dependencies. On Windows, use `Launch Folio.bat`. The source launchers need Node.js; packaged desktop apps do not.

Use **Open PDF** for your own file or **Explore with a sample document** to try real editing immediately.

## What changed in 0.7.0

- Select a Folio-added image or text box with **Select / move**, then use **−90° / +90°** in Object properties. Rotation changes actual PDF content, supports undo/redo, persists after save/reopen and keeps rotated text editable directly on the page. Near an edge, the object moves inward to fit; an object too large to rotate must be resized first. This release supports quarter turns.
- **Cmd/Ctrl+C** copies a selected Folio text/image object; **Cmd/Ctrl+V** or **Paste onto page** pastes it. Copies retain their PDF font resources, formatting, rotation and independent editability, including between documents. Copying a text object also supplies plain text to other apps; copying an image supplies a transparent PNG preview. Existing PDF text can still be selected/copied in Read mode.
- External clipboard text opens as an inline draft to review/apply; external PNG/JPEG image data becomes a movable image. Ordinary paste inside a text field remains text input. New content starts near the top-left of the current page with a small offset for repeated pastes. Move/resize it afterward. Pasting requires an editable, open document.
- Clipboard actions are explicit and local. Native IPC supports only validated text, PNG/JPEG and an isolated Folio object fragment. Limits: 40 MB, 100,000 text characters and 18-megapixel clipboard images. HTML, remote URLs and arbitrary clipboard formats are not imported. The isolated fragment contains the selected object and its font resources, excluding the rest of the source page.
- Mixed English/Chinese Folio text boxes preserve the families already used in that object when edited. This does not add paragraph reflow or mixed per-run formatting to arbitrary imported text.
- Standard installers: a universal macOS **.dmg** with an Applications link, and a Windows x64 **Setup.exe** wizard with uninstall support. Windows resource editing now applies Folio's icon/version while leaving code signing explicitly disabled. macOS requires 13 or later, consistent with the bundled Electron runtime.

## What changed in 0.6.0

- Refined the document workspace with a restrained blue-gray palette, clearer toolbar labels, separate review tools, stronger text contrast, simpler start screen and consistent side panels. Highlight and Comment remain labeled at the minimum 1000 × 680 window size; English and Traditional Chinese are supported.
- **Highlight** marks selected PDF characters without opening a comment editor, creating a written note or automatically quoting selected text into annotation contents. Highlights and drawings appear in **Markup**.
- **Comment** is a separate explicit action: choose Comment (or Add a comment), click the page, write a note and apply. The Comments panel then stays open to show the saved note. It lists native Text/FreeText notes only.
- Existing annotation text is preserved. Text attached to imported/older highlights stays available under **Existing annotation text** in Markup; the update does not delete it or turn it into a new written comment.
- Regression checks cover save/reopen, separated lists, correct removal after filtering, legacy annotation preservation and compact bilingual layout.

## What changed in 0.5.0

- Apply/Cancel stay visible in the inspector footer while font details scroll.
- Font matching is explicit. The side panel displays the detected original typeface and point size. Missing glyphs block Apply by default; import a matching full font, choose another font intentionally, or check **Allow substitute characters (appearance may differ)**. Matching the point size alone cannot reconstruct missing glyph outlines.
- Desktop builds look for an installed matching font in standard local font folders, comparing internal font metadata rather than filenames. Matching font faces augment original embedded subsets. This uses local files only; no fonts are downloaded or installed. Native font files and imported fonts retain the 40 MB limit.
- **Match nearby text** copies font, size and color from a clicked line on the current page while retaining the draft's position and baseline.
- Highlight now selects actual PDF characters, including partial and multiline selections, in either drag direction. Release to create one native highlight with the exact selected text quads. Read mode shares the same selection geometry, with Copy and **Highlight selected text** actions. Rectangle remains the separate area-markup tool. Scanned pages still require OCR.
- New tests cover the supplied JhengHei table cell, strict font matching, local font-name lookup, sampled formatting, Unicode copying and saved multiline/rotated-page highlight geometry.

## What changed in 0.4.0

- Click an existing line in **Edit text**, or double-click in Read mode, and type directly on the page. Added text also edits in place. Font, size, color, import, fitting and coverage controls live in the side panel; text editing no longer opens a dialog.
- **Enter** applies an existing-line edit; **Cmd/Ctrl+Enter** applies a multiline text object; **Escape** cancels. Use the side-panel Apply/Cancel buttons as alternatives. Chinese composition keystrokes do not trigger Apply.
- For supported embedded TrueType/OpenType programs, the typing preview uses the same glyph outlines as the PDF. Recover Unicode maps and normalize a temporary browser copy of subset fonts. Some embedded CFF/Type 1 programs cannot be previewed exactly; a visible notice says to inspect the PDF rendering after applying. This does not change the final PDF font-resolution rules.
- A clone of the page supplies the editing backdrop, preserving images/graphics without changing the live document, history or original file. Draft text and formatting changes participate in the close warning.
- Original-line color controls now affect the exported PDF. The app version is visible beside the Folio name to distinguish releases.

## What changed in 0.3.0

- Existing text preserves glyphs from embedded fonts even when their Unicode cmap is absent. Same-family subset fonts can supply missing glyphs without replacing the whole line. Per-character substitutions are shown before applying.
- Added a serif CJK fallback and local OTF/TTF/TTC font import (40 MB limit). Imported font names come from font metadata; saved text remains editable after reopening.
- Keep the original point size and baseline by default. **Fit to original line** is an explicit option with a size preview. Text beyond the page width is rejected with the draft retained.
- Fixed baseline drift after repeated edits, searchable Unicode output for unusual CID fonts, undo-branch font references, and nonuniform text stretching. Text corner resizing now keeps proportions.

## What changed in 0.2.0

- Added **Select / move** (M). Text, images, drawings, shapes, highlights and comments can be selected and dragged; a corner handle resizes them. Position/size fields and arrow-key nudging are available. Added text can be edited again by double-clicking it or choosing **Edit selected text**. Operations support undo/redo and persist after saving/reopening in Folio.
- Recoverable isolated text/image objects created by Folio 0.1 are upgraded to editable objects when opened, without changing their appearance. Arbitrary flattened graphics from other PDF producers are not automatically converted into objects.
- Existing text can be edited by double-clicking a line in Read mode. Validation errors keep the draft in the dialog.
- Added a persistent **Language / 語言** selector for English and Traditional Chinese. The interface and app-defined native menu labels switch; the PDF contents are not translated. English and Chinese input use the operating system keyboard/IME.
- Added **Export** (Cmd/Ctrl+Shift+E): PDF, PNG, JPEG and UTF-8 plain text, with all/current/range page selection. Multiple images are packaged as a ZIP. Image resolution choices are 72, 144 and 216 DPI, subject to the 18-megapixel render cap. All-page PDF export marks the document saved; partial/image/text export does not clear unsaved edits.
- Page-range PDF export creates a separate PDF from selected pages. Pages with interactive widgets require all-page PDF export or an image format. This avoids copying incomplete form field trees.

## Available tools

- Read PDFs with selectable text, page thumbnails, page navigation, fit-to-width, and zoom.
- Search text across the document and navigate matches.
- **Edit text**: click an existing horizontal text line and type directly on the page, then press Enter or Apply change. The original line's text is removed from the PDF content; replacement text remains searchable after saving.
- **Add text**: click a position and type English or Chinese directly on the page, with side-panel size/color settings. Long text wraps inside the page; text that cannot fit vertically is rejected.
- Add PNG/JPEG images, native character-aligned highlights, rectangles, freehand strokes, and comments. Select text in Read mode to copy it or highlight it, or drag in Highlight mode to mark it directly.
- Inspect and remove highlights/drawings in **Markup** and written notes in **Comments**. These lists describe the current page.
- Fill supported existing AcroForm text/choice fields and toggle checkboxes/radio buttons in the Forms panel.
- Rotate, duplicate, move, delete, and insert blank pages; append pages from another PDF.
- Undo/redo PDF edits, including after saving.
- Open password-protected PDFs with a password. Documents that prohibit editing remain read only.
- Save an edited PDF copy. Native saving prevents overwriting any source opened during the session, including symlink and hard-link aliases.

## Editing boundaries

This is an initial practical editor, **not feature parity with Adobe Acrobat**.

Existing text replacement is **line-based**, with no paragraph reflow. Folio reuses original/same-family embedded glyphs where available and substitutes only missing characters, with a preview. Serif text uses a serif fallback where possible. A subset font cannot supply every new character; import the full matching OTF/TTF/TTC font when needed. Matching cannot be guaranteed for every PDF. The desktop tries an installed matching font for missing characters. Importing a full matching font supplements the original subsets. The interface blocks missing-glyph substitution until explicitly allowed. Font size and baseline are retained by default; longer text may extend past the old line boundary and must be reviewed for nearby content. Enable **Fit to original line** to shrink to the old width (minimum 5 pt). Text beyond the page edge is rejected. Mixed font sizes, colors, tracking, and distinct styles within a line are still simplified to the first run's style. Arbitrary imported source lines must be horizontal to edit; rotate the page first if necessary. Folio-managed text boxes retain their own quarter-turn orientation during edits. Unusual encodings, vertical writing, ligatures and complex shaping require manual review.

Scanned image text needs OCR, which is not implemented. Add text can place content on scanned pages. Advanced OCR, certificate signatures, Word/Excel conversion, paragraph reflow, image-object editing, full editing of arbitrary imported graphics, and PDF/A validation are not included. No redaction tool is offered; text replacement uses targeted text removal internally, and is not a general privacy sanitization workflow.

Saving creates a normal PDF and does not preserve validity of existing cryptographic signatures. Some unusual documents, XFA forms, and encrypted documents may not be supported. Duplicating or merging pages with interactive form widgets is currently rejected to avoid losing their field relationships. Native comments and markup annotations on ordinary pages are copied; cross-page comment reply relationships are not copied. Editing very large or complex PDFs can consume significant memory. Native file selection/export is capped at 250 MB. Only the current page and visible thumbnails render; render resolution is capped at 18 megapixels.

## Desktop builds

```sh
npm run package:mac           # Universal macOS DMG (Apple Silicon + Intel)
npm run package:mac:app       # Apple Silicon app folder for development
npm run package:win           # Windows x64 NSIS Setup.exe installer
npm run package:win:zip       # Windows x64 app folder in release/v0.7.0/win-unpacked/
```

The universal Mac installer contains both arm64 and x86_64. Native verification on this host covers Apple Silicon; Intel execution remains untested. Windows ARM64 is not included.

The GitHub Actions workflow in `.github/workflows/build.yml` builds on macOS and Windows. It runs native app checks and a silent Windows install and uninstall test on a disposable runner. Run it manually from Actions or push a version tag. See [VERIFICATION.md](VERIFICATION.md) for the checks that have actually run.

Packaged builds are unsigned and not notarized. Public distribution needs code-signing certificates, signing/notarization configuration, and testing on target operating systems. Creating a Windows package on a Mac does not verify its Windows runtime.

## Development and verification

```sh
npm run build
npm test
npx playwright install chromium
npm run test:ui
npm run test:desktop           # requires an Electron runtime
npm run test:clipboard         # restores the system clipboard after testing
npm run test:package           # requires the packaged universal Mac app
npm run test:installer:mac     # verifies/mounts DMG and tests a copied app
npm audit
```

To use an existing Chrome installation for UI tests, set `FOLIO_CHROME` to its executable path. Tests reopen exported PDFs and check text replacement/removal, Unicode text, coordinates on cropped/rotated pages, native annotations, canonical form values, image insertion, page operations, history, real UI flows, and native source-file protection. Desktop/package tests run with isolated profiles and temporary working directories. Set `FOLIO_TEST_PDF` to the locally supplied regression document to include its private font-fidelity tests; it is never bundled or uploaded. Without that variable those fixture-specific tests are skipped.

## Architecture

`src/engine.ts` wraps MuPDF. `src/engine.worker.ts` owns the PDF in a worker, and `src/client.ts` queues requests after engine initialization. The renderer exposes document tools and never receives filesystem access. `electron/main.cjs` serves only bundled assets through `folio://app`, validates main-frame IPC, uses native dialogs, and performs atomic copy saves. `electron/preload.cjs` exposes the narrow bridge. Context isolation, renderer sandboxing, disabled Node integration, restrictive CSP, blocked navigation/popups, and denied permissions are enabled.

MuPDF's live undo journal is kept separate from export garbage collection: export cleans a temporary cloned document, preventing renumbering from damaging the live history. Dirty-state IDs remain unique across history branches.

## License

AGPL-3.0-or-later. MuPDF is dual licensed under AGPL/commercial terms. Closed-source distribution needs a licensing review and potentially a commercial MuPDF license. The bundled Noto Sans and Serif CJK TC fonts use SIL OFL 1.1. See `LICENSE`, `THIRD_PARTY_NOTICES.md`, `src/assets/OFL.txt`, and `src/assets/NotoSerif-OFL.txt`.

## Installer checks and open release items

For Mac, open the DMG and drag Folio into Applications. For Windows, run the Setup.exe wizard. Neither packaged app requires Node.js or project dependencies. Save work and quit Folio before replacing an installed copy; removing the application does not remove your PDFs. An older app window continues running its old version until quit. Check the visible version badge.

`tests/mac-installer.mjs` verifies the DMG, mounts it read-only, checks its Applications link/universal executable and tests a copied app in a temporary Applications folder. It does not overwrite `/Applications/Folio.app`. `tests/windows-installer.mjs` runs only on a disposable Windows host with `FOLIO_INSTALLER_TEST=1`; it installs the real NSIS artifact, runs both native workflows, and uninstalls it.

Packages are currently unsigned and the Mac app is not notarized. No valid Apple signing identity was present on the build host. The scripted Mac checks do not establish Gatekeeper acceptance of an internet-downloaded unsigned app. Windows install/runtime and Intel runtime require their target systems; cross-packaging does not establish success there.

The 2026-11-01 dependency audit reports moderate development/build-tool findings related to minimatch (GHSA-g3hv-75wg-m249) in electron-builder's dependency tree. Electron-builder 26.18.0 is the current registry release checked in this audit; npm's suggested downgrade to 20.23.1 is not applied. The application does not bundle these Node packaging dependencies, and its build uses repository-controlled glob patterns. The build-tool advisory remains open pending a compatible upstream update. See VERIFICATION.md for current evidence and FEATURE_REVIEW.md for prioritized product gaps.

The root postinstall step explicitly runs Electron 45's `install-electron` command. A clean npm install of the Electron package alone did not create its runtime on this host; this project-level step prevents `npm start`/native tests failing with a missing executable after `npm ci`. Packaged installers remain independent of npm.
