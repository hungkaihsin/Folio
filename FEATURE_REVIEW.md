# Pageline 0.8.0 progress — 2026-11-25

Pageline is the new product name paired with Cutline. This release adds normal printing, page ranges, booklet/saddle-stitch imposition, print-ready PDF export, an installer-based update checker and optional desktop shortcuts. The release feed needs accessible published releases; signing/notarization and Windows runtime validation remain release work. Bookmarks, tabs, crash recovery, OCR, paragraph reflow and editing arbitrary imported images remain product gaps. The older review below records the 0.7.0 assessment; its printing gap has now been addressed.

# Folio feature review — 2026-11-01

Folio 0.7.0 has a useful everyday editing core, but it is not yet a full Adobe Acrobat replacement. This review compares the live source and verified workflows with Adobe's documented capabilities. The priorities below are product recommendations, not features already implemented.

## Delivered in this update

- Rotate Folio-added images and text boxes independently in either direction, in 90° steps. Move, proportional resize, undo/redo, save/reopen and continued text editing are supported.
- Copy/paste selected Folio text/image objects with their fonts, formatting and rotation preserved; copies have independent IDs. Plain text and image clipboard formats work with other applications. Pasted external text opens inline for review; external PNG/JPEG image data becomes a movable image.
- A standard universal Mac DMG and Windows x64 Setup.exe installer. Mac source-runtime setup is explicit; Windows icon/version resource editing is enabled. Target-system verification and signing limitations are described in the installation report.

These controls apply to Folio-managed objects, including supported objects recovered from older Folio versions. Arbitrary images/graphics flattened into an imported PDF are still not automatically selectable objects. Scanned text still needs OCR. An imported horizontal text line can be replaced, but this remains a line edit.

## Recommended order

| Priority | Area | Current gap | Useful next result |
| --- | --- | --- | --- |
| 1 | Recovery and release reliability | No crash recovery; Windows/Intel execution and public signing are outstanding | Recover unsaved work after a crash; signed/notarized Mac releases; signed Windows installer; real install/upgrade/uninstall tests on target systems |
| 2 | Text editing and font fidelity | Line editing simplifies mixed styles and has no paragraph/table-aware reflow | Preserve styles within a paragraph, expose overflow before applying, keep table cells within bounds, handle CJK punctuation/IME carefully |
| 3 | Existing-image editing | New Folio images can move/resize/rotate; arbitrary imported images cannot | Select an existing image, replace/crop/flip it, adjust stacking, and rotate by a custom angle |
| 4 | Local OCR | Image-only scans have no selectable/editable text | English/Traditional Chinese recognition, rotation/deskew, searchable output and a correction/review step |
| 5 | Reader and page workflow | No polished print workflow, bookmarks or document tabs; page reordering uses buttons | Print preview/page ranges, bookmark navigation, drag page reordering, multi-document tabs and keyboard-accessible controls |
| 6 | Forms and signatures | Existing AcroForm filling is supported; field creation and signatures are absent | Create fields, tab order and validation; add a drawn signature/stamp. Treat certificate-backed digital signing as a separate feature |
| 7 | Permanent redaction and protection | No dedicated sanitization workflow or new password-protection controls | Apply irreversible redaction to text/images and verify removed content cannot be extracted; inspect/remove hidden data; password/encryption controls |
| 8 | Conversion and document review | PDF/PNG/JPEG/TXT exports exist; Office conversion and document comparison do not | Quality-controlled compression, Word/Excel conversion with fidelity previews, side-by-side comparison and change summaries |
| Later | Accessibility and collaboration | Limited screen-reader/document-tagging support; no shared review service | Better keyboard/focus behavior, reading order/tags, comment replies/resolution and optional collaboration with explicit privacy choices |

My recommendation is to finish recovery, release reliability and dependable text/image editing before adding AI features. Folio can offer a focused local document workflow while the more complex OCR, conversion, security and collaboration features are developed separately.

## Evidence and limits

Adobe documents text/image editing, OCR for scans and object manipulation in its [PDF editing guide](https://helpx.adobe.com/acrobat/using/edit-pdf.html), and describes image transformations in its [image editing guide](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-images-or-objects/modify-image.html). Its [content reuse guide](https://helpx.adobe.com/uk/acrobat/using/reusing-pdf-content.html) covers copying text/images. The [Acrobat plan comparison](https://www.adobe.com/acrobat/pricing/compare-versions.html) provides the wider forms, signing, conversion and review context. Features vary by plan; this is a workflow comparison, not a claim that all features belong to every Adobe plan.

Folio's existing font-subset limitation is unchanged: matching the detected size does not provide glyphs missing from the embedded font. A matching full font may still be required. The new multi-family preservation applies to managed Folio text boxes and does not establish perfect mixed-run formatting for every imported PDF.
