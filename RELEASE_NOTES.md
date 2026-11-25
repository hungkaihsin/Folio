# Pageline 0.8.0

Pageline is the new name for Folio, paired with Cutline. This release adds printing, booklet layouts, installer-based updates and optional desktop shortcuts while keeping Folio preferences and existing PDF objects compatible.

## Downloads

- **macOS 13+ (Apple Silicon and Intel):** `Pageline-0.8.0-macOS-Universal.dmg`. Save work and quit Folio/Pageline, open the DMG and run **Pageline Installer**. Choose the Applications folder containing your old installation and whether to create a desktop shortcut. Drag-to-Applications is also available for a basic install.
- **Windows x64:** `Pageline-0.8.0-Windows-x64-Setup.exe`. Save work and close Folio/Pageline, then run the setup wizard. It offers a desktop-shortcut checkbox and retains the existing installer identity for upgrades.
- Verify the installers with `Pageline-0.8.0-SHA256SUMS.txt`. The published bytes match the locally verified packages.

**Unsigned evaluation builds:** neither installer is code signed; the Mac app is not notarized. Intel Mac execution, legacy Folio-to-Pageline upgrades on Windows and the interactive Windows shortcut-checkbox UI still need verification. This is an early release, not a claim of full Adobe Acrobat parity. See the post-publication CI results below for Windows install/runtime coverage.

## Changes

- Renamed the app **Pageline** while retaining Folio compatibility identifiers and the existing preferences folder.
- Normal printing with page ranges, A4/A3/Letter paper, orientation, margins, copies, duplex settings and reverse order. Use the printer button or **Cmd/Ctrl+P**.
- **Booklet / saddle stitch (小冊子／騎馬釘)** with left/right binding, blank-page padding, page-order previews and separate front/back passes for manual duplex. Test one sheet before printing a full booklet. Stapling needs a finisher or manual stapling.
- **Save print PDF** keeps vector content and searchable text. Native printing renders sheets at up to 300 dpi, capped at 18 megapixels per side and 160 MB per job.
- **Help > Check for updates** or the version badge checks this public release feed and opens the matching installer for a newer version. Save work, quit the app and run the downloaded installer. It does not silently install updates. Version 0.8.0 reports current while it is the latest published version. Older Folio builds can install this release directly.
- Mac installer helper handles identified Folio/Pageline upgrades and optional desktop shortcuts. Windows installer includes the shortcut choice and keeps the legacy installer identity.

## Verification

- **51 engine/service tests and 23 production UI tests passed**, including local, private font-regression tests. No private PDF was uploaded or bundled.
- The final DMG passed integrity checks, read-only mounting, universal app/helper architecture checks, temporary legacy-app upgrade and shortcut on/off/reinstall/conflict/downgrade tests. The installed copy passed editing/export/source protection, clipboard/rotation and native print/update-dialog workflows on Apple Silicon.
- Print tests captured Chromium PDF output and checked page count, landscape geometry, fonts and booklet order. **No physical print job was sent**; printer duplex/reinsertion/stapling remain unverified.
- Windows static checks passed: NSIS and inner archive integrity, x64 app, version/icon resources, extracted payload hashes, source/production asset correspondence and bundled AGPL/OFL notices. **Windows installation/runtime were not tested on this Mac.**
- Build-tool dependency advisories remain open. Signing, notarization, OCR, paragraph reflow, crash recovery and arbitrary imported-image editing remain future work.

The installers were built before publication; their bundled README/QA snapshot may describe the update feed as private or pending. This release page and the repository README give the current public distribution status. The app's update endpoint is unchanged and uses this repository's published releases.

AGPL-3.0-or-later; MuPDF and bundled fonts retain their license notices. Corresponding source is available at this release's `v0.8.0` tag. Documents are processed locally; optional update checks contact GitHub for release metadata.

## Post-publication verification

[Mac and Windows CI passed](https://github.com/hungkaihsin/Folio/actions/runs/45631508365) on 2026-11-25. Each runner passed 49 engine/service tests and 20 UI tests; two engine and three UI tests requiring the private local PDF were skipped. The earlier local run included those private tests. Both runners passed native editing/export, clipboard/rotation and print/update-dialog checks. Mac completed the DMG/native-helper installation checks. Windows completed NSIS archive validation, silent fresh install, desktop-shortcut target validation, same-version reinstall, installed-app workflows and uninstall. The private regression PDF stayed local.

CI built and executed its own installer artifacts from the same application code, with follow-up CI/test-tooling fixes. These are separate artifacts from the published installers. The published installers retained their verified bytes and passed full anonymous download/checksum verification; the published Mac DMG also passed local installed-app checks. The exact published Windows installer still has static/hash verification rather than a recorded Windows execution. Signing/notarization and physical-printer testing remain open.

The public repository, tagged source, latest-release API, both complete installer downloads and checksum file were verified without authentication. The live updater selects the correct platform installer for an older version, reports current for 0.8.0, and the actual packaged Mac app reports current against the public feed.
