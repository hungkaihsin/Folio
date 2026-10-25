# Folio PDF Editor

Read HANDOFF.md before changing this project. Use npm ci, npm run build, npm test, and npm run test:ui. Keep PDF processing local. Preserve source PDFs: saving writes a user-chosen copy, and never silently overwrites an imported source. Use sandboxed Electron, context isolation, a restrictive CSP, and narrow validated IPC. Do not execute PDF JavaScript or follow PDF links automatically.

MuPDF is AGPL-3.0-or-later/commercial dual licensed; this project uses the AGPL option. Keep license notices. Do not describe line replacement as automatic paragraph reflow, OCR, or exact font matching. Never claim Windows runtime verification from a Mac build.
