import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const project = path.resolve(".");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "folio-desktop-"));
const executable = process.argv[2];
let app;
try {
  const opts = {
    cwd: tmp,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    timeout: 60000,
  };
  if (executable) opts.executablePath = path.resolve(executable);
  else
    opts.executablePath = path.join(
      project,
      "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
  opts.args = [
    ...(!executable ? [project] : []),
    `--user-data-dir=${path.join(tmp, "profile")}`,
  ];
  app = await electron.launch(opts);
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Explore with a sample document" })
    .click();
  await page
    .getByText("Welcome to Folio.pdf", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.locator(".text-layer").waitFor();
  const runtime = await app.evaluate(() => process.versions.electron);
  assert.equal(runtime, "45.0.0");
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return w.webContents.getLastWebPreferences();
  });
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Edit line: Choose Edit text, then click this sentence.",
      exact: true,
    })
    .click();
  await page.getByLabel("Replacement text").fill("Desktop editing works.");
  await page.getByRole("button", { name: "Apply change" }).click();
  await page
    .getByRole("button", {
      name: "Edit line: Desktop editing works.",
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: path.join(project, "work", "folio-preview.png"),
  });
  const target = path.join(tmp, "saved.pdf");
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
  }, target);
  await page.getByRole("button", { name: "Save copy" }).click();
  await page.getByRole("status").waitFor();
  assert.ok((await fs.stat(target)).size > 10000);
  // Opening the saved PDF exercises the real native bridge with a selected source.
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
  }, target);
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await page.getByText("saved.pdf", { exact: true }).waitFor();
  await page.locator(".text-layer").waitFor();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Edit line: Desktop editing works.",
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Save copy" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Choose a new filename" })
    .waitFor();
  // A hard link to the original must also be protected.
  const hardlink = path.join(tmp, "same-source.pdf");
  await fs.link(target, hardlink);
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
  }, hardlink);
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.getByRole("button", { name: "Save copy" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Choose a new filename" })
    .waitFor();
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: path.join(
      project,
      "work",
      executable ? "packaged-editor.png" : "desktop-editor.png",
    ),
  });
  console.log(
    executable
      ? "Packaged desktop workflow passed (isolated working directory)."
      : "Desktop workflow passed.",
  );
} finally {
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.destroy();
      })
      .catch(() => {});
    await app.close().catch(() => {});
  }
  await fs.rm(tmp, { recursive: true, force: true });
}
