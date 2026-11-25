import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const platform =
  process.platform === "darwin"
    ? "macOS-Universal.dmg"
    : "Windows-x64-Setup.exe";
const file = `Pageline-0.8.0-${platform}`;
const expected =
  process.platform === "darwin"
    ? "442de208ce93e89b8a007c3a76852cce66616bae04b70ee802152848a5b798b0"
    : "a853da539a90c52fb44e9190d57f04992185110b0f240f0a18e4765831d397fb";
assert.ok(["darwin", "win32"].includes(process.platform));
assert.ok(
  process.env.RUNNER_TEMP && process.env.GITHUB_ENV,
  "Use the disposable CI runner.",
);
const target = path.join(process.env.RUNNER_TEMP, file);
const response = await fetch(
  `https://github.com/hungkaihsin/Folio/releases/download/v0.8.0/${file}`,
  { signal: AbortSignal.timeout(180000) },
);
assert.equal(response.status, 200);
const hash = createHash("sha256"),
  handle = await fs.open(target, "w");
try {
  for await (const bytes of response.body) {
    hash.update(bytes);
    await handle.writeFile(bytes);
  }
} finally {
  await handle.close();
}
assert.equal(
  hash.digest("hex"),
  expected,
  "Previous installer checksum mismatch",
);
await fs.appendFile(
  process.env.GITHUB_ENV,
  `PAGELINE_PREVIOUS_INSTALLER=${target}\n`,
);
console.log(`Verified published 0.8.0 upgrade baseline: ${file}`);
