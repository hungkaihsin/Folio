// Static package validation on any host; this does not run Windows or NSIS.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { getPath7za } from "app-builder-lib/out/toolsets/7zip.js";
import { NtExecutable, NtExecutableResource } from "pe-library";
import { Resource } from "resedit";
import { extractFile, listPackage } from "@electron/asar";
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const root = path.resolve(`release/v${version}`),
  setup = path.join(root, `Pageline-${version}-Windows-x64-Setup.exe`);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pageline-win-package-"));
const bin = await getPath7za(),
  exec = promisify(execFile);
const run = (args) =>
  exec(bin, args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
try {
  await run(["t", setup]);
  await run([
    "x",
    setup,
    `-o${tmp}`,
    "$PLUGINSDIR/app-64.7z",
    "$R0/Uninstall Pageline.exe",
    "-y",
  ]);
  const archive = path.join(tmp, "$PLUGINSDIR/app-64.7z");
  await run(["t", archive]);
  await run([
    "x",
    archive,
    `-o${path.join(tmp, "payload")}`,
    "Pageline.exe",
    "resources/app.asar",
    "-y",
  ]);
  const hash = async (file) =>
    createHash("sha256")
      .update(await fs.readFile(file))
      .digest("hex");
  for (const name of ["Pageline.exe", "resources/app.asar"])
    assert.equal(
      await hash(path.join(tmp, "payload", name)),
      await hash(path.join(root, "win-unpacked", name)),
    );
  for (const name of [
    path.join(tmp, "payload/Pageline.exe"),
    path.join(tmp, "$R0/Uninstall Pageline.exe"),
    setup,
  ]) {
    const data = await fs.readFile(name),
      pe = data.readUInt32LE(0x3c);
    assert.equal(data.toString("ascii", pe, pe + 4), "PE\0\0");
    const resources = NtExecutableResource.from(
      NtExecutable.from(data, { ignoreCert: true }),
    );
    const info = Resource.VersionInfo.fromEntries(resources.entries)[0];
    assert.ok(info);
    const [major, minor, patch] = version.split(".").map(Number);
    assert.equal(info.fixedInfo.fileVersionMS, (major << 16) | minor);
    assert.equal(info.fixedInfo.fileVersionLS, patch << 16);
    assert.ok(
      Resource.IconGroupEntry.fromEntries(resources.entries).length > 0,
    );
  }
  const executable = await fs.readFile(path.join(tmp, "payload/Pageline.exe"));
  assert.equal(
    executable.readUInt16LE(executable.readUInt32LE(0x3c) + 4),
    0x8664,
  );
  const asar = path.join(tmp, "payload/resources/app.asar");
  assert.equal(
    JSON.parse(extractFile(asar, "package.json").toString()).productName,
    "Pageline",
  );
  assert.equal(
    JSON.parse(extractFile(asar, "package.json").toString()).version,
    version,
  );
  for (const name of [
    "electron/printing.cjs",
    "electron/updates.cjs",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "src/assets/OFL.txt",
    "src/assets/NotoSerif-OFL.txt",
  ])
    assert.ok(extractFile(asar, name).length > 0, name);
  for (const name of [
    "electron/main.cjs",
    "electron/preload.cjs",
    "electron/printing.cjs",
    "electron/updates.cjs",
    "README.md",
  ])
    assert.deepEqual(extractFile(asar, name), await fs.readFile(name));
  for (const name of listPackage(asar).filter((name) =>
    name.startsWith("/dist/"),
  )) {
    const local = name.slice(1),
      stat = await fs.stat(local);
    if (stat.isFile())
      assert.deepEqual(extractFile(asar, local), await fs.readFile(local));
  }
  assert.equal(
    listPackage(asar).some((p) => /\/work\/|\/tests\/|\.pdf$/.test(p)),
    false,
  );
  console.log(
    "Windows static checks passed: NSIS/archive integrity, payload SHA-256 equality, x64 app, version/icon resources, bundled print/update modules and license notices. Windows installation/runtime remain untested on this Mac.",
  );
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
