# Publishing Pageline updates

The repository remains `hungkaihsin/Folio` so installed update-check URLs and Folio compatibility identifiers keep working. Public downloads are under [releases](https://github.com/hungkaihsin/Folio/releases).

1. Bump `package.json` and the root `package-lock.json` version together. Update the versioned output paths and Mac DMG app path in the build configuration. Keep appId `com.danielhung.folio`, npm name `folio-pdf-editor`, the legacy preference directory, protocol and PDF/clipboard identifiers stable.
2. Build and verify installers with the documented engine, UI, native and installer checks. Test Windows installation/upgrade/runtime/uninstall on Windows and Mac installation/upgrade on Mac; cross-packaging establishes no target-OS runtime result. Private regression PDFs stay local and out of Git, release assets and CI.
3. Keep installer asset names exact: `Pageline-VERSION-macOS-Universal.dmg` and `Pageline-VERSION-Windows-x64-Setup.exe`. The update service selects these names from a GitHub release with tag `vVERSION`.
4. Calculate SHA-256 checksums for the tested installer bytes. Commit and push the corresponding source, license notices and release notes. Create a draft release targeting the full commit SHA; upload the tested installers and checksum file. Verify uploaded sizes and digests before publishing.
5. Publish the release and mark it latest only when ready for users. The updater uses `releases/latest`, accepts numeric stable versions and excludes drafts/prereleases. Clearly identify unsigned builds and any unverified platform behavior. Code signing/notarization require separate configuration and credentials.
6. Without authentication, verify the repository/source, the latest-release API, and full installer downloads against local SHA-256 values. Exercise `electron/updates.cjs` for both platforms with an older version (available) and current version (current); confirm the packaged app's update dialog works against the live feed.
7. Review the tag-triggered Desktop builds workflow. Validation uses `--publish never` to avoid implicit electron-builder publishing on tag builds; public releases are published explicitly after verification. Record exact results and limits. CI artifacts are separate builds: passing CI does not make independently built release binaries signed or notarized.

Users update through **Help > Check for updates**, download the matching installer, save their work, quit the app and run the new installer. This is an installer-based flow. Versions of Folio predating the checker can install Pageline directly.

Do not embed GitHub tokens or make PDF processing depend on the update service. Update checks send no document contents. Keep old releases/tags immutable; publish a new version for application fixes.
