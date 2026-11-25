import { test, expect } from "@playwright/test";
import { PDFEngine } from "../src/engine";
import * as fs from "node:fs";
const font = fs.readFileSync(
  new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
);
test("sample document: existing text edits, annotation, undo/redo, pages, saved content", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your PDF workspace." }),
  ).toBeVisible();
  await page.screenshot({ path: "work/home.png" });
  await page
    .getByRole("button", { name: "Explore with a sample document" })
    .click();
  await expect(
    page.getByText("Welcome to Pageline.pdf", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loading")).toBeHidden();
  await expect(page.locator(".text-layer")).toBeVisible();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Edit line: Choose Edit text, then click this sentence.",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Replacement text")
    .fill("This sentence has been revised.");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(
    page.getByRole("button", {
      name: "Edit line: This sentence has been revised.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Edit line: Choose Edit text, then click this sentence.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Edit line: This sentence has been revised.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page.locator(".sheet").click({ position: { x: 120, y: 570 } });
  await page.getByLabel("Text content").fill("新增文字");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.locator(".loading")).toBeHidden();
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.locator(".sheet").click({ position: { x: 450, y: 180 } });
  await page.getByLabel("Text content").fill("Review the revised sentence.");
  await page.getByRole("button", { name: "Apply change" }).click();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(
    page.getByText("Review the revised sentence.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save copy" }).click();
  const result = await download;
  const saved = await result.path();
  const engine = new PDFEngine(font);
  engine.open(new Uint8Array(fs.readFileSync(saved!)));
  expect(engine.info().pages.length).toBe(2);
  expect(engine.extract(0)).toContain("This sentence has been revised.");
  expect(engine.extract(0)).not.toContain(
    "Choose Edit text, then click this sentence.",
  );
  expect(engine.extract(0)).toContain("新增文字");
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(page.locator(".loading")).toBeHidden();
  await page.screenshot({ path: "work/editor.png" });
  expect(errors).toEqual([]);
});
test("real file import, text search, highlights, and dirty-document guard", async ({
  page,
}) => {
  const engine = new PDFEngine(font);
  engine.create();
  engine.edit({
    kind: "text",
    page: 0,
    point: [50, 80],
    text: "A document to review.",
    size: 16,
    color: [0, 0, 0],
  });
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Review.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(engine.export()),
    });
  await expect(page.getByText("Review.pdf", { exact: true })).toBeVisible();
  await expect(page.locator(".loading")).toBeHidden();
  await page.getByLabel("Search document").fill("review");
  await page.getByLabel("Search document").press("Enter");
  await expect(page.getByText("1 of 1 matches")).toBeVisible();
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  const r = await page
    .locator(".selectable-line")
    .filter({ hasText: "A document to review." })
    .boundingBox();
  await page.mouse.move(r!.x + 1, r!.y + r!.height / 2);
  await page.mouse.down();
  await page.mouse.move(r!.x + r!.width - 1, r!.y + r!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
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
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Another.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(engine.export()),
    });
  await expect(
    page.getByRole("heading", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .last()
    .click();
  await expect(page.getByText("Review.pdf", { exact: true })).toBeVisible();
});
