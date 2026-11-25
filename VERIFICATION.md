# Initial build verification

Date: 2026-10-25 (Asia/Taipei). Host: Apple Silicon Mac. Version: Folio 0.1.0, Electron 45.0.0.

Passed:

- TypeScript check and Vite production build (`npm run build`).
- 14 engine tests (`npm test`): saving/reopening, real text replacement and removal, neighboring content preservation, Chinese text, search, cropped/rotated coordinates, native annotations, image insertion, canonical AcroForm text and checkbox values, wrapping/overflow rejection, page operations, undo/redo, dirty-state history branching, independent page duplication and copied annotations.
- 2 production-browser UI tests: sample and imported PDFs, editing, Unicode insertion, comments, search/highlights, duplicate pages, exported content, and unsaved-change guard. Ran with installed Google Chrome via FOLIO_CHROME against Vite's production preview (no development hot reload).
- Native Electron 45 desktop workflow (`npm run test:desktop`): renderer sandbox/context isolation, disabled Node integration, editing, native save/reopen, original-path protection, and hard-link protection.
- Packaged Mac app workflow (`npm run test:package`) from an isolated temporary working directory and user-data profile. Exercises actual worker/font/WASM loading and native editing/save behavior without depending on project source or node_modules.
- Independently obtained W3C dummy PDF: extracted Arial text, replaced it, saved/reopened, and checked replacement was present while original text was absent. Fixture source: https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf .
- Full dependency audit: zero reported vulnerabilities at verification time (`npm audit`).
- Electron runtime archives for macOS arm64 and Windows x64 verified against the official Electron npm package's SHA-256 manifest.
- Mac and Windows cross-packaging completed using those verified runtime archives.

Limits:

- Windows has been packaged on macOS; it has not been launched or tested on a Windows host.
- Intel Mac and Windows ARM64 packages were not built/tested.
- Packages are unsigned and the Mac app is not notarized.
- The initial build configured GitHub Actions and was verified locally.
- This is an initial editor with the explicit limitations in README.md, including line-based text editing and no OCR/paragraph reflow. PDF fixtures cannot establish compatibility with every real-world document.

Deliverable checks:

- Both final ZIP archives passed `unzip -tq`.
- Windows executable identified as PE32+ x86-64.
- Eight bundled production UI/engine/WASM/font assets compared byte for byte between Mac and Windows packages and matched.
- The initial local delivery included both archives, a quick-start guide and SHA-256 checksums.

# Folio 0.2.0 verification — 2026-10-26

- `npm test`: 20 passing engine tests. Added tests cover persisted movable/editable text, image/shape/ink/comment transforms, rotated page transforms, independent duplicate/merge objects, actual text-coordinate changes, PNG/JPEG/TXT/page-range PDF/image ZIP exports, and recovery of Folio 0.1 objects without pixel changes.
- `npm run test:ui` with the installed Chrome executable: 6 passing production-browser tests. Includes drag/resize, editing an added text object to Chinese, export download verification, persisted English/Traditional Chinese UI selection, read-mode double-click editing, and retaining drafts after a rejected edit.
- `npm run test:desktop`: native Electron 45.0.0 workflow passed, including exported PNG/JPEG/TXT/PDF files, movement, native menus in Traditional Chinese, source-path/hard-link protection, and sandbox/isolation settings.
- `npm run test:package`: the actual 0.2.0 Mac app passed the same workflow from an isolated working directory/profile.
- Mac and Windows packages report app version 0.2.0; eight production UI/engine/font/WASM assets match byte for byte.
- A generated multi-page PNG ZIP with Unicode filenames passed `unzip -tq`.
- `npm audit`: zero reported vulnerabilities. `git diff --check`: clean.
- Windows is cross-packaged and remains untested on a Windows host. Packages remain unsigned; the Mac app is not notarized.

New release folder: `release/v0.2.0/`. Older packages were preserved. Text replacement of arbitrary existing PDF content remains line-based, and scanned image text still needs OCR. Object recovery is restricted to recognizable Folio 0.1 isolated content streams; arbitrary imported flattened graphics are not automatically converted.

# Folio 0.3.0 verification — 2026-10-26

