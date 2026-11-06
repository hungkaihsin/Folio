import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "@phosphor-icons/react";
import { FontFeedback } from "./FontFeedback";
import { engine } from "./client";
import { tr } from "./i18n";
import type { FontReport, PageObject, Point, TextLine } from "./types";

const loadedFonts = new Map<string, FontFace>();
export function clearEditingFonts() {
  for (const face of loadedFonts.values()) document.fonts.delete(face);
  loadedFonts.clear();
}
export interface TextDraft {
  kind: "replace" | "object" | "text";
  text: string;
  line?: TextLine;
  object?: PageObject;
  point?: Point;
}
export function InlineTextEditor({
  draft,
  page,
  scale,
  pageWidth,
  pageHeight,
  host,
  actionsHost,
  size,
  color,
  font,
  fitOriginal,
  customFonts,
  blocked,
  busy,
  onText,
  onSize,
  onColor,
  onFont,
  onFit,
  onBlocked,
  onImport,
  onApply,
  onCancel,
  allowSubstitution,
  onAllowSubstitution,
  pickingStyle,
  onPickStyle,
}: {
  draft: TextDraft;
  page: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  host: HTMLElement | null;
  actionsHost: HTMLElement | null;
  size: number;
  color: string;
  font: string;
  fitOriginal: boolean;
  customFonts: { key: string; name: string }[];
  blocked: boolean;
  busy: boolean;
  onText: (s: string) => void;
  onSize: (n: number) => void;
  onColor: (s: string) => void;
  onFont: (s: string) => void;
  onFit: (b: boolean) => void;
  onBlocked: (b: boolean) => void;
  onImport: () => void;
  onApply: () => void;
  onCancel: () => void;
  allowSubstitution: boolean;
  onAllowSubstitution: (value: boolean) => void;
  pickingStyle: boolean;
  onPickStyle: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [backdrop, setBackdrop] = useState("");
  const [preview, setPreview] = useState({
    family: "serif",
    ascent: size * 0.9,
    descent: size * 0.3,
  });
  const [previewError, setPreviewError] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const [effectiveSize, setEffectiveSize] = useState(size);
  const [textWidth, setTextWidth] = useState(
    draft.line ? draft.line.rect[2] - draft.line.rect[0] : size,
  );
  const [backdropError, setBackdropError] = useState("");
  const reportId = useRef(0);
  const [fontRevision, setFontRevision] = useState(0);
  const [fontReport, setFontReport] = useState<FontReport | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const searched = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  async function findMatchingFont(report: FontReport) {
    if (!window.desktop?.findFont) return;
    searched.current.add(report.requestedFont);
    setLookingUp(true);
    setLookupMessage("");
    try {
      const found = await window.desktop.findFont(report.requestedFont);
      if (!mounted.current) return;
      if (!found) {
        setLookupMessage(
          tr(
            "Matching font is not installed. Import the full font file to keep this typeface.",
          ),
        );
        return;
      }
      await engine.loadFont(found.bytes, found.name);
      if (!mounted.current) return;
      onBlocked(true);
      setFontRevision((n) => n + 1);
      setLookupMessage(tr("Matching installed font loaded."));
    } catch (e) {
      if (mounted.current) setLookupMessage((e as Error).message);
    } finally {
      if (mounted.current) setLookingUp(false);
    }
  }
  const sourceKey = `${page}:${draft.line?.id ?? draft.object?.id ?? "new"}`;
  const query = {
    page,
    line: draft.kind === "replace" ? draft.line!.id : undefined,
    objectId: draft.object?.id,
    text: draft.text,
    font,
    size,
    fitOriginal,
    browserFonts: true,
    knownFonts: [...loadedFonts.keys()],
    revision: fontRevision,
  };
  const origin: Point =
    draft.line?.origin ||
    draft.object?.baseline ||
    (draft.object
      ? [
          draft.object.rect[0],
          draft.object.rect[1] + (draft.object.size || size),
        ]
      : [draft.point![0], draft.point![1] + size]);
  const rotation = draft.object?.rotation || 0;
  const width = Math.max(
    8,
    Math.min(
      draft.kind === "replace"
        ? Math.max(size, textWidth + size * 0.5)
        : draft.object?.wrapWidth || Infinity,
      rotation
        ? draft.object?.wrapWidth || Math.max(pageWidth, pageHeight) - 16
        : pageWidth - origin[0] - 8,
    ),
  );
  const multiline = draft.kind !== "replace";
  const lineHeight = effectiveSize * 1.35;
  const top =
    origin[1] -
    (lineHeight - preview.ascent - preview.descent) / 2 -
    preview.ascent;
  const rows = Math.max(
    draft.text.split("\n").length,
    Math.ceil((draft.text.length * effectiveSize) / width),
    1,
  );
  const height = Math.max(
    lineHeight,
    Math.min(
      rotation ? Math.max(pageWidth, pageHeight) - 16 : pageHeight - top - 8,
      (multiline ? rows + 1 : 1) * lineHeight,
    ),
  );
  useEffect(() => {
    let active = true,
      url = "";
    setBackdrop("");
    setBackdropError("");
    if (draft.kind !== "text")
      engine
        .textBackdrop(query, scale * Math.min(devicePixelRatio, 2))
        .then((bytes) => {
          if (active) {
            url = URL.createObjectURL(
              new Blob([bytes as BlobPart], { type: "image/png" }),
            );
            setBackdrop(url);
          }
        })
        .catch((e) => {
          if (active) setBackdropError(e.message);
        });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sourceKey, scale]);
  useEffect(() => {
    input.current?.focus();
    if (draft.kind !== "text") input.current?.select();
    return () => {
      reportId.current++;
    };
  }, [sourceKey]);
  async function showFonts(report: FontReport) {
    setFontReport(report);
    if (
      report.substitutedCharacters.length &&
      (font === "original" || font.startsWith("document:")) &&
      !searched.current.has(report.requestedFont)
    )
      void findMatchingFont(report);
    const request = ++reportId.current;
    setEffectiveSize(report.size || size);
    setTextWidth(report.width || size);
    const families: string[] = [];
    let failed = false;
    for (const f of report.browserFonts || []) {
      if (!loadedFonts.has(f.id) && f.bytes) {
        try {
          const face = await new FontFace(
            f.id,
            f.bytes as unknown as ArrayBuffer,
          ).load();
          if (request !== reportId.current) return;
          document.fonts.add(face);
          loadedFonts.set(f.id, face);
        } catch {
          failed = true;
        }
      }
      if (loadedFonts.has(f.id)) families.push(`"${f.id}"`);
      else failed = true;
    }
    if (request !== reportId.current) return;
    const fallback = /sans|arial|helvetica|gothic/i.test(report.requestedFont)
      ? "sans-serif"
      : "serif";
    const family = [...families, fallback].join(",");
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${report.size || size}px ${family}`;
    const metrics = context.measureText("Hg中文");
    setPreview({
      family,
      ascent: metrics.fontBoundingBoxAscent,
      descent: metrics.fontBoundingBoxDescent,
    });
    setPreviewError(
      failed
        ? tr(
            "This font cannot be previewed exactly while typing. Apply to see the PDF rendering.",
          )
        : "",
    );
    setFontsReady(true);
  }
  const canApply =
    !blocked &&
    !busy &&
    !lookingUp &&
    !pickingStyle &&
    !backdropError &&
    Number.isFinite(size) &&
    size >= (multiline ? 6 : 5) &&
    size <= 120 &&
    (draft.kind !== "text" || !!draft.text.trim());
  return (
    <>
      {backdrop && (
        <img
          className="inline-backdrop"
          src={backdrop}
          alt=""
          draggable={false}
        />
      )}
      <div
        className="inline-text-editor"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <textarea
          ref={input}
          className="inline-text-input"
          aria-label={tr(
            draft.kind === "text" ? "Text content" : "Replacement text",
          )}
          aria-describedby="inline-help"
          spellCheck={false}
          wrap={multiline ? "soft" : "off"}
          data-font-ready={fontsReady}
          value={draft.text}
          style={{
            left: origin[0] * scale,
            top: top * scale,
            width: width * scale,
            height: height * scale,
            fontSize: effectiveSize * scale,
            lineHeight: `${lineHeight * scale}px`,
            fontFamily: preview.family,
            transformOrigin: `0 ${(origin[1] - top) * scale}px`,
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            whiteSpace: multiline ? "pre-wrap" : "pre",
            color,
            opacity:
              fontsReady && (draft.kind === "text" || !!backdrop) ? 1 : 0,
          }}
          onChange={(e) => {
            onBlocked(true);
            onText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (
              e.nativeEvent.isComposing ||
              e.key === "Process" ||
              e.keyCode === 229
            )
              return;
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            } else if (
              e.key === "Enter" &&
              (!multiline || e.ctrlKey || e.metaKey)
            ) {
              e.preventDefault();
              e.stopPropagation();
              if (canApply) onApply();
            }
          }}
        />
      </div>
      {host &&
        createPortal(
          <div className="inline-text-controls">
            <div className="section-label">{tr("Editing on page")}</div>
            <h2>{tr(draft.kind === "text" ? "Add text" : "Edit text")}</h2>
            <p id="inline-help" className="inspector-copy">
              {tr(
                multiline
                  ? "Type directly on the page. Cmd/Ctrl+Enter applies; Escape cancels."
                  : "Type directly on the page. Enter applies; Escape cancels.",
              )}
            </p>
            {(draft.line || draft.object?.sourceFont) && (
              <p className="detected-style">
                {tr("Detected original style")}:{" "}
                {(draft.line?.font || draft.object?.sourceFont || "").replace(
                  /^[A-Z]{6}\+/,
                  "",
                )}{" "}
                · {draft.line?.size || draft.object?.size} pt
              </p>
            )}
            <button
              type="button"
              className="button subtle match-style"
              onClick={onPickStyle}
              disabled={busy}
            >
              {tr(pickingStyle ? "Stop matching" : "Match nearby text")}
            </button>
            {pickingStyle && (
              <p className="inline-warning">
                {tr(
                  "Click nearby text to copy its font, size and color. Your draft stays in place.",
                )}
              </p>
            )}
            <div className="text-editor-settings">
              <label>
                {tr("Font")}
                <select
                  aria-label={tr("Font")}
                  value={font}
                  onChange={(e) => {
                    onBlocked(true);
                    onFont(e.target.value);
                  }}
                >
                  {font.startsWith("document:") && (
                    <option value={font}>
                      {font.slice(9).replace(/^[A-Z]{6}\+/, "")}
                    </option>
                  )}
                  <option value="original">
                    {tr("Preserve original font")}
                  </option>
                  <option value="auto">
                    {tr("Automatic (English / 中文)")}
                  </option>
                  <option value="sans">{tr("Sans serif")}</option>
                  <option value="serif">{tr("Serif")}</option>
                  <option value="mono">{tr("Monospace")}</option>
                  <option value="cjk">Noto Sans CJK TC</option>
                  <option value="cjk-serif">Noto Serif CJK TC</option>
                  {customFonts.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Text size")}
                <input
                  type="number"
                  aria-label={tr("Text size")}
                  min={multiline ? 6 : 5}
                  max={120}
                  step={0.5}
                  value={size}
                  onChange={(e) => {
                    onBlocked(true);
                    onSize(Number(e.target.value));
                  }}
                />
              </label>
              <label>
                {tr("Color")}
                <input
                  type="color"
                  aria-label={tr("Text color")}
                  value={color}
                  onChange={(e) => onColor(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="button subtle import-font"
              disabled={busy}
              onClick={onImport}
            >
              {tr("Import font file…")}
            </button>
            {draft.kind === "replace" && (
              <label className="fit-original">
                <input
                  type="checkbox"
                  checked={fitOriginal}
                  onChange={(e) => {
                    onBlocked(true);
                    onFit(e.target.checked);
                  }}
                />
                {tr("Fit to original line (may reduce text size)")}
              </label>
            )}
            <FontFeedback
              query={query}
              allowSubstitution={allowSubstitution}
              onState={onBlocked}
              onReport={showFonts}
            />
            {lookingUp && (
              <p role="status" className="inline-warning">
                {tr("Checking installed fonts…")}
              </p>
            )}
            {lookupMessage && (
              <p role="status" className="inline-warning">
                {lookupMessage}
              </p>
            )}
            {!!fontReport?.substitutedCharacters.length &&
              window.desktop?.findFont && (
                <button
                  type="button"
                  className="button subtle"
                  disabled={busy || lookingUp}
                  onClick={() => void findMatchingFont(fontReport!)}
                >
                  {tr("Find matching installed font")}
                </button>
              )}
            {(previewError || backdropError) && (
              <p className="inline-warning" role="status">
                {previewError || backdropError}
              </p>
            )}
            <p className="input-hint">
              {tr(
                "Existing PDF text is edited one line at a time. Paragraph reflow is not available yet.",
              )}
            </p>
          </div>,
          host,
        )}
      {actionsHost &&
        createPortal(
          <div className="inline-text-controls inline-footer-controls">
            {!!fontReport?.substitutedCharacters.length && (
              <label className="substitution-choice">
                <input
                  type="checkbox"
                  checked={allowSubstitution}
                  onChange={(e) => {
                    onBlocked(true);
                    onAllowSubstitution(e.target.checked);
                  }}
                />
                {tr("Allow substitute characters (appearance may differ)")}
              </label>
            )}

            <div className="inline-actions">
              <button
                type="button"
                className="button subtle"
                disabled={busy}
                onClick={onCancel}
              >
                <X size={16} />
                {tr("Cancel")}
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!canApply}
                onClick={onApply}
              >
                {tr("Apply change")}
                <Check size={16} />
              </button>
            </div>
          </div>,
          actionsHost,
        )}
    </>
  );
}
