import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as m from "mupdf";
const project = path.resolve("."),
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "folio-clipboard-")),
  executable = process.argv[2];
const format =
  'electron application/osclipboard;format="com.danielhung.folio.object-v1"';
let app,
  snapshot = false;
try {
  app = await electron.launch({
    executablePath: executable
      ? path.resolve(executable)
      : path.join(
          project,
          process.platform === "win32"
            ? "node_modules/electron/dist/electron.exe"
            : "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        ),
    args: [
      ...(!executable ? [project] : []),
      `--user-data-dir=${path.join(tmp, "profile")}`,
    ],
    cwd: tmp,
    timeout: 60000,
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Preserve every existing format in memory; restore in finally, including on failure.
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    const items = await clipboard.read();
    globalThis.__folioOriginalClipboard = await Promise.all(
      items
        .filter((item) => item.types.length)
        .map(async (item) => {
          const parts = {};
          for (const type of item.types) parts[type] = await item.getType(type);
          return new ClipboardItem(parts);
        }),
    );
  });
  snapshot = true;
  await page
    .getByRole("button", { name: "Create blank PDF", exact: true })
    .click();
  await page.locator(".text-layer").waitFor();
  const shortcut = process.platform === "darwin" ? "Meta" : "Control";
  await app.evaluate(async ({ clipboard }) =>
    clipboard.writeText("Native clipboard 中文"),
  );
  await page.locator(".text-layer").focus();
  await page.keyboard.press(`${shortcut}+V`);
  const input = page.getByLabel("Text content", { exact: true });
  await expect(input).toHaveValue("Native clipboard 中文");
  // A normal paste inside the editor stays ordinary text input.
  await app.evaluate(async ({ clipboard }) =>
    clipboard.writeText("Native pasted 中文"),
  );
  await input.selectText();
  await page.keyboard.press(`${shortcut}+V`);
  await expect(input).toHaveValue("Native pasted 中文");
  await expect(page.locator(".object-hit")).toHaveCount(0);
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await page
    .getByRole("button", { name: "Rotate object right", exact: true })
    .click();
  await expect(page.getByLabel("Object rotation", { exact: true })).toHaveText(
    "90°",
  );
  await page.locator(".object-hit").first().focus();
  await page.keyboard.press(`${shortcut}+C`);
  await expect
    .poll(() =>
      app.evaluate(async ({ clipboard }, type) => clipboard.has(type), format),
    )
    .toBe(true);
  assert.equal(
    await app.evaluate(async ({ clipboard }) => clipboard.readText()),
    "Native pasted 中文",
  );
  await page.keyboard.press(`${shortcut}+V`);
  await expect(page.locator(".object-hit")).toHaveCount(2);
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 240, 120],
      0,
      { Font: { F: d.addSimpleFont(new m.Font("Helvetica")) } },
      ".88 .94 1 rg 0 0 240 120 re f .2 .4 .6 rg 12 12 40 96 re f BT /F 16 Tf 65 65 Td (Clipboard image) Tj ET",
    ),
  );
  const p = d.loadPage(0),
    pix = p.toPixmap(m.Matrix.identity, m.ColorSpace.DeviceRGB, false, false),
    png = Array.from(pix.asPNG());
  pix.destroy();
  p.destroy();
  d.destroy();
  await app.evaluate(
    async ({ clipboard, ClipboardItem }, bytes) =>
      clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        }),
      ]),
    png,
  );
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  await expect(page.locator(".object-hit")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Rotate object right", exact: true })
    .click();
  await expect(page.getByLabel("Object rotation", { exact: true })).toHaveText(
    "90°",
  );
  await page
    .getByRole("button", { name: "Copy selected object", exact: true })
    .click();
  await expect
    .poll(() =>
      app.evaluate(async ({ clipboard }, type) => clipboard.has(type), format),
    )
    .toBe(true);
  const external = await app.evaluate(async ({ clipboard, nativeImage }) => {
    const items = await clipboard.read(),
      item = items.find((item) => item.types.includes("image/png"));
    if (!item) return null;
    const blob = await item.getType("image/png");
    return nativeImage
      .createFromBuffer(Buffer.from(await blob.arrayBuffer()))
      .getSize();
  });
  assert.ok(external.height > external.width);
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  await expect(page.locator(".object-hit")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".object-hit")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".object-hit")).toHaveCount(4);
  const validation = await page.evaluate(async () => {
    try {
      await window.desktop.writeClipboard({
        kind: "text",
        text: "x".repeat(100001),
      });
      return "accepted";
    } catch (e) {
      return e.message;
    }
  });
  assert.match(validation, /100,000/);
  assert.equal(
    await app.evaluate(
      async ({ clipboard }, type) => clipboard.has(type),
      format,
    ),
    true,
  );
  const target = path.join(tmp, "clipboard-result.pdf");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, target);
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  await expect(
    page.getByText("Your edited copy has been saved.", { exact: true }),
  ).toBeVisible();
  const check = m.Document.openDocument(
      await fs.readFile(target),
      "application/pdf",
    ),
    cp = check.loadPage(0),
    metadata = cp.getObject().get("FolioObjects");
  const objects = [];
  metadata.forEach((record) =>
    objects.push(JSON.parse(record.get("Data").asString())),
  );
  assert.equal(objects.length, 4);
  assert.equal(objects.filter((o) => o.kind === "text").length, 2);
  assert.equal(objects.filter((o) => o.kind === "image").length, 2);
  assert.ok(objects.every((o) => Math.round(o.rotation) === 90));
  assert.equal(new Set(objects.map((o) => o.id)).size, 4);
  cp.destroy();
  check.destroy();
  await page.screenshot({
    path: path.join(project, "work/redesign/v07-native-clipboard.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    executable
      ? "Packaged clipboard/rotation workflow passed."
      : "Native clipboard/rotation workflow passed.",
  );
} finally {
  if (app) {
    if (snapshot)
      await app.evaluate(async ({ clipboard }) => {
        const items = globalThis.__folioOriginalClipboard;
        if (items.length) await clipboard.write(items);
        else clipboard.clear();
      });
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
      )
      .catch(() => {});
    await app.close();
  }
  await fs.rm(tmp, { recursive: true, force: true });
}
