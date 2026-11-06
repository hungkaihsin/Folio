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
function fixture() {
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      0,
      {
        Font: {
          F: d.addSimpleFont(new m.Font("Helvetica")),
          S: d.addSimpleFont(new m.Font("Times-Roman")),
        },
      },
      "BT /F 16 Tf 40 740 Td (First selected line.) Tj 0 -28 Td (Second selected line.) Tj ET BT /S 18 Tf .6 .1 .2 rg 40 620 Td (Nearby serif style) Tj ET",
    ),
  );
  const b = d.saveToBuffer(""),
    bytes = b.asUint8Array().slice();
  b.destroy();
  d.destroy();
  return bytes;
}
async function open(page: any, bytes: Uint8Array) {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Font selection.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });
  await expect(page.locator(".selectable-line").first()).toBeVisible();
}
async function saved(page: any) {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  const p = await (await wait).path();
  return new Uint8Array(fs.readFileSync(p!));
}

test("Read selects actual PDF text in reverse across lines, copies it, and creates one multiline native highlight", async ({
  page,
}) => {
  await open(page, fixture());
  const first = await page
      .locator(".selectable-line")
      .filter({ hasText: "First selected line." })
      .boundingBox(),
    second = await page
      .locator(".selectable-line")
      .filter({ hasText: "Second selected line." })
      .boundingBox();
  await page.mouse.move(
    second!.x + second!.width - 1,
    second!.y + second!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(first!.x + 1, first!.y + first!.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.locator(".text-selection-quads polygon")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Highlight selected text", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "work/inline-audit/text-selection-highlight.png",
  });
  const copied = await page.getByLabel("PDF text selection").evaluate((el) => {
    const data = new DataTransfer();
    el.dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    return data.getData("text/plain");
  });
  expect(copied).toContain("First selected line.");
  expect(copied).toContain("Second selected line.");
  expect(copied).not.toContain("Nearby serif style");
  await page
    .getByRole("button", { name: "Highlight selected text", exact: true })
    .click();
  await expect(page.locator(".loading")).toBeHidden();
  const d = m.Document.openDocument(await saved(page), "application/pdf"),
    p = d.loadPage(0) as m.PDFPage;
  expect(p.getAnnotations()).toHaveLength(1);
  expect(p.getAnnotations()[0].getQuadPoints()).toHaveLength(2);
  expect(p.getAnnotations()[0].getContents()).toBe("");
  p.destroy();
  d.destroy();
});

test("Highlight tool marks selected characters rather than an arbitrary rectangular area", async ({
  page,
}) => {
  await open(page, fixture());
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  const line = await page
    .locator(".selectable-line")
    .filter({ hasText: "First selected line." })
    .boundingBox();
  await page.mouse.move(line!.x + 1, line!.y + line!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    line!.x + line!.width * 0.45,
    line!.y + line!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  const d = m.Document.openDocument(await saved(page), "application/pdf"),
    p = d.loadPage(0) as m.PDFPage,
    a = p.getAnnotations()[0];
  expect(a.getType()).toBe("Highlight");
  expect(a.getQuadPoints()).toHaveLength(1);
  expect(a.getContents()).toBe("");
  const width =
    Math.max(a.getQuadPoints()[0][2], a.getQuadPoints()[0][6]) -
    Math.min(a.getQuadPoints()[0][0], a.getQuadPoints()[0][4]);
  const full = p.search("First selected line.")[0][0];
  expect(width).toBeLessThan(Math.abs(full[2] - full[0]));
  p.destroy();
  d.destroy();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(
    page.getByText("No comments yet.", { exact: true }),
  ).toBeVisible();
});

test("Match nearby text adopts the detected font, size and color without changing the draft or baseline", async ({
  page,
}) => {
  const bytes = fixture(),
    before = new PDFEngine(sans, serif);
  before.open(bytes);
  const original = before.render(0, 0.2).lines[0];
  await open(page, bytes);
  await page
    .locator(".selectable-line")
    .filter({ hasText: "First selected line." })
    .dblclick();
  await page.getByLabel("Replacement text").fill("Revised with sampled style");
  await page
    .getByRole("button", { name: "Match nearby text", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Match style from: Nearby serif style",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Replacement text")).toHaveValue(
    "Revised with sampled style",
  );
  await expect(page.getByLabel("Text size", { exact: true })).toHaveValue("18");
  await expect(
    page.getByRole("status", { name: "Font preview" }),
  ).toContainText("Matched font available.");
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  const e = new PDFEngine(sans, serif);
  e.open(await saved(page));
  const line = e
    .render(0, 0.2)
    .lines.find((l) => l.text === "Revised with sampled style")!;
  expect(line.font).toMatch(/Times|NimbusRoman/);
  expect(line.size).toBe(18);
  expect(line.origin).toEqual(original.origin);
  expect(line.color[0]).toBeCloseTo(0.6, 2);
});

const local = process.env.FOLIO_TEST_PDF;
test("actual screenshot cell detects JhengHei 12pt and requires explicit permission for missing glyph substitution", async ({
  page,
}) => {
  test.skip(!local, "Private local regression fixture");
  await open(page, fs.readFileSync(local!));
  await page
    .locator(".selectable-line")
    .filter({ hasText: "職稱：秘書長" })
    .dblclick();
  await page.getByLabel("Replacement text").fill("職稱：測試123");
  const preview = page.getByRole("status", { name: "Font preview" });
  await expect(preview).toContainText("MicrosoftJhengHeiRegular");
  await expect(preview).toContainText("12.00");
  await expect(preview).toContainText("測 試");
  await expect(
    page.getByRole("button", { name: "Apply change", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: "work/inline-audit/cell-font-check.png" });
  await page
    .locator(".inspector")
    .screenshot({ path: "work/inline-audit/font-match-controls.png" });
  await page
    .getByLabel("Allow substitute characters (appearance may differ)")
    .check();
  await expect(
    page.getByRole("button", { name: "Apply change", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Allow substitute characters (appearance may differ)")
    .uncheck();
  await expect(
    page.getByRole("button", { name: "Apply change", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Font", { exact: true }).selectOption("cjk");
  await expect(
    page.getByRole("button", { name: "Apply change", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  const e = new PDFEngine(sans, serif);
  e.open(await saved(page));
  const line = e.render(0, 0.2).lines.find((l) => l.text === "職稱：測試123")!;
  expect(line.font).toMatch(/NotoSans/);
  expect(line.size).toBe(12);
});
