import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import * as mupdf from "mupdf";
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
      process.platform === "win32"
        ? "node_modules/electron/dist/electron.exe"
        : "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
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
    .getByText("Welcome to Pageline.pdf", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.locator(".text-layer").waitFor();
  const runtime = await app.evaluate(() => process.versions.electron);
  assert.equal(runtime, "45.0.0");
  assert.equal(
    await app.evaluate(({ app }) => app.getVersion()),
    JSON.parse(await fs.readFile(path.join(project, "package.json"), "utf8"))
      .version,
  );
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
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page
    .getByRole("button", { name: "Select / move", exact: true })
    .click();
  const object = page.getByRole("button", {
    name: "Select text: Desktop editing works.",
    exact: true,
  });
  await object.waitFor();
  const bounds = await object.boundingBox();
  await object.hover();
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 25,
    bounds.y + bounds.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.locator(".loading").waitFor({ state: "hidden" });
  for (const format of ["png", "jpeg", "txt", "pdf"]) {
    const output = path.join(
      tmp,
      "native-export." + ({ jpeg: "jpg" }[format] || format),
    );
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, output);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByLabel("Export format").selectOption(format);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Export", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const data = await fs.readFile(output);
    assert.ok(data.length > 10);
    if (format === "png")
      assert.deepEqual(
        [...data.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
      );
    if (format === "jpeg")
      assert.deepEqual([...data.subarray(0, 2)], [255, 216]);
    if (format === "txt")
      assert.match(data.toString("utf8"), /Desktop editing works/);
    if (format === "pdf") {
      const doc = mupdf.Document.openDocument(
        new Uint8Array(data),
        "application/pdf",
      );
      const p = doc.loadPage(0),
        text = p.toStructuredText("");
      assert.match(text.asText(), /Desktop editing works/);
      text.destroy();
      p.destroy();
      doc.destroy();
    }
  }
  await page.getByLabel("Language / 語言").selectOption("zh-TW");
  await page.getByRole("button", { name: "匯出", exact: true }).waitFor();
  const labels = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().items.map((i) => i.label),
  );
  assert.ok(labels.includes("檔案"));
  await page.getByLabel("Language / 語言").selectOption("en");
  const fixture = process.env.FOLIO_TEST_PDF;
  if (fixture) {
    const original = await fs.readFile(fixture);
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, fixture);
    await page.getByRole("button", { name: "Open PDF", exact: true }).click();
    await page.getByText(path.basename(fixture), { exact: true }).waitFor();
    await page.locator(".text-layer").waitFor();
    await page.getByLabel("Page number").fill("2");
    await page.getByLabel("Page number").press("Enter");
    const targetLine = page
      .locator(".selectable-line")
      .filter({ hasText: "\u4eca\u5e74\u7a4d\u6975\u958b\u767c" });
    await targetLine.waitFor();
    const oldText = await targetLine.textContent();
    await targetLine.dblclick();
    const editor = page.getByLabel("Replacement text");
    await expect(page.locator(".modal-backdrop")).toHaveCount(0);
    await expect(editor).toHaveAttribute("data-font-ready", "true");
    await expect(editor).toHaveCSS("opacity", "1");
    await expect(editor).toHaveCSS("font-family", /folio-/);
    await editor.fill(oldText + "123");
    await page
      .getByRole("status", { name: "Font preview" })
      .getByText("Original font preserved.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Apply change" }).click();
    await expect(targetLine).toHaveText(oldText + "123");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const output = path.join(tmp, "local-font-fidelity.pdf");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, output);
    await page.getByRole("button", { name: "Save copy", exact: true }).click();
    await expect
      .poll(async () => (await fs.stat(output).catch(() => null))?.size || 0)
      .toBeGreaterThan(10000);
    const doc = mupdf.Document.openDocument(
        new Uint8Array(await fs.readFile(output)),
        "application/pdf",
      ),
      p = doc.loadPage(1),
      text = p.toStructuredText("");
    let row = "",
      matched = false;
    text.walk({
      beginLine: () => {
        row = "";
      },
      onChar: (char, _origin, font, size) => {
        row += char;
        if (row.startsWith("\u4eca\u5e74\u7a4d\u6975") && row.length > 4) {
          assert.match(font.getName(), /PMingLiU/);
          assert.equal(size, 12);
          matched = true;
        }
      },
    });
    assert.equal(matched, true);
    assert.match(text.asText(), /123/);
    text.destroy();
    p.destroy();
    doc.destroy();
    assert.deepEqual(await fs.readFile(fixture), original);
    assert.equal(
      await page.evaluate(() =>
        window.desktop.findFont("FolioDefinitelyMissingFont"),
      ),
      null,
    );
    const invalid = await page.evaluate(async () => {
      try {
        await window.desktop.findFont("");
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(invalid, true);
    // Reopen the original table, exercise strict matching, and cancel the draft.
    await page.getByRole("button", { name: "Open PDF", exact: true }).click();
    await page.getByText(path.basename(fixture), { exact: true }).waitFor();
    const cell = page
      .locator(".selectable-line")
      .filter({ hasText: "職稱：秘書長" });
    await cell.dblclick();
    await page.getByLabel("Replacement text").fill("職稱：測試123");
    const feedback = page.getByRole("status", { name: "Font preview" });
    await expect(feedback).toContainText("MicrosoftJhengHei");
    await expect(feedback).toContainText("12.00");
    await expect(
      page.getByText("Checking installed fonts…", { exact: true }),
    ).toBeHidden();
    if (
      await page
        .getByLabel("Allow substitute characters (appearance may differ)")
        .count()
    ) {
      await expect(
        page.getByRole("button", { name: "Apply change", exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("Allow substitute characters (appearance may differ)")
        .check();
      await expect(
        page.getByRole("button", { name: "Apply change", exact: true }),
      ).toBeEnabled();
    }
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Highlight", exact: true }).click();
    const selectedCell = await page
      .locator(".selectable-line")
      .filter({ hasText: "職稱：秘書長" })
      .boundingBox();
    await page.mouse.move(
      selectedCell.x + 1,
      selectedCell.y + selectedCell.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      selectedCell.x + selectedCell.width - 1,
      selectedCell.y + selectedCell.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeEnabled();
    const highlighted = path.join(tmp, "native-selected-highlight.pdf");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, highlighted);
    await page.getByRole("button", { name: "Save copy", exact: true }).click();
    await expect
      .poll(
        async () => (await fs.stat(highlighted).catch(() => null))?.size || 0,
      )
      .toBeGreaterThan(10000);
    const hd = mupdf.Document.openDocument(
        new Uint8Array(await fs.readFile(highlighted)),
        "application/pdf",
      ),
      hp = hd.loadPage(0);
    const mark = hp.getAnnotations().find((a) => a.getType() === "Highlight");
    assert.ok(mark);
    assert.equal(mark.getQuadPoints().length, 1);
    assert.equal(mark.getContents(), "");
    assert.equal(
      hp.getAnnotations().filter((a) => a.getType() === "Text").length,
      0,
    );
    await page.getByRole("button", { name: "Comments", exact: true }).click();
    await expect(
      page.getByText("No comments yet.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Markup", exact: true }).click();
    await expect(
      page
        .getByLabel("Page markup")
        .locator('[data-annotation-type="Highlight"]'),
    ).toHaveCount(1);
    hp.destroy();
    hd.destroy();
    assert.deepEqual(await fs.readFile(fixture), original);
  }
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
