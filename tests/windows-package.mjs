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
import { Resource, Data } from "resedit";
import {
  extractFile as extractArchiveFile,
  listPackage as listArchiveFiles,
} from "@electron/asar";
// ASAR lookup splits directories using the host separator. Normalize nested
// lookup paths and use portable separators when inspecting the listing.
const extractFile = (archive, name) =>
  extractArchiveFile(archive, path.normalize(name));
const listPackage = (archive) =>
  listArchiveFiles(archive).map((name) => name.replaceAll("\\", "/"));
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const root = path.resolve(`release/v${version}`),
  setup = path.join(root, `Pageline-${version}-Windows-x64-Setup.exe`);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pageline-win-package-"));
let bin = process.env.PAGELINE_7ZIP;
if (!bin && process.platform === "win32") {
  // The Windows builder toolset contains 7za, which can see the embedded 7z
  // stream but cannot unpack the outer NSIS container. Use full 7-Zip here.
  const installed = path.join(
    process.env.ProgramFiles || "C:\\Program Files",
    "7-Zip",
    "7z.exe",
  );
  await fs.access(installed);
  bin = installed;
}
bin ||= await getPath7za();
const exec = promisify(execFile);
const run = (args) =>
  exec(bin, args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
try {
  const sourceIcon = Data.IconFile.from(await fs.readFile("build/icon.ico"));
  const source256 = sourceIcon.icons.find(
    (item) => item.data.width === 256,
  ).data;
  assert.ok(source256.isRaw());
  await run(["t", setup]);
  await run(["x", setup, `-o${tmp}`, "-y"]);
  const extracted = await fs.readdir(tmp, { recursive: true });
  const findExtracted = (name) => {
    const matches = extracted.filter((entry) => path.basename(entry) === name);
    assert.equal(
      matches.length,
      1,
      `Expected one ${name} in the NSIS container`,
    );
    return path.join(tmp, matches[0]);
  };
  const archive = findExtracted("app-64.7z");
  const uninstaller = findExtracted("Uninstall Pageline.exe");
  await run(["t", archive]);
  await run(["x", archive, `-o${path.join(tmp, "payload")}`, "-y"]);
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
    uninstaller,
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
    const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
    assert.ok(groups.length > 0);
    const icon256 = groups
      .flatMap((group) => group.getIconItemsFromEntries(resources.entries))
      .find((item) => item.width === 256);
    assert.ok(
      icon256?.isRaw(),
      `Missing high-resolution icon in ${path.basename(name)}`,
    );
    assert.deepEqual(
      Buffer.from(icon256.bin),
      Buffer.from(source256.bin),
      `Icon differs from Pageline artwork in ${path.basename(name)}`,
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
  ])
    assert.deepEqual(extractFile(asar, name), await fs.readFile(name));
  // Publication can update documentation after a verified package is built.
  assert.ok(
    extractFile(asar, "README.md")
      .toString()
      .startsWith(`# Pageline ${version}`),
  );
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
    "Windows static checks passed: NSIS/archive integrity, payload SHA-256 equality, x64 app, version/icon resources, bundled print/update modules and license notices. Static validation alone does not establish target-OS installation/runtime success.",
  );
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
