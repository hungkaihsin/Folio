# Pageline 0.8.2

The update control is now a full-size **Check for updates / 檢查更新** button in the top-right toolbar, next to the document actions. The version remains visible beside the Pageline name. **Help > Check for updates** also works.

## Changes

- Larger, higher-contrast update button with the full action label, including on a 1000×680 window in English and Traditional Chinese.
- Carries the corrected Windows icon check into the tagged release: size zero in an icon directory represents 256 pixels. The native print verification also allows realistic preparation time.
- CI cancels superseded runs for the same branch/tag and uses explicit read-only repository permissions and bounded job duration. Historical failed-run records and notification settings are preserved.

The failure email for `v0.8.1 (f162177)` refers to the original Windows icon-validator assertion. The corrected application-equivalent 0.8.1 validation passed afterward. This release tags the corrected checks together with the new update-button design.

## Install

Save your work and quit the installed app. On Mac, open the DMG and run **Pageline Installer**, choosing the Applications folder containing your old version and the optional desktop shortcut. On Windows x64, run Setup.exe. Open Pageline and check the visible version label.

Release binaries are taken from passing target-OS installer jobs and checked against their post-test SHA-256 records. Existing settings, Folio compatibility identifiers and the P icon are retained. The release includes the checksum file.

**Unsigned builds:** code signing and macOS notarization remain pending. Intel Mac execution, physical-printer behavior and the interactive Windows shortcut-checkbox UI remain unverified. PDF processing stays local; the optional update check contacts GitHub for release metadata. Updates download an installer for you to run, rather than installing silently. AGPL-3.0-or-later; corresponding application source is the `v0.8.2` tag.

## Verification completed

[Both Mac and Windows CI jobs passed](https://github.com/hungkaihsin/Folio/actions/runs/45845481940) for this tag. Each passed 49 engine/service and 21 UI tests; private-fixture cases stayed local, where 51 engine/service and 24 UI tests passed. Installer suites exercised embedded icons, fresh/reinstall/installed-app workflows and upgrades from the published 0.8.0 installers with retained language preferences; Windows uninstall passed. The downloads are those exact tested files, matched to the job-recorded SHA-256 values and verified again by full anonymous public downloads.
