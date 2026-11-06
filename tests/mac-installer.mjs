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
  process.argv[2] || `release/v${version}/Folio-${version}-macOS-Universal.dmg`,
);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "folio-dmg-")),
  mount = path.join(tmp, "volume"),
  installed = path.join(tmp, "Applications/Folio.app");
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
  const app = path.join(mount, "Folio.app"),
    plist = path.join(app, "Contents/Info.plist");
  const actual = await exec("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleShortVersionString",
    plist,
  ]);
  assert.equal(actual.stdout.trim(), version);
  const arch = await exec("/usr/bin/lipo", [
    "-archs",
    path.join(app, "Contents/MacOS/Folio"),
  ]);
  assert.match(arch.stdout, /arm64/);
  assert.match(arch.stdout, /x86_64/);
  await fs.mkdir(path.dirname(installed));
  await run("/usr/bin/ditto", [app, installed]);
  const hash = async (root) =>
    createHash("sha256")
      .update(await fs.readFile(path.join(root, "Contents/Resources/app.asar")))
      .digest("hex");
  assert.equal(await hash(app), await hash(installed));
  await fs.access(path.join(installed, "Contents/Resources/icon.icns"));
  const binary = path.join(installed, "Contents/MacOS/Folio");
  await run(process.execPath, ["tests/desktop.mjs", binary]);
  await run(process.execPath, ["tests/clipboard-desktop.mjs", binary]);
  console.log(
    "DMG verified; universal binary and Applications link checked; copied-app editing/clipboard/rotation workflows passed.",
  );
} finally {
  if (attached) await run("/usr/bin/hdiutil", ["detach", mount]);
  await fs.rm(tmp, { recursive: true, force: true });
}
