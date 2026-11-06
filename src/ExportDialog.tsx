import { useState } from "react";
import type { ExportFormat, ExportOptions } from "./types";
import { tr } from "./i18n";
export function parsePages(value: string, count: number): number[] {
  const result: number[] = [];
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Enter pages like 1-3, 5.");
    const a = Number(match[1]),
      b = Number(match[2] || a);
    if (a < 1 || b < a || b > count)
      throw new Error("The page range is outside this document.");
    for (let i = a; i <= b; i++)
      if (!result.includes(i - 1)) result.push(i - 1);
  }
  return result;
}
export function ExportDialog({
  page,
  count,
  busy,
  onClose,
  onExport,
}: {
  page: number;
  count: number;
  busy: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf"),
    [scope, setScope] = useState("all"),
    [range, setRange] = useState(String(page + 1)),
    [scale, setScale] = useState(2),
    [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <form
        className="modal export-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Export file")}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const pages =
              scope === "current"
                ? [page]
                : scope === "range"
                  ? parsePages(range, count)
                  : Array.from({ length: count }, (_, i) => i);
            setError("");
            onExport({ format, pages, scale, quality: 90 });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="modal-title">
          <h2>{tr("Export file")}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label={tr("Close export")}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p>
          {tr(
            "Choose a format and the pages to include. Your original PDF stays safe.",
          )}
        </p>
        <label className="export-field">
          {tr("Format")}
          <select
            autoFocus
            aria-label={tr("Export format")}
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            disabled={busy}
          >
            <option value="pdf">{tr("PDF document")}</option>
            <option value="png">{tr("PNG images")}</option>
            <option value="jpeg">{tr("JPEG images")}</option>
            <option value="txt">{tr("Plain text (.txt)")}</option>
          </select>
        </label>
        <label className="export-field">
          {tr("Pages")}
          <select
            aria-label={tr("Export pages")}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={busy}
          >
            <option value="all">{tr("All pages")}</option>
            <option value="current">{tr("Current page")}</option>
            <option value="range">{tr("Page range")}</option>
          </select>
        </label>
        {scope === "range" && (
          <label className="export-field">
            {tr("Page range")}
            <input
              aria-label={tr("Page range")}
              placeholder="1-3, 5"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {["png", "jpeg"].includes(format) && (
          <label className="export-field">
            {tr("Resolution")}
            <select
              aria-label={tr("Export resolution")}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              disabled={busy}
            >
              <option value="1">72 DPI</option>
              <option value="2">144 DPI</option>
              <option value="3">216 DPI</option>
            </select>
          </label>
        )}
        <div className="notice">
          <p>
            {tr(
              format === "txt"
                ? "Exports selectable text. Scanned image text needs OCR."
                : format === "pdf"
                  ? "PDF keeps text and graphics editable in Folio. Exporting all pages also saves your edits."
                  : "Multiple images are saved together in a ZIP file. Images include your edits and annotations.",
            )}
          </p>
        </div>
        {error && <p role="alert">{tr(error)}</p>}
        <div className="modal-actions">
          <button
            className="button subtle"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            {tr("Cancel")}
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {tr(busy ? "Exporting…" : "Export")}
          </button>
        </div>
      </form>
    </div>
  );
}
