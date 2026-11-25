const { BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");

module.exports = function registerPrinting(ipcMain, valid, getWindow) {
  const jobs = new Map();
  let active = false;
  ipcMain.handle("document:print", async (event, job) => {
    valid(event);
    if (active) throw new Error("A print job is already open.");
    if (
      !job ||
      !Array.isArray(job.pages) ||
      !job.pages.length ||
      job.pages.length > 2000 ||
      !["A4", "A3", "Letter"].includes(job.paper) ||
      typeof job.landscape !== "boolean" ||
      !Number.isInteger(job.copies) ||
      job.copies < 1 ||
      job.copies > 999 ||
      !["simplex", "shortEdge", "longEdge"].includes(job.duplex)
    ) {
      throw new Error("Invalid print job.");
    }
    let total = 0;
    for (const page of job.pages) {
      if (
        !(page instanceof Uint8Array) ||
        page.length < 24 ||
        !Buffer.from(page.subarray(0, 8)).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        )
      ) {
        throw new Error("Invalid print page.");
      }
      const bytes = Buffer.from(page);
      const width = bytes.readUInt32BE(16),
        height = bytes.readUInt32BE(20);
      total += bytes.length;
      if (
        !width ||
        !height ||
        width * height > 18100000 ||
        total > 160 * 1024 * 1024
      ) {
        throw new Error("Print fewer pages in one job, or save a print PDF.");
      }
    }
    active = true;
    const id = randomUUID();
    let directory, window;
    try {
      directory = await fs.mkdtemp(path.join(os.tmpdir(), "pageline-print-"));
      const sizes = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] };
      const dimensions = sizes[job.paper].slice();
      if (job.landscape) dimensions.reverse();
      const [width, height] = dimensions;
      const sheets = [];
      for (let index = 0; index < job.pages.length; index++) {
        await fs.writeFile(
          path.join(directory, `p-${index}.png`),
          job.pages[index],
        );
        sheets.push(`<section><img alt="" src="p-${index}.png"></section>`);
      }
      const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Print · Pageline</title><style>@page{size:${width}mm ${height}mm;margin:0}*{box-sizing:border-box}html,body{padding:0;margin:0}section{width:${width}mm;height:${height}mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}img{display:block;width:100%;height:100%}@media screen{body{background:#e9eef4}section{margin:16px auto;background:white;box-shadow:0 1px 8px #8794a5}}</style>${sheets.join("")}`;
      await fs.writeFile(path.join(directory, "index.html"), html);
      jobs.set(id, directory);
      window = new BrowserWindow({
        show: false,
        width: 1000,
        height: 760,
        title: "Print · Pageline",
        parent: getWindow(),
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      await window.loadURL(`folio://app/__print/${id}/index.html`);
      await window.webContents.executeJavaScript(
        "Promise.all([...document.images].map(image => image.decode()))",
      );
      window.show();
      return await new Promise((resolve, reject) => {
        window.once("closed", () => resolve(false));
        window.webContents.print(
          {
            silent: false,
            printBackground: true,
            pageSize: job.paper,
            landscape: job.landscape,
            copies: job.copies,
            duplexMode: job.duplex,
            margins: { marginType: "none" },
            scaleFactor: 100,
          },
          (success, reason) => {
            if (success) resolve(true);
            else if (/cancel/i.test(reason || "")) resolve(false);
            else
              reject(
                new Error(reason || "The printer could not start this job."),
              );
          },
        );
      });
    } finally {
      if (window && !window.isDestroyed()) window.destroy();
      jobs.delete(id);
      active = false;
      if (directory) await fs.rm(directory, { recursive: true, force: true });
    }
  });
  return async function printAsset(relative) {
    const match = relative.match(
      /^__print\/([a-f0-9-]{36})\/(index\.html|p-\d+\.png)$/,
    );
    if (!match || !jobs.has(match[1]))
      return new Response("Print job unavailable", { status: 404 });
    try {
      const bytes = await fs.readFile(path.join(jobs.get(match[1]), match[2]));
      return new Response(bytes, {
        headers: {
          "Content-Type": match[2].endsWith(".html")
            ? "text/html"
            : "image/png",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return new Response("Print page unavailable", { status: 404 });
    }
  };
};
