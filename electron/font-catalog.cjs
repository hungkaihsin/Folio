const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const fontKey = (name) =>
  name
    .replace(/^(?:[A-Z]{6}\+)+/, "")
    .replace(/[\s_-]/g, "")
    .replace(/regular$/i, "")
    .toLowerCase();
const MAX_FONT = 40 * 1024 * 1024;
function fontDirectories(
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
) {
  if (platform === "win32")
    return [
      path.win32.join(env.WINDIR || "C:\\Windows", "Fonts"),
      path.win32.join(
        env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local"),
        "Microsoft",
        "Windows",
        "Fonts",
      ),
    ];
  if (platform === "darwin")
    return [
      "/System/Library/Fonts",
      "/Library/Fonts",
      path.join(home, "Library/Fonts"),
      ...["Word", "Excel", "PowerPoint"].map(
        (app) => `/Applications/Microsoft ${app}.app/Contents/Resources/DFonts`,
      ),
      path.join(home, "Library/Group Containers/UBF8T346G9.Office/FontCache"),
    ];
  return [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    path.join(home, ".local/share/fonts"),
  ];
}
async function namesFromFile(file) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_FONT || stat.size < 12) return [];
    const read = async (at, length) => {
      if (at < 0 || length < 0 || at + length > stat.size)
        return Buffer.alloc(0);
      const bytes = Buffer.alloc(length);
      const r = await handle.read(bytes, 0, length, at);
      return bytes.subarray(0, r.bytesRead);
    };
    const header = await read(0, 12);
    let faces = [0];
    if (header.toString("ascii", 0, 4) === "ttcf") {
      const n = header.readUInt32BE(8);
      if (n < 1 || n > 64) return [];
      const offsets = await read(12, n * 4);
      if (offsets.length !== n * 4) return [];
      faces = Array.from({ length: n }, (_, i) => offsets.readUInt32BE(i * 4));
    }
    const found = [];
    for (let face = 0; face < faces.length; face++) {
      const start = faces[face],
        h = await read(start, 12);
      if (h.length !== 12) continue;
      const count = h.readUInt16BE(4);
      if (count > 512) continue;
      const directory = await read(start + 12, count * 16);
      if (directory.length !== count * 16) continue;
      for (let i = 0; i < count; i++) {
        const at = i * 16;
        if (directory.toString("ascii", at, at + 4) !== "name") continue;
        const length = directory.readUInt32BE(at + 12);
        if (length > 128 * 1024) break;
        const table = await read(directory.readUInt32BE(at + 8), length);
        if (table.length < 6) break;
        const n = Math.min(table.readUInt16BE(2), 4096),
          strings = table.readUInt16BE(4);
        const names = [];
        for (let j = 0; j < n; j++) {
          const at = 6 + j * 12;
          if (at + 12 > table.length) break;
          const platform = table.readUInt16BE(at),
            id = table.readUInt16BE(at + 6),
            length = table.readUInt16BE(at + 8),
            pos = strings + table.readUInt16BE(at + 10);
          if (
            ![4, 6].includes(id) ||
            length > 2048 ||
            pos + length > table.length
          )
            continue;
          let name = "";
          if (platform === 0 || platform === 3) {
            for (let k = 0; k + 1 < length; k += 2)
              name += String.fromCharCode(table.readUInt16BE(pos + k));
          } else if (platform === 1)
            name = table.toString("latin1", pos, pos + length);
          if (name.trim()) names.push(name.trim());
        }
        if (names.length) found.push({ face, names: [...new Set(names)] });
        break;
      }
    }
    return found;
  } finally {
    await handle.close();
  }
}
async function findMatchingFont(requested, roots = fontDirectories()) {
  const key = fontKey(requested);
  let visited = 0;
  async function scan(dir, depth = 0) {
    if (depth > 5 || visited > 2500) return null;
    const files = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of files) {
      if (visited++ > 2500) return null;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = await scan(file, depth + 1);
        if (result) return result;
      } else if (/\.(ttf|otf|ttc)$/i.test(entry.name)) {
        const faces = await namesFromFile(file).catch(() => []),
          match = faces.find((f) =>
            f.names.some((name) => fontKey(name) === key),
          );
        if (match) {
          const stat = await fs.stat(file);
          if (stat.size > MAX_FONT) continue;
          return {
            name: entry.name,
            face: match.face,
            bytes: new Uint8Array(await fs.readFile(file)),
          };
        }
      }
    }
    return null;
  }
  for (const dir of roots) {
    const found = await scan(dir);
    if (found) return found;
  }
  return null;
}
module.exports = { fontKey, fontDirectories, namesFromFile, findMatchingFont };
