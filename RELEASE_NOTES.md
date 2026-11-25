# Pageline 0.8.1

Pageline now has its own folded-page **P** icon and a clearly labeled **Updates** button.

## Changes

- Replaced the old F icon in the Mac/Windows app, Mac installer helper, Windows setup/uninstaller, Dock/taskbar, toolbar, desktop shortcut artwork and browser favicon.
- Added a visible **Updates / 更新** label beside the version. You can also use **Help > Check for updates**. Updates download a new installer for you to run after saving and quitting the app.
- Preserved Folio's app/installer identity, PDF compatibility and preference directory.

## Installation

- **Mac (macOS 13+, Apple Silicon and Intel binaries):** open the DMG and run **Pageline Installer**. Select the Applications folder containing your old version and choose whether to create a desktop shortcut. Save and quit the installed app first.
- **Windows x64:** close Pageline/Folio and run Setup.exe. The wizard includes an optional desktop shortcut.

The published installers will be the exact files tested and checksummed by the release CI jobs. Verification results and the public checksum file accompany the release.

**Unsigned builds:** the Mac app is not notarized and neither installer is code signed. Gatekeeper/SmartScreen acceptance is not established. Intel execution, physical-printer behavior and the interactive Windows shortcut checkbox still need manual checks. PDF processing stays local; update checks contact GitHub for release metadata.

Existing 0.8.0 users can use its **Help > Check for updates** menu or click its version number to find 0.8.1 once published. Builds predating the checker can install this version directly. AGPL-3.0-or-later with retained MuPDF and Noto font notices; corresponding source is the `v0.8.1` tag.
