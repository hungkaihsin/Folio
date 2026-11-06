const { clipboard, ClipboardItem, nativeImage } = require("electron");
const FORMAT =
  'electron application/osclipboard;format="com.danielhung.folio.object-v1"';
const LIMIT = 40 * 1024 * 1024;
function bytes(value) {
  if (!(value instanceof Uint8Array) || !value.length || value.length > LIMIT)
    throw new Error("Clipboard content must be smaller than 40 MB.");
  return value;
}
function text(value) {
  if (typeof value !== "string" || value.length > 100000)
    throw new Error("Paste up to 100,000 characters at a time.");
  return value;
}
function pdf(value) {
  const data = bytes(value);
  if (!Buffer.from(data.subarray(0, 1024)).includes(Buffer.from("%PDF-")))
    throw new Error("Invalid copied object.");
  return data;
}
function png(value) {
  const image = nativeImage.createFromBuffer(Buffer.from(bytes(value)));
  const { width, height } = image.getSize();
  if (image.isEmpty() || width * height > 18000000)
    throw new Error("Choose a clipboard image of at most 18 megapixels.");
  return bytes(new Uint8Array(image.toPNG()));
}
module.exports = function registerClipboard(ipcMain, valid) {
  ipcMain.handle("clipboard:edit", (event, action) => {
    valid(event);
    if (!["copy", "paste"].includes(action))
      throw new Error("Invalid clipboard action.");
    event.sender[action]();
  });
  ipcMain.handle("clipboard:write", async (event, value) => {
    valid(event);
    const parts = {};
    if (value?.kind === "text")
      parts["text/plain"] = new Blob([text(value.text)], {
        type: "text/plain",
      });
    else if (value?.kind === "image")
      parts["image/png"] = new Blob([png(value.bytes)], { type: "image/png" });
    else if (value?.kind === "object") {
      parts[FORMAT] = new Blob([pdf(value.bytes)]);
      if (value.text !== undefined)
        parts["text/plain"] = new Blob([text(value.text)], {
          type: "text/plain",
        });
      if (value.png !== undefined)
        parts["image/png"] = new Blob([png(value.png)], { type: "image/png" });
    } else throw new Error("Invalid clipboard content.");
    await clipboard.write([new ClipboardItem(parts)]);
  });
  ipcMain.handle("clipboard:read", async (event) => {
    valid(event);
    const items = await clipboard.read();
    for (const format of [FORMAT, "image/png", "image/jpeg", "text/plain"]) {
      const item = items.find((item) => item.types.includes(format));
      if (!item) continue;
      const blob = await item.getType(format);
      if (blob.size > LIMIT)
        throw new Error("Clipboard content must be smaller than 40 MB.");
      if (format === "text/plain")
        return { kind: "text", text: text(await blob.text()) };
      const data = new Uint8Array(await blob.arrayBuffer());
      return format === FORMAT
        ? { kind: "object", bytes: pdf(data) }
        : { kind: "image", bytes: png(data) };
    }
    return null;
  });
};
