import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowSquareOut,
  ArrowUUpLeft,
  ArrowUUpRight,
  ArrowsOutSimple,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle,
  Copy,
  CursorText,
  FilePdf,
  FilePlus,
  FolderOpen,
  Highlighter,
  Image as ImageIcon,
  MagnifyingGlass,
  Minus,
  Note,
  PencilSimple,
  Plus,
  ArrowClockwise,
  SidebarSimple,
  Square,
  Stack,
  TextT,
  Trash,
  X,
  DownloadSimple,
  LockSimple,
  Keyboard,
  WarningCircle,
  SpinnerGap,
  Cursor,
  Export,
  ClipboardText,
  Printer,
} from "@phosphor-icons/react";
import { engine } from "./client";
import type {
  DocumentInfo,
  Edit,
  Point,
  Rect,
  RenderedPage,
  RGB,
  TextLine,
  PageObject,
  ExportOptions,
} from "./types";
import "./style.css";
import { TextSelectionLayer } from "./TextSelectionLayer";
import { ObjectLayer, ObjectControls } from "./ObjectLayer";
import {
  InlineTextEditor,
  clearEditingFonts,
  type TextDraft,
} from "./InlineTextEditor";
import packageInfo from "../package.json";
import { AnnotationPanel } from "./AnnotationPanel";
import { PrintDialog } from "./PrintDialog";
import { UpdatesDialog } from "./UpdatesDialog";
import type { PrintOptions } from "./types";
import { readClipboard, writeClipboard, editingField } from "./clipboard";
import { ExportDialog } from "./ExportDialog";
import { tr, getLocale, setLocale, type Locale } from "./i18n";

type Tool =
  | "select"
  | "read"
  | "edit"
  | "text"
  | "highlight"
  | "ink"
  | "rectangle"
  | "image"
  | "note";
