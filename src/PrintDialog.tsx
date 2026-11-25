import { useState } from "react";
import { Printer, DownloadSimple, X } from "@phosphor-icons/react";
import { parsePages } from "./ExportDialog";
import { printLayout } from "./printLayout";
import type { PrintOptions } from "./types";
import { tr } from "./i18n";

export function PrintDialog({
  page,
  count,
  busy,
  onClose,
  onPrint,
  onSave,
}: {
  page: number;
  count: number;
  busy: boolean;
  onClose: () => void;
  onPrint: (options: PrintOptions) => void;
  onSave: (options: PrintOptions) => void;
}) {
  const [scope, setScope] = useState("all"),
    [range, setRange] = useState(String(page + 1));
  const [settings, setSettings] = useState<Omit<PrintOptions, "pages">>({
    layout: "normal",
    paper: "A4",
    orientation: "portrait",
    binding: "left",
    sides: "both",
    reverse: false,
    margin: 12,
    copies: 1,
    duplex: "simplex",
  });
  const change = (patch: Partial<typeof settings>) =>
    setSettings((current) => ({ ...current, ...patch }));
  let options: PrintOptions | null = null,
    plan: ReturnType<typeof printLayout> | null = null,
    error = "";
  try {
    const pages =
      scope === "all"
        ? Array.from({ length: count }, (_, index) => index)
        : scope === "current"
          ? [page]
          : parsePages(range, count);
    options = { ...settings, pages };
    plan = printLayout(options, count);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
      }}
    >
      <section
        className="modal print-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Print PDF")}
      >
        <div className="modal-title">
          <h2>{tr("Print PDF")}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={tr("Close print")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="print-body">
          <div className="print-settings">
            <label className="export-field">
              {tr("Layout")}
              <select
                autoFocus
                aria-label={tr("Print layout")}
                value={settings.layout}
                disabled={busy}
                onChange={(event) =>
                  change({
                    layout: event.target.value as PrintOptions["layout"],
                    duplex:
                      event.target.value === "booklet"
                        ? "shortEdge"
                        : "simplex",
                  })
                }
              >
                <option value="normal">{tr("Normal printing")}</option>
                <option value="booklet">{tr("Booklet / saddle stitch")}</option>
              </select>
            </label>
            <label className="export-field">
              {tr("Pages")}
              <select
                aria-label={tr("Print pages")}
                value={scope}
                disabled={busy}
                onChange={(event) => setScope(event.target.value)}
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
                  aria-label={tr("Print page range")}
                  value={range}
                  disabled={busy}
                  onChange={(event) => setRange(event.target.value)}
                />
              </label>
            )}
            <label className="export-field">
              {tr("Paper size")}
              <select
                aria-label={tr("Paper size")}
                value={settings.paper}
                disabled={busy}
                onChange={(event) =>
                  change({ paper: event.target.value as PrintOptions["paper"] })
                }
              >
                <option>A4</option>
                <option>A3</option>
                <option>Letter</option>
              </select>
            </label>
            {settings.layout === "normal" ? (
              <label className="export-field">
                {tr("Orientation")}
                <select
                  aria-label={tr("Orientation")}
                  value={settings.orientation}
                  disabled={busy}
                  onChange={(event) =>
                    change({
                      orientation: event.target
                        .value as PrintOptions["orientation"],
                    })
                  }
                >
                  <option value="portrait">{tr("Portrait")}</option>
                  <option value="landscape">{tr("Landscape")}</option>
                </select>
              </label>
            ) : (
              <>
                <label className="export-field">
                  {tr("Binding")}
                  <select
                    aria-label={tr("Booklet binding")}
                    value={settings.binding}
                    disabled={busy}
                    onChange={(event) =>
                      change({
                        binding: event.target.value as PrintOptions["binding"],
                      })
                    }
                  >
                    <option value="left">{tr("Left binding")}</option>
                    <option value="right">{tr("Right binding")}</option>
                  </select>
                </label>
                <label className="export-field">
                  {tr("Sheet sides")}
                  <select
                    aria-label={tr("Booklet sides")}
                    value={settings.sides}
                    disabled={busy}
                    onChange={(event) =>
                      change({
                        sides: event.target.value as PrintOptions["sides"],
                      })
                    }
                  >
                    <option value="both">{tr("Both sides")}</option>
                    <option value="front">{tr("Front sides only")}</option>
                    <option value="back">{tr("Back sides only")}</option>
                  </select>
                </label>
              </>
            )}
            <label className="export-field">
              {tr("Two-sided printing")}
              <select
                aria-label={tr("Two-sided printing")}
                value={settings.duplex}
                disabled={
                  busy ||
                  (settings.layout === "booklet" && settings.sides !== "both")
                }
                onChange={(event) =>
                  change({
                    duplex: event.target.value as PrintOptions["duplex"],
                  })
                }
              >
                <option value="simplex">{tr("Single-sided")}</option>
                <option value="longEdge">{tr("Flip on long edge")}</option>
                <option value="shortEdge">{tr("Flip on short edge")}</option>
              </select>
            </label>
            <div className="coordinate-grid">
              <label>
                {tr("Copies")}
                <input
                  aria-label={tr("Print copies")}
                  type="number"
                  min={1}
                  max={999}
                  value={settings.copies}
                  disabled={busy}
                  onChange={(event) =>
                    change({ copies: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                {tr("Margin (pt)")}
                <input
                  aria-label={tr("Print margin")}
                  type="number"
                  min={0}
                  max={72}
                  value={settings.margin}
                  disabled={busy}
                  onChange={(event) =>
                    change({ margin: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <label className="fit-original">
              <input
                type="checkbox"
                checked={settings.reverse}
                disabled={busy}
                onChange={(event) => change({ reverse: event.target.checked })}
              />
              {tr("Reverse output order")}
            </label>
          </div>
          <div
            className="print-preview"
            aria-label={tr("Print arrangement preview")}
          >
            <p>
              {tr("Page arrangement")}
              {plan && ` · ${plan.sides.length} ${tr("sides")}`}
            </p>
            {settings.layout === "booklet" && (
              <p className="inspector-copy">
                {tr(
                  "Fold the sheets in half and staple along the fold. For duplex printers, choose landscape and short-edge flipping. For manual duplex, print fronts then backs and test one sheet first.",
                )}
              </p>
            )}
            {plan?.blanks ? (
              <p className="notice">
                {plan.blanks} {tr("blank pages added to complete sheets.")}
              </p>
            ) : null}
            {plan?.sides.slice(0, 12).map((side, index) => (
              <div className="print-side" key={index}>
                <span>
                  {tr("Sheet")} {side.sheet} ·{" "}
                  {tr(
                    side.face === "single"
                      ? "Page"
                      : side.face === "front"
                        ? "Front"
                        : "Back",
                  )}
                </span>
                <div
                  className={`print-sheet ${side.pages.length === 2 ? "booklet-sheet" : ""}`}
                  style={{ aspectRatio: String(plan!.width / plan!.height) }}
                >
                  {side.pages.map((page, cell) => (
                    <div
                      key={cell}
                      className={page === null ? "blank-print-page" : ""}
                    >
                      {page === null ? tr("Blank") : page + 1}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!!plan && plan.sides.length > 12 && (
              <p>{tr("Preview shows the first 12 sides.")}</p>
            )}
            {error && <p role="alert">{tr(error)}</p>}
          </div>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button subtle"
            disabled={busy}
            onClick={onClose}
          >
            {tr("Cancel")}
          </button>
          <button
            type="button"
            className="button subtle"
            disabled={busy || !plan}
            onClick={() => options && onSave(options)}
          >
            <DownloadSimple size={16} />
            {tr("Save print PDF")}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || !plan || !window.desktop}
            onClick={() => options && onPrint(options)}
          >
            <Printer size={16} />
            {tr("Print…")}
          </button>
        </div>
      </section>
    </div>
  );
}
