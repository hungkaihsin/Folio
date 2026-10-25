const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  protocol,
  session,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
let win,
  dirty = false;
const sources = new Set(),
  sourceInodes = new Set();
const root = path.resolve(__dirname, "../dist");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "folio",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
function valid(event) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    !event.senderFrame.url.startsWith("folio://app/")
  )
    throw new Error("Untrusted request.");
}
async function source(file) {
  const real = await fs.realpath(file),
    s = await fs.stat(real);
  sources.add(real);
  sourceInodes.add(`${s.dev}:${s.ino}`);
}
ipcMain.handle("file:open", async (event, kind) => {
  valid(event);
  if (!["pdf", "image"].includes(kind)) throw new Error("Invalid file type.");
  const selected = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      kind === "image"
        ? { name: "Images", extensions: ["png", "jpg", "jpeg"] }
        : { name: "PDF documents", extensions: ["pdf"] },
    ],
  });
  if (selected.canceled) return null;
  const file = selected.filePaths[0],
    stat = await fs.stat(file);
  if (stat.size > 250 * 1024 * 1024)
    throw new Error("Please choose a file smaller than 250 MB.");
  const bytes = await fs.readFile(file);
  if (kind === "pdf") {
    if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw new Error("This file is not a PDF.");
    await source(file);
  }
  return { bytes: new Uint8Array(bytes), name: path.basename(file) };
});
ipcMain.handle("file:save", async (event, bytes, name) => {
  valid(event);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 250 * 1024 * 1024 ||
    !Buffer.from(bytes.subarray(0, 1024)).includes(Buffer.from("%PDF-"))
  )
    throw new Error("Invalid PDF data.");
  const base =
    typeof name === "string"
      ? path.basename(name).replace(/\.pdf$/i, "")
      : "document";
  const result = await dialog.showSaveDialog(win, {
    defaultPath: `${base}-edited.pdf`,
    filters: [{ name: "PDF document", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const file = result.filePath.toLowerCase().endsWith(".pdf")
    ? result.filePath
    : result.filePath + ".pdf";
  try {
    const real = await fs.realpath(file),
      s = await fs.stat(real);
    if (sources.has(real) || sourceInodes.has(`${s.dev}:${s.ino}`))
      throw new Error("Choose a new filename to keep the original PDF safe.");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const tmp = path.join(
    path.dirname(file),
    `.folio-${require("node:crypto").randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(tmp, bytes, { flag: "wx" });
    await fs.rename(tmp, file);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
  return file;
});
ipcMain.on("document:dirty", (event, value) => {
  valid(event);
  dirty = value === true;
  win.setDocumentEdited(dirty);
});
app.whenReady().then(() => {
  protocol.handle("folio", async (request) => {
    try {
      const url = new URL(request.url);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, ""),
        file = path.resolve(root, relative || "index.html");
      if (
        url.host !== "app" ||
        !(file === root || file.startsWith(root + path.sep))
      )
        return new Response("Forbidden", { status: 403 });
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".wasm": "application/wasm",
        ".otf": "font/otf",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      };
      return new Response(await fs.readFile(file), {
        headers: {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
    callback({
      cancel:
        !details.url.startsWith("folio://app/") &&
        !details.url.startsWith("devtools:") &&
        !details.url.startsWith("blob:"),
    }),
  );
  const create = () => {
    win = new BrowserWindow({
      width: 1440,
      height: 940,
      minWidth: 1000,
      minHeight: 680,
      backgroundColor: "#e8e9ec",
      title: "Folio",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.on("close", (e) => {
      if (
        dirty &&
        dialog.showMessageBoxSync(win, {
          type: "warning",
          buttons: ["Keep editing", "Discard changes"],
          defaultId: 0,
          cancelId: 0,
          message: "Discard unsaved changes?",
          detail: "Use Save copy to keep your edits before closing.",
        }) !== 1
      )
        e.preventDefault();
    });
    win.loadURL("folio://app/index.html");
  };
  const action = (name) => () => win?.webContents.send("menu:action", name);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "Folio",
              submenu: [
                { role: "about" },
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
              ],
            },
          ]
        : []),
      {
        label: "File",
        submenu: [
          {
            label: "Open PDF…",
            accelerator: "CmdOrCtrl+O",
            click: action("open"),
          },
          {
            label: "New document",
            accelerator: "CmdOrCtrl+N",
            click: action("new"),
          },
          {
            label: "Save copy…",
            accelerator: "CmdOrCtrl+S",
            click: action("save"),
          },
          { type: "separator" },
          { role: "close" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          {
            label: "Undo PDF edit",
            accelerator: "CmdOrCtrl+Z",
            click: action("undo"),
          },
          {
            label: "Redo PDF edit",
            accelerator: "CmdOrCtrl+Shift+Z",
            click: action("redo"),
          },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [{ role: "togglefullscreen" }, { role: "toggleDevTools" }],
      },
    ]),
  );
  create();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      dirty = false;
      create();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
