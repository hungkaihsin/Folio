import { useEffect, useState } from "react";
import { X, ArrowClockwise, ArrowSquareOut } from "@phosphor-icons/react";
import type { UpdateStatus } from "./client";
import { tr } from "./i18n";
import packageInfo from "../package.json";

export function UpdatesDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null),
    [checking, setChecking] = useState(false),
    [error, setError] = useState("");
  async function check() {
    setChecking(true);
    setError("");
    try {
      setStatus(
        (await window.desktop?.checkUpdates()) || {
          state: "unavailable",
          currentVersion: packageInfo.version,
        },
      );
    } catch {
      setStatus({ state: "unavailable", currentVersion: packageInfo.version });
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  async function download() {
    try {
      await window.desktop?.downloadUpdate();
    } catch {
      setError(tr("Could not open the download page."));
    }
  }
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section
        className="modal updates-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Pageline updates")}
      >
        <div className="modal-title">
          <h2>{tr("Pageline updates")}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={tr("Close updates")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p>
          {tr("Installed version")} <strong>{packageInfo.version}</strong>
        </p>
        <p role="status">
          {tr(
            checking
              ? "Checking for updates…"
              : status?.state === "available"
                ? "A new version is available."
                : status?.state === "current"
                  ? "You have the latest published version."
                  : "The update feed is unavailable. Check the release page for installers.",
          )}
        </p>
        {status?.state === "available" && (
          <p>
            {tr("Latest version")} <strong>{status.version}</strong>
          </p>
        )}
        <p>
          {tr(
            "Run the new installer to update this installation. Save your work and close the app before installing.",
          )}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button
            className="button subtle"
            type="button"
            disabled={checking}
            onClick={() => void check()}
          >
            <ArrowClockwise size={16} />
            {tr("Check again")}
          </button>
          {status?.state === "available" ? (
            <button
              className="button primary"
              type="button"
              onClick={() => void download()}
            >
              <ArrowSquareOut size={16} />
              {tr("Download installer")}
            </button>
          ) : (
            <button
              className="button subtle"
              type="button"
              onClick={() =>
                void window.desktop
                  ?.openReleases()
                  .catch(() =>
                    setError(tr("Could not open the download page.")),
                  )
              }
            >
              {tr("Open release page")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
