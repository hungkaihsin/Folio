import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import * as m from "mupdf";

test("booklet range, right binding, downloads and compact translated layout", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore with a sample document" })
    .click();
  await page.locator(".text-layer").waitFor();
  await page.getByRole("button", { name: "Print PDF", exact: true }).click();
  await page.getByLabel("Print layout").selectOption("booklet");
  await expect(page.locator(".booklet-sheet").first()).toHaveText("Blank1");
  await page.getByLabel("Booklet binding").selectOption("right");
  await expect(page.locator(".booklet-sheet").first()).toHaveText("1Blank");
  await page.getByLabel("Print pages").selectOption("range");
  await page.getByLabel("Print page range").fill("999");
  await expect(
    page.getByRole("button", { name: "Save print PDF" }),
  ).toBeDisabled();
  await page.getByLabel("Print page range").fill("1");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save print PDF" }).click();
  const download = await downloadEvent;
  const output = await download.path();
  const pdf = m.Document.openDocument(
    new Uint8Array(await fs.readFile(output!)),
    "application/pdf",
  );
  expect(pdf.countPages()).toBe(2);
  const side = pdf.loadPage(0),
    text = side.toStructuredText("");
  expect(text.asText()).toContain("PAGELINE");
  text.destroy();
  side.destroy();
  pdf.destroy();
  await page.getByRole("button", { name: "Close print" }).click();
  await page.getByLabel("Language / 語言").selectOption("zh-TW");
  await page.setViewportSize({ width: 1000, height: 680 });
  await page.getByRole("button", { name: "列印 PDF", exact: true }).click();
  await page.getByLabel("列印版面").selectOption("booklet");
  await expect(
    page.getByRole("button", { name: "儲存列印 PDF" }),
  ).toBeInViewport();
  await page.screenshot({ path: "work/printing/compact-dialog.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("update UI exposes an installer download and handles failed opening", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).desktop = {
      onAction: () => () => {},
      dirty: () => {},
      language: () => {},
      checkUpdates: async () => ({
        state: "available",
        currentVersion: "0.8.0",
        version: "0.9.0",
      }),
      downloadUpdate: async () => {
        throw new Error("offline");
      },
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByRole("dialog")).toContainText("0.9.0");
  await page.getByRole("button", { name: "Download installer" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Could not open the download page.",
  );
  await page.getByRole("button", { name: "Close updates" }).click();
});

test("Updates is visibly labeled on the compact home and document workspace in both languages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 680 });
  await page.goto("/");
  const updates = page.getByRole("button", {
    name: "Check for updates",
    exact: true,
  });
  await expect(updates).toBeInViewport();
  await expect(updates).toContainText("Updates");
  await updates.click();
  await expect(
    page.getByRole("dialog", { name: "Pageline updates" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close updates" }).click();
  await page
    .getByRole("button", { name: "Explore with a sample document" })
    .click();
  await page.locator(".text-layer").waitFor();
  await expect(updates).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Save copy", exact: true }),
  ).toBeInViewport();
  await page.getByLabel("Language / 語言").selectOption("zh-TW");
  const translated = page.getByRole("button", {
    name: "檢查更新",
    exact: true,
  });
  await expect(translated).toContainText("更新");
  await expect(translated).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "work/pageline-081-workspace.png" });
  await translated.click();
  await expect(
    page.getByRole("dialog", { name: "Pageline 更新" }),
  ).toBeVisible();
});
