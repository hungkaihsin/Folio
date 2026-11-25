const RELEASES = "https://github.com/hungkaihsin/Folio/releases";
const API = "https://api.github.com/repos/hungkaihsin/Folio/releases/latest";

function versionParts(value) {
  const match =
    typeof value === "string" && value.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}
function newerVersion(candidate, current) {
  const next = versionParts(candidate),
    previous = versionParts(current);
  if (!next || !previous) return false;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== previous[index]) return next[index] > previous[index];
  }
  return false;
}
function installerUrl(release, platform) {
  const version = release.tag_name.replace(/^v/, "");
  const suffix =
    platform === "darwin" ? "macOS-Universal.dmg" : "Windows-x64-Setup.exe";
  const asset = release.assets?.find((asset) =>
    ["Pageline", "Folio"].some(
      (name) => asset.name === `${name}-${version}-${suffix}`,
    ),
  );
  if (!asset || typeof asset.browser_download_url !== "string") return null;
  const url = new URL(asset.browser_download_url);
  if (
    url.protocol !== "https:" ||
    url.host !== "github.com" ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/hungkaihsin/Folio/releases/download/") ||
    url.search ||
    url.hash
  )
    return null;
  return url.href;
}
function createUpdateService({
  version,
  platform,
  fetchRelease = fetch,
  openExternal,
}) {
  let checking = null,
    download = null;
  async function check() {
    if (checking) return checking;
    download = null;
    checking = (async () => {
      try {
        const response = await fetchRelease(API, {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Pageline",
          },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error("Release feed unavailable");
        const text = await response.text();
        if (text.length > 1024 * 1024)
          throw new Error("Invalid release response");
        const release = JSON.parse(text);
        if (
          release.draft ||
          release.prerelease ||
          !versionParts(release.tag_name)
        )
          throw new Error("Published release unavailable");
        if (!newerVersion(release.tag_name, version))
          return { state: "current", currentVersion: version };
        download = installerUrl(release, platform);
        if (!download) throw new Error("Installer unavailable");
        return {
          state: "available",
          currentVersion: version,
          version: release.tag_name.replace(/^v/, ""),
        };
      } catch {
        return { state: "unavailable", currentVersion: version };
      }
    })();
    try {
      return await checking;
    } finally {
      checking = null;
    }
  }
  return {
    check,
    async download() {
      if (!download) throw new Error("Check for updates before downloading.");
      await openExternal(download);
    },
    openReleases: () => openExternal(RELEASES),
  };
}
module.exports = { createUpdateService };
