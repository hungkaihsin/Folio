import type { ClipboardContent } from "./types";
const CUSTOM = "web application/x-folio-object";
const LIMIT = 40 * 1024 * 1024;
export function editingField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest("input,textarea,select,[contenteditable=true]")
  );
}
export async function writeClipboard(content: ClipboardContent) {
  if (window.desktop) return window.desktop.writeClipboard(content);
  const parts: Record<string, Blob> = {};
  if (content.kind === "text")
    parts["text/plain"] = new Blob([content.text], { type: "text/plain" });
  else if (content.kind === "image")
    parts["image/png"] = new Blob([content.bytes as BlobPart], {
      type: "image/png",
    });
  else {
    parts[CUSTOM] = new Blob([content.bytes as BlobPart], {
      type: "application/x-folio-object",
    });
    if (content.text !== undefined)
      parts["text/plain"] = new Blob([content.text], { type: "text/plain" });
    if (content.png)
      parts["image/png"] = new Blob([content.png as BlobPart], {
        type: "image/png",
      });
  }
  await navigator.clipboard.write([new ClipboardItem(parts)]);
}
export async function readClipboard(
  data?: DataTransfer,
): Promise<ClipboardContent | null> {
  if (window.desktop) return window.desktop.readClipboard();
  if (data) {
    const image = [...data.items]
      .find(
        (item) =>
          item.kind === "file" &&
          ["image/png", "image/jpeg"].includes(item.type),
      )
      ?.getAsFile();
    if (image) {
      if (image.size > LIMIT)
        throw new Error("Clipboard content must be smaller than 40 MB.");
      return {
        kind: "image",
        bytes: new Uint8Array(await image.arrayBuffer()),
      };
    }
    const text = data.getData("text/plain");
    if (text) return { kind: "text", text };
  }
  const items = await navigator.clipboard.read();
  for (const type of [CUSTOM, "image/png", "image/jpeg", "text/plain"]) {
    const item = items.find((item) => item.types.includes(type));
    if (!item) continue;
    const blob = await item.getType(type);
    if (blob.size > LIMIT)
      throw new Error("Clipboard content must be smaller than 40 MB.");
    if (type === "text/plain") return { kind: "text", text: await blob.text() };
    return {
      kind: type === CUSTOM ? "object" : "image",
      bytes: new Uint8Array(await blob.arrayBuffer()),
    };
  }
  return null;
}
