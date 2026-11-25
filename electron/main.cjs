const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  protocol,
  session,
  shell,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
app.setName("Pageline");
if (!app.commandLine.hasSwitch("user-data-dir")) {
  app.setPath("userData", path.join(app.getPath("appData"), "Folio"));
}
app.setAppUserModelId("com.danielhung.folio");
let win,
  dirty = false;
let uiLanguage = "en",
  rebuildMenu = () => {};
const nativeStrings = {
  File: "檔案",
  Edit: "編輯",
  View: "檢視",
  Help: "說明",
  "Print…": "列印…",
  "Check for updates…": "檢查更新…",
  "Open PDF…": "開啟 PDF…",
  "New document": "建立文件",
  "Save copy…": "另存副本…",
  "Export…": "匯出…",
  "Undo PDF edit": "復原 PDF 編輯",
  "Redo PDF edit": "重做 PDF 編輯",
  "Paste onto page": "貼到頁面",
  Copy: "複製",
  Paste: "貼上",
  "Keep editing": "繼續編輯",
  "Discard changes": "捨棄變更",
  "Discard unsaved changes?": "捨棄未儲存的變更？",
  "Use Save copy to keep your edits before closing.":
    "關閉前請使用「另存副本」保留變更。",
};
const trNative = (text) =>
  uiLanguage === "zh-TW" ? nativeStrings[text] || text : text;
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
require("./clipboard.cjs")(ipcMain, valid);
const printAsset = require("./printing.cjs")(ipcMain, valid, () => win);
const updates = require("./updates.cjs").createUpdateService({
  version: app.getVersion(),
  platform: process.platform,
  openExternal: (url) => shell.openExternal(url),
});
ipcMain.handle("updates:check", (event) => {
  valid(event);
  return updates.check();
});
ipcMain.handle("updates:download", (event) => {
  valid(event);
  return updates.download();
});
ipcMain.handle("updates:releases", (event) => {
  valid(event);
  return updates.openReleases();
});
ipcMain.handle("fonts:find", async (event, name) => {
  valid(event);
  if (typeof name !== "string" || !name.trim() || name.length > 256)
    throw new Error("Invalid font name.");
  return require("./font-catalog.cjs").findMatchingFont(name);
});
ipcMain.handle("file:open", async (event, kind) => {
  valid(event);
  if (!["pdf", "image", "font"].includes(kind))
    throw new Error("Invalid file type.");
  const selected = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      kind === "font"
        ? { name: "Font files", extensions: ["ttf", "otf", "ttc"] }
        : kind === "image"
          ? { name: "Images", extensions: ["png", "jpg", "jpeg"] }
          : { name: "PDF documents", extensions: ["pdf"] },
    ],
  });
  if (selected.canceled) return null;
  const file = selected.filePaths[0],
    stat = await fs.stat(file);
  if (kind === "font" && stat.size > 40 * 1024 * 1024)
    throw new Error("Choose a font smaller than 40 MB.");
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
async function saveFile(
  event,
  bytes,
  name,
  extension = "pdf",
  exporting = false,
) {
  valid(event);
  const types = {
    pdf: "PDF document",
    png: "PNG image",
    jpg: "JPEG image",
    txt: "Text document",
    zip: "ZIP archive",
  };
  if (
    !Object.hasOwn(types, extension) ||
    !(bytes instanceof Uint8Array) ||
    bytes.length > 250 * 1024 * 1024
  )
    throw new Error("Invalid export data.");
  const buf = Buffer.from(bytes),
    validType =
      extension === "pdf"
        ? buf.subarray(0, 1024).includes(Buffer.from("%PDF-"))
        : extension === "png"
          ? buf
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : extension === "jpg"
            ? buf[0] === 255 && buf[1] === 216
            : extension === "zip"
              ? buf.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
              : true;
  if (!validType) throw new Error("Invalid export data.");
  if (extension === "txt")
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const base =
    typeof name === "string"
      ? path.basename(name).replace(/\.[^.]+$/, "")
      : "document";
  const result = await dialog.showSaveDialog(win, {
    defaultPath: exporting ? `${base}.${extension}` : `${base}-edited.pdf`,
    filters: [{ name: types[extension], extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return null;
  const file = result.filePath.toLowerCase().endsWith("." + extension)
    ? result.filePath
    : result.filePath + "." + extension;
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
}
ipcMain.handle("file:save", (event, bytes, name) =>
  saveFile(event, bytes, name),
);
ipcMain.handle("file:export", (event, file) => {
  if (
    !file ||
    typeof file.name !== "string" ||
    typeof file.extension !== "string"
  )
    throw new Error("Invalid export request.");
  return saveFile(event, file.bytes, file.name, file.extension, true);
});
ipcMain.on("ui:language", (event, locale) => {
  valid(event);
  if (["en", "zh-TW"].includes(locale)) {
    uiLanguage = locale;
    rebuildMenu();
  }
});
ipcMain.on("document:dirty", (event, value) => {
  valid(event);
  dirty = value === true;
  win.setDocumentEdited(dirty);
});
app.whenReady().then(() => {
  if (process.platform === "darwin")
    app.dock.setIcon(path.join(__dirname, "assets/icon.png"));
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
      if (relative.startsWith("__print/")) return printAsset(relative);
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
      title: "Pageline",
      icon: path.join(__dirname, "assets/icon.png"),
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
          buttons: [trNative("Keep editing"), trNative("Discard changes")],
          defaultId: 0,
          cancelId: 0,
          message: trNative("Discard unsaved changes?"),
          detail: trNative("Use Save copy to keep your edits before closing."),
        }) !== 1
      )
        e.preventDefault();
    });
    win.loadURL("folio://app/index.html");
  };
  const action = (name) => () => win?.webContents.send("menu:action", name);
  rebuildMenu = () => {
    const template = [
      ...(process.platform === "darwin"
        ? [
            {
              label: "Pageline",
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
          {
            label: "Export…",
            accelerator: "CmdOrCtrl+Shift+E",
            click: action("export"),
          },
          {
            label: "Print…",
            accelerator: "CmdOrCtrl+P",
            click: action("print"),
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
          { label: "Copy", accelerator: "CmdOrCtrl+C", click: action("copy") },
          {
            label: "Paste",
            accelerator: "CmdOrCtrl+V",
            click: action("paste"),
          },
          {
            label: "Paste onto page",
            accelerator: "CmdOrCtrl+Shift+V",
            click: action("pastePage"),
          },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [{ role: "togglefullscreen" }, { role: "toggleDevTools" }],
      },
      {
        label: "Help",
        submenu: [{ label: "Check for updates…", click: action("updates") }],
      },
    ];
    const localize = (list) =>
      list.map((item) => ({
        ...item,
        ...(item.label ? { label: trNative(item.label) } : {}),
        ...(Array.isArray(item.submenu)
          ? { submenu: localize(item.submenu) }
          : {}),
      }));
    Menu.setApplicationMenu(Menu.buildFromTemplate(localize(template)));
  };
  rebuildMenu();

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
