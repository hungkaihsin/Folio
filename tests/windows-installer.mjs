// Run only on a disposable Windows CI runner/VM: exercises the real NSIS
// install, installed application, and uninstaller rather than just unpacking it.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
if (process.platform !== "win32")
  throw new Error("This installer test requires Windows.");
if (process.env.FOLIO_INSTALLER_TEST !== "1")
  throw new Error(
    "Use a disposable Windows runner with FOLIO_INSTALLER_TEST=1.",
  );
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const setup = path.resolve(
  process.argv[2] ||
    `release/v${version}/Folio-${version}-Windows-x64-Setup.exe`,
);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "folio-install-")),
  target = path.join(root, "Folio"),
  exe = path.join(target, "Folio.exe");
const run = (file, args, timeout = 180000) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out: ${path.basename(file)}`));
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(new Error(`${path.basename(file)} exited ${code}`));
    });
  });
let installed = false;
try {
  await run(setup, ["/S", `/D=${target}`]);
  installed = true;
  await fs.access(exe);
  // The actual worker/fonts/WASM/native dialogs are exercised by both workflows.
  await run(process.execPath, ["tests/desktop.mjs", exe]);
  await run(process.execPath, ["tests/clipboard-desktop.mjs", exe]);
  console.log("Windows NSIS install and installed-app workflows passed.");
} finally {
  if (installed) {
    await run(path.join(target, "Uninstall Folio.exe"), ["/S"]);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        await fs.access(exe);
      } catch {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await assert.rejects(fs.access(exe));
    console.log("Windows NSIS uninstall passed.");
  }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