- Production TypeScript/Vite build passed.
- 28 engine tests passed, including the opt-in private document fixture. New regressions cover missing Unicode cmaps, per-character serif fallback, imported font persistence, exact baseline/point-size preservation, text resizing, undo branches and explicit fitting.
- 8 production-browser UI tests passed with installed Chrome. After the final feedback/help-text adjustment, both font UI tests were repeated and passed.
- Native Electron desktop workflow passed, including the actual private PDF, save/reopen, native exports, sandbox/isolation and source-path/hard-link protection.
- The actual 0.3.0 Mac app passed the same workflow from an isolated temporary working directory/profile. This included opening the supplied six-page document, appending digits on page 2, saving a temporary copy, and checking PMingLiU at 12 pt in the exported PDF.
- Original source bytes were compared before/after the native workflows and unchanged. Source SHA-256: 3fe01e77f80d4fb912bcc93ead75221f77f57e407fdcc9ead80fb6550394738f.
- Visually inspected original/0.2.0/0.3.0 renders of the same page crop. The 0.3.0 line retains the serif appearance; engine checks also establish the original baseline, font family, size, searchability and neighboring-content preservation.
- Mac and Windows packages report app version 0.3.0. All eight production asset files match the final build byte for byte; both font-license notices are present.
- Windows executable is PE32+ x86-64. It remains cross-packaged and has not been run on Windows. Packages remain unsigned; the Mac app is not notarized.
- `npm audit`: zero reported vulnerabilities. `git diff --check`: clean.

Remaining boundaries: line editing simplifies mixed styles; no paragraph reflow, OCR, crash recovery, general imported-image editing or redaction workflow. Font coverage depends on embedded subsets or an imported full font. Per-character substitutions are visible before applying. No universal compatibility, performance or security-fuzzing claim is made from these tests.

0.3.0 deliverables: both final ZIP archives passed `unzip -tq`. Versioned SHA-256 sums, the local before/after comparison PNG and the QA/roadmap report accompany the ZIPs in the task outputs folder. The existing 0.2.0 app process was left running to preserve the user's work.

# Folio 0.4.0 verification — 2026-10-27

- Production TypeScript/Vite build passed. Final production build was used for all packaging.
- 31 engine tests passed, including three new checks for browser-font preview coverage/cache stability, nonmutating text-backdrop rendering, and persisted original-line color changes. Private fixture enabled through FOLIO_TEST_PDF.
- 11 production-browser UI tests passed. New tests exercise text editing directly inside the PDF sheet without a modal, Escape cancellation, retained drafts, Enter/Ctrl+Enter application, simulated composition Enter protection and exported color. Actual OS IME typing has not been manually exercised.
- The exact screenshot passage beginning with 研發並編寫 on page 2 was edited using real embedded PMingLiU browser glyphs. Browser canvas advance measurement matches the PDF engine's measured width; the exported/reopened line remains PMingLiU at 12 pt and the original baseline. The screenshot artifact shows the live input and side panel. This remains line editing, not paragraph reflow.
- Native Electron workflow and actual 0.4.0 packaged Mac workflow passed in temporary profiles/working directories. The private document check verifies that the on-page font loads as a FontFace under the real application CSP, no text-editing dialog appears, exports remain searchable and source bytes are unchanged. Native PDF/PNG/JPEG/TXT exports, source/hard-link protection, language switching and renderer isolation were also exercised.
- Mac and Windows bundles report version 0.4.0; eight production assets match the final build byte for byte. Both font-license notices are present. Windows executable is PE32+ x86-64; Windows runtime remains untested.
- npm audit reported zero vulnerabilities. git diff --check passed.
- The user's older 0.2.0 process was observed still running and was left intact. The new 0.4.0 bundle was launched separately with a dedicated preview profile. The visible version badge distinguishes the windows.

Preview limits: repaired SFNT TrueType/OpenType subset programs can be used directly by the browser. Raw embedded CFF/Type 1 programs and fonts rejected by browser validation use an explicitly warned approximate typing preview; final PDF rendering still uses the PDF font resolver. Mixed per-run styles, original tracking/kerning, vertical writing and complex script shaping remain outside exact-match claims. Font preview caches are scoped to the document and full-font bytes are reused across keystrokes.

0.4.0 handoff: both final ZIP archives passed unzip integrity checks; SHA-256 sums accompany them. A manual native UI check opened the original PDF in the separate 0.4.0 app, selected page 2 and entered direct editing on the exact screenshot passage. The visible panel reports PMingLiU, 12.00 pt and Original font preserved, with no text-editing dialog. No text was changed in that handoff window; it is left ready for the user to type.

