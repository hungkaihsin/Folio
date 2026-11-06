import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
import { FontLibrary } from "../src/fonts";
const require = createRequire(import.meta.url),
  {
    fontKey,
    fontDirectories,
    findMatchingFont,
    namesFromFile,
  } = require("../electron/font-catalog.cjs");
const sans = fs.readFileSync(
    new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
  ),
  serif = fs.readFileSync(
    new URL("../src/assets/NotoSerifCJKtc-Regular.otf", import.meta.url),
  );
function fixture(rotation = 0) {
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      rotation,
      { Font: { F: d.addSimpleFont(new m.Font("Helvetica")) } },
      "BT /F 16 Tf 40 740 Td (First selected line.) Tj 0 -28 Td (Second selected line.) Tj 0 -28 Td (Leave this neighbor.) Tj ET",
    ),
  );
  const b = d.saveToBuffer(""),
    bytes = b.asUint8Array().slice();
  b.destroy();
  d.destroy();
  const e = new PDFEngine(sans, serif);
  e.open(bytes);
  return e;
}

test("character selection follows partial and multiline text in both drag directions; saved highlights preserve geometry", () => {
  const e = fixture(),
    lines = e.render(0, 0.2).lines,
    a: [number, number] = [lines[0].origin[0] + 2, lines[0].origin[1] - 5],
    b: [number, number] = [lines[1].rect[2] - 2, lines[1].origin[1] - 5];
  const s = e.selectText(0, a, b),
    reverse = e.selectText(0, b, a);
  assert.match(s.text, /First selected line\.[\s\S]*Second selected line\./);
  assert.equal(reverse.text, s.text);
  assert.equal(s.quads.length, 2);
  assert.equal(e.info().canUndo, false);
  e.edit({
    kind: "highlightText",
    page: 0,
    start: b,
    end: a,
    color: [1, 0.8, 0.1],
  });
  let d = m.Document.openDocument(e.export(), "application/pdf"),
    p = d.loadPage(0) as m.PDFPage;
  const annot = p.getAnnotations()[0];
  assert.equal(annot.getType(), "Highlight");
  assert.ok(
    annot
      .getQuadPoints()
      .flat()
      .every((v, i) => Math.abs(v - s.quads.flat()[i]) < 0.001),
  );
  assert.equal(annot.getContents(), "");
  p.destroy();
  d.destroy();
  e.undo();
  assert.equal(e.render(0, 0.2).annotations.length, 0);
  e.redo();
  assert.equal(e.render(0, 0.2).annotations.length, 1);
  assert.match(e.extract(0), /Leave this neighbor/);
});

test("text highlighting on rotated pages remains attached to actual character quads", () => {
  const e = fixture(90),
    line = e.render(0, 0.2).lines[0],
    a: [number, number] = [(line.rect[0] + line.rect[2]) / 2, line.rect[1] + 1],
    b: [number, number] = [(line.rect[0] + line.rect[2]) / 2, line.rect[3] - 1];
  const selection = e.selectText(0, a, b);
  assert.ok(selection.text.trim());
  e.edit({
    kind: "highlightText",
    page: 0,
    start: a,
    end: b,
    color: [1, 0.8, 0.1],
  });
  const d = m.Document.openDocument(e.export(), "application/pdf"),
    p = d.loadPage(0) as m.PDFPage;
  assert.ok(
    p
      .getAnnotations()[0]
      .getQuadPoints()
      .flat()
      .every((v, i) => Math.abs(v - selection.quads.flat()[i]) < 0.001),
  );
  p.destroy();
  d.destroy();
});

test("empty selections and unsupported exact-font edits leave history and source content intact", () => {
  const e = fixture(),
    line = e.render(0, 0.2).lines[0],
    before = e.export();
  assert.throws(
    () =>
      e.edit({
        kind: "highlightText",
        page: 0,
        start: [0, 0],
        end: [0, 0],
        color: [1, 1, 0],
      }),
    /Select text/,
  );
  assert.throws(
    () =>
      e.edit({
        kind: "replace",
        page: 0,
        line: line.id,
        text: "中文",
        font: "original",
        allowSubstitution: false,
      }),
    /matching font/,
  );
  assert.equal(e.info().canUndo, false);
  assert.deepEqual(e.export(), before);
  e.edit({
    kind: "replace",
    page: 0,
    line: line.id,
    text: "中文",
    font: "original",
    allowSubstitution: true,
  });
  assert.match(e.extract(0), /中文/);
});

test("font matching copies an existing typeface and preserves the target baseline", () => {
  const e = fixture();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 220],
    text: "Style sample",
    size: 18,
    color: [0.1, 0.2, 0.3],
    font: "serif",
  });
  const target = e.render(0, 0.2).lines[0],
    sample = e.render(0, 0.2).lines.find((l) => l.text === "Style sample")!;
  e.edit({
    kind: "replace",
    page: 0,
    line: target.id,
    text: "Revised",
    size: sample.size,
    color: sample.color,
    font: "document:" + sample.font,
    allowSubstitution: false,
  });
  const changed = e.render(0, 0.2).lines.find((l) => l.text === "Revised")!;
  assert.match(changed.font, /Times|NimbusRoman/);
  assert.equal(changed.size, 18);
  assert.deepEqual(changed.origin, target.origin);
});

