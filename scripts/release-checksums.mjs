import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const platform = process.platform === "darwin" ? "macos" : "windows";
const file =
  process.platform === "darwin"
    ? `Pageline-${version}-macOS-Universal.dmg`
    : `Pageline-${version}-Windows-x64-Setup.exe`;
const directory = `release/v${version}`;
const digest = createHash("sha256")
  .update(await fs.readFile(path.join(directory, file)))
  .digest("hex");
const line = `${digest}  ${file}\n`;
await fs.writeFile(
  path.join(directory, `Pageline-${version}-SHA256SUMS-${platform}.txt`),
  line,
);
console.log(`Installer tested by this CI job: ${line.trim()}`);
