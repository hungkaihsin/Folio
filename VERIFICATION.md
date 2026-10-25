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
- GitHub Actions is configured, but no remote repository, CI run, or release was created.
- This is an initial editor with the explicit limitations in README.md, including line-based text editing and no OCR/paragraph reflow. PDF fixtures cannot establish compatibility with every real-world document.

Deliverable checks:

- Both final ZIP archives passed `unzip -tq`.
- Windows executable identified as PE32+ x86-64.
- Eight bundled production UI/engine/WASM/font assets compared byte for byte between Mac and Windows packages and matched.
- Final archives and quick-start guide are in `/Users/danielhung/Documents/Codex/2026-10-25/s/outputs`; SHA256SUMS.txt accompanies them.
