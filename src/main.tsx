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
} from "./types";
import "./style.css";

type Tool =
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
  read: "Select text to copy. Use the page list to navigate.",
  edit: "Click a text line to replace it. Longer text shrinks to fit the original line.",
  text: "Click the page to place new text.",
  highlight: "Drag across a line or area to highlight it.",
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
      aria-label={`Page ${index + 1}`}
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
    [tab, setTab] = useState<"tools" | "comments" | "forms">("tools");
  const [modal, setModal] = useState<{
    kind: "text" | "replace" | "note" | "password" | "discard";
    text: string;
    point?: Point;
    line?: TextLine;
    resolve?: (v: any) => void;
  } | null>(null);
  const [drag, setDrag] = useState<Point[] | null>(null),
    [viewportWidth, setViewportWidth] = useState(900);
  const viewport = useRef<HTMLDivElement>(null),
    sheet = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    search = useRef<HTMLInputElement>(null),
    pendingFile = useRef<{ bytes: Uint8Array; name: string } | null>(null),
    actions = useRef<Record<string, () => void>>({});
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
    window.desktop?.dirty(dirty);
    document.title = `${dirty ? "● " : ""}${doc ? name + " · " : ""}Folio`;
  }, [dirty, name, doc]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty && !window.desktop) e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
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
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      report(e);
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
    setDoc(d);
    setName(n);
    setSavedPosition(d.position);
    setPage(0);
    setView(null);
    setRevision((v) => v + 1);
    setTool("read");
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
          "FOLIO / YOUR EVERYDAY PDF WORKSPACE",
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
      loaded(d, sample ? "Welcome to Folio.pdf" : "Untitled.pdf");
    });
  }
  async function edit(e: Edit) {
    await run("Applying edit", async () => {
      const d = await engine.edit(e);
      setDoc(d);
      setPage((p) => Math.min(p, d.pages.length - 1));
      setRevision((v) => v + 1);
    });
  }
  async function undo() {
    if (!doc?.canUndo) return;
    await run("Undoing", async () => {
      const d = await engine.undo();
      setDoc(d);
      setPage((p) => Math.min(p, d.pages.length - 1));
      setRevision((v) => v + 1);
    });
  }
  async function redo() {
    if (!doc?.canRedo) return;
    await run("Redoing", async () => {
      const d = await engine.redo();
      setDoc(d);
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
  actions.current = {
    open: () => void chooseOpen(),
    new: () => void newDocument(),
    save: () => void save(),
    undo: () => void undo(),
    redo: () => void redo(),
  };
  useEffect(
    () =>
      window.desktop?.onAction((a) => {
        if (busy || modal) return;
        if (
          ["undo", "redo"].includes(a) &&
          (document.activeElement instanceof HTMLInputElement ||
            document.activeElement instanceof HTMLTextAreaElement)
        )
          return;
        actions.current[a]?.();
      }),
    [busy, modal],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        modal
      )
        return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "f") {
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
      const t = tools.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (t) setTool(t.id);
      if (doc && e.key === "ArrowRight")
        setPage((p) => Math.min(doc.pages.length - 1, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
      if (e.key === "Escape") setTool("read");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [doc, busy, modal]);
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
    if (!ready || tool === "read" || tool === "edit") return;
    const p = point(e);
    if (tool === "text" || tool === "note") {
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
    if (!modal) return;
    const m = modal;
    setModal(null);
    if (m.kind === "password") {
      await run("Unlocking PDF", async () => {
        try {
          loaded(
            await engine.open(pendingFile.current!.bytes, m.text),
            pendingFile.current!.name,
          );
          pendingFile.current = null;
        } catch (e) {
          if ((e as Error).message === "PASSWORD_REQUIRED") {
            setModal({ ...m, text: "" });
            throw new Error("Incorrect password. Try again.");
          }
          throw e;
        }
      });
    } else if (m.kind === "replace")
      await edit({ kind: "replace", page, line: m.line!.id, text: m.text });
    else if (m.kind === "text")
      await edit({
        kind: "text",
        page,
        point: m.point!,
        text: m.text,
        size,
        color: rgb,
      });
    else if (m.kind === "note")
      await edit({ kind: "note", page, point: m.point!, text: m.text });
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
    <div className={`app ${doc ? "has-document" : ""}`}>
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
      <header className="topbar">
        <div className="wordmark">
          <div className="brand-icon">
            <Stack size={22} weight="bold" />
          </div>
          folio
          <span className="brand-divider" />
        </div>
        <div className="document-name">
          {doc ? (
            <>
              <FilePdf size={18} />
              <span>{name}</span>
              {dirty && <span className="unsaved" title="Unsaved changes" />}
            </>
          ) : (
            <span className="app-caption">
              A little more possible with every PDF.
            </span>
          )}
        </div>
        <div className="top-actions">
          <span className="local-label">
            <LockSimple size={13} />
            On your device
          </span>
          <button
            className="button subtle"
            onClick={chooseOpen}
            disabled={!!busy}
          >
            <FolderOpen size={17} />
            Open PDF
          </button>
          <button
            className="button primary"
            onClick={save}
            disabled={!doc || !!busy}
          >
            <DownloadSimple size={17} />
            Save copy
          </button>
        </div>
      </header>
      {doc ? (
        <>
          <nav className="toolbar" aria-label="PDF tools">
            <div className="tool-group">
              <IconButton
                title="Toggle pages"
                onClick={() => setSidebar((s) => !s)}
              >
                <SidebarSimple size={19} />
              </IconButton>
              <span className="separator" />
              {tools.map((t) => (
                <button
                  key={t.id}
                  className={`tool ${tool === t.id ? "active" : ""}`}
                  title={`${t.label} (${t.key})`}
                  aria-label={t.label}
                  aria-pressed={tool === t.id}
                  disabled={!!busy || (!doc.editable && t.id !== "read")}
                  onClick={() => {
                    setTool(t.id);
                    setTab("tools");
                  }}
                >
                  <t.icon size={19} />
                  {["read", "edit", "text"].includes(t.id) && (
                    <span>{t.id === "read" ? "Read" : t.label}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="tool-group">
              <IconButton
                title="Undo"
                disabled={!doc.canUndo || !!busy}
                onClick={undo}
              >
                <ArrowUUpLeft size={19} />
              </IconButton>
              <IconButton
                title="Redo"
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
                  <span>Pages</span>
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
                    Merge PDF
                  </button>
                  <IconButton
                    title="Insert blank page"
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
                    title="Previous page"
                    disabled={page === 0 || !!busy}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ArrowLeft size={15} />
                  </IconButton>
                  <span>
                    Page{" "}
                    <input
                      aria-label="Page number"
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
                    of {doc.pages.length}
                  </span>
                  <IconButton
                    title="Next page"
                    disabled={page === doc.pages.length - 1 || !!busy}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ArrowRight size={15} />
                  </IconButton>
                </div>
                <div className="zoom-controls">
                  <IconButton
                    title="Zoom out"
                    onClick={() => {
                      setFit(false);
                      setZoom(Math.max(0.25, scale - 0.1));
                    }}
                  >
                    <Minus size={15} />
                  </IconButton>
                  <button
                    className="zoom-number"
                    title="Reset zoom"
                    onClick={() => {
                      setFit(false);
                      setZoom(1);
                    }}
                  >
                    {Math.round(scale * 100)}%
                  </button>
                  <IconButton
                    title="Zoom in"
                    onClick={() => {
                      setFit(false);
                      setZoom(Math.min(3, scale + 0.1));
                    }}
                  >
                    <Plus size={15} />
                  </IconButton>
                  <span className="separator" />
                  <IconButton
                    title="Fit to width"
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
                    {ready && ["read", "edit"].includes(tool) && (
                      <div className="text-layer">
                        {view.lines.map((l) =>
                          tool === "edit" ? (
                            <button
                              key={l.id}
                              aria-label={`Edit line: ${l.text}`}
                              title={`${l.font} · ${Math.round(l.size)} pt`}
                              className="text-hit"
                              style={{
                                left: l.rect[0] * scale,
                                top: l.rect[1] * scale,
                                width: (l.rect[2] - l.rect[0]) * scale,
                                height: (l.rect[3] - l.rect[1]) * scale,
                              }}
                              onClick={() =>
                                setModal({
                                  kind: "replace",
                                  text: l.text,
                                  line: l,
                                })
                              }
                            />
                          ) : (
                            <span
                              key={l.id}
                              className="selectable-line"
                              style={{
                                left: l.rect[0] * scale,
                                top: l.rect[1] * scale,
                                fontSize: l.size * scale,
                                width: (l.rect[2] - l.rect[0]) * scale,
                                height: (l.rect[3] - l.rect[1]) * scale,
                              }}
                            >
                              {l.text}
                            </span>
                          ),
                        )}
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
                    {busy || "Rendering page"}
                  </div>
                )}
              </div>
              <div className="document-hint">
                <span
                  className={`mode-dot ${tool === "read" ? "neutral" : ""}`}
                />
                {selectedHint}
              </div>
            </section>
            <aside className="inspector">
              <div className="inspector-tabs">
                {(["tools", "comments", "forms"] as const).map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "selected" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <div className="inspector-body">
                {tab === "tools" ? (
                  <>
                    <div className="section-label">
                      {tools.find((t) => t.id === tool)?.label}
                    </div>
                    <h2>
                      {tool === "read"
                        ? "Your document, in focus."
                        : tool === "edit"
                          ? "Make it say what you mean."
                          : "A personal touch."}
                    </h2>
                    <p className="inspector-copy">{selectedHint}</p>
                    {["text", "ink", "rectangle"].includes(tool) && (
                      <div className="properties">
                        <label>
                          Color
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            aria-label="Text and drawing color"
                          />
                        </label>
                        {tool === "text" && (
                          <label>
                            Text size{" "}
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
                              pt
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                    {tool === "edit" && (
                      <div className="notice">
                        <PencilSimple size={16} />
                        <p>
                          Edits replace the original text. Fonts are retained
                          when their glyphs are available; otherwise Folio uses
                          a substitute. Text fits within its original line.
                        </p>
                      </div>
                    )}
                    <div className="inspector-section">
                      <div className="section-label">Current page</div>
                      <div className="page-tools">
                        <button
                          onClick={() => edit({ kind: "rotate", page })}
                          disabled={!!busy || !doc.editable}
                        >
                          <ArrowClockwise size={19} />
                          <span>Rotate</span>
                        </button>
                        <button
                          onClick={() => edit({ kind: "duplicate", page })}
                          disabled={!!busy || !doc.editable}
                        >
                          <Copy size={19} />
                          <span>Duplicate</span>
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
                          <span>Move up</span>
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
                          <span>Move down</span>
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
                        Delete page
                      </button>
                    </div>
                    <div className="inspector-section">
                      <div className="section-label">Find in document</div>
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
                          placeholder="Search text…"
                          aria-label="Search document"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        <button title="Find" disabled={!!busy || !query}>
                          <ArrowRight size={16} />
                        </button>
                      </form>
                      {hits.length > 0 && (
                        <div className="search-results">
                          <span>
                            {hit + 1} of {hits.length} matches
                          </span>
                          <IconButton
                            title="Previous match"
                            onClick={() => {
                              const i = (hit - 1 + hits.length) % hits.length;
                              setHit(i);
                              setPage(hits[i].page);
                            }}
                          >
                            <ArrowUp size={14} />
                          </IconButton>
                          <IconButton
                            title="Next match"
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
                ) : tab === "comments" ? (
                  <>
                    <div className="section-label">This page</div>
                    <h2>Notes & marks</h2>
                    {view?.annotations.length ? (
                      view.annotations.map((a) => (
                        <div className="annotation-item" key={a.index}>
                          <div>
                            <span className="annotation-type">{a.type}</span>
                            <p>{a.contents || "Page annotation"}</p>
                          </div>
                          <IconButton
                            title={`Remove annotation ${a.index + 1}`}
                            disabled={!!busy}
                            onClick={() =>
                              edit({
                                kind: "removeAnnotation",
                                page,
                                index: a.index,
                              })
                            }
                          >
                            <Trash size={15} />
                          </IconButton>
                        </div>
                      ))
                    ) : (
                      <div className="empty-panel">
                        <Note size={28} />
                        <p>No annotations yet.</p>
                        <span>
                          Comments, highlights and drawings on this page appear
                          here.
                        </span>
                        <button
                          className="button subtle"
                          onClick={() => setTool("note")}
                        >
                          Add a comment
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="section-label">Interactive PDF fields</div>
                    <h2>Fill it in.</h2>
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
                              {w.value !== "Off" && <Check size={16} />}Toggle{" "}
                              {w.type}
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
                                Apply
                              </button>
                            </form>
                          ) : (
                            <p className="inspector-copy">
                              {w.type} fields are view only.
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="empty-panel">
                        <TextT size={28} />
                        <p>No fillable fields.</p>
                        <span>
                          You can still use Add text to type onto the page.
                        </span>
                        <button
                          className="button subtle"
                          onClick={() => {
                            setTool("text");
                            setTab("tools");
                          }}
                        >
                          Add text
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="inspector-footer">
                <LockSimple size={15} />
                <span>
                  Private by design.
                  <br />
                  Your files stay on this device.
                </span>
              </div>
            </aside>
          </main>
          <footer className="statusbar">
            <span>
              {dirty ? (
                <>
                  <span className="mode-dot" />
                  Unsaved changes
                </>
              ) : (
                <>
                  <CheckCircle size={13} />
                  No unsaved edits
                </>
              )}
            </span>
            <span>
              {info &&
                `${Math.round(info.width)} × ${Math.round(info.height)} pt`}
              <span className="status-divider" />
              PDF document
            </span>
            <span>
              <Keyboard size={14} />V Read · E Edit · T Add text
            </span>
          </footer>
        </>
      ) : (
        <main className="home">
          <div className="home-intro">
            <div className="eyebrow">
              <span />
              YOUR EVERYDAY PDF WORKSPACE
            </div>
            <h1>
              Good documents.
              <br />
              Great possibilities.
            </h1>
            <p>
              Read, edit, and bring your PDFs together.
              <br />
              All in one place. All on your device.
            </p>
            <div className="home-buttons">
              <button
                className="button primary large"
                onClick={chooseOpen}
                disabled={!!busy}
              >
                <FolderOpen size={20} />
                Open a PDF
                <ArrowRight size={18} />
              </button>
              <button
                className="button subtle large"
                onClick={() => newDocument()}
                disabled={!!busy}
              >
                <FilePlus size={19} />
                Create blank PDF
              </button>
            </div>
            <button
              className="sample-link"
              onClick={() => newDocument(true)}
              disabled={!!busy}
            >
              Explore with a sample document
              <ArrowSquareOut size={15} />
            </button>
            <div className="home-footnote">
              <LockSimple size={14} />
              No uploads. No account. Just your documents.
            </div>
          </div>
          <div className="home-guide">
            <div className="guide-top">
              <div className="guide-mark">
                <FilePdf size={30} />
              </div>
              <span>MADE FOR THE EVERYDAY</span>
            </div>
            <h2>
              A fresh perspective
              <br />
              on your paperwork.
            </h2>
            <div className="guide-row">
              <PencilSimple size={22} />
              <div>
                <strong>Make the words work</strong>
                <p>Edit existing text or add something new.</p>
              </div>
            </div>
            <div className="guide-row">
              <Highlighter size={22} />
              <div>
                <strong>Think on the page</strong>
                <p>Highlight, draw, comment, and fill forms.</p>
              </div>
            </div>
            <div className="guide-row">
              <Stack size={22} />
              <div>
                <strong>Get your pages in order</strong>
                <p>Reorder, rotate, merge, and save a copy.</p>
              </div>
            </div>
            <div className="guide-bottom">
              <span>PDFs, with a little less friction.</span>
              <span>F.</span>
            </div>
          </div>
        </main>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <WarningCircle size={19} />
          <span>{error}</span>
          <IconButton title="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={18} />
          {toast}
        </div>
      )}
      {!doc && busy && (
        <div className="home-busy">
          <SpinnerGap className="spin" size={18} />
          {busy}…
        </div>
      )}
      {modal && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void submitModal();
            }}
          >
            <div className="modal-title">
              <h2>
                {
                  (
                    {
                      text: "Add text",
                      replace: "Edit text line",
                      note: "Add a comment",
                      password: "Unlock PDF",
                      discard: "Discard unsaved changes?",
                    } as const
                  )[modal.kind]
                }
              </h2>
              <IconButton
                title="Cancel"
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
                Your edits haven’t been saved. Save a copy first to keep them.
              </p>
            ) : modal.kind === "password" ? (
              <>
                <p>Enter this document’s password to open it.</p>
                <input
                  autoFocus
                  type="password"
                  aria-label="PDF password"
                  value={modal.text}
                  onChange={(e) => setModal({ ...modal, text: e.target.value })}
                />
              </>
            ) : (
              <>
                <p>
                  {modal.kind === "replace"
                    ? "Replace this line of text. Longer replacements shrink to fit; the rest of the page stays in place."
                    : modal.kind === "text"
                      ? "Your text will appear at the point you selected."
                      : "This comment stays with the PDF as an annotation."}
                </p>
                <textarea
                  autoFocus
                  aria-label={
                    modal.kind === "replace"
                      ? "Replacement text"
                      : "Text content"
                  }
                  rows={modal.kind === "replace" ? 3 : 5}
                  value={modal.text}
                  onChange={(e) => setModal({ ...modal, text: e.target.value })}
                />
                {modal.kind === "replace" && (
                  <span className="modal-meta">
                    Original font: {modal.line!.font} ·{" "}
                    {Math.round(modal.line!.size)} pt
                  </span>
                )}
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
                Cancel
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
                  Discard changes
                </button>
              ) : (
                <button
                  className="button primary"
                  type="submit"
                  disabled={modal.kind !== "replace" && !modal.text.trim()}
                >
                  {modal.kind === "password" ? "Unlock" : "Apply change"}
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
