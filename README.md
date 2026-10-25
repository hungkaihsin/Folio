# Folio

A local PDF editor for macOS and Windows, built with Electron, React, TypeScript, and MuPDF WebAssembly. No accounts, uploads, remote fonts, or PDF JavaScript execution.

## Run

Install Node.js 24 LTS or newer, then run:

```sh
npm ci
npm start
```

On macOS, double-click `Launch Folio.command` after installing dependencies. On Windows, use `Launch Folio.bat`. The source launchers need Node.js; packaged desktop apps do not.

Use **Open PDF** for your own file or **Explore with a sample document** to try real editing immediately.

## Available tools

- Read PDFs with selectable text, page thumbnails, page navigation, fit-to-width, and zoom.
- Search text across the document and navigate matches.
- **Edit text**: click an existing horizontal text line, enter replacement text, and apply. The original line's text is removed from the PDF content; replacement text remains searchable after saving.
- **Add text**: place English or Chinese text with size/color settings. Long text wraps inside the page; text that cannot fit vertically is rejected.
- Add PNG/JPEG images, native highlights, rectangles, freehand strokes, and comments.
- Inspect and remove native page annotations in the Comments panel.
- Fill supported existing AcroForm text/choice fields and toggle checkboxes/radio buttons in the Forms panel.
- Rotate, duplicate, move, delete, and insert blank pages; append pages from another PDF.
- Undo/redo PDF edits, including after saving.
- Open password-protected PDFs with a password. Documents that prohibit editing remain read only.
- Save an edited PDF copy. Native saving prevents overwriting any source opened during the session, including symlink and hard-link aliases.

## Editing boundaries

This is an initial practical editor, **not feature parity with Adobe Acrobat**.

Existing text replacement is **line-based**, with no paragraph reflow. The original line's font is reused when it contains all required glyphs; otherwise Folio substitutes Helvetica or the bundled Noto Sans CJK TC font. Longer text shrinks to the original line width (minimum 5 pt); excessive replacements are rejected. Mixed formatting within a line is simplified to the first run's style. Only horizontal text is currently editable; rotate a page to make its text horizontal first. Some unusual font encodings/layouts will require manual review.

Scanned image text needs OCR, which is not implemented. Add text can place content on scanned pages. Advanced OCR, certificate signatures, Word/Excel conversion, paragraph reflow, image-object editing, arbitrary annotation repositioning, and PDF/A validation are not included. No redaction tool is offered; text replacement uses targeted text removal internally, and is not a general privacy sanitization workflow.

Saving creates a normal PDF and does not preserve validity of existing cryptographic signatures. Some unusual documents, XFA forms, and encrypted documents may not be supported. Duplicating or merging pages with interactive form widgets is currently rejected to avoid losing their field relationships. Native comments and markup annotations on ordinary pages are copied; cross-page comment reply relationships are not copied. Editing very large or complex PDFs can consume significant memory. Native file selection/export is capped at 250 MB. Only the current page and visible thumbnails render; render resolution is capped at 18 megapixels.

## Desktop builds

```sh
npm run package:mac           # Apple Silicon .app in release/mac-arm64/
npm run package:win           # Windows x64 NSIS installer (prefer a Windows host)
npm run package:win:zip       # Windows x64 app folder in release/win-unpacked/
```

For Intel Macs: `npm run build && npx electron-builder --mac dir --x64` on a Mac. Intel and Windows ARM64 builds have not been tested.

A GitHub Actions workflow in `.github/workflows/build.yml` builds on macOS and Windows. It is configured but has not been dispatched or published. No GitHub repository or release is created automatically.

Packaged builds are unsigned and not notarized. Public distribution needs code-signing certificates, signing/notarization configuration, and testing on target operating systems. Creating a Windows package on a Mac does not verify its Windows runtime.

## Development and verification

```sh
npm run build
npm test
npx playwright install chromium
npm run test:ui
npm run test:desktop           # requires an Electron runtime
npm run test:package           # requires the packaged Apple Silicon app
npm audit
```

To use an existing Chrome installation for UI tests, set `FOLIO_CHROME` to its executable path. Tests reopen exported PDFs and check text replacement/removal, Unicode text, coordinates on cropped/rotated pages, native annotations, canonical form values, image insertion, page operations, history, real UI flows, and native source-file protection. Desktop/package tests run with isolated profiles and temporary working directories.

## Architecture

`src/engine.ts` wraps MuPDF. `src/engine.worker.ts` owns the PDF in a worker, and `src/client.ts` queues requests after engine initialization. The renderer exposes document tools and never receives filesystem access. `electron/main.cjs` serves only bundled assets through `folio://app`, validates main-frame IPC, uses native dialogs, and performs atomic copy saves. `electron/preload.cjs` exposes the narrow bridge. Context isolation, renderer sandboxing, disabled Node integration, restrictive CSP, blocked navigation/popups, and denied permissions are enabled.

MuPDF's live undo journal is kept separate from export garbage collection: export cleans a temporary cloned document, preventing renumbering from damaging the live history. Dirty-state IDs remain unique across history branches.

## License

AGPL-3.0-or-later. MuPDF is dual licensed under AGPL/commercial terms. Closed-source distribution needs a licensing review and potentially a commercial MuPDF license. The bundled Noto font uses SIL OFL 1.1. See `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `src/assets/OFL.txt`.
