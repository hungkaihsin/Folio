import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
if (process.platform !== "darwin")
  throw Error("Generate the committed native icons on macOS.");
const design = JSON.parse(await fs.readFile("build/icon-design.json", "utf8"));
const paths = design.paths
  .map(
    (shape) =>
      `<path fill="${shape.fill}" fill-rule="evenodd" d="${shape.commands.map((command) => command.join(" ")).join(" ")}"/>`,
  )
  .join("");
await fs.writeFile(
  "src/assets/pageline-mark.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect x="32" y="32" width="960" height="960" rx="210" fill="${design.background}"/>${paths}</svg>\n`,
);
await exec("xcrun", ["swift", "scripts/make-icon.swift"], { timeout: 120000 });
const frames = "work/pageline-icon-frames";
const iconset = "work/Pageline.iconset";
await fs.mkdir(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  await fs.copyFile(
    `${frames}/${size}.png`,
    `${iconset}/icon_${size}x${size}.png`,
  );
  await fs.copyFile(
    `${frames}/${size * 2}.png`,
    `${iconset}/icon_${size}x${size}@2x.png`,
  );
}
await exec("iconutil", ["-c", "icns", iconset, "-o", "build/icon.icns"]);
const sizes = [16, 24, 32, 48, 64, 128, 256],
  images = await Promise.all(
    sizes.map((size) => fs.readFile(`${frames}/${size}.png`)),
  );
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const pos = 6 + index * 16;
  header[pos] = size === 256 ? 0 : size;
  header[pos + 1] = header[pos];
  header.writeUInt16LE(1, pos + 4);
  header.writeUInt16LE(32, pos + 6);
  header.writeUInt32LE(images[index].length, pos + 8);
  header.writeUInt32LE(offset, pos + 12);
  offset += images[index].length;
});
await fs.writeFile("build/icon.ico", Buffer.concat([header, ...images]));
await fs.copyFile(`${frames}/1024.png`, "build/icon.png");
await fs.mkdir("electron/assets", { recursive: true });
await fs.copyFile("build/icon.png", "electron/assets/icon.png");
console.log(
  "Generated Pageline SVG, PNG, ICNS and multi-resolution ICO from the shared vector design.",
);
