# Folio handoff

Project: `/Users/danielhung/Desktop/02. Projects/PDF_Editor`

Daniel requested both a balanced everyday PDF editor and editing existing text, with macOS and Windows versions. The first release is Folio 0.1.0. Keep text editing honest: it removes/replaces one horizontal text line, preserves/substitutes fonts when possible, and shrinks longer replacements. It does not reflow full paragraphs or perform OCR.

Read README.md for commands, features, limits, security, licensing, and test details. Do not run /init. Keep documents local and source files protected. Keep AGPL/OFL notices. Do not add cloud services or silently overwrite originals.

Stack: Electron / React / TypeScript / Vite / MuPDF WASM / Phosphor icons. Native main/preload files are CommonJS; UI/engine are ESM. Node 24 LTS recommended.

Important fixes already made:
- Worker initialization has an explicit ready handshake; early open requests must not be dropped while MuPDF initializes.
- Garbage collection must run on an export clone; garbage=4 on the live document corrupts its journal through object renumbering.
- Use unique state IDs across undo-history branches to avoid false clean states.
- Copy every overlay PDF resource into the destination document, including BBox as plain coordinates.
- Overlay transform maps through the overlay and target page transforms; rotated/cropped pages are tested.
- Text replacement applies only its own temporary redaction, never a user's pending redactions elsewhere.
- Custom protocol serves bytes with explicit MIME types. Using net.fetch(file://) conflicts with the outbound request block.
- Duplicate pages are grafted from a snapshot so edits never mutate their sibling. Annotations are copied explicitly; pages with form widgets are rejected for duplication/merge to avoid broken field trees.
- Native save checks canonical paths and inode aliases against all selected sources.

Future priorities: broader real-world PDF corpus, robust multi-run/paragraph editing with layout/overflow previews, move/resize added objects, OCR, file associations, improved accessibility/contrast and keyboard navigation, Windows native smoke tests, Intel packaging, signing and notarization. The CI workflow is configured but has not been run remotely.

See VERIFICATION.md for the final checks actually run in the initial build session. Do not infer Windows runtime success from cross-packaging.
