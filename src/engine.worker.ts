import { PDFEngine } from "./engine";
import fontUrl from "./assets/NotoSansCJKtc-Regular.otf?url";
import serifUrl from "./assets/NotoSerifCJKtc-Regular.otf?url";
const ready = Promise.all(
  [fontUrl, serifUrl].map(async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Cannot load the bundled font.");
    return new Uint8Array(await r.arrayBuffer());
  }),
).then(([sans, serif]) => new PDFEngine(sans, serif));
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const engine = await ready;
      const method = data.method as keyof PDFEngine;
      if (
        ![
          "open",
          "create",
          "info",
          "render",
          "export",
          "exportFile",
          "extract",
          "search",
          "selectText",
          "undo",
          "redo",
          "edit",
          "inspectFont",
          "textBackdrop",
          "loadFont",
          "copyObject",
        ].includes(method)
      )
        throw new Error("Unknown operation.");
      const result = (engine[method] as (...args: unknown[]) => unknown).apply(
        engine,
        data.args,
      );
      self.postMessage({ id: data.id, result });
    } catch (error) {
      self.postMessage({
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};

ready
  .then(() => self.postMessage({ ready: true }))
  .catch((e) =>
    self.postMessage({
      initializationError: e.message || "Cannot initialize PDF engine.",
    }),
  );