# Folio 0.5.0 verification — 2026-10-28

- Production TypeScript/Vite build passed. No new package dependency was added.
- 38 engine tests passed with the private fixture enabled. New tests cover forward/reverse multiline selection, rotated-page highlights, saved native quads/contents, rejected-edit rollback, sampled font/size/baseline, internal font-name lookup, platform font roots, the actual JhengHei cell and a matching full imported font supplying previously unavailable glyphs.
- 15 production browser tests passed. After a final pointer-request guard, all four font/selection tests were repeated and passed. Tests cover Read selection/copy, a single multiline native highlight, partial text highlighting, undo, nearby-style sampling, missing-glyph approval and deliberate font changes.
- Native Mac workflow passed with local font lookup IPC, validation of an invalid request, the private table cell, explicit fallback approval, cancellation and a saved character-aligned highlight. Existing sandbox/isolation, save/reopen, original/hard-link protection, exports and locale checks also passed. The original private PDF was compared before/after and unchanged.
- The source cell is declared as DSPZCC+MicrosoftJhengHeiRegular, 12 pt. Its Chinese program and Latin sibling do not provide 測 and 試. These previously fell back to Noto Sans CJK TC. A read-only scan of standard Mac and Office font locations found no matching full font on this host. No proprietary full font was downloaded, installed or bundled.
- Poppler independently rendered the table cell after a strict rejected edit and after a native selection highlight. Visual inspection confirms the source text is retained after rejection and the highlight follows the text line while preserving table borders/backgrounds.
- npm audit: zero reported vulnerabilities. git diff --check: clean.

The update improves matching/approval rather than inventing unavailable glyphs. The full original font is still required for an exact typeface match where embedded subsets lack new characters. Table-cell-aware overflow, mixed-run formatting, paragraph reflow, OCR, crash recovery, actual OS IME testing and Windows runtime verification remain outstanding.

The font panel review also identified actions below the scroll area on shorter windows. Apply/Cancel now live in the inspector's fixed footer; the missing-font explanation is shorter and the detailed report remains scrollable. The nine font/inline UI tests were repeated after this final layout adjustment.

0.5.0 final package: the final Mac bundle passed the native workflow again after moving the substitution choice and Apply/Cancel into the fixed footer. All 15 UI tests passed after the action-footer change, and the four font/selection tests passed after the final checkbox placement. Both packages report 0.5.0; all eight assets match the final build and both font notices plus electron/font-catalog.cjs are bundled. Private tmp/work folders are excluded. Packages remain unsigned and Windows runtime remains untested.

A separate 0.5.0 preview profile was launched without closing older windows. The final manual CUA handoff could not inspect/open the live document because the Mac was locked. No attempt was made to bypass the lock; packaged automated checks had already passed. Full JhengHei font availability remains the user-dependent condition for exact new glyphs in the private cell.

Both final 0.5.0 ZIPs passed unzip integrity checks. Versioned checksums, font/selection screenshots and Font-and-Highlight-Notes accompany the application ZIPs in the task outputs folder.

# Folio 0.6.0 verification — 2026-10-30

- Production TypeScript/Vite build passed. No dependency was added.
- 39 engine tests passed, with FOLIO_TEST_PDF enabled. New regression saves/reopens a native Highlight with empty contents and no automatic Text note, then verifies an explicitly written note remains separate.
- All 18 production-browser UI tests passed using installed Chrome. The three new review tests cover explicit comment creation, highlights remaining in Markup, correct deletion by native annotation index after list filtering, legacy highlight contents preserved in details, save/reopen and minimum-window English/Traditional Chinese layout.
- An initial full UI run exposed a fractional-zoom browser canvas metric rounding difference (0.129 pt over a 240 pt line). The font-outline assertion now measures at the PDF's nominal 12 pt, avoiding zoom quantization; the original strict tolerance remains. Actual applied/exported font family, point size, baseline and searchable text checks remain. The final full 18-test run passed.
- Native Electron workflow passed. The final packaged Mac app passed the same workflow from an isolated temporary working directory/profile, including actual worker/font/WASM loading, direct text editing, private-document checks, local font lookup, character highlighting without automatic contents, native exports, source/hard-link protection and sandbox/context isolation.
- The private source PDF remains unchanged with SHA-256 3fe01e77f80d4fb912bcc93ead75221f77f57e407fdcc9ead80fb6550394738f. No private PDF or proprietary full font is bundled.
- Visually inspected the updated sample-document workspace, separate Markup and Comments views at 1440 × 1000, and the Traditional Chinese view at 1000 × 680. Toolbar labels and four tabs are visible without overlap; new notes remain in Comments after submission. Preview artifacts use only the generated sample document.
- Mac and Windows packages report 0.6.0. All eight production assets match the final build byte for byte. Both OFL notices, third-party notices and electron/font-catalog.cjs are present; work/tmp/test-results folders are excluded. Windows executable is PE32+ x86-64.
- npm audit: zero reported vulnerabilities. git diff --check passed.

