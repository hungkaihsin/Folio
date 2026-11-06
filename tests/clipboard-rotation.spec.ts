import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PDFEngine } from "../src/engine";
const font = fs.readFileSync(
  new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let items: ClipboardItem[] = [];
    Object.defineProperty(navigator, "clipboard", {
      value: {
        read: async () => items,
        write: async (value: ClipboardItem[]) => {
          items = value;
        },
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create blank PDF", exact: true })
    .click();
  await expect(page.locator(".text-layer")).toBeVisible();
});
async function save(page: any) {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  const e = new PDFEngine(font);
  e.open(fs.readFileSync((await (await wait).path())!));
  return e;
}
async function textClipboard(page: any, text: string) {
  await page.evaluate(async (text: string) => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
  }, text);
}

test("external text pastes inline; rotated text remains editable; copying and pasting keeps formatting and undo is independent", async ({
  page,
}) => {
  await textClipboard(page, "Paste this 中文");
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  const input = page.getByLabel("Text content", { exact: true });
  await expect(input).toHaveValue("Paste this 中文");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await page
    .getByRole("button", { name: "Rotate object right", exact: true })
    .click();
  await expect(page.getByLabel("Object rotation", { exact: true })).toHaveText(
    "90°",
  );
  await page
    .getByRole("button", { name: "Edit selected text", exact: true })
    .click();
  const replacement = page.getByLabel("Replacement text", { exact: true });
  await expect(replacement).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
  await replacement.fill("Edited 中文");
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await page
    .getByRole("button", { name: "Copy selected object", exact: true })
    .click();
  await expect(
    page.getByText("Selected object copied.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  await expect(page.locator(".object-hit")).toHaveCount(2);
  let e = await save(page);
  let objects = e.render(0, 0.2).objects;
  expect(objects).toHaveLength(2);
  expect(objects.map((o) => o.rotation)).toEqual([90, 90]);
  expect(objects.map((o) => o.size)).toEqual([14, 14]);
  expect(new Set(objects.map((o) => o.id)).size).toBe(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".object-hit")).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".object-hit")).toHaveCount(2);
  await page.screenshot({ path: "work/redesign/v07-rotated-text.png" });
});
test("clipboard image becomes a movable image, rotates, copies and exports as separate actual objects", async ({
  page,
}) => {
  const e = new PDFEngine(font);
  e.create();
  const png = e.render(0, 0.1).png;
  await page.evaluate(async (bytes: number[]) => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      }),
    ]);
  }, Array.from(png));
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  await expect(page.locator(".object-hit")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Rotate object right", exact: true })
    .click();
  await expect(page.getByLabel("Object rotation", { exact: true })).toHaveText(
    "90°",
  );
  await page.getByLabel("Object x", { exact: true }).fill("120");
  await page
    .getByRole("button", { name: "Apply position / size", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Copy selected object", exact: true })
    .click();
  await expect(
    page.getByText("Selected object copied.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  await expect(page.locator(".object-hit")).toHaveCount(2);
  const result = await save(page);
  const objects = result.render(0, 0.2).objects;
  expect(objects.map((o) => o.kind)).toEqual(["image", "image"]);
  expect(objects.map((o) => o.rotation)).toEqual([90, 90]);
  expect(objects[0].rect[0]).toBeCloseTo(120, 1);
  await page.screenshot({ path: "work/redesign/v07-image-controls.png" });
});
test("paste events stay out of text fields, cancel preserves PDF, excessive text is rejected and Chinese controls fit a small window", async ({
  page,
}) => {
  await textClipboard(page, "A draft to cancel");
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  const input = page.getByLabel("Text content", { exact: true });
  await input.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "input text");
    el.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
    );
  });
  await expect(input).toHaveValue("A draft to cancel");
  await input.press("Escape");
  expect((await save(page)).extract(0).trim()).toBe("");
  await textClipboard(page, "x".repeat(100001));
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("100,000");
  await page
    .getByRole("button", { name: "Dismiss error", exact: true })
    .click();
  await textClipboard(page, "Small window");
  await page
    .getByRole("button", { name: "Paste onto page", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await page.setViewportSize({ width: 1000, height: 680 });
  await page.getByLabel("Language / 語言").selectOption("zh-TW");
  for (const label of ["貼到頁面", "複製選取物件", "向右旋轉物件"]) {
    const button = page.getByRole("button", { name: label, exact: true });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1000);
    expect(box.y + box.height).toBeLessThanOrEqual(680);
  }
  await page.screenshot({ path: "work/redesign/v07-compact-zh.png" });
});
