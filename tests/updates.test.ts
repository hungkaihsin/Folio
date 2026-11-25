import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createUpdateService } = createRequire(import.meta.url)(
  "../electron/updates.cjs",
);
function release(
  version = "0.9.0",
  url = `https://github.com/hungkaihsin/Folio/releases/download/v${version}/Pageline-${version}-macOS-Universal.dmg`,
) {
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: `Pageline-${version}-macOS-Universal.dmg`,
        browser_download_url: url,
      },
    ],
  };
}
test("updates select a newer platform installer, compare numeric versions and open only the approved release asset", async () => {
  const opened: string[] = [];
  const updates = createUpdateService({
    version: "0.8.0",
    platform: "darwin",
    fetchRelease: async () => new Response(JSON.stringify(release("0.10.0"))),
    openExternal: async (url: string) => opened.push(url),
  });
  assert.equal((await updates.check()).state, "available");
  await updates.download();
  assert.match(opened[0], /Pageline-0.10.0-macOS-Universal.dmg$/);
  const current = createUpdateService({
    version: "0.10.0",
    platform: "darwin",
    fetchRelease: async () => new Response(JSON.stringify(release("0.9.0"))),
    openExternal: async () => {},
  });
  assert.equal((await current.check()).state, "current");
});
test("private/draft feeds, missing assets and unsafe URLs return unavailable and cannot launch a download", async () => {
  for (const response of [
    new Response("Not found", { status: 404 }),
    new Response(JSON.stringify({ ...release(), draft: true })),
    new Response(
      JSON.stringify(release("0.9.0", "https://attacker.example/update.exe")),
    ),
    new Response(
      JSON.stringify(
        release(
          "0.9.0",
          "https://github.com/other/repo/releases/download/v0.9.0/update.exe",
        ),
      ),
    ),
    new Response(JSON.stringify({ ...release(), assets: [] })),
  ]) {
    const updates = createUpdateService({
      version: "0.8.0",
      platform: "darwin",
      fetchRelease: async () => response,
      openExternal: async () => assert.fail("Unexpected URL launch"),
    });
    assert.equal((await updates.check()).state, "unavailable");
    await assert.rejects(updates.download());
  }
});
test("concurrent checks share a request and a failed request can be retried", async () => {
  let calls = 0;
  const updates = createUpdateService({
    version: "0.8.0",
    platform: "darwin",
    fetchRelease: async () => {
      calls++;
      if (calls === 1) throw Error("offline");
      return new Response(JSON.stringify(release()));
    },
    openExternal: async () => {},
  });
  const first = await Promise.all([updates.check(), updates.check()]);
  assert.equal(calls, 1);
  assert.ok(first.every((value) => value.state === "unavailable"));
  assert.equal((await updates.check()).state, "available");
  assert.equal(calls, 2);
});
