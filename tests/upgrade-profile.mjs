import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

// Use a dedicated profile to verify that a real installer upgrade retains
// preferences. Never start either version against the user's own profile.
export async function upgradeProfile(binary, root, seed, version) {
  const profile = path.join(root, "upgrade-profile");
  await fs.mkdir(profile, { recursive: true });
  const app = await electron.launch({
    executablePath: binary,
    cwd: root,
    args: [`--user-data-dir=${profile}`],
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow();
    assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
    const language = page.getByLabel("Language / 語言");
    if (seed) await language.selectOption("zh-TW");
    await expect(language).toHaveValue("zh-TW");
    await app.evaluate(({ session }) =>
      session.defaultSession.flushStorageData(),
    );
    if (!seed)
      await expect(
        page.getByRole("button", { name: "檢查更新", exact: true }),
      ).toBeVisible();
  } finally {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      )
      .catch(() => {});
    await app.close().catch(() => {});
  }
}
