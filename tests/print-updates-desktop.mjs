// Exercises native IPC and Chromium print output without sending a physical job.
import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as m from "mupdf";
const project = path.resolve("."),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pageline-print-test-"));
const binary = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
      project,
      process.platform === "win32"
        ? "node_modules/electron/dist/electron.exe"
        : "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
let app;
try {
  app = await electron.launch({
    executablePath: binary,
    cwd: tmp,
    args: [
      ...(!process.argv[2] ? [project] : []),
      `--user-data-dir=${path.join(tmp, "profile")}`,
    ],
    timeout: 60000,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  assert.equal(await app.evaluate(({ app }) => app.getName()), "Pageline");
  assert.equal(
    await fs.realpath(await app.evaluate(({ app }) => app.getPath("userData"))),
    await fs.realpath(path.join(tmp, "profile")),
  );
  await page
    .getByRole("button", { name: "Explore with a sample document" })
    .click();
  await page.getByText("Welcome to Pageline.pdf", { exact: true }).waitFor();
  await page.locator(".text-layer").waitFor();
  await app.evaluate(
    ({ app }, output) => {
      globalThis.printRecords = [];
      app.on("browser-window-created", (_event, window) => {
        const contents = window.webContents;
        contents.print = (options, callback) => {
          globalThis.printRecords.push(options);
          if (globalThis.cancelPrint) {
            callback(false, "Print job canceled");
            return;
          }
          contents
            .printToPDF({ preferCSSPageSize: true, printBackground: true })
            .then(
              (bytes) => {
                globalThis.printPDF = Array.from(bytes);
                callback(true);
              },
              (error) => callback(false, error.message),
            );
        };
      });
    },
    path.join(tmp, "native-preview.png"),
  );
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()
      .items.find((i) => i.label === "File")
      .submenu.items.find((i) => i.label === "Print…")
      .click(),
  );
  await page.getByRole("dialog", { name: "Print PDF" }).waitFor();
  await page.getByLabel("Print layout").selectOption("booklet");
  await expect(
    page.getByText("blank pages added to complete sheets.", { exact: false }),
  ).toBeVisible();
  const vector = path.join(tmp, "booklet.pdf");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, vector);
  await page
    .getByRole("button", { name: "Save print PDF", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your print PDF has been saved.",
  );
  const doc = m.Document.openDocument(
    new Uint8Array(await fs.readFile(vector)),
    "application/pdf",
  );
  assert.equal(doc.countPages(), 2);
  const first = doc.loadPage(0),
    text = first.toStructuredText("");
  assert.match(text.asText(), /PAGELINE/);
  text.destroy();
  first.destroy();
  doc.destroy();
  await page.getByRole("button", { name: "Print…", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Print PDF" })
    .waitFor({ state: "hidden", timeout: 60000 });
  const records = await app.evaluate(() => globalThis.printRecords);
  assert.equal(records.length, 1);
  assert.equal(records[0].duplexMode, "shortEdge");
  assert.equal(records[0].landscape, true);
  const captured = new Uint8Array(
    await app.evaluate(() => globalThis.printPDF),
  );
  const raster = m.Document.openDocument(captured, "application/pdf");
  assert.equal(raster.countPages(), 2);
  const side = raster.loadPage(0),
    bounds = side.getBounds();
  assert.ok(bounds[2] > bounds[3]);
  const pix = side.toPixmap(
    m.Matrix.scale(0.7, 0.7),
    m.ColorSpace.DeviceRGB,
    false,
  );
  await fs.writeFile(
    path.join(project, "work/printing/native-preview.png"),
    pix.asPNG(),
  );
  pix.destroy();
  side.destroy();
  raster.destroy();
  await page.getByRole("button", { name: "Print PDF", exact: true }).click();
  await app.evaluate(() => {
    globalThis.cancelPrint = true;
  });
  await page.getByRole("button", { name: "Print…", exact: true }).click();
  await expect(page.locator(".loading")).toBeHidden({ timeout: 60000 });
  await expect(page.getByRole("dialog", { name: "Print PDF" })).toBeVisible();
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
  );
  await page.getByRole("button", { name: "Close print" }).click();
  const invalid = await page.evaluate(async () => {
    try {
      await window.desktop.print({
        pages: [],
        paper: "A4",
        landscape: false,
        copies: 1,
        duplex: "simplex",
      });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(invalid, true);
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(
    page.getByRole("dialog", { name: "Pageline updates" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Pageline updates" }).getByRole("status"),
  ).not.toContainText("Checking for updates…", { timeout: 20000 });
  await page.getByRole("button", { name: "Close updates" }).click();
  await page.getByLabel("Language / 語言").selectOption("zh-TW");
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()
      .items.find((i) => i.label === "檔案")
      .submenu.items.find((i) => i.label === "列印…")
      .click(),
  );
  await expect(page.getByRole("dialog", { name: "列印 PDF" })).toBeVisible();
  await page.screenshot({
    path: path.join(project, "work/printing/native-dialog-zh.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    "Native print bridge, print-sheet preview, cancel/retry, vector save, update dialog and Chinese menus passed. No physical print job sent.",
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
