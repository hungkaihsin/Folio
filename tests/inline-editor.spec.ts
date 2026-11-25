import { test, expect } from "@playwright/test";
import fs from "node:fs";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
const sans = fs.readFileSync(
  new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
);
const serif = fs.readFileSync(
  new URL("../src/assets/NotoSerifCJKtc-Regular.otf", import.meta.url),
);
function fixture() {
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      0,
      { Font: { F: d.addSimpleFont(new m.Font("Times-Roman")) } },
      "BT /F 16 Tf 40 740 Td (Original phrase) Tj 0 -35 Td (Keep this neighbor.) Tj ET",
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
      name: "Inline.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });
  await expect(page.locator(".selectable-line").first()).toBeVisible();
}

test("existing text edits in place, cancels without mutation, retains drafts and applies color with Enter", async ({
  page,
}) => {
  await open(page, fixture());
  await expect(page.getByLabel("Check for updates")).toBeVisible();
  await page
    .locator(".selectable-line")
    .filter({ hasText: "Original phrase" })
    .dblclick();
  const input = page.getByLabel("Replacement text");
  await expect(input).toBeVisible();
  await expect(page.locator(".modal-backdrop")).toHaveCount(0);
  const sheet = await page.locator(".sheet").boundingBox(),
    box = await input.boundingBox();
  expect(box!.x).toBeGreaterThan(sheet!.x);
  expect(box!.y).toBeGreaterThan(sheet!.y);
  await input.fill("Draft to cancel");
  await input.press("Escape");
  await expect(
    page.locator(".selectable-line").filter({ hasText: "Original phrase" }),
  ).toBeVisible();
  await page
    .locator(".selectable-line")
    .filter({ hasText: "Original phrase" })
    .dblclick();
  await input.fill("Revised phrase");
  await page
    .getByRole("button", { name: "Add text", exact: true })
    .click({ force: true })
    .catch(() => {});
  await expect(input).toHaveValue("Revised phrase");
  await page.getByLabel("Text color", { exact: true }).fill("#aa2255");
  await expect(
    page.getByRole("button", { name: "Apply change" }),
  ).toBeEnabled();
  await input.press("Enter");
  await expect(page.locator(".inline-text-input")).toHaveCount(0);
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  const saved = await (await wait).path();
  const e = new PDFEngine(sans, serif);
  e.open(fs.readFileSync(saved!));
  const line = e.render(0, 0.2).lines.find((l) => l.text === "Revised phrase")!;
  expect(line.font).toMatch(/Times|NimbusRoman/);
  expect(line.size).toBe(16);
  expect(line.color[0]).toBeCloseTo(170 / 255, 2);
  expect(e.extract(0)).toContain("Keep this neighbor.");
});

test("new multiline text stays on page; composition Enter does not apply and Cmd/Ctrl+Enter does", async ({
  page,
}) => {
  await open(page, fixture());
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page.locator(".sheet").click({ position: { x: 100, y: 300 } });
  const input = page.getByLabel("Text content");
  await input.fill("中文第一行\nSecond line");
  await expect(page.locator(".modal-backdrop")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Apply change" }),
  ).toBeEnabled();
  await input.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  await expect(input).toBeVisible();
  await input.press("Control+Enter");
  await expect(input).toHaveCount(0);
  await expect(page.locator(".loading")).toBeHidden();
  await page
    .getByRole("button", { name: "Read & select", exact: true })
    .click();
  await expect(
    page.locator(".selectable-line").filter({ hasText: "中文第一行" }),
  ).toBeVisible();
});

const local = process.env.FOLIO_TEST_PDF;
test("screenshot passage uses real embedded browser glyphs while typing and PMingLiU after saving", async ({
  page,
}) => {
  test.skip(!local, "Private local regression fixture");
  const source = fs.readFileSync(local!);
  const e = new PDFEngine(sans, serif);
  e.open(source);
  const line = e
    .render(1, 0.1)
    .lines.find((l) => l.text.startsWith("研發並編寫"))!;
  await open(page, source);
  await page.getByLabel("Page number").fill("2");
  await page.getByLabel("Page number").press("Enter");
  await page
    .locator(".selectable-line")
    .filter({ hasText: "研發並編寫" })
    .dblclick();
  const input = page.getByLabel("Replacement text");
  await expect(input).toHaveAttribute("data-font-ready", "true");
  await expect(input).toHaveCSS("opacity", "1");
  const preview = await input.evaluate((el) => {
    const style = getComputedStyle(el);
    const c = document.createElement("canvas").getContext("2d")!;
    // Measure at the PDF point size: fractional zoom sizes are quantized
    // by browser text metrics and can introduce subpixel rounding.
    c.font = `12px ${style.fontFamily}`;
    c.fontKerning = "none";
    return {
      family: style.fontFamily,
      width: c.measureText((el as HTMLTextAreaElement).value).width,
      fontSize: 12,
      loaded: [...document.fonts]
        .filter((f) => f.family.startsWith("folio-"))
        .map((f) => f.status),
    };
  });
  expect(preview.family).toContain("folio-");
  expect(preview.loaded.every((s) => s === "loaded")).toBe(true);
  expect((preview.width / preview.fontSize) * 12).toBeCloseTo(
    e.inspectFont({ page: 1, line: line.id, text: line.text, font: "original" })
      .width!,
    1,
  );
  await input.fill(line.text + "123");
  await expect(
    page.getByRole("button", { name: "Apply change" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("status", { name: "Font preview" }),
  ).toContainText("Original font preserved.");
  await input.evaluate((el) => {
    (el as HTMLTextAreaElement).setSelectionRange(
      (el as HTMLTextAreaElement).value.length,
      (el as HTMLTextAreaElement).value.length,
    );
  });
  expect((await input.boundingBox())!.width).toBeLessThan(420);
  await page.screenshot({ path: "work/inline-audit/on-page-editor.png" });
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  const path = await (await wait).path();
  const check = new PDFEngine(sans, serif);
  check.open(fs.readFileSync(path!));
  const saved = check
    .render(1, 0.1)
    .lines.find((l) => l.text === line.text + "123")!;
  expect(saved.font).toContain("PMingLiU");
  expect(saved.size).toBe(12);
  expect(saved.origin).toEqual(line.origin);
  expect(check.extract(1)).toContain("的劇本");
  expect(fs.readFileSync(local!)).toEqual(source);
  await page.screenshot({ path: "work/inline-audit/applied-passage.png" });
});
