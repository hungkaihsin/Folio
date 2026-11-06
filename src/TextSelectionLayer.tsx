import { useEffect, useRef, useState } from "react";
import { Copy, Highlighter } from "@phosphor-icons/react";
import { engine } from "./client";
import { tr } from "./i18n";
import type { Point, TextLine, TextSelection } from "./types";

export function TextSelectionLayer({
  page,
  scale,
  lines,
  highlight,
  editable,
  onEdit,
  onHighlight,
}: {
  page: number;
  scale: number;
  lines: TextLine[];
  highlight: boolean;
  editable: boolean;
  onEdit: (line: TextLine) => void;
  onHighlight: (start: Point, end: Point) => Promise<boolean>;
}) {
  const root = useRef<HTMLDivElement>(null),
    gesture = useRef<{ start: Point; end: Point } | null>(null),
    request = useRef(0),
    committing = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [selection, setSelection] = useState<TextSelection | null>(null),
    [selecting, setSelecting] = useState(false),
    [message, setMessage] = useState("");
  const selectionRef = useRef<TextSelection | null>(null);
  useEffect(
    () => () => {
      request.current++;
      clearTimeout(timer.current);
    },
    [],
  );
  const point = (e: { clientX: number; clientY: number }): Point => {
    const r = root.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };
  async function update(start: Point, end: Point, commit = false) {
    const id = ++request.current;
    try {
      const result = await engine.selectText(page, start, end);
      if (id !== request.current) return;
      selectionRef.current = result;
      setSelection(result);
      if (commit && highlight && result.text.trim() && result.quads.length) {
        if (await onHighlight(start, end)) {
          selectionRef.current = null;
          setSelection(null);
        }
      } else if (commit && !result.text.trim())
        setMessage(tr("Select text to highlight. Scanned pages need OCR."));
    } catch (e) {
      if (id === request.current) setMessage((e as Error).message);
    } finally {
      if (commit) committing.current = false;
    }
  }
  function copy() {
    root.current?.focus({ preventScroll: true });
    document.execCommand("copy");
    setMessage(tr("Selected text copied."));
  }
  const q = selection?.quads[0],
    x = q
      ? Math.max(
          0,
          Math.min(
            q[0] * scale,
            root.current?.clientWidth
              ? root.current.clientWidth - 200
              : q[0] * scale,
          ),
        )
      : 0,
    y = q ? Math.max(0, Math.min(q[1], q[3]) * scale - 36) : 0;
  return (
    <div
      className={`text-layer text-selection-layer ${highlight ? "highlight-selection" : ""}`}
      ref={root}
      tabIndex={0}
      aria-label={tr("PDF text selection")}
      onDoubleClick={(e) => {
        if (highlight || !editable) return;
        const [x, y] = point(e);
        const line = lines.find(
          (l) =>
            x >= l.rect[0] &&
            x <= l.rect[2] &&
            y >= l.rect[1] &&
            y <= l.rect[3],
        );
        if (line) onEdit(line);
      }}
      onCopy={(e) => {
        if (selectionRef.current?.text) {
          e.clipboardData.setData("text/plain", selectionRef.current.text);
          e.preventDefault();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          request.current++;
          setSelection(null);
          selectionRef.current = null;
        } else if (
          (e.metaKey || e.ctrlKey) &&
          e.key.toLowerCase() === "c" &&
          selectionRef.current?.text
        ) {
          e.preventDefault();
          copy();
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest("button"))
          return;
        e.preventDefault();
        e.stopPropagation();
        root.current?.focus({ preventScroll: true });
        request.current++;
        setMessage("");
        setSelection(null);
        selectionRef.current = null;
        const p = point(e);
        gesture.current = { start: p, end: p };
        setSelecting(true);
        root.current!.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g) return;
        e.stopPropagation();
        g.end = point(e);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void update(g.start, g.end), 24);
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        if (!g) return;
        e.stopPropagation();
        clearTimeout(timer.current);
        gesture.current = null;
        setSelecting(false);
        g.end = point(e);
        if (Math.hypot(g.start[0] - g.end[0], g.start[1] - g.end[1]) > 2) {
          committing.current = true;
          void update(g.start, g.end, true);
        }
      }}
      onPointerCancel={() => {
        gesture.current = null;
        request.current++;
        clearTimeout(timer.current);
        setSelecting(false);
        setSelection(null);
        selectionRef.current = null;
      }}
    >
      {lines.map((line) => (
        <span
          key={line.id}
          className="selectable-line"

          title={tr(
            highlight
              ? "Drag to select and highlight text"
              : "Double-click to edit text",
          )}
          style={{
            left: line.rect[0] * scale,
            top: line.rect[1] * scale,
            width: (line.rect[2] - line.rect[0]) * scale,
            height: (line.rect[3] - line.rect[1]) * scale,
            fontSize: line.size * scale,
          }}
        >
          {line.text}
        </span>
      ))}
      {selection?.quads.length ? (
        <svg className="text-selection-quads" aria-hidden="true">
          {selection.quads.map((q, i) => (
            <polygon
              key={i}
              points={[0, 2, 6, 4]
                .map((n) => `${q[n] * scale},${q[n + 1] * scale}`)
                .join(" ")}
            />
          ))}
        </svg>
      ) : null}
      {!selecting && !highlight && !!selection?.text.trim() && (
        <div
          className="selection-actions"
          style={{ left: x, top: y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title={tr("Copy selected text")}
            aria-label={tr("Copy selected text")}
            onClick={copy}
          >
            <Copy size={14} />
            {tr("Copy")}
          </button>
          {editable && (
            <button
              type="button"
              title={tr("Highlight selected text")}
              aria-label={tr("Highlight selected text")}
              onClick={() =>
                void onHighlight(selection!.start, selection!.end).then(
                  (ok) => {
                    if (ok) setSelection(null);
                  },
                )
              }
            >
              <Highlighter size={14} />
              {tr("Highlight")}
            </button>
          )}
        </div>
      )}
      {message && (
        <div className="selection-message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