Highlights remain standard PDF markup annotations; other readers may list them in their own annotation panels. Folio now separates them from written notes and does not populate a new highlight's contents automatically. Existing annotation contents are preserved, not erased. Text/FreeText notes are Comments; other types belong to Markup. The lists are scoped to the current page.

Windows was cross-packaged on macOS and remains runtime-untested. Both packages remain unsigned; the Mac app is not notarized. Earlier font-coverage, paragraph reflow, OCR, mixed-run editing, crash recovery and actual OS IME-testing boundaries remain. No older release or user app window was replaced or closed.

0.6.0 deliverables: both versioned ZIP archives passed `unzip -tq`. SHA-256 checksums, update notes and sample-document previews accompany them in the task outputs folder. The new 0.6.0 Mac app was launched with a separate preview profile; its process is running alongside the existing 0.5.0 app. No manual inspection of that live window is claimed.

# Folio 0.7.0 verification — 2026-11-01

- Production TypeScript/Vite builds and clean `npm ci` passed. The clean-install audit exposed a missing Electron runtime: Electron 45's npm package has no automatic dependency postinstall on this host. Root `postinstall: install-electron` now explicitly invokes the official installer; a second clean `npm ci` created a working runtime. Both native workflows then passed.
- 43 engine tests passed, with the private opt-in PDF enabled. Four new clipboard/rotation regressions verify real text direction, edited baseline/orientation, movement/proportional resizing, source-independent object fragments, editable cross-document copies, rotated pages, image preview dimensions, independent IDs, rejected-operation rollback and pixel-identical restoration after four quarter turns. Managed mixed-script font-family preservation is checked.
- All 21 production-browser UI tests passed. Three new tests cover external text/image paste, direct on-page editing after rotation, formatted object copy/paste, independent undo/redo, cancellation, excessive-input rejection and compact English/Traditional Chinese controls. Browser clipboard data is mocked in these interface tests; the real system clipboard is tested separately.
- Source native desktop workflow passed after the clean install, including source/hard-link protection, native exports, private font checks, language, character highlighting and sandbox/context isolation.
- The new native clipboard/rotation workflow passed with the actual Electron 45 ClipboardItem API, standard Cmd+C/Cmd+V, ordinary paste inside the editor, external PNG data, external text format, internal object fragments, validation, undo/redo and exported object metadata. System clipboard formats are snapshotted in memory and restored afterward. An early failure found default native Paste did not route to page operations; explicit menu routing now preserves both page paste and normal focused-input behavior.
- The final universal DMG passed `hdiutil verify`, mounted read-only, and contained the correct Applications link and version. `lipo` confirms arm64 and x86_64 in its executable. Its Folio.app was copied with ditto into a temporary Applications folder, and both full native workflows passed from that copied app using isolated working directories/profiles. The mounted volume was detached afterward. The actual final artifact was repeated after the last packaging configuration update.
- The private source PDF SHA-256 remains 3fe01e77f80d4fb912bcc93ead75221f77f57e407fdcc9ead80fb6550394738f. No private PDF or proprietary full font is shipped. Previews use generated sample content.
- Windows NSIS initially failed with macOS error -86: the legacy default compiler was x86_64 with no Rosetta on this host. Pinning the supported `toolsets.nsis: 1.2.1` selects the official NSIS 3.12 unified bundle with an arm64 compiler. Setup.exe built successfully without installing Rosetta, Wine or Homebrew packages.
- Resource editing now remains enabled with `signExecutable: false`. Both Windows Folio.exe and Setup.exe contain ProductName Folio, FileVersion 0.7.0 and icon resources. The installer archive passed 7-Zip integrity testing and includes its uninstaller. The app.asar extracted from its actual app-64.7z payload is byte-for-byte identical to win-unpacked/resources/app.asar.
- Mac, Windows app folder and actual Windows installer payload report 0.7.0 and contain all eight final production assets byte-for-byte. Native bridge modules, font catalog and AGPL/OFL notices match source. work/tmp/test-results/node_modules are excluded. Official Electron 45 macOS arm64/x64 and Windows x64 runtime archive SHA-256 values match the Electron package's manifest. The NSIS 3.12 bundle matches its pinned official checksum.
- Visual checks covered 90° text and image rendering, separate rotation controls, and the 1000 × 680 Traditional Chinese layout. The final source is whitespace-clean (`git diff --check`).

