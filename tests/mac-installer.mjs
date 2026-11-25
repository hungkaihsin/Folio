import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
if (process.platform !== "darwin")
  throw new Error("The DMG installation test requires macOS.");
const exec = promisify(execFile),
  version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const image = path.resolve(
  process.argv[2] ||
    `release/v${version}/Pageline-${version}-macOS-Universal.dmg`,
);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "folio-dmg-")),
  mount = path.join(tmp, "volume"),
  installed = path.join(tmp, "Applications/Pageline.app");
let attached = false;
const run = async (file, args) => {
  const result = await exec(file, args, {
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout;
};
try {
  await run("/usr/bin/hdiutil", ["verify", image]);
  await fs.mkdir(mount);
  await run("/usr/bin/hdiutil", [
    "attach",
    "-readonly",
    "-nobrowse",
    "-mountpoint",
    mount,
    image,
  ]);
  attached = true;
  assert.equal(
    await fs.readlink(path.join(mount, "Applications")),
    "/Applications",
  );
  const app = path.join(mount, "Pageline.app"),
    plist = path.join(app, "Contents/Info.plist");
  const actual = await exec("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleShortVersionString",
    plist,
  ]);
  assert.equal(actual.stdout.trim(), version);
  const arch = await exec("/usr/bin/lipo", [
    "-archs",
    path.join(app, "Contents/MacOS/Pageline"),
  ]);
  assert.match(arch.stdout, /arm64/);
  assert.match(arch.stdout, /x86_64/);
  await fs.mkdir(path.dirname(installed));
  const helper = path.join(
    mount,
    "Pageline Installer.app/Contents/MacOS/Installer",
  );
  const helperArch = await exec("/usr/bin/lipo", ["-archs", helper]);
  assert.match(helperArch.stdout, /arm64/);
  assert.match(helperArch.stdout, /x86_64/);
  // A small, identified legacy bundle exercises real rename/upgrade behavior.
  const legacy = path.join(path.dirname(installed), "Folio.app");
  const fakeApp = async (
    folder,
    version,
    identity = "com.danielhung.folio",
  ) => {
    await fs.mkdir(path.join(folder, "Contents/MacOS"), { recursive: true });
    await fs.writeFile(
      path.join(folder, "Contents/MacOS/Pageline"),
      "#!/bin/sh\nexit 0\n",
      { mode: 0o755 },
    );
    await fs.writeFile(
      path.join(folder, "Contents/Info.plist"),
      `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identity}</string><key>CFBundleExecutable</key><string>Pageline</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`,
    );
  };
  await fakeApp(legacy, "0.7.0");
  const desktop = path.join(tmp, "Desktop");
  const result = JSON.parse(
    await run(helper, [
      "--install-to",
      path.dirname(installed),
      "--desktop",
      desktop,
      "--shortcut",
    ]),
  );
  assert.equal(result.shortcut, true);
  assert.equal(result.warning, null);
  assert.equal(
    await fs.realpath(path.join(desktop, "Pageline.app")),
    await fs.realpath(installed),
  );
  await assert.rejects(fs.access(legacy));
  // Exercise no-shortcut, reinstallation, downgrade and unrelated-item protection
  // using the same native helper with tiny source bundles, leaving user apps alone.
  const fixture = path.join(tmp, "helper-fixture");
  await fs.mkdir(fixture);
  await run("/usr/bin/ditto", [
    path.join(mount, "Pageline Installer.app"),
    path.join(fixture, "Pageline Installer.app"),
  ]);
  await fakeApp(path.join(fixture, "Pageline.app"), version);
  const smallHelper = path.join(
    fixture,
    "Pageline Installer.app/Contents/MacOS/Installer",
  );
  const smallTarget = path.join(tmp, "SmallApplications"),
    smallDesktop = path.join(tmp, "SmallDesktop");
  const smallArgs = ["--install-to", smallTarget, "--desktop", smallDesktop];
  assert.equal(JSON.parse(await run(smallHelper, smallArgs)).shortcut, false);
  await assert.rejects(fs.access(smallDesktop));
  await run(smallHelper, [...smallArgs, "--shortcut"]);
  await run(smallHelper, [...smallArgs, "--shortcut"]);
  await fs.rm(path.join(smallDesktop, "Pageline.app"));
  await fs.writeFile(
    path.join(smallDesktop, "Pageline.app"),
    "unrelated desktop file",
  );
  const conflict = JSON.parse(
    await run(smallHelper, [...smallArgs, "--shortcut"]),
  );
  assert.equal(conflict.shortcut, false);
  assert.match(conflict.warning, /different item/);
  assert.equal(
    await fs.readFile(path.join(smallDesktop, "Pageline.app"), "utf8"),
    "unrelated desktop file",
  );
  await fs.rm(path.join(smallTarget, "Pageline.app"), { recursive: true });
  await fakeApp(path.join(smallTarget, "Pageline.app"), "99.0.0");
  await assert.rejects(exec(smallHelper, smallArgs), /newer version/);
  await fs.rm(path.join(smallTarget, "Pageline.app"), { recursive: true });
  await fakeApp(
    path.join(smallTarget, "Pageline.app"),
    version,
    "another.application",
  );
  await assert.rejects(exec(smallHelper, smallArgs), /Another application/);
  const hash = async (root) =>
    createHash("sha256")
      .update(await fs.readFile(path.join(root, "Contents/Resources/app.asar")))
      .digest("hex");
  assert.equal(await hash(app), await hash(installed));
  await fs.access(path.join(installed, "Contents/Resources/icon.icns"));
  const binary = path.join(installed, "Contents/MacOS/Pageline");
  await run(process.execPath, ["tests/desktop.mjs", binary]);
  await run(process.execPath, ["tests/clipboard-desktop.mjs", binary]);
  await run(process.execPath, ["tests/print-updates-desktop.mjs", binary]);
  console.log(
    "DMG and native upgrade/shortcut helper verified; universal binary and Applications link checked; copied-app editing/clipboard/rotation workflows passed.",
  );
} finally {
  if (attached) await run("/usr/bin/hdiutil", ["detach", mount]);
  await fs.rm(tmp, { recursive: true, force: true });
}
