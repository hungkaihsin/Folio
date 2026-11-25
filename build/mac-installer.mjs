import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
if (process.platform !== "darwin")
  throw new Error("Build the Mac installer on macOS.");
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const root = path.resolve("work/mac-installer-helper"),
  bundle = path.join(root, "Pageline Installer.app"),
  contents = path.join(bundle, "Contents");
await fs.mkdir(path.join(contents, "MacOS"), { recursive: true });
await fs.mkdir(path.join(contents, "Resources"), { recursive: true });
const sdk = (
  await exec("xcrun", ["--sdk", "macosx", "--show-sdk-path"])
).stdout.trim();
for (const architecture of ["arm64", "x86_64"]) {
  const result = await exec(
    "xcrun",
    [
      "swiftc",
      "build/MacInstaller.swift",
      "-sdk",
      sdk,
      "-target",
      `${architecture}-apple-macosx13.0`,
      "-O",
      "-o",
      path.join(root, `installer-${architecture}`),
    ],
    { timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.stderr.trim()) console.log(result.stderr.trim());
}
await exec("lipo", [
  "-create",
  path.join(root, "installer-arm64"),
  path.join(root, "installer-x86_64"),
  "-output",
  path.join(contents, "MacOS/Installer"),
]);
await fs.copyFile(
  "build/icon.icns",
  path.join(contents, "Resources/icon.icns"),
);
await fs.writeFile(
  path.join(contents, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.danielhung.folio.installer</string><key>CFBundleName</key><string>Pageline Installer</string><key>CFBundleDisplayName</key><string>Pageline Installer</string><key>CFBundleExecutable</key><string>Installer</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${version}</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleIconFile</key><string>icon.icns</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>`,
);
console.log("Built universal Pageline installer helper.");