test("local font lookup matches internal names rather than misleading filenames and uses platform font folders", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "folio-fonts-"));
  try {
    const file = path.join(dir, "MicrosoftJhengHei.ttf");
    await fsp.writeFile(file, serif);
    const names = await namesFromFile(file);
    assert.ok(names[0].names.some((n: string) => n.includes("NotoSerif")));
    assert.equal(
      await findMatchingFont("MicrosoftJhengHeiRegular", [dir]),
      null,
    );
    const result = await findMatchingFont("NotoSerifCJKtc-Regular", [dir]);
    assert.ok(result);
    assert.deepEqual(result.bytes, new Uint8Array(serif));
    assert.equal(
      fontKey("ABCDEF+MicrosoftJhengHeiRegular"),
      fontKey("Microsoft JhengHei"),
    );
    assert.notEqual(
      fontKey("MicrosoftJhengHeiBold"),
      fontKey("MicrosoftJhengHeiRegular"),
    );
    assert.ok(
      fontDirectories(
        "win32",
        {
          WINDIR: "C:\\Windows",
          LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local",
        },
        "C:\\Users\\Test",
      ).some((s: string) => s === "C:\\Windows\\Fonts"),
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
const local = process.env.FOLIO_TEST_PDF;
test(
  "local table cell detects JhengHei 12pt and blocks missing 測試 glyphs without altering the PDF",
  { skip: !local },
  () => {
    const e = new PDFEngine(sans, serif);
    e.open(fs.readFileSync(local!));
    const line = e
        .render(0, 0.2)
        .lines.find((l) => l.text.startsWith("職稱："))!,
      before = e.render(0, 0.5).png;
    assert.equal(line.size, 12);
    assert.match(line.font, /MicrosoftJhengHei/);
    const report = e.inspectFont({
      page: 0,
      line: line.id,
      text: "職稱：測試123",
      font: "original",
    });
    assert.deepEqual(report.substitutedCharacters, ["測", "試"]);
    assert.throws(
      () =>
        e.edit({
          kind: "replace",
          page: 0,
          line: line.id,
          text: "職稱：測試123",
          font: "original",
          allowSubstitution: false,
        }),
      /matching font/,
    );
    assert.deepEqual(e.render(0, 0.5).png, before);
    assert.equal(e.info().canUndo, false);
  },
);

test("a full imported matching font supplies glyphs omitted from a subset without changing the requested family", () => {
  const bytes = new Uint8Array(serif),
    v = new DataView(bytes.buffer);
  for (let i = 0; i < v.getUint16(4); i++) {
    const at = 12 + i * 16;
    if (new TextDecoder().decode(bytes.subarray(at, at + 4)) === "cmap")
      bytes.set(new TextEncoder().encode("Foli"), at);
  }
  const full = new m.Font("NotoSerifCJKtc-Regular", serif),
    subset = new m.Font("NotoSerifCJKtc-Regular", bytes),
    latin = new m.Font("Helvetica"),
    lib = new FontLibrary(latin, latin, latin, latin, latin);
  assert.equal(subset.encodeCharacter("測"), 0);
  assert.throws(() => lib.plan("測試", subset, "original"), /cannot draw/);
  lib.register(serif, "Matching.otf");
  const result = lib.plan("測試", subset, "original");
  assert.deepEqual(result.report.substitutedCharacters, []);
  assert.equal(result.report.preserved, true);
  assert.ok(result.glyphs.every((g) => g.gid === full.encodeCharacter(g.char)));
  full.destroy();
  subset.destroy();
  latin.destroy();
});

test("a highlight has no automatic written comment, including after save/reopen; a note is explicit", () => {
  const e = fixture(),
    line = e.render(0, 0.2).lines[0];
  e.edit({
    kind: "highlightText",
    page: 0,
    start: [line.rect[0] + 1, line.origin[1] - 5],
    end: [line.rect[2] - 1, line.origin[1] - 5],
    color: [1, 0.8, 0.1],
  });
  let d = m.Document.openDocument(e.export(), "application/pdf"),
    p = d.loadPage(0) as m.PDFPage;
  assert.equal(p.getAnnotations().length, 1);
  assert.equal(p.getAnnotations()[0].getType(), "Highlight");
  assert.equal(p.getAnnotations()[0].getContents(), "");
  p.destroy();
  d.destroy();
  e.edit({
    kind: "note",
    page: 0,
    point: [300, 150],
    text: "An intentional comment",
  });
  d = m.Document.openDocument(e.export(), "application/pdf");
  p = d.loadPage(0) as m.PDFPage;
  assert.deepEqual(
    p.getAnnotations().map((a) => a.getType()),
    ["Highlight", "Text"],
  );
  assert.equal(p.getAnnotations()[1].getContents(), "An intentional comment");
  p.destroy();
  d.destroy();
});
