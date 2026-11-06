import type {
  DocumentInfo,
  Edit,
  RenderedPage,
  ExportOptions,
  ExportedFile,
  FontQuery,
  FontReport,
  Point,
  TextSelection,
  ClipboardContent,
} from "./types";
const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {
  type: "module",
});
let initialize!: (v: void) => void, failInitialize!: (e: Error) => void;
const initialized = new Promise<void>((resolve, reject) => {
  initialize = resolve;
  failInitialize = reject;
});
initialized.catch(() => {});
let failure: Error | null = null;
let id = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
worker.onmessage = ({ data }) => {
  if (data.ready) {
    initialize();
    return;
  }
  if (data.initializationError) {
    failure = new Error(data.initializationError);
    failInitialize(failure);
    return;
  }
  const p = pending.get(data.id);
  if (p) {
    pending.delete(data.id);
    if (data.error) p.reject(new Error(data.error));
    else p.resolve(data.result);
  }
};
worker.onerror = () => {
  failure = new Error("The PDF engine stopped. Reopen the app and try again.");
  failInitialize(failure);
  for (const p of pending.values())
    p.reject(
      new Error("The PDF engine stopped. Reopen the app and try again."),
    );
  pending.clear();
};
const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
  await initialized;
  if (failure) throw failure;
  return new Promise<T>((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    worker.postMessage({ id: key, method, args });
  });
};
export const engine = {
  copyObject: (page: number, id: string) =>
    call<ClipboardContent>("copyObject", page, id),
  selectText: (page: number, start: Point, end: Point) =>
    call<TextSelection>("selectText", page, start, end),
  textBackdrop: (query: FontQuery, scale: number) =>
    call<Uint8Array>("textBackdrop", query, scale),
  inspectFont: (query: FontQuery) => call<FontReport>("inspectFont", query),
  loadFont: (bytes: Uint8Array, name: string) =>
    call<{ key: string; name: string }[]>("loadFont", bytes, name),
  open: (b: Uint8Array, p?: string) => call<DocumentInfo>("open", b, p),
  create: () => call<DocumentInfo>("create"),
  render: (p: number, s: number, extras = true) =>
    call<RenderedPage>("render", p, s, extras),
  edit: (e: Edit) => call<DocumentInfo>("edit", e),
  export: () => call<Uint8Array>("export"),
  exportFile: (options: ExportOptions, name: string) =>
    call<ExportedFile>("exportFile", options, name),
  undo: () => call<DocumentInfo>("undo"),
  redo: () => call<DocumentInfo>("redo"),
  search: (s: string) =>
    call<{ page: number; rect: [number, number, number, number] }[]>(
      "search",
      s,
    ),
};
declare global {
  interface Window {
    desktop?: {
      readClipboard: () => Promise<ClipboardContent | null>;
      nativeClipboard: (action: "copy" | "paste") => Promise<void>;
      writeClipboard: (content: ClipboardContent) => Promise<void>;
      findFont: (
        name: string,
      ) => Promise<{ name: string; face: number; bytes: Uint8Array } | null>;
      open: (
        kind?: "pdf" | "image" | "font",
      ) => Promise<{ bytes: Uint8Array; name: string } | null>;
      save: (bytes: Uint8Array, name: string) => Promise<string | null>;
      exportFile: (file: ExportedFile) => Promise<string | null>;
      language: (locale: "en" | "zh-TW") => void;
      dirty: (dirty: boolean) => void;
      onAction: (callback: (action: string) => void) => () => void;
      platform: string;
    };
  }
}