Open release findings:

- `npm audit` reports 15 moderate development/build-tool findings through minimatch (GHSA-g3hv-75wg-m249, published/reviewed 2026-10-30). Current electron-builder registry release checked: 26.18.0. npm suggests an obsolete major downgrade, which was not applied. These dependencies are not shipped in app.asar; packaging uses repository-controlled globs. A compatible upstream remediation remains outstanding; this is not a zero-vulnerability claim. Advisory: https://github.com/advisories/GHSA-g3hv-75wg-m249 .
- The Mac host has zero valid signing identities. Both installers are unsigned, and the Mac app is not notarized. Direct copied-app launch does not prove Gatekeeper acceptance after an internet download.
- Windows install/runtime/uninstall and Intel execution have not been tested on their target systems. A disposable-Windows installer test and native checks are configured in GitHub Actions, but no remote workflow was run. The Mac DMG test is an automated drag-copy equivalent into a temporary Applications folder; it did not replace the user's installed app.
- Quarter-turn rotation applies to Folio-managed text/images, not arbitrary flattened imported graphics. Paragraph reflow, OCR, crash recovery, full mixed-run formatting, certificate signatures and arbitrary imported image editing remain outside this release. Actual OS IME composition still needs manual verification.

No older release or running user application was replaced or closed. Installation instructions require saving/quitting older Folio windows and checking the 0.7.0 badge so an old process is not mistaken for the update.

0.7.0 handoff: the final DMG and Setup.exe are copied to the task outputs folder alongside installation/QA notes, a feature review, a generated rotation-control preview and SHA-256 sums. Output installer bytes match the verified release artifacts. Installer script syntax and CI YAML were checked locally; Windows CI execution remains pending.

On 2026-11-06, a fresh dependency audit of the same lockfile reported six moderate findings in the packaging toolchain, all linked to the minimatch advisory above. The count of 15 records the earlier audit.


# Pageline 0.8.0 verification — 2026-11-25

- Renamed the product from Folio to Pageline; preserved appId, Windows installer identity, legacy protocol, metadata and preference directory. An isolated native startup checked default preference-directory reuse; explicit test profiles remain respected.
- `npm ci` and production build passed. Final `npm test`: 51 passed, 0 skipped. Final production UI suite: 23 passed, 0 skipped, with FOLIO_TEST_PDF supplied locally. No private document was bundled or uploaded; its original SHA-256 remains unchanged.
- Normal/booklet vector print output, Chinese text, cropped/rotated pages and annotation appearances, blank padding, left/right binding, manual sides/reversal and source/history protection passed regression tests. Native tests captured Chromium printToPDF output through a stubbed printer handoff, checked page count/orientation and visually inspected it. Native cancel/retry, malformed-job rejection, update unavailable state and Chinese menus passed. No physical print job was sent; hardware duplex is unverified.
- The final universal DMG passed hdiutil integrity verification, read-only mounting, Applications-link and app/helper architecture checks. The native helper upgraded a temporary identified legacy Folio bundle and created a desktop shortcut. Smaller fixture checks covered opt-out, reinstallation, unrelated-item protection and downgrade rejection. The actual installed app passed desktop editing/export, clipboard/rotation and printing/update-dialog workflows in isolated profiles/cwd. The mounted volume was detached. /Applications and the user's Desktop were untouched. Intel execution remains unverified.
- The final Windows NSIS installer compiled using the pinned NSIS1.2.1 toolset. Static archive tests, x64 app, app/Setup/uninstaller version/icon resources, payload hash equality, final assets/bridge/README and license notices passed. The shortcut wizard and rename-aware path are configured; Windows runtime/install/upgrade/uninstall tests are prepared but were not run on this Mac.
- Delivered DMG and Setup.exe are in the task outputs folder, alongside installation/QA notes, a booklet-dialog preview and SHA-256 sums. Copies match verified artifact hashes. Both packages remain unsigned; Mac notarization and real downloaded-package Gatekeeper acceptance are unverified.
- Update checks use a fixed GitHub stable-release feed and validated platform installer links; tests cover available/current/unavailable/unsafe feeds and concurrent retries. The UI opens the installer for the user to run after saving/quitting. The repository is private with a draft release, so public update downloads remain unavailable until an accessible feed/release is published. No publishing or repository visibility changes were made.
- Clean dependency installation reported six moderate build-tool advisories. Packaging dependencies are excluded from the app; this does not resolve those upstream advisories. Full Acrobat parity, OCR, paragraph reflow, arbitrary imported-image editing, crash recovery and certificate signing remain outside this release.