const tools: {
  id: Tool;
  label: string;
  icon: typeof CursorText;
  key: string;
}[] = [
  { id: "select", label: "Select / move", icon: Cursor, key: "M" },
  { id: "read", label: "Read & select", icon: CursorText, key: "V" },
  { id: "edit", label: "Edit text", icon: PencilSimple, key: "E" },
  { id: "text", label: "Add text", icon: TextT, key: "T" },
  { id: "highlight", label: "Highlight", icon: Highlighter, key: "H" },
  { id: "ink", label: "Draw", icon: PencilSimple, key: "D" },
  { id: "rectangle", label: "Rectangle", icon: Square, key: "R" },
  { id: "image", label: "Add image", icon: ImageIcon, key: "I" },
  { id: "note", label: "Comment", icon: Note, key: "C" },
];
const hints: Record<Tool, string> = {
  select:
    "Click an added object to select it. Drag to move, use the corner to resize, or double-click text to edit.",
  read: "Select text to copy. Double-click a line to edit it.",
  edit: "Click a text line to replace it. Font coverage and size are previewed before applying.",
  text: "Click the page to place new text.",
  highlight:
    "Drag to select text, just as in Read mode. Release to highlight the selected characters.",
  ink: "Draw directly on the page. Each stroke can be undone.",
  rectangle: "Drag to draw a rectangle.",
  image: "Click the page to place a PNG or JPEG image.",
  note: "Click the page to leave a comment.",
};
function IconButton({
  title,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="icon-button" title={title} aria-label={title} {...rest}>
      {children}
    </button>
  );
}
function Thumb({
  index,
  revision,
  selected,
  onClick,
}: {
  index: number;
  revision: number;
  selected: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null),
    [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true,
      blob = "";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          engine
            .render(index, 0.2, false)
            .then((r) => {
              if (alive) {
                blob = URL.createObjectURL(
                  new Blob([r.png as BlobPart], { type: "image/png" }),
                );
                setUrl(blob);
              }
            })
            .catch(() => {});
        }
      },
      { rootMargin: "160px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      alive = false;
      observer.disconnect();
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [index, revision]);
  return (
    <button
      ref={ref}
      className={`thumbnail ${selected ? "selected" : ""}`}
      onClick={onClick}
      aria-label={`${tr("Page")} ${index + 1}`}
      aria-current={selected ? "page" : undefined}
    >
      <div className="thumb-sheet">
        {url ? <img src={url} alt="" /> : <FilePdf size={24} />}
      </div>
      <span>{String(index + 1).padStart(2, "0")}</span>
    </button>
  );
}
function App() {
  const [printing, setPrinting] = useState(false),
    [updating, setUpdating] = useState(false);
  const [locale, changeLocale] = useState<Locale>(getLocale),
    [exporting, setExporting] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [fontFamily, setFontFamily] = useState("auto"),
    [fitOriginal, setFitOriginal] = useState(false),
    [allowSubstitution, setAllowSubstitution] = useState(false),
    [pickingStyle, setPickingStyle] = useState(false),
    [fontBlocked, setFontBlocked] = useState(false),
    [customFonts, setCustomFonts] = useState<{ key: string; name: string }[]>(
      [],
    );
  useEffect(() => {
    document.documentElement.lang = locale;
    window.desktop?.language(locale);
  }, [locale]);
  const [doc, setDoc] = useState<DocumentInfo | null>(null),
    [name, setName] = useState("Untitled.pdf"),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0),
    [savedPosition, setSavedPosition] = useState(0),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [tool, setTool] = useState<Tool>("read"),
    [zoom, setZoom] = useState(0.85),
    [fit, setFit] = useState(true),
    [sidebar, setSidebar] = useState(true),
    [view, setView] = useState<RenderedPage | null>(null),
    [url, setUrl] = useState(""),
    [rendering, setRendering] = useState(false);
  const [size, setSize] = useState(14),
    [color, setColor] = useState("#2558d4"),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<{ page: number; rect: Rect }[]>([]),
    [hit, setHit] = useState(0),
    [tab, setTab] = useState<"tools" | "comments" | "markup" | "forms">(
      "tools",
    );
  const [modal, setModal] = useState<{
    kind: "text" | "replace" | "object" | "note" | "password" | "discard";
    object?: PageObject;
    text: string;
    point?: Point;
    line?: TextLine;
    resolve?: (v: any) => void;
  } | null>(null);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const [editorActionsHost, setEditorActionsHost] =
    useState<HTMLDivElement | null>(null);
  const inline =
    modal && ["text", "replace", "object"].includes(modal.kind)
      ? (modal as TextDraft)
      : null;
  const originalColor = inline?.line?.color || inline?.object?.color;
  const originalColorHex = originalColor
    ? "#" +
      originalColor
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    : color;
  const draftDirty =
    !!inline &&
    (inline.text !== (inline.line?.text || inline.object?.text || "") ||
      (inline.kind !== "text" &&
        (fontFamily !== "original" ||
          size !== (inline.line?.size || inline.object?.size || 14) ||
          color !== originalColorHex ||
          fitOriginal)));
  const [drag, setDrag] = useState<Point[] | null>(null),
    [viewportWidth, setViewportWidth] = useState(900);
  const viewport = useRef<HTMLDivElement>(null),
    sheet = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    fontInput = useRef<HTMLInputElement>(null),
    search = useRef<HTMLInputElement>(null),
    pendingFile = useRef<{ bytes: Uint8Array; name: string } | null>(null),
    actions = useRef<Record<string, () => void>>({});
  useEffect(() => setSelectedId(null), [page]);
  useEffect(() => {
    if (!inline) setPickingStyle(false);
  }, [!!inline]);
  const chooseTool = (id: Tool) => {
    setTool(id);
    setTab(
      id === "note"
        ? "comments"
        : ["highlight", "ink", "rectangle"].includes(id)
          ? "markup"
          : "tools",
    );
  };
  const selected = view?.objects.find((o) => o.id === selectedId);
  const pastePoint = useRef<Point | null>(null),
    pasteOffset = useRef(0);
  useEffect(() => {
    pastePoint.current = null;
    pasteOffset.current = 0;
  }, [page, name]);
  const dirty = !!doc && doc.position !== savedPosition,
    info = doc?.pages[page];
  const scale =
    fit && info
      ? Math.min(1.8, Math.max(0.1, (viewportWidth - 80) / info.width))
      : zoom;
  const ready = !!view && !rendering && !busy;
  const rgb: RGB = [
    parseInt(color.slice(1, 3), 16) / 255,
    parseInt(color.slice(3, 5), 16) / 255,
    parseInt(color.slice(5, 7), 16) / 255,
  ];
  const report = useCallback(
    (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    [],
  );
  useEffect(() => {
    window.desktop?.dirty(dirty || draftDirty);
    document.title = `${dirty || draftDirty ? "● " : ""}${doc ? name + " · " : ""}Pageline`;
  }, [dirty, draftDirty, name, doc]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if ((dirty || draftDirty) && !window.desktop) e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty, draftDirty]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!viewport.current) return;
    const o = new ResizeObserver(([e]) =>
      setViewportWidth(e.contentRect.width),
    );
    o.observe(viewport.current);
    return () => o.disconnect();
  }, [doc, sidebar]);
  useEffect(() => {
    if (!doc) return;
    let alive = true,
      blob = "";
    setRendering(true);
    engine
      .render(page, scale * Math.min(devicePixelRatio, 2))
      .then((v) => {
        if (alive) {
          blob = URL.createObjectURL(
            new Blob([v.png as BlobPart], { type: "image/png" }),
          );
          setView(v);
          setUrl(blob);
          setRendering(false);
        }
      })
      .catch((e) => {
        if (alive) {
          report(e);
          setRendering(false);
          setView(null);
        }
      });
    return () => {
      alive = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [!!doc, page, revision, scale, report]);
  useEffect(() => {
    setHits([]);
    setHit(0);
  }, [revision]);
  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return false;
    setBusy(label);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      report(e);
      return false;
    } finally {
      setBusy("");
    }
  }
  async function checkDiscard() {
    if (!dirty) return true;
    return new Promise<boolean>((resolve) =>
      setModal({ kind: "discard", text: "", resolve }),
    );
  }
  function loaded(d: DocumentInfo, n: string) {
    clearEditingFonts();
    setDoc(d);
    setName(n);
    setSavedPosition(d.position);
    setPage(0);
    setView(null);
    setRevision((v) => v + 1);
    setTool("read");
    setSelectedId(null);
    setQuery("");
    setHits([]);
  }
  async function openBytes(bytes: Uint8Array, n: string) {
    if (!(await checkDiscard())) return;
    await run("Opening PDF", async () => {
      try {
        loaded(await engine.open(bytes), n);
      } catch (e) {
        if ((e as Error).message === "PASSWORD_REQUIRED") {
          pendingFile.current = { bytes, name: n };
          setModal({ kind: "password", text: "" });
        } else throw e;
      }
    });
  }
  async function chooseOpen() {
    if (window.desktop) {
      try {
        const f = await window.desktop.open();
        if (f) await openBytes(f.bytes, f.name);
      } catch (e) {
        report(e);
      }
    } else fileInput.current?.click();
  }
  async function newDocument(sample = false) {
    if (!(await checkDiscard())) return;
    await run(sample ? "Creating example" : "Creating document", async () => {
      let d = await engine.create();
      if (sample) {
        const add = async (
          text: string,
          x: number,
          y: number,
          s: number,
          c: RGB = [0.12, 0.15, 0.2],
        ) => {
          d = await engine.edit({
            kind: "text",
            page: 0,
            point: [x, y],
            text,
            size: s,
            color: c,
          });
        };
        await add("A little room for your ideas.", 56, 80, 27);
        await add(
          "PAGELINE / YOUR EVERYDAY PDF WORKSPACE",
          56,
          48,
          9,
          [0.15, 0.34, 0.83],
        );
        await add("Read it. Mark it. Make it yours.", 56, 144, 16);
        await add(
          "This is a real PDF. Try editing any of these lines.",
          56,
          190,
          12,
        );
        await add("01   Make a change", 56, 257, 17);
        await add("Choose Edit text, then click this sentence.", 56, 293, 12);
        await add(
          "Original text is removed and replaced in the saved PDF.",
          56,
          315,
          12,
        );
        await add("02   Leave your mark", 56, 390, 17);
        await add(
          "Highlight a passage, draw a shape, or add a comment.",
          56,
          426,
          12,
        );
        await add(
          "Try adding English or Chinese text: 你好，世界。",
          56,
          448,
          12,
        );
        await add("03   Bring it together", 56, 523, 17);
        await add(
          "Rotate, duplicate, reorder, or merge pages from another PDF.",
          56,
          559,
          12,
        );
        await add(
          "Save a copy when you are ready. Your original stays safe.",
          56,
          581,
          12,
        );
        await add(
          "Everything happens on your device.",
          56,
          744,
          10,
          [0.38, 0.41, 0.46],
        );
      }
      loaded(d, sample ? "Welcome to Pageline.pdf" : "Untitled.pdf");
    });
  }
  async function edit(e: Edit) {
    return run("Applying edit", async () => {
      const d = await engine.edit(e);
      setDoc(d);
      setPage((p) => Math.min(p, d.pages.length - 1));
      if (e.kind === "note") {
        setSelectedId(null);
        setTool("read");
        setTab("comments");
      } else if (
        d.focusObjectId &&
        [
          "text",
          "image",
          "highlight",
          "rectangle",
          "ink",
          "note",
          "objectPaste",
        ].includes(e.kind)
      ) {
        setSelectedId(d.focusObjectId);
        setTool("select");
        setTab("tools");
      }
      if (
        [
          "objectDelete",
          "removeAnnotation",
          "rotate",
          "move",
          "duplicate",
          "delete",
          "blank",
        ].includes(e.kind)
      )
        setSelectedId(null);
      setRevision((v) => v + 1);
    });
  }
  async function undo() {
    if (!doc?.canUndo) return;
    await run("Undoing", async () => {
      const d = await engine.undo();
      setDoc(d);
      setSelectedId(null);
      setPage((p) => Math.min(p, d.pages.length - 1));
      setRevision((v) => v + 1);
    });
  }
  async function redo() {
    if (!doc?.canRedo) return;
    await run("Redoing", async () => {
      const d = await engine.redo();
      setDoc(d);
      setSelectedId(null);
      setPage((p) => Math.min(p, d.pages.length - 1));
      setRevision((v) => v + 1);
    });
  }
  async function save() {
    if (!doc) return;
    await run("Saving PDF", async () => {
      const bytes = await engine.export();
      if (window.desktop) {
        const result = await window.desktop.save(bytes, name);
        if (!result) return;
      } else {
        const u = URL.createObjectURL(
            new Blob([bytes as BlobPart], { type: "application/pdf" }),
          ),
          a = document.createElement("a");
        a.href = u;
        a.download = name.replace(/\.pdf$/i, "") + "-edited.pdf";
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 3000);
      }
      setSavedPosition(doc.position);
      setToast("Your edited copy has been saved.");
    });
  }
  async function printFile(options: PrintOptions) {
    await run("Preparing print", async () => {
      const job = await engine.printImages(options);
      if (await window.desktop?.print(job)) {
        setPrinting(false);
        setToast("Print job sent.");
      }
    });
  }
  async function savePrintFile(options: PrintOptions) {
    await run("Preparing print", async () => {
      const file = await engine.printDocument(options, name);
      if (window.desktop) {
        if (!(await window.desktop.exportFile(file))) return;
      } else {
        const url = URL.createObjectURL(
          new Blob([file.bytes as BlobPart], { type: file.mime }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }
      setToast("Your print PDF has been saved.");
    });
  }
  async function exportFile(options: ExportOptions) {
    if (!doc) return;
    const ok = await run("Exporting file", async () => {
      const file = await engine.exportFile(options, name);
      if (window.desktop) {
        const target = await window.desktop.exportFile(file);
        if (!target) return;
      } else {
        const url = URL.createObjectURL(
            new Blob([file.bytes as BlobPart], { type: file.mime }),
          ),
          link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }
      if (
        options.format === "pdf" &&
        options.pages.length === doc.pages.length &&
        options.pages.every((p, i) => p === i)
      )
        setSavedPosition(doc.position);
      setToast("Your file has been exported.");
      setExporting(false);
    });
  }
  function editObject(object: PageObject) {
    setAllowSubstitution(false);
    if (!doc?.editable || inline) return;
    setTab("tools");
    if (object.kind !== "text" || object.id.startsWith("annotation:")) return;
    setSelectedId(object.id);
    setSize(object.size || 14);
    if (object.color)
      setColor(
        "#" +
          object.color
            .map((v) =>
              Math.round(v * 255)
                .toString(16)
                .padStart(2, "0"),
            )
            .join(""),
      );
    setFontFamily("original");
    setFitOriginal(false);
    setFontBlocked(true);
    setModal({ kind: "object", text: object.text || "", object });
  }
  function editLine(line: TextLine) {
    setAllowSubstitution(false);
    if (!doc?.editable || inline) return;
    setTab("tools");
    setColor(
      "#" +
        line.color
          .map((v) =>
            Math.round(v * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join(""),
    );
    const object =
      line.objectId && view?.objects.find((o) => o.id === line.objectId);
    if (object) {
      editObject(object);
      return;
    }
    setSize(line.size);
    setFontFamily("original");
    setFitOriginal(false);
    setFontBlocked(true);
    setModal({ kind: "replace", text: line.text, line });
  }
  async function loadFont(bytes: Uint8Array, name: string) {
    await run("Loading font", async () => {
      const font = await engine.loadFont(bytes, name);
      setCustomFonts((f) => [...f, ...font]);
      const requested = (
        modal?.line?.font ||
        modal?.object?.sourceFont ||
        ""
      ).replace(/^[A-Z]{6}\+/, "");
      setFontBlocked(true);
      setFontFamily(
        (
          font.find((f) => f.name.toLowerCase() === requested.toLowerCase()) ||
          font[0]
        ).key,
      );
    });
  }
  async function importFont() {
    if (window.desktop) {
      try {
        const file = await window.desktop.open("font");
        if (file) await loadFont(file.bytes, file.name);
      } catch (e) {
        report(e);
      }
    } else fontInput.current?.click();
  }
  async function merge() {
    try {
      if (window.desktop) {
        const f = await window.desktop.open();
        if (f) await edit({ kind: "merge", bytes: f.bytes });
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".pdf";
        input.onchange = async () => {
          const f = input.files?.[0];
          if (f)
            await edit({
              kind: "merge",
              bytes: new Uint8Array(await f.arrayBuffer()),
            });
        };
        input.click();
      }
    } catch (e) {
      report(e);
    }
  }
  async function copySelected() {
    if (
      !selected ||
      !["text", "image"].includes(selected.kind) ||
      selected.id.startsWith("annotation:")
    )
      return;
    try {
      const content = await engine.copyObject(page, selected.id);
      await writeClipboard(content);
      setToast("Selected object copied.");
    } catch (e) {
      report(e);
    }
  }
  async function pasteClipboard(data?: DataTransfer) {
    if (busy || modal || exporting || printing || updating) return;
    if (!doc || !view) {
      setToast("Open or create a PDF before pasting.");
      return;
    }
    if (!doc.editable) {
      report(new Error("This document is read only."));
      return;
    }
    const base = pastePoint.current || [40, 40],
      offset = pasteOffset.current % 60;
    const point: Point = [
      Math.max(8, Math.min(view.width - 80, base[0] + offset)),
      Math.max(8, Math.min(view.height - 80, base[1] + offset)),
    ];
    let content: Awaited<ReturnType<typeof readClipboard>> = null;
    const ok = await run("Reading clipboard", async () => {
      content = await readClipboard(data);
    });
    if (!ok) return;
    const value = content as Awaited<ReturnType<typeof readClipboard>>;
    if (!value) {
      report(new Error("Clipboard has no supported text or image."));
      return;
    }
    if (value.kind === "text") {
      if (!value.text.trim()) {
        setToast("The clipboard is empty.");
        return;
      }
      if (value.text.length > 100000) {
        report(new Error("Paste up to 100,000 characters at a time."));
        return;
      }
      setTool("text");
      setTab("tools");
      setFontFamily("auto");
      setSize(14);
      setAllowSubstitution(false);
      setFontBlocked(true);
      setModal({ kind: "text", text: value.text, point });
    } else if (value.kind === "object") {
      await edit({ kind: "objectPaste", page, point, bytes: value.bytes });
    } else {
      try {
        const image = await createImageBitmap(
          new Blob([value.bytes as BlobPart]),
        );
        const pixels = image.width * image.height;
        image.close();
        if (pixels > 18000000)
          throw new Error("Choose a clipboard image of at most 18 megapixels.");
        await edit({
          kind: "image",
          page,
          point,
          bytes: value.bytes,
          width: Math.min(240, view.width - point[0] - 8),
        });
      } catch (e) {
        report(e);
      }
    }
    pasteOffset.current += 12;
  }
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      if (
        editingField(e.target) ||
        modal ||
        busy ||
        exporting ||
        printing ||
        updating
      )
        return;
      e.preventDefault();
      void pasteClipboard(e.clipboardData || undefined);
    };
    const copy = (e: ClipboardEvent) => {
      if (
        e.defaultPrevented ||
        editingField(e.target) ||
        modal ||
        busy ||
        tool !== "select" ||
        !selected
      )
        return;
      if (
        ["text", "image"].includes(selected.kind) &&
        !selected.id.startsWith("annotation:")
      ) {
        e.preventDefault();
        void copySelected();
      }
    };
    window.addEventListener("paste", paste);
    window.addEventListener("copy", copy);
    return () => {
      window.removeEventListener("paste", paste);
      window.removeEventListener("copy", copy);
    };
  }, [
    doc,
    view,
    page,
    selected,
    tool,
    busy,
    modal,
    exporting,
    printing,
    updating,
  ]);
  actions.current = {
    open: () => void chooseOpen(),
    new: () => void newDocument(),
    save: () => void save(),
    export: () => setExporting(true),
    undo: () => void undo(),
    redo: () => void redo(),
    pastePage: () => void pasteClipboard(),
    print: () => {
      if (doc) setPrinting(true);
    },
    updates: () => setUpdating(true),
  };
  useEffect(
    () =>
      window.desktop?.onAction((a) => {
        if (busy) return;
        if (a === "copy" || a === "paste") {
          if (editingField(document.activeElement)) {
            void window.desktop?.nativeClipboard(a).catch(report);
          } else if (!modal && !exporting && !printing && !updating) {
            if (a === "paste") void pasteClipboard();
            else if (tool === "select" && selected) void copySelected();
            else void window.desktop?.nativeClipboard("copy").catch(report);
          }
          return;
        }
        if (
          ["undo", "redo"].includes(a) &&
          (document.activeElement instanceof HTMLInputElement ||
            document.activeElement instanceof HTMLTextAreaElement)
        ) {
          document.execCommand(a);
          return;
        }
        if (modal || printing || updating || exporting) return;
        actions.current[a]?.();
      }),
    [
      busy,
      modal,
      exporting,
      printing,
      updating,
      tool,
      selected,
      doc,
      view,
      page,
    ],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        modal ||
        exporting ||
        printing ||
        updating ||
        e.isComposing ||
        e.key === "Process"
      )
        return;
      if (e.metaKey || e.ctrlKey) {
        if (
          !window.desktop &&
          e.key.toLowerCase() === "c" &&
          tool === "select" &&
          selected
        ) {
          e.preventDefault();
          void copySelected();
        } else if (e.key.toLowerCase() === "p") {
          e.preventDefault();
          if (doc) setPrinting(true);
        } else if (e.key.toLowerCase() === "e" && e.shiftKey) {
          e.preventDefault();
          setExporting(true);
        } else if (e.key === "f") {
          e.preventDefault();
          search.current?.focus();
        } else if (
          !window.desktop &&
          ["o", "n", "s", "z"].includes(e.key.toLowerCase())
        ) {
          e.preventDefault();
          actions.current[
            e.key === "z"
              ? e.shiftKey
                ? "redo"
                : "undo"
              : ({ o: "open", n: "new", s: "save" } as Record<string, string>)[
                  e.key
                ]
          ]?.();
        }
        return;
      }
      if (busy) return;
      if (tool === "select" && selected) {
        if (["Delete", "Backspace"].includes(e.key)) {
          e.preventDefault();
          void edit({ kind: "objectDelete", page, id: selected.id });
          return;
        }
        const delta = (
          {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          } as Record<string, number[]>
        )[e.key];
        if (delta && info) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1,
            r = selected.rect,
            w = r[2] - r[0],
            h = r[3] - r[1],
            x = Math.max(0, Math.min(info.width - w, r[0] + delta[0] * step)),
            y = Math.max(0, Math.min(info.height - h, r[1] + delta[1] * step));
          void edit({
            kind: "objectTransform",
            page,
            id: selected.id,
            rect: [x, y, x + w, y + h],
          });
          return;
        }
      }
      const t = tools.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (t) chooseTool(t.id);
      if (doc && e.key === "ArrowRight")
        setPage((p) => Math.min(doc.pages.length - 1, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
      if (e.key === "Escape") setTool("read");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    doc,
    busy,
    modal,
    exporting,
    printing,
    updating,
    selected,
    tool,
    page,
    info,
  ]);
  function point(e: React.PointerEvent): Point {
    const r = sheet.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(view!.width, (e.clientX - r.left) / scale)),
      Math.max(0, Math.min(view!.height, (e.clientY - r.top) / scale)),
    ];
  }
  async function imageAt(p: Point) {
    try {
      if (window.desktop) {
        const f = await window.desktop.open("image");
        if (f)
          await edit({
            kind: "image",
            page,
            point: p,
            bytes: f.bytes,
            width: Math.min(200, view!.width - p[0]),
          });
      } else {
        imageInput.current!.dataset.x = String(p[0]);
        imageInput.current!.dataset.y = String(p[1]);
        imageInput.current?.click();
      }
    } catch (e) {
      report(e);
    }
  }
  function pointerDown(e: React.PointerEvent) {
    if (inline || !ready || ["read", "edit", "highlight"].includes(tool))
      return;
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    const p = point(e);
    if (tool === "text" || tool === "note") {
      if (tool === "text") {
        setAllowSubstitution(false);
        setFontFamily("auto");
        setFontBlocked(true);
      }
      setModal({ kind: tool, text: "", point: p });
      return;
    }
    if (tool === "image") {
      void imageAt(p);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag([p, p]);
  }
  function pointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = point(e);
    setDrag((d) => (d ? (tool === "ink" ? [...d, p] : [d[0], p]) : null));
  }
  function pointerUp() {
    if (!drag) return;
    const points = drag;
    setDrag(null);
    if (tool === "ink") {
      if (points.length > 2)
        void edit({ kind: "ink", page, points, color: rgb, width: 2 });
      return;
    }
    const a = points[0],
      b = points[points.length - 1],
      rect: Rect = [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
      ];
    if (
      rect[2] - rect[0] > 3 &&
      rect[3] - rect[1] > 3 &&
      (tool === "rectangle" || tool === "highlight")
    )
      void edit({
        kind: tool,
        page,
        rect,
        color: tool === "highlight" ? [1, 0.79, 0.15] : rgb,
      });
  }
  async function submitModal() {
    if (!modal || busy) return;
    const m = modal;
    let ok = false;
    if (inline && fontBlocked) return;
    if (m.kind === "password")
      ok = await run("Unlocking PDF", async () => {
        try {
          loaded(
            await engine.open(pendingFile.current!.bytes, m.text),
            pendingFile.current!.name,
          );
          pendingFile.current = null;
        } catch (e) {
          if ((e as Error).message === "PASSWORD_REQUIRED")
            throw new Error("Incorrect password. Try again.");
          throw e;
        }
      });
    else if (m.kind === "replace")
      ok = await edit({
        kind: "replace",
        page,
        line: m.line!.id,
        text: m.text,
        font: fontFamily,
        size,
        fitOriginal,
        allowSubstitution,
        color: rgb,
      });
    else if (m.kind === "object")
      ok = await edit({
        kind: "objectText",
        page,
        id: m.object!.id,
        text: m.text,
        size,
        color: rgb,
        font: fontFamily,
        allowSubstitution,
        width:
          m.object!.wrapWidth ||
          Math.max(m.object!.rect[2] - m.object!.rect[0], size * 3),
      });
    else if (m.kind === "text")
      ok = await edit({
        kind: "text",
        page,
        point: m.point!,
        text: m.text,
        size,
        color: rgb,
        font: fontFamily,
        allowSubstitution,
      });
    else if (m.kind === "note")
      ok = await edit({ kind: "note", page, point: m.point!, text: m.text });
    if (ok) setModal(null);
  }
  async function doSearch() {
    if (!doc) return;
    await run("Searching document", async () => {
      const found = await engine.search(query);
      setHits(found);
      setHit(0);
      if (found.length) setPage(found[0].page);
      else setToast("No matching text found. Scanned pages need OCR.");
    });
  }
  const selectedHint =
    tool === "edit" && view && !view.lines.length
      ? "No selectable text on this page. Scanned PDFs need OCR before text can be edited."
      : hints[tool];
  return (
    <div
      className={`app ${doc ? "has-document" : ""}`}
      onClickCapture={(e) => {
        if (
          inline &&
          !(e.target as HTMLElement).closest(
            ".inline-text-editor, .inline-text-controls, .style-picker, .zoom-controls, .language-switch, .error-banner",
          )
        ) {
          e.preventDefault();
          e.stopPropagation();
          setToast(
            "Apply or cancel the current text edit before using another tool.",
          );
        }
      }}
    >
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="application/pdf,.pdf"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) await openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
        }}
      />
      <input
        ref={imageInput}
        hidden
        type="file"
        accept="image/png,image/jpeg"
        onChange={async (e) => {
          const f = e.target.files?.[0],
            p: Point = [Number(e.target.dataset.x), Number(e.target.dataset.y)];
          e.target.value = "";
          if (f)
            await edit({
              kind: "image",
              page,
              point: p,
              bytes: new Uint8Array(await f.arrayBuffer()),
              width: Math.min(200, view!.width - p[0]),
            });
        }}
      />
      <input
        ref={fontInput}
        type="file"
        hidden
        accept=".ttf,.otf,.ttc"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            await loadFont(new Uint8Array(await file.arrayBuffer()), file.name);
        }}
      />
      <header className="topbar">
        <div className="wordmark">
          <div className="brand-icon">
            <Stack size={22} weight="bold" />
          </div>
          {tr("pageline")}
          <button
            type="button"
            className="app-version"
            aria-label={`Pageline version ${packageInfo.version}`}
            title={tr("Check for updates")}
            disabled={!!modal || !!busy || printing}
            onClick={() => setUpdating(true)}
          >
            {packageInfo.version}
          </button>
          <span className="brand-divider" />
        </div>
        <div className="document-name">
          {doc ? (
            <>
              <FilePdf size={18} />
              <span>{name}</span>
              {(dirty || draftDirty) && (
                <span className="unsaved" title={tr("Unsaved changes")} />
              )}
            </>
          ) : (
            <span className="app-caption">{tr("Local PDF workspace")}</span>
          )}
        </div>
        <div className="top-actions">
          <label className="language-switch">
            <span>{tr("Language / 語言")}</span>
            <select
              aria-label="Language / 語言"
              value={locale}
              onChange={(e) => {
                const value = e.target.value as Locale;
                setLocale(value);
                changeLocale(value);
              }}
            >
              <option value="en">{tr("English")}</option>
              <option value="zh-TW">繁體中文</option>
            </select>
          </label>
          <span className="local-label">
            <LockSimple size={13} />
            {tr("On your device")}
          </span>
          <button
            className="button subtle"
            onClick={chooseOpen}
            disabled={!!busy}
          >
            <FolderOpen size={17} />
            {tr("Open PDF")}
          </button>
          {doc && (
            <IconButton
              title={tr("Print PDF")}
              disabled={!!busy || !!modal}
              onClick={() => setPrinting(true)}
            >
              <Printer size={19} />
            </IconButton>
          )}
          {doc && (
            <button
              className="button subtle"
              onClick={() => setExporting(true)}
              disabled={!!busy}
            >
              <Export size={17} />
              {tr("Export")}
            </button>
          )}
          <button
            className="button primary"
            onClick={save}
            disabled={!doc || !!busy}
          >
            <DownloadSimple size={17} />
            {tr("Save copy")}
          </button>
        </div>
      </header>
      {doc ? (
        <>
          <nav className="toolbar" aria-label={tr("PDF tools")}>
            <div className="tool-group">
              <IconButton
                title={tr("Toggle pages")}
                onClick={() => setSidebar((s) => !s)}
              >
                <SidebarSimple size={19} />
              </IconButton>
              <span className="separator" />
              {tools.map((t) => (
                <button
                  key={t.id}
                  className={`tool tool-${t.id} ${tool === t.id ? "active" : ""}`}
                  title={`${tr(t.label)} (${t.key})`}
                  aria-label={tr(t.label)}
                  aria-pressed={tool === t.id}
                  disabled={!!busy || (!doc.editable && t.id !== "read")}
                  onClick={() => chooseTool(t.id)}
                >
                  {t.id === "highlight" && (
                    <span className="tool-group-divider" aria-hidden="true" />
                  )}
                  <t.icon size={18} />
                  <span className="tool-label">
                    {tr(t.id === "read" ? "Read" : t.label)}
                  </span>
                </button>
              ))}
            </div>
            <div className="tool-group">
              <IconButton
                title={tr("Undo")}
                disabled={!doc.canUndo || !!busy}
                onClick={undo}
              >
                <ArrowUUpLeft size={19} />
              </IconButton>
              <IconButton
                title={tr("Redo")}
                disabled={!doc.canRedo || !!busy}
                onClick={redo}
              >
                <ArrowUUpRight size={19} />
              </IconButton>
            </div>
          </nav>
          <main className="workspace">
            {sidebar && (
              <aside className="pages-panel">
                <div className="panel-heading">
                  <span>{tr("Pages")}</span>
                  <span className="count">{doc.pages.length}</span>
                </div>
                <div className="page-list">
                  {doc.pages.map((_, i) => (
                    <Thumb
                      key={i}
                      index={i}
                      revision={revision}
                      selected={page === i}
                      onClick={() => {
                        if (!busy) setPage(i);
                      }}
                    />
                  ))}
                </div>
                <div className="pages-actions">
                  <button
                    className="button subtle"
                    onClick={merge}
                    disabled={!!busy || !doc.editable}
                  >
                    <Plus size={16} />
                    {tr("Merge PDF")}
                  </button>
                  <IconButton
                    title={tr("Insert blank page")}
                    disabled={!!busy || !doc.editable}
                    onClick={() => edit({ kind: "blank", page })}
                  >
                    <FilePlus size={18} />
                  </IconButton>
                </div>
              </aside>
            )}
            <section className="document-area">
              <div className="document-controls">
                <div className="page-navigation">
                  <IconButton
                    title={tr("Previous page")}
                    disabled={page === 0 || !!busy}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ArrowLeft size={15} />
                  </IconButton>
                  <span>
                    {tr("Page")}{" "}
                    <input
                      aria-label={tr("Page number")}
                      disabled={!!inline || !!busy}
                      key={`${page}-${doc.pages.length}`}
                      type="number"
                      min="1"
                      max={doc.pages.length}
                      defaultValue={page + 1}
                      onBlur={(e) =>
                        setPage(
                          Math.max(
                            0,
                            Math.min(
                              doc.pages.length - 1,
                              (Number(e.target.value) || 1) - 1,
                            ),
                          ),
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />{" "}
                    {tr("of")} {doc.pages.length}
                  </span>
                  <IconButton
                    title={tr("Next page")}
                    disabled={page === doc.pages.length - 1 || !!busy}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ArrowRight size={15} />
                  </IconButton>
                </div>
                <div className="zoom-controls">
                  <IconButton
                    title={tr("Zoom out")}
                    onClick={() => {
                      setFit(false);
                      setZoom(Math.max(0.25, scale - 0.1));
                    }}
                  >
                    <Minus size={15} />
                  </IconButton>
                  <button
                    className="zoom-number"
                    title={tr("Reset zoom")}
                    onClick={() => {
                      setFit(false);
                      setZoom(1);
                    }}
                  >
                    {Math.round(scale * 100)}%
                  </button>
                  <IconButton
                    title={tr("Zoom in")}
                    onClick={() => {
                      setFit(false);
                      setZoom(Math.min(3, scale + 0.1));
                    }}
                  >
                    <Plus size={15} />
                  </IconButton>
                  <span className="separator" />
                  <IconButton
                    title={tr("Fit to width")}
                    className={`icon-button ${fit ? "chosen" : ""}`}
                    onClick={() => setFit(true)}
                  >
                    <ArrowsOutSimple size={18} />
                  </IconButton>
                </div>
              </div>
              <div className={`viewport tool-${tool}`} ref={viewport}>
                {view && (
                  <div
                    className="sheet"
                    ref={sheet}
                    style={{
                      width: view.width * scale,
                      height: view.height * scale,
                    }}
                    onPointerDown={pointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    onPointerCancel={() => setDrag(null)}
                  >
                    <img
                      className="page-image"
                      src={url}
                      alt={`PDF page ${page + 1}`}
                      draggable={false}
                    />
                    {!inline &&
                      ready &&
                      ["read", "highlight"].includes(tool) && (
                        <TextSelectionLayer
                          key={`${page}-${revision}-${tool}`}
                          page={page}
                          scale={scale}
                          lines={view.lines}
                          highlight={tool === "highlight"}
                          editable={doc.editable}
                          onEdit={editLine}
                          onHighlight={async (start, end) =>
                            edit({
                              kind: "highlightText",
                              page,
                              start,
                              end,
                              color: [1, 0.79, 0.15],
                            })
                          }
                        />
                      )}
                    {!inline && ready && tool === "edit" && (
                      <div className="text-layer">
                        {view.lines.map((l) => (
                          <button
                            key={l.id}
                            className="text-hit"
                            aria-label={`${tr("Edit line:")} ${l.text}`}
                            title={`${l.font} · ${l.size} pt`}
                            style={{
                              left: l.rect[0] * scale,
                              top: l.rect[1] * scale,
                              width: (l.rect[2] - l.rect[0]) * scale,
                              height: (l.rect[3] - l.rect[1]) * scale,
                            }}
                            onClick={() => editLine(l)}
                          />
                        ))}
                      </div>
                    )}
                    {!inline && ready && tool === "select" && (
                      <ObjectLayer
                        objects={view.objects}
                        selected={selectedId}
                        scale={scale}
                        width={view.width}
                        height={view.height}
                        onSelect={(id) => {
                          setSelectedId(id);
                          setTab("tools");
                        }}
                        onTransform={(id, rect) =>
                          void edit({ kind: "objectTransform", page, id, rect })
                        }
                        onEdit={editObject}
                      />
                    )}
                    {inline && (
                      <InlineTextEditor
                        draft={inline}
                        page={page}
                        scale={scale}
                        pageWidth={view.width}
                        pageHeight={view.height}
                        host={editorHost}
                        actionsHost={editorActionsHost}
                        size={size}
                        color={color}
                        font={fontFamily}
                        fitOriginal={fitOriginal}
                        customFonts={customFonts}
                        blocked={fontBlocked}
                        busy={!!busy}
                        onText={(text) =>
                          setModal((m) => (m ? { ...m, text } : m))
                        }
                        onSize={setSize}
                        onColor={setColor}
                        onFont={setFontFamily}
                        onFit={setFitOriginal}
                        onBlocked={setFontBlocked}
                        onImport={() => void importFont()}
                        onApply={() => void submitModal()}
                        onCancel={() => setModal(null)}
                        allowSubstitution={allowSubstitution}
                        onAllowSubstitution={setAllowSubstitution}
                        pickingStyle={pickingStyle}
                        onPickStyle={() => setPickingStyle((v) => !v)}
                      />
                    )}
                    {inline && pickingStyle && (
                      <div className="style-picker">
                        {view.lines
                          .filter((l) => l.text.trim() && l.horizontal)
                          .map((l) => (
                            <button
                              key={l.id}
                              className="style-sample"
                              aria-label={`${tr("Match style from:")} ${l.text}`}
                              title={`${l.font} · ${l.size} pt`}
                              style={{
                                left: l.rect[0] * scale,
                                top: l.rect[1] * scale,
                                width: (l.rect[2] - l.rect[0]) * scale,
                                height: (l.rect[3] - l.rect[1]) * scale,
                              }}
                              onClick={() => {
                                setFontBlocked(true);
                                setFontFamily("document:" + l.font);
                                setSize(l.size);
                                setColor(
                                  "#" +
                                    l.color
                                      .map((v) =>
                                        Math.round(v * 255)
                                          .toString(16)
                                          .padStart(2, "0"),
                                      )
                                      .join(""),
                                );
                                setAllowSubstitution(false);
                                setPickingStyle(false);
                              }}
                            />
                          ))}
                      </div>
                    )}
                    {hits
                      .filter((h, i) => h.page === page && i === hit)
                      .map((h, i) => (
                        <div
                          key={i}
                          className="search-hit"
                          style={{
                            left: h.rect[0] * scale,
                            top: h.rect[1] * scale,
                            width: (h.rect[2] - h.rect[0]) * scale,
                            height: (h.rect[3] - h.rect[1]) * scale,
                          }}
                        />
                      ))}
                    {drag && (
                      <svg
                        className="drawing-overlay"
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${view.width} ${view.height}`}
                      >
                        {tool === "ink" ? (
                          <polyline
                            points={drag.map((p) => p.join(",")).join(" ")}
                            fill="none"
                            stroke={color}
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        ) : (
                          <rect
                            x={Math.min(drag[0][0], drag.at(-1)![0])}
                            y={Math.min(drag[0][1], drag.at(-1)![1])}
                            width={Math.abs(drag.at(-1)![0] - drag[0][0])}
                            height={Math.abs(drag.at(-1)![1] - drag[0][1])}
                            fill={
                              tool === "highlight" ? "#ffce4266" : "transparent"
                            }
                            stroke={tool === "highlight" ? "#ddac26" : color}
                          />
                        )}
                      </svg>
                    )}
                  </div>
                )}
                {(rendering || busy) && (
                  <div className="loading">
                    <SpinnerGap className="spin" size={16} />
                    {tr(busy || "Rendering page")}
                  </div>
                )}
              </div>
              <div className="document-hint">
                <span
                  className={`mode-dot ${tool === "read" ? "neutral" : ""}`}
                />
                {tr(selectedHint)}
              </div>
            </section>
            <aside className="inspector">
              <div className="inspector-tabs">
                {(["tools", "markup", "comments", "forms"] as const).map(
                  (t) => (
                    <button
                      key={t}
                      className={tab === t ? "selected" : ""}
                      onClick={() => setTab(t)}
                      aria-pressed={tab === t}
                    >
                      {tr(t[0].toUpperCase() + t.slice(1))}
                    </button>
                  ),
                )}
              </div>
              <div className="inspector-body">
                {inline ? (
                  <div ref={setEditorHost} />
                ) : tab === "tools" ? (
                  <>
                    <div className="section-label">
                      {tr(tools.find((t) => t.id === tool)?.label || "")}
                    </div>
                    <h2>
                      {tr(
                        tool === "read"
                          ? "Document tools"
                          : tool === "edit"
                            ? "Edit text"
                            : tool === "select"
                              ? "Object properties"
                              : "Tool settings",
                      )}
                    </h2>
                    <p className="inspector-copy">{tr(selectedHint)}</p>
                    <button
                      className="button subtle paste-page-button"
                      disabled={!ready || !doc.editable}
                      onClick={() => void pasteClipboard()}
                    >
                      <ClipboardText size={16} />
                      {tr("Paste onto page")}
                    </button>
                    {selected && tool === "select" && (
                      <ObjectControls
                        key={`${selected.id}-${revision}`}
                        object={selected}
                        pageWidth={view!.width}
                        pageHeight={view!.height}
                        disabled={!ready}
                        onCopy={() => void copySelected()}
                        onRotate={(degrees) =>
                          void edit({
                            kind: "objectRotate",
                            page,
                            id: selected.id,
                            degrees,
                          })
                        }
                        onTransform={(rect) =>
                          void edit({
                            kind: "objectTransform",
                            page,
                            id: selected.id,
                            rect,
                          })
                        }
                        onEdit={() => editObject(selected)}
                        onDelete={() =>
                          void edit({
                            kind: "objectDelete",
                            page,
                            id: selected.id,
                          })
                        }
                      />
                    )}
                    {tool === "select" && !selected && (
                      <div className="notice">
                        <p>
                          {tr(
                            "Choose an added image or text box to edit its properties.",
                          )}
                        </p>
                      </div>
                    )}
                    {["text", "ink", "rectangle"].includes(tool) && (
                      <div className="properties">
                        <label>
                          {tr("Color")}
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            aria-label={tr("Text and drawing color")}
                          />
                        </label>
                        {tool === "text" && (
                          <label>
                            {tr("Text size")}{" "}
                            <span>
                              <input
                                type="number"
                                min="6"
                                max="120"
                                value={size}
                                onChange={(e) =>
                                  setSize(
                                    Math.max(
                                      6,
                                      Math.min(120, Number(e.target.value)),
                                    ),
                                  )
                                }
                              />{" "}
                              {tr("pt")}
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                    {tool === "edit" && (
                      <div className="notice">
                        <PencilSimple size={16} />
                        <p>
                          {tr(
                            "Edits preserve the original font where available. Preview substitutions and choose whether longer text should shrink.",
                          )}
                        </p>
                      </div>
                    )}
                    <div className="inspector-section">
                      <div className="section-label">{tr("Current page")}</div>
                      <div className="page-tools">
                        <button
                          onClick={() => edit({ kind: "rotate", page })}
                          disabled={!!busy || !doc.editable}
                        >
                          <ArrowClockwise size={19} />
                          <span>{tr("Rotate")}</span>
                        </button>
                        <button
                          onClick={() => edit({ kind: "duplicate", page })}
                          disabled={!!busy || !doc.editable}
                        >
                          <Copy size={19} />
                          <span>{tr("Duplicate")}</span>
                        </button>
                        <button
                          onClick={() =>
                            edit({ kind: "move", page, to: page - 1 }).then(
                              () => setPage(Math.max(0, page - 1)),
                            )
                          }
                          disabled={page === 0 || !!busy || !doc.editable}
                        >
                          <ArrowUp size={19} />
                          <span>{tr("Move up")}</span>
                        </button>
                        <button
                          onClick={() =>
                            edit({ kind: "move", page, to: page + 1 }).then(
                              () =>
                                setPage(
                                  Math.min(doc.pages.length - 1, page + 1),
                                ),
                            )
                          }
                          disabled={
                            page === doc.pages.length - 1 ||
                            !!busy ||
                            !doc.editable
                          }
                        >
                          <ArrowDown size={19} />
                          <span>{tr("Move down")}</span>
                        </button>
                      </div>
                      <button
                        className="delete-page"
                        onClick={() => edit({ kind: "delete", page })}
                        disabled={
                          doc.pages.length === 1 || !!busy || !doc.editable
                        }
                      >
                        <Trash size={15} />
                        {tr("Delete page")}
                      </button>
                    </div>
                    <div className="inspector-section">
                      <div className="section-label">
                        {tr("Find in document")}
                      </div>
                      <form
                        className="search-input"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void doSearch();
                        }}
                      >
                        <MagnifyingGlass size={16} />
                        <input
                          ref={search}
                          placeholder={tr("Search text…")}
                          aria-label={tr("Search document")}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        <button title={tr("Find")} disabled={!!busy || !query}>
                          <ArrowRight size={16} />
                        </button>
                      </form>
                      {hits.length > 0 && (
                        <div className="search-results">
                          <span>
                            {`${hit + 1} ${tr("of")} ${hits.length} ${tr("matches")}`}
                          </span>
                          <IconButton
                            title={tr("Previous match")}
                            onClick={() => {
                              const i = (hit - 1 + hits.length) % hits.length;
                              setHit(i);
                              setPage(hits[i].page);
                            }}
                          >
                            <ArrowUp size={14} />
                          </IconButton>
                          <IconButton
                            title={tr("Next match")}
                            onClick={() => {
                              const i = (hit + 1) % hits.length;
                              setHit(i);
                              setPage(hits[i].page);
                            }}
                          >
                            <ArrowDown size={14} />
                          </IconButton>
                        </div>
                      )}
                    </div>
                  </>
                ) : tab === "comments" || tab === "markup" ? (
                  <AnnotationPanel
                    mode={tab}
                    annotations={view?.annotations || []}
                    busy={!!busy}
                    editable={doc.editable}
                    onRemove={(index) =>
                      void edit({ kind: "removeAnnotation", page, index })
                    }
                    onComment={() => chooseTool("note")}
                  />
                ) : (
                  <>
                    <div className="section-label">
                      {tr("Interactive PDF fields")}
                    </div>
                    <h2>{tr("Form fields")}</h2>
                    {view?.widgets.length ? (
                      view.widgets.map((w) => (
                        <div
                          className="form-field"
                          key={`${revision}-${w.index}`}
                        >
                          <label>{w.name || `Field ${w.index + 1}`}</label>
                          {["checkbox", "radiobutton"].includes(
                            w.type.toLowerCase(),
                          ) ? (
                            <button
                              className="button subtle"
                              disabled={w.readonly || !!busy}
                              onClick={() =>
                                edit({
                                  kind: "form",
                                  page,
                                  index: w.index,
                                  value: "",
                                })
                              }
                            >
                              {w.value !== "Off" && <Check size={16} />}
                              {tr("Toggle")} {w.type}
                            </button>
                          ) : ["text", "combobox", "listbox"].includes(
                              w.type.toLowerCase(),
                            ) ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const value = new FormData(e.currentTarget).get(
                                  "value",
                                ) as string;
                                void edit({
                                  kind: "form",
                                  page,
                                  index: w.index,
                                  value,
                                });
                              }}
                            >
                              {w.options.length ? (
                                <select
                                  name="value"
                                  defaultValue={w.value}
                                  disabled={w.readonly}
                                >
                                  {w.options.map((o) => (
                                    <option key={o}>{o}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  name="value"
                                  aria-label={w.name}
                                  defaultValue={w.value}
                                  disabled={w.readonly}
                                />
                              )}
                              <button
                                className="button subtle"
                                disabled={w.readonly || !!busy}
                              >
                                {tr("Apply")}
                              </button>
                            </form>
                          ) : (
                            <p className="inspector-copy">
                              {w.type}
                              {tr("fields are view only.")}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="empty-panel">
                        <TextT size={28} />
                        <p>{tr("No fillable fields.")}</p>
                        <span>
                          {tr(
                            "You can still use Add text to type onto the page.",
                          )}
                        </span>
                        <button
                          className="button subtle"
                          onClick={() => {
                            setTool("text");
                            setTab("tools");
                          }}
                        >
                          {tr("Add text")}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="inspector-footer">
                {inline ? (
                  <div
                    className="inline-footer-host"
                    ref={setEditorActionsHost}
                  />
                ) : (
                  <>
                    <LockSimple size={15} />
                    <span>
                      {tr("Private by design.")}
                      <br />
                      {tr("Your files stay on this device.")}
                    </span>
                  </>
                )}
              </div>
            </aside>
          </main>
          <footer className="statusbar">
            <span>
              {dirty || draftDirty ? (
                <>
                  <span className="mode-dot" />
                  {tr("Unsaved changes")}
                </>
              ) : (
                <>
                  <CheckCircle size={13} />
                  {tr("No unsaved edits")}
                </>
              )}
            </span>
            <span>
              {info &&
                `${Math.round(info.width)} × ${Math.round(info.height)} pt`}
              <span className="status-divider" />
              {tr("PDF document")}
            </span>
            <span>
              <Keyboard size={14} />
              {tr("V Read · M Move · E Edit · T Add text")}
            </span>
          </footer>
        </>
      ) : (
        <main className="home">
          <section className="home-intro">
            <div className="eyebrow">
              <span />
              {tr("Local document workspace")}
            </div>
            <h1>{tr("Your PDF workspace.")}</h1>
            <p>
              {tr(
                "Read, edit and annotate your documents. Open a PDF to get started.",
              )}
            </p>
            <div className="home-buttons">
              <button
                className="button primary large"
                onClick={chooseOpen}
                disabled={!!busy}
              >
                <FolderOpen size={19} />
                {tr("Open a PDF")}
                <ArrowRight size={17} />
              </button>
              <button
                className="button subtle large"
                onClick={() => newDocument()}
                disabled={!!busy}
              >
                <FilePlus size={18} />
                {tr("Create blank PDF")}
              </button>
            </div>
            <button
              className="sample-link"
              onClick={() => newDocument(true)}
              disabled={!!busy}
            >
              {tr("Explore with a sample document")}
              <ArrowRight size={15} />
            </button>
            <div className="home-footnote">
              <LockSimple size={14} />
              {tr("No uploads. No account. Just your documents.")}
            </div>
          </section>
          <section className="home-guide" aria-label={tr("Workspace guide")}>
            <div className="guide-top">
              <span>{tr("A focused workflow")}</span>
              <FilePdf size={21} />
            </div>
            <h2>{tr("Everything in its place.")}</h2>
            <div className="guide-row">
              <span className="guide-step">01</span>
              <div>
                <strong>{tr("Read & edit")}</strong>
                <p>{tr("Find text and make changes directly on the page.")}</p>
              </div>
              <PencilSimple size={18} />
            </div>
            <div className="guide-row">
              <span className="guide-step">02</span>
              <div>
                <strong>{tr("Highlight & draw")}</strong>
                <p>{tr("Mark passages without creating written comments.")}</p>
              </div>
              <Highlighter size={18} />
            </div>
            <div className="guide-row">
              <span className="guide-step">03</span>
              <div>
                <strong>{tr("Add a comment")}</strong>
                <p>{tr("Write a note only when you choose Comment.")}</p>
              </div>
              <Note size={18} />
            </div>
            <div className="guide-bottom">
              <Stack size={16} />
              <span>
                {tr("Organize pages. Export a copy. Keep the original.")}
              </span>
            </div>
          </section>
        </main>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <WarningCircle size={19} />
          <span>{tr(error)}</span>
          <IconButton title={tr("Dismiss error")} onClick={() => setError("")}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={18} />
          {tr(toast)}
        </div>
      )}
      {!doc && busy && (
        <div className="home-busy">
          <SpinnerGap className="spin" size={18} />
          {tr(busy)}…
        </div>
      )}
      {exporting && doc && (
        <ExportDialog
          page={page}
          count={doc.pages.length}
          busy={!!busy}
          onClose={() => setExporting(false)}
          onExport={(options) => void exportFile(options)}
        />
      )}
      {printing && doc && (
        <PrintDialog
          page={page}
          count={doc.pages.length}
          busy={!!busy}
          onClose={() => setPrinting(false)}
          onPrint={(options) => void printFile(options)}
          onSave={(options) => void savePrintFile(options)}
        />
      )}
      {updating && <UpdatesDialog onClose={() => setUpdating(false)} />}
      {modal && !inline && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onSubmit={(e) => {
              e.preventDefault();
              void submitModal();
            }}
          >
            <div className="modal-title">
              <h2 id="dialog-title">
                {tr(
                  (
                    {
                      text: "Add text",
                      replace: "Edit text line",
                      object: "Edit added text",
                      note: "Add a comment",
                      password: "Unlock PDF",
                      discard: "Discard unsaved changes?",
                    } as const
                  )[modal.kind],
                )}
              </h2>
              <IconButton
                title={tr("Cancel")}
                onClick={() => {
                  modal.resolve?.(false);
                  setModal(null);
                }}
                type="button"
              >
                <X size={19} />
              </IconButton>
            </div>
            {modal.kind === "discard" ? (
              <p>
                {tr(
                  "Your edits haven’t been saved. Save a copy first to keep them.",
                )}
              </p>
            ) : modal.kind === "password" ? (
              <>
                <p>{tr("Enter this document’s password to open it.")}</p>
                <input
                  autoFocus
                  type="password"
                  aria-label={tr("PDF password")}
                  value={modal.text}
                  onChange={(e) => {
                    setFontBlocked(true);
                    setModal({ ...modal, text: e.target.value });
                  }}
                />
              </>
            ) : (
              <>
                <p>
                  {tr(
                    modal.kind === "replace"
                      ? "Replace this line while preserving its font, size, and baseline. Enable fitting only if you want longer text to shrink."
                      : modal.kind === "object"
                        ? "Edit this text object. You can change its content, font, size, and color."
                        : modal.kind === "text"
                          ? "Your text will appear at the point you selected."
                          : "This comment stays with the PDF as an annotation.",
                  )}
                </p>
                <textarea
                  autoFocus
                  aria-label={tr(
                    modal.kind === "replace" || modal.kind === "object"
                      ? "Replacement text"
                      : "Text content",
                  )}
                  rows={modal.kind === "replace" ? 3 : 5}
                  value={modal.text}
                  onChange={(e) => {
                    setFontBlocked(true);
                    setModal({ ...modal, text: e.target.value });
                  }}
                />
                <p className="input-hint">
                  {tr(
                    "Type in any supported language using your system keyboard. Interface language does not translate PDF contents.",
                  )}
                </p>
              </>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button subtle"
                onClick={() => {
                  modal.resolve?.(false);
                  setModal(null);
                }}
              >
                {tr("Cancel")}
              </button>
              {modal.kind === "discard" ? (
                <button
                  type="button"
                  className="button danger"
                  onClick={() => {
                    modal.resolve?.(true);
                    setModal(null);
                  }}
                >
                  {tr("Discard changes")}
                </button>
              ) : (
                <button
                  className="button primary"
                  type="submit"
                  disabled={
                    !!busy ||
                    (["text", "object", "replace"].includes(modal.kind) &&
                      fontBlocked) ||
                    (modal.kind !== "replace" &&
                      modal.kind !== "object" &&
                      !modal.text.trim())
                  }
                >
                  {tr(modal.kind === "password" ? "Unlock" : "Apply change")}
                  <Check size={16} />
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
