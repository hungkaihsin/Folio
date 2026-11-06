import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PDFEngine } from "../src/engine";
import * as m from "mupdf";
const font = fs.readFileSync(
  new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
);
test("added text and images can be selected, dragged, resized, edited and exported with persistent positions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create blank PDF", exact: true })
    .click();
  await expect(page.locator(".loading")).toBeHidden();
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page.locator(".sheet").click({ position: { x: 100, y: 100 } });
  await page.getByLabel("Text content", { exact: true }).fill("Movable text");
  await page.getByRole("button", { name: "Apply change" }).click();
  const object = page.getByRole("button", {
    name: "Select text: Movable text",
    exact: true,
  });
  await expect(object).toBeVisible();
  const before = await object.boundingBox();
  await object.hover();
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width / 2 + 80,
    before!.y + before!.height / 2 + 60,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.locator(".loading")).toBeHidden();
  const after = await object.boundingBox();
  expect(after!.x - before!.x).toBeCloseTo(80, 0);
  expect(after!.y - before!.y).toBeCloseTo(60, 0);
  await page.getByRole("button", { name: "Edit selected text" }).click();
  await page.getByLabel("Replacement text").fill("移動後的文字");
  await page.getByLabel("Font", { exact: true }).selectOption("cjk");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(
    page.getByRole("button", {
      name: "Select text: 移動後的文字",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add image", exact: true }).click();
  await page.locator(".sheet").click({ position: { x: 250, y: 200 } });
  const source = new PDFEngine(font);
  source.create();
  source.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "Picture",
    size: 24,
    color: [1, 0, 0],
  });
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "image.png",
      mimeType: "image/png",
      buffer: Buffer.from(source.render(0, 0.2).png),
    });
  const image = page
    .locator(".object-hit")
    .filter({ hasNotText: "unused" })
    .last();
  await expect(page.locator(".object-hit")).toHaveCount(2);
  const ib = await image.boundingBox();
  await image.hover();
  await page.mouse.down();
  await page.mouse.move(
    ib!.x + ib!.width / 2 + 35,
    ib!.y + ib!.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(page.locator(".loading")).toBeHidden();
  const handle = page.getByRole("button", { name: "Resize selected object" });
  const hb = await handle.boundingBox();
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(hb!.x + 45, hb!.y + 65, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".loading")).toBeHidden();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export file" })).toBeVisible();
  let download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Export", exact: true })
    .click();
  const saved = await (await download).path();
  const result = new PDFEngine(font);
  result.open(new Uint8Array(fs.readFileSync(saved!)));
  expect(result.render(0, 0.2).objects).toHaveLength(2);
  expect(result.extract(0)).toContain("移動後的文字");
  expect(
    result.render(0, 0.2).objects.find((o) => o.kind === "image")!.rect[0],
  ).toBeGreaterThan(200);
  await page.screenshot({ path: "work/improvements-editor.png" });
});
test("interface switches language and persists; Chinese input is independent of interface language", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Language / 語言").selectOption("zh-TW");
  await expect(
    page.getByRole("button", { name: "建立空白 PDF" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Language / 語言")).toHaveValue("zh-TW");
  await page.getByRole("button", { name: "建立空白 PDF" }).click();
  await expect(page.locator(".loading")).toBeHidden();
  await page.getByRole("button", { name: "新增文字", exact: true }).click();
  await page.locator(".sheet").click({ position: { x: 90, y: 100 } });
  await page.getByLabel("文字內容", { exact: true }).fill("繁體中文輸入");
  await page.getByRole("button", { name: "套用變更" }).click();
  await expect(
    page.getByRole("button", { name: "選取 文字: 繁體中文輸入" }),
  ).toBeVisible();
  await page.getByLabel("Language / 語言").selectOption("en");
  await expect(
    page.getByRole("button", { name: "Select text: 繁體中文輸入" }),
  ).toBeVisible();
});
test("existing text can be edited by double-clicking in read mode; validation keeps draft", async ({
  page,
}) => {
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      0,
      { Font: { F: d.addSimpleFont(new m.Font("Helvetica")) } },
      "BT /F 16 Tf 40 740 Td (Original content) Tj ET",
    ),
  );
  const b = d.saveToBuffer("");
  const bytes = b.asUint8Array().slice();
  b.destroy();
  d.destroy();
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Original.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });
  await expect(page.locator(".selectable-line")).toBeVisible();
  await page.locator(".selectable-line").dblclick();
  await page.getByLabel("Replacement text").fill("Invalid\nline break");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("alert")).toContainText("one line");
  await expect(page.getByLabel("Replacement text")).toHaveValue(
    "Invalid\nline break",
  );
  await page.getByLabel("Replacement text").fill("New content");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.locator(".selectable-line")).toHaveText("New content");
});
test("export dialog supports a page range, PNG ZIP, JPEG and plain text", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore with a sample document" })
    .click();
  await expect(page.locator(".text-layer")).toBeVisible();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toBeVisible();
  for (const format of ["png", "jpeg", "txt", "pdf"]) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByLabel("Export format").selectOption(format);
    if (format === "pdf") {
      await page.getByLabel("Export pages").selectOption("range");
      await page.getByLabel("Page range", { exact: true }).fill("2");
    }
    if (format === "jpeg")
      await page.getByLabel("Export pages").selectOption("current");
    const wait = page.waitForEvent("download");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Export", exact: true })
      .click();
    const file = await wait;
    expect(file.suggestedFilename()).toMatch(
      format === "png"
        ? /\.zip$/
        : format === "jpeg"
          ? /\.jpg$/
          : format === "txt"
            ? /\.txt$/
            : /\.pdf$/,
    );
  }
});