# Pageline 0.8.0 publication — 2026-11-25

Daniel explicitly approved public repository/release publication. Source commit `1e493387886d3ddab0d41d39a2cbd442293b8c9d` was pushed and tagged `v0.8.0`. The repository is public; the release is published (not a draft or prerelease) and marked latest. The earlier 0.7.0 draft was retained. Release: https://github.com/hungkaihsin/Folio/releases/tag/v0.8.0.

Anonymous repository metadata, raw main/tagged source, and latest-release API access passed. The live update service reported available 0.8.0 from a simulated older version on both platforms, selected the expected platform-specific installer URLs, and reported current for version 0.8.0. This tests platform selection, not Windows runtime. The actual packaged Mac app also reported the latest published version against the live public feed, with no mocked response or authentication. Installer upload sizes/digests match the verified local deliverables. Signing and notarization are unchanged.

Complete unauthenticated public downloads of both installers passed SHA-256 and size comparison with the verified local files: Mac `442de208ce93e89b8a007c3a76852cce66616bae04b70ee802152848a5b798b0`, Windows `a853da539a90c52fb44e9190d57f04992185110b0f240f0a18e4765831d397fb`. The public checksum file also matches. Local installation/QA notes were updated to reflect the public feed.

The initial tag-triggered CI run 45628141266 passed both platform app test suites and produced the Windows Setup.exe, then failed because electron-builder attempted implicit tag-triggered publishing without a GH_TOKEN. The Mac matrix job was cancelled by fail-fast. The validation workflow now explicitly builds with --publish never and disables fail-fast so both platform results remain independent. No application code or published installer bytes were changed by this CI correction.

Final remote CI run https://github.com/hungkaihsin/Folio/actions/runs/45631508365 passed both jobs at commit b5c6e0074a9634b9be08655a7f6e344c12796507. Both runners passed 49 engine/service and 20 UI tests (2 engine/3 UI private-fixture cases intentionally skipped), source native workflows, packaging and installer workflows. The Windows runner verified NSIS archive/resources/payload hashes, fresh silent install, desktop shortcut target, same-version reinstall, packaged editing/export, clipboard/rotation, printing/update-dialog behavior and uninstall. Mac verified its CI-built universal DMG and native helper, including the installed app. Physical printing, interactive Windows checkbox UI and Windows legacy-name upgrade remain unverified.

The Windows validator required full 7-Zip for the NSIS container, recursive extraction independent of separators, host-normalized nested ASAR lookup paths, and canonical shortcut paths for Windows short/long path aliases. The nested lookup failure was reproduced locally using the actual ASAR Filesystem with Windows path semantics. These were CI/test-tooling corrections; no application code or published installer bytes changed.

Artifact boundary: remote CI built separate installers from application-equivalent source with later documentation/test-tooling commits. It did not execute the exact published Windows Setup.exe. The published binaries retain the earlier local/static checks and complete anonymous download/hash verification; the exact published Mac DMG was also installed/tested locally. Source v0.8.0 remains pinned to 1e493387886d3ddab0d41d39a2cbd442293b8c9d.
