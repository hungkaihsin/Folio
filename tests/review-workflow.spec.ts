import { test, expect } from "@playwright/test";
import fs from "node:fs";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
function fixture(legacy = false) {
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      0,
      { Font: { F: d.addSimpleFont(new m.Font("Helvetica")) } },
      "BT /F 16 Tf 40 740 Td (First passage to review.) Tj 0 -32 Td (Second passage to review.) Tj ET",
    ),
  );
  if (legacy) {
    const p = d.loadPage(0);
    const a = p.createAnnotation("Highlight");
    a.setQuadPoints([[40, 88, 200, 88, 40, 107, 200, 107]]);
    a.setContents("Legacy highlighted quotation");
    a.update();
    const n = p.createAnnotation("Text");
    n.setRect([320, 150, 340, 170]);
    n.setContents("An existing written comment");
    n.update();
    p.destroy();
  }
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
      name: "Review.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });
  await expect(page.locator(".text-layer")).toBeVisible();
}
async function highlight(page: any, text: string) {
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  const r = await page
    .locator(".selectable-line")
    .filter({ hasText: text })
    .boundingBox();
  await page.mouse.move(r!.x + 1, r!.y + r!.height / 2);
  await page.mouse.down();
  await page.mouse.move(r!.x + r!.width - 1, r!.y + r!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".loading")).toBeHidden();
}
async function save(page: any) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  return fs.readFileSync((await (await download).path())!);
}

test("highlights stay in Markup; only the Comment button creates written comments; deleting by category retains correct indices", async ({
  page,
}) => {
  await open(page, fixture());
  await highlight(page, "First passage to review.");
  await expect(
    page.getByLabel("Page markup").locator(".markup-item"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(
    page.getByText("No comments yet.", { exact: true }),
  ).toBeVisible();
  let d = m.Document.openDocument(await save(page), "application/pdf"),
    p = d.loadPage(0) as m.PDFPage;
  expect(p.getAnnotations().map((a) => a.getType())).toEqual(["Highlight"]);
  expect(p.getAnnotations()[0].getContents()).toBe("");
  p.destroy();
  d.destroy();
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.locator(".sheet").click({ position: { x: 400, y: 360 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("Please check the wording.");
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(
    page.getByLabel("Page comments").locator(".comment-item"),
  ).toHaveCount(1);
  await expect(
    page.getByText("Please check the wording.", { exact: true }),
  ).toBeVisible();
  await highlight(page, "Second passage to review.");
  await expect(
    page.getByLabel("Page markup").locator(".markup-item"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(
    page.getByLabel("Page comments").locator(".comment-item"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Markup", exact: true }).click();
  await page
    .getByLabel("Page markup")
    .getByRole("button", { name: "Remove annotation 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Page markup").locator(".markup-item"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page
    .getByLabel("Page comments")
    .getByRole("button", { name: "Remove annotation 1", exact: true })
    .click();
  await expect(
    page.getByText("No comments yet.", { exact: true }),
  ).toBeVisible();
  d = m.Document.openDocument(await save(page), "application/pdf");
  p = d.loadPage(0) as m.PDFPage;
  expect(p.getAnnotations().map((a) => a.getType())).toEqual(["Highlight"]);
  expect(p.getAnnotations()[0].getContents()).toBe("");
  p.destroy();
  d.destroy();
});

test("existing highlight text is preserved as markup metadata and never presented as a new comment", async ({
  page,
}) => {
  await open(page, fixture(true));
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(
    page.getByText("An existing written comment", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Page comments").locator(".comment-item"),
  ).toHaveCount(1);
  await expect(
    page.getByText("Legacy highlighted quotation", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Markup", exact: true }).click();
  await expect(
    page.getByLabel("Page markup").locator(".markup-item"),
  ).toHaveCount(1);
  await page.getByText("Existing annotation text", { exact: true }).click();
  await expect(
    page.getByText("Legacy highlighted quotation", { exact: true }),
  ).toBeVisible();
  const d = m.Document.openDocument(await save(page), "application/pdf"),
    p = d.loadPage(0) as m.PDFPage;
  expect(p.getAnnotations()[0].getContents()).toBe(
    "Legacy highlighted quotation",
  );
  expect(p.getAnnotations()[1].getContents()).toBe(
    "An existing written comment",
  );
  p.destroy();
  d.destroy();
});

test("modern workspace keeps Highlight and Comment readable at the minimum window size and in Chinese", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 680 });
  await page.goto("/");
  await page.screenshot({ path: "work/redesign/home-compact.png" });
  await page
    .getByRole("button", {
      name: "Explore with a sample document",
      exact: true,
    })
    .click();
  await expect(page.locator(".loading")).toBeHidden();
  for (const label of ["Highlight", "Comment", "Save copy"]) {
    const r = await page
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    expect(r!.x).toBeGreaterThanOrEqual(0);
    expect(r!.x + r!.width).toBeLessThanOrEqual(1000);
  }
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add a comment", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "work/redesign/editor-compact.png" });
  await page.getByLabel("Language / 語言").selectOption("zh-TW");
  await expect(
    page
      .locator(".toolbar")
      .getByRole("button", { name: "新增留言", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "標記", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "work/redesign/editor-compact-zh.png" });
});
