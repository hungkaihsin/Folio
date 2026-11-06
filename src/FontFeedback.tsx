import { useEffect, useState } from "react";
import { engine } from "./client";
import { tr } from "./i18n";
import type { FontQuery, FontReport } from "./types";
export function FontFeedback({
  query,
  onState,
  onReport,
  allowSubstitution = true,
}: {
  query: FontQuery;
  onState: (disabled: boolean) => void;
  onReport?: (report: FontReport) => void;
  allowSubstitution?: boolean;
}) {
  const [report, setReport] = useState<FontReport | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setReport(null);
    setError("");
    onState(true);
    const timer = setTimeout(() => {
      engine
        .inspectFont(query)
        .then((result) => {
          if (active) {
            setReport(result);
            onReport?.(result);
            onState(
              (!allowSubstitution && result.substitutedCharacters.length > 0) ||
                !!result.overflow ||
                (result.size !== undefined && result.size < 5),
            );
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            onState(true);
          }
        });
    }, 140);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    query.page,
    query.line,
    query.objectId,
    query.text,
    query.font,
    query.size,
    query.fitOriginal,
    query.revision,
    allowSubstitution,
  ]);
  return (
    <div
      className={`font-feedback ${report?.substitutedCharacters.length ? "fallback" : ""}`}
      role="status"
      aria-label={tr("Font preview")}
    >
      {error ? (
        <span role="alert">{tr(error)}</span>
      ) : report ? (
        <>
          <div>
            <span>{tr("Requested font")}</span>
            <strong>{report.requestedFont}</strong>
          </div>
          <div>
            <span>{tr("Using")}</span>
            <strong>{report.usedFonts.join(" + ") || "—"}</strong>
          </div>
          <div>
            <span>{tr("Text size")}</span>
            <strong>{report.size?.toFixed(2)} pt</strong>
          </div>
          {report.substitutedCharacters.length > 0 ? (
            <p>
              {tr(
                "Missing characters require the full font. Import it or allow substitution below.",
              )}
              <br />
              {tr("Substituted characters")}:{" "}
              {report.substitutedCharacters.join(" ")}
            </p>
          ) : (
            <p className="font-preserved">
              {tr(
                report.preserved
                  ? query.font?.startsWith("document:")
                    ? "Matched font available."
                    : "Original font preserved."
                  : "The selected font can render this text.",
              )}
            </p>
          )}
          {report.overflow && (
            <p role="alert">
              {tr(
                "The replacement exceeds the page width. Shorten it or enable Fit to original line.",
              )}
            </p>
          )}
          {report.size !== undefined && report.size < 5 && (
            <p role="alert">
              {tr(
                "The replacement is too long for this line. Shorten it or use a smaller edit.",
              )}
            </p>
          )}
        </>
      ) : (
        tr("Checking font coverage…")
      )}
    </div>
  );
}
