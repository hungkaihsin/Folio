import React, { useState, useRef } from "react";
import type { PageObject, Rect, Point } from "./types";
import { tr } from "./i18n";
import {
  Copy,
  ArrowClockwise,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
export function ObjectLayer({
  objects,
  selected,
  scale,
  width,
  height,
  onSelect,
  onTransform,
  onEdit,
}: {
  objects: PageObject[];
  selected: string | null;
  scale: number;
  width: number;
  height: number;
  onSelect: (id: string) => void;
  onTransform: (id: string, rect: Rect) => void;
  onEdit: (object: PageObject) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    gesture = useRef<{
      object: PageObject;
      start: Point;
      resize: boolean;
      rect: Rect;
    } | null>(null),
    [preview, setPreview] = useState<Rect | null>(null);
  const point = (e: React.PointerEvent): Point => {
    const r = root.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };
  function down(e: React.PointerEvent, object: PageObject, resize = false) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(object.id);
    gesture.current = { object, start: point(e), resize, rect: object.rect };
    setPreview(object.rect);
    root.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e),
      dx = p[0] - g.start[0],
      dy = p[1] - g.start[1],
      r = g.object.rect;
    let rect: Rect;
    if (g.resize) {
      let w = Math.max(8, Math.min(width - r[0], r[2] - r[0] + dx)),
        h = Math.max(8, Math.min(height - r[1], r[3] - r[1] + dy));
      if (["image", "text"].includes(g.object.kind)) {
        const ratio = (r[2] - r[0]) / (r[3] - r[1]);
        w = Math.min(w, h * ratio);
        h = w / ratio;
      }
      rect = [r[0], r[1], r[0] + w, r[1] + h];
    } else {
      const x = Math.max(0, Math.min(width - (r[2] - r[0]), r[0] + dx)),
        y = Math.max(0, Math.min(height - (r[3] - r[1]), r[1] + dy));
      rect = [x, y, x + r[2] - r[0], y + r[3] - r[1]];
    }
    g.rect = rect;
    setPreview(rect);
  }
  function up(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    e.stopPropagation();
    gesture.current = null;
    setPreview(null);
    if (g.rect.some((v, i) => Math.abs(v - g.object.rect[i]) > 0.1))
      onTransform(g.object.id, g.rect);
  }
  const active = objects.find((o) => o.id === selected),
    r = preview || active?.rect;
  return (
    <div
      className="object-layer"
      ref={root}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        gesture.current = null;
        setPreview(null);
      }}
    >
      {objects.map((object, i) => (
        <button
          type="button"
          key={object.id}
          className={`object-hit ${object.id === selected ? "selected" : ""}`}
          aria-label={`${tr("Select")} ${tr(object.kind)}: ${object.text || i + 1}`}
          title={tr("Drag to move. Double-click text to edit.")}
          style={{
            left: object.rect[0] * scale,
            top: object.rect[1] * scale,
            width: Math.max(8, (object.rect[2] - object.rect[0]) * scale),
            height: Math.max(8, (object.rect[3] - object.rect[1]) * scale),
          }}
          onPointerDown={(e) => down(e, object)}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(object.id);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEdit(object);
          }}
        />
      ))}
      {r && active && (
        <div
          className="object-selection"
          style={{
            left: r[0] * scale,
            top: r[1] * scale,
            width: (r[2] - r[0]) * scale,
            height: (r[3] - r[1]) * scale,
          }}
        >
          <span className="object-label">{tr(active.kind)}</span>
          <button
            className="object-resize"
            aria-label={tr("Resize selected object")}
            title={tr("Drag to resize")}
            onPointerDown={(e) => down(e, active, true)}
          />
        </div>
      )}
    </div>
  );
}
export function ObjectControls({
  object,
  pageWidth,
  pageHeight,
  onTransform,
  onEdit,
  onDelete,
  onCopy,
  onRotate,
  disabled,
}: {
  object: PageObject;
  pageWidth: number;
  pageHeight: number;
  onTransform: (rect: Rect) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onRotate: (degrees: number) => void;
  disabled: boolean;
}) {
  const r = object.rect;
  return (
    <section className="selected-properties">
      <div className="section-label">
        {tr("Selected object")} · {tr(object.kind)}
      </div>
      {["text", "image"].includes(object.kind) &&
        !object.id.startsWith("annotation:") && (
          <div className="object-clipboard-controls">
            <button
              type="button"
              className="button subtle"
              onClick={onCopy}
              disabled={disabled}
            >
              <Copy size={16} />
              {tr("Copy selected object")}
            </button>
            <div className="object-rotation-controls">
              <button
                type="button"
                className="button subtle"
                onClick={() => onRotate(-90)}
                disabled={disabled}
                aria-label={tr("Rotate object left")}
              >
                <ArrowCounterClockwise size={17} />
                <span>−90°</span>
              </button>
              <button
                type="button"
                className="button subtle"
                onClick={() => onRotate(90)}
                disabled={disabled}
                aria-label={tr("Rotate object right")}
              >
                <ArrowClockwise size={17} />
                <span>+90°</span>
              </button>
              <span className="object-angle" aria-label={tr("Object rotation")}>
                {Math.round(object.rotation || 0)}°
              </span>
            </div>
          </div>
        )}
      {object.kind === "text" && (
        <button
          type="button"
          className="button primary"
          onClick={onEdit}
          disabled={disabled}
        >
          {tr("Edit selected text")}
        </button>
      )}
      <form
        key={`${object.id}-${r.join(",")}`}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget),
            x = Number(data.get("x")),
            y = Number(data.get("y")),
            w = Number(data.get("width")),
            h = Number(data.get("height"));
          onTransform([x, y, x + w, y + h]);
        }}
      >
        <div className="coordinate-grid">
          {[
            ["x", r[0]],
            ["y", r[1]],
            ["width", r[2] - r[0]],
            ["height", r[3] - r[1]],
          ].map(([label, value]) => (
            <label key={label}>
              {tr(String(label))}
              <input
                name={String(label)}
                type="number"
                step="0.1"
                min={label === "x" || label === "y" ? 0 : 2}
                max={
                  label === "x" || label === "width" ? pageWidth : pageHeight
                }
                defaultValue={Number(value).toFixed(1)}
                aria-label={`${tr("Object")} ${tr(String(label))}`}
                disabled={disabled}
              />
            </label>
          ))}
        </div>
        <button className="button subtle" disabled={disabled}>
          {tr("Apply position / size")}
        </button>
      </form>
      <button
        className="delete-page"
        type="button"
        onClick={onDelete}
        disabled={disabled}
      >
        {tr("Delete selected object")}
      </button>
      <p className="inspector-copy">
        {tr(
          "Drag to move, use the corner to resize, or nudge with arrow keys. Shift moves 10 points.",
        )}
      </p>
    </section>
  );
}
