import { test, expect } from "@playwright/test";
import fs from "node:fs";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
const sans = fs.readFileSync(
    new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
  ),
  serif = fs.readFileSync(
    new URL("../src/assets/NotoSerifCJKtc-Regular.otf", import.meta.url),
  );
test("font preview exposes substitution, imports an OTF font, and saves searchable serif text", async ({
  page,
}) => {
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      0,
      { Font: { F: d.addSimpleFont(new m.Font("Times-Roman")) } },
      "BT /F 16 Tf 40 740 Td (Original phrase) Tj ET",
    ),
  );
  const b = d.saveToBuffer(""),
    bytes = b.asUint8Array().slice();
  b.destroy();
  d.destroy();
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Serif.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });
  await expect(page.locator(".selectable-line")).toBeVisible();
  await page.locator(".selectable-line").dblclick();
  await page.getByLabel("Replacement text").fill("Original中文");
  const feedback = page.getByRole("status", { name: "Font preview" });
  await expect(feedback).toContainText("Substituted characters");
  await expect(feedback).toContainText(/Noto ?Serif/);
  await page.locator("input[type=file]").nth(2).setInputFiles({
    name: "Imported.otf",
    mimeType: "font/otf",
    buffer: serif,
  });
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue(/custom:/);
  await expect(feedback).not.toContainText("Substituted characters");
  await page.getByLabel("Text size", { exact: true }).fill("17");
  await expect(feedback).toContainText("17.00");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.locator(".selectable-line")).toHaveText("Original中文");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  const result = await download,
    path = await result.path(),
    engine = new PDFEngine(sans, serif);
  engine.open(new Uint8Array(fs.readFileSync(path!)));
  expect(engine.extract(0).trim()).toBe("Original中文");
  expect(engine.render(0, 0.2).lines[0].font).toContain("Serif");
  expect(engine.render(0, 0.2).lines[0].size).toBe(17);
});
const fixture = process.env.FOLIO_TEST_PDF;
test("local PDF in screenshot preserves PMingLiU and 12pt through the actual interface and export", async ({
  page,
}) => {
  test.skip(!fixture, "Local, private regression fixture");
  const source = fs.readFileSync(fixture!),
    engine = new PDFEngine(sans, serif);
  engine.open(source);
  const line = engine
    .render(1, 0.2)
    .lines.find((l) => l.text.startsWith("今年積極"))!;
  await page.goto("/");
  await page.locator("input[type=file]").first().setInputFiles({
    name: "Font-audit.pdf",
    mimeType: "application/pdf",
    buffer: source,
  });
  await expect(page.locator(".text-layer")).toBeVisible();
  await page.getByLabel("Page number").fill("2");
  await page.getByLabel("Page number").press("Enter");
  const target = page
    .locator(".selectable-line")
    .filter({ hasText: "今年積極開發" });
  await expect(target).toBeVisible();
  await target.dblclick();
  await page.getByLabel("Replacement text").fill(line.text + "123");
  const feedback = page.getByRole("status", { name: "Font preview" });
  await expect(feedback).toContainText("PMingLiU");
  await expect(feedback).toContainText("Original font preserved");
  await expect(feedback).toContainText("12.00");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(target).toContainText("123");
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  const download = await wait,
    path = await download.path(),
    check = new PDFEngine(sans, serif);
  check.open(new Uint8Array(fs.readFileSync(path!)));
  const edited = check
    .render(1, 0.2)
    .lines.find((l) => l.text === line.text + "123")!;
  expect(edited.font).toContain("PMingLiU");
  expect(edited.size).toBe(12);
  expect(edited.origin).toEqual(line.origin);
});
