import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
import { FontLibrary } from "../src/fonts";
import { fontNames } from "../src/fontNames";
const sans = fs.readFileSync(
    new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
  ),
  serif = fs.readFileSync(
    new URL("../src/assets/NotoSerifCJKtc-Regular.otf", import.meta.url),
  );
const engine = () => {
  const e = new PDFEngine(sans, serif);
  e.create();
  return e;
};
function brokenCMap() {
  const normal = new m.Font("AuditMingSubset", serif),
    bytes = new Uint8Array(serif),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < view.getUint16(4, false); i++) {
    const at = 12 + i * 16;
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) === "cmap")
      bytes.set(new TextEncoder().encode("Foli"), at);
  }
  const broken = new m.Font("AuditMingSubset", bytes);
  assert.equal(broken.encodeCharacter("中"), 0);
  const d = new m.PDFDocument(),
    font = d.addFont(broken),
    lib = new FontLibrary(normal, normal, normal, normal, normal),
    map = new Map(
      [...new Set("中文測試其他文字123 ")].map((c) => [
        c,
        normal.encodeCharacter(c),
      ]),
    );
  lib.repairUnicode(d, font, map);
  const hex = (text: string) =>
    [...text]
      .map((c) => normal.encodeCharacter(c).toString(16).padStart(4, "0"))
      .join("");
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      0,
      { Font: { F: font } },
      `BT /F 14 Tf 40 740 Td <${hex("中文測試")}> Tj 0 -30 Td <${hex("其他文字123")}> Tj ET`,
    ),
  );
  const buffer = d.saveToBuffer("");
  const result = buffer.asUint8Array().slice();
  buffer.destroy();
  d.destroy();
  broken.destroy();
  normal.destroy();
  return result;
}
test("CID subset without Unicode cmap keeps original outlines, size and baseline; repeated edits and save/reopen remain searchable", () => {
  const e = engine();
  e.open(brokenCMap());
  const before = e.render(0, 0.5),
    line = before.lines.find((l) => l.text === "中文測試")!;
  assert.ok(line);
  const report = e.inspectFont({
    page: 0,
    line: line.id,
    text: "中文測試123",
    font: "original",
  });
  assert.equal(report.preserved, true);
  assert.deepEqual(report.substitutedCharacters, []);
  const info = e.edit({
    kind: "replace",
    page: 0,
    line: line.id,
    text: "中文測試123",
  });
  let after = e.render(0, 0.5);
  assert.equal(after.lines.find((l) => l.text === "中文測試123")!.size, 14);
  assert.deepEqual(
    after.lines.find((l) => l.text === "中文測試123")!.origin,
    line.origin,
  );
  const id = info.focusObjectId!;
  for (const text of ["中文測試12", "中文測試123"])
    e.edit({
      kind: "objectText",
      page: 0,
      id,
      text,
      size: 14,
      color: [0, 0, 0],
      font: "original",
      width: 300,
    });
  const reopened = engine();
  reopened.open(e.export());
  reopened.edit({
    kind: "objectText",
    page: 0,
    id,
    text: "中文測試1",
    size: 14,
    color: [0, 0, 0],
    font: "original",
    width: 300,
  });
  const edited = reopened
    .render(0, 0.5)
    .lines.find((l) => l.text === "中文測試1")!;
  assert.equal(edited.size, 14);
  assert.deepEqual(edited.origin, line.origin);
  assert.equal(edited.font, line.font);
});
test("an unavailable serif glyph is substituted per character, with an explicit warning", () => {
  const e = engine();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "Original phrase",
    size: 14,
    color: [0, 0, 0],
    font: "serif",
  });
  const object = e.render(0, 0.2).objects[0],
    report = e.inspectFont({
      page: 0,
      objectId: object.id,
      text: "Original" + "\u4e2d\u6587",
      font: "original",
    });
  assert.ok(
    report.usedFonts.some(
      (n) => n.includes("NotoSerif") || n.includes("Noto Serif"),
    ),
  );
  assert.ok(
    report.usedFonts.some(
      (n) => n.includes("Times") || n.includes("NimbusRoman"),
    ),
  );
  assert.deepEqual(report.substitutedCharacters, ["\u4e2d", "\u6587"]);
});
test("imported font names come from font metadata and survive save/reopen", () => {
  assert.ok(fontNames(serif, "unknown")[0].includes("Serif"));
  const e = engine(),
    fonts = e.loadFont(serif, "imported.otf");
  assert.ok(fonts.length);
  const info = e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "匯入字型",
    size: 18,
    color: [0, 0, 0],
    font: fonts[0].key,
  });
  const id = info.focusObjectId!;
  const r = engine();
  r.open(e.export());
  const report = r.inspectFont({
    page: 0,
    objectId: id,
    text: "匯入字型修改",
    font: "original",
    size: 18,
  });
  assert.equal(report.preserved, true);
  assert.equal(report.substitutedCharacters.length, 0);
});
test("text boxes reject stretching; proportional resizing retains typeface and a stable baseline", () => {
  const e = engine(),
    info = e.edit({
      kind: "text",
      page: 0,
      point: [40, 40],
      text: "Serif text",
      size: 16,
      color: [0, 0, 0],
      font: "serif",
    }),
    object = e.render(0, 0.2).objects[0],
    r = object.rect;
  assert.throws(
    () =>
      e.edit({
        kind: "objectTransform",
        page: 0,
        id: object.id,
        rect: [r[0], r[1], r[2] + 80, r[3]],
      }),
    /proportionally/,
  );
  e.edit({
    kind: "objectTransform",
    page: 0,
    id: object.id,
    rect: [r[0], r[1], r[0] + (r[2] - r[0]) * 1.5, r[1] + (r[3] - r[1]) * 1.5],
  });
  const baseline = e.render(0, 0.2).lines[0].origin;
  e.edit({
    kind: "objectText",
    page: 0,
    id: info.focusObjectId!,
    text: "Serif text edited",
    size: 24,
    color: [0, 0, 0],
    font: "original",
    width: 300,
  });
  assert.ok(
    e
      .render(0, 0.2)
      .lines[0].origin.every((v, i) => Math.abs(v - baseline[i]) < 0.001),
  );
  assert.match(e.render(0, 0.2).lines[0].font, /Times|NimbusRoman/);
});
test("long existing-line edits preserve point size by default; shrinking is explicit", () => {
  const e = engine();
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      0,
      { Font: { F: d.addSimpleFont(new m.Font("Helvetica")) } },
      "BT /F 16 Tf 40 740 Td (Short) Tj ET",
    ),
  );
  const b = d.saveToBuffer("");
  e.open(b.asUint8Array().slice());
  b.destroy();
  d.destroy();
  e.edit({
    kind: "replace",
    page: 0,
    line: 0,
    text: "A considerably longer line",
  });
  assert.equal(e.render(0, 0.2).lines[0].size, 16);
});
const fixture = process.env.FOLIO_TEST_PDF;
test(
  "local document: PMingLiU edits append 123 without changing font size/baseline, preserve neighbors, and remain editable after save",
  { skip: !fixture },
  () => {
    const e = engine();
    e.open(fs.readFileSync(fixture!));
    const page = 1,
      before = e.render(page, 0.5),
      line = before.lines.find((l) => l.text.startsWith("今年積極"))!,
      neighbor = before.lines.find((l) => l.text.startsWith("案設計"))!;
    assert.match(line.font, /PMingLiU/);
    const text = line.text + "123",
      report = e.inspectFont({ page, line: line.id, text, font: "original" });
    assert.equal(report.preserved, true);
    assert.equal(report.substitutedCharacters.length, 0);
    const info = e.edit({ kind: "replace", page, line: line.id, text });
    const result = e.render(page, 0.5).lines.find((l) => l.text === text)!;
    assert.match(result.font, /PMingLiU/);
    assert.equal(result.size, 12);
    assert.deepEqual(result.origin, line.origin);
    assert.equal(
      e.render(page, 0.5).lines.find((l) => l.text === neighbor.text)!.font,
      neighbor.font,
    );
    const r = engine();
    r.open(e.export());
    r.edit({
      kind: "objectText",
      page,
      id: info.focusObjectId!,
      text: text + "2",
      size: 12,
      color: line.color,
      font: "original",
      width: 490,
    });
    const saved = r.render(page, 0.5).lines.find((l) => l.text === text + "2")!;
    assert.match(saved.font, /PMingLiU/);
    assert.equal(saved.size, 12);
    assert.deepEqual(saved.origin, line.origin);
  },
);
test("branching undo history never reuses detached PDF font references", () => {
  const e = engine();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "Version one",
    size: 16,
    color: [0, 0, 0],
    font: "serif",
  });
  e.undo();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "Version two",
    size: 16,
    color: [0, 0, 0],
    font: "serif",
  });
  assert.equal(e.extract(0).trim(), "Version two");
  const copy = engine();
  copy.open(e.export());
  assert.equal(copy.extract(0).trim(), "Version two");
  assert.match(copy.render(0, 0.2).lines[0].font, /Times|NimbusRoman/);
});
test("fit-to-original is explicit and reports the resulting point size", () => {
  const e = engine();
  const d = new m.PDFDocument();
  d.insertPage(
    -1,
    d.addPage(
      [0, 0, 595, 842],
      0,
      { Font: { F: d.addSimpleFont(new m.Font("Helvetica")) } },
      "BT /F 16 Tf 40 740 Td (Short) Tj ET",
    ),
  );
  const b = d.saveToBuffer(""),
    bytes = b.asUint8Array().slice();
  b.destroy();
  d.destroy();
  e.open(bytes);
  const text = "Longer phrase",
    preview = e.inspectFont({
      page: 0,
      line: 0,
      text,
      font: "original",
      size: 16,
      fitOriginal: true,
    });
  assert.ok(preview.size! < 16);
  e.edit({ kind: "replace", page: 0, line: 0, text, fitOriginal: true });
  assert.ok(Math.abs(e.render(0, 0.2).lines[0].size - preview.size!) < 0.01);
});

test("on-page font preview repairs Unicode coverage and caches full fonts across keystrokes", () => {
  const e = engine();
  e.open(brokenCMap());
  const line = e.render(0, 0.2).lines.find((l) => l.text === "中文測試")!;
  const report = e.inspectFont({
    page: 0,
    line: line.id,
    text: "中文測試123",
    font: "original",
    browserFonts: true,
  });
  assert.ok(report.browserFonts!.length > 0);
  for (const face of report.browserFonts!) {
    // Raw CFF-only embedded programs cannot be loaded as browser OpenType.
    // Their final PDF rendering remains correct and the UI reports a preview limit.
    assert.equal(face.bytes, undefined);
  }
  const known = report.browserFonts!.map((f) => f.id);
  assert.ok(
    e
      .inspectFont({
        page: 0,
        line: line.id,
        text: "中文測試12",
        font: "original",
        browserFonts: true,
        knownFonts: known,
      })
      .browserFonts!.every((f) => !f.bytes),
  );
  const full = e.inspectFont({
    page: 0,
    line: line.id,
    text: "中文",
    font: "cjk-serif",
    browserFonts: true,
  });
  const next = e.inspectFont({
    page: 0,
    line: line.id,
    text: "中文新字",
    font: "cjk-serif",
    browserFonts: true,
    knownFonts: full.browserFonts!.map((f) => f.id),
  });
  const derived = new m.Font("DerivedEditorFace", full.browserFonts![0].bytes!);
  assert.ok(derived.encodeCharacter("中") > 0);
  derived.destroy();
  assert.deepEqual(
    next.browserFonts!.map((f) => f.id),
    full.browserFonts!.map((f) => f.id),
  );
  assert.ok(next.browserFonts!.every((f) => !f.bytes));
});

test("text backdrops are isolated previews: no history, source bytes, annotations or background graphics change", () => {
  const e = engine();
  e.open(brokenCMap());
  e.edit({
    kind: "rectangle",
    page: 0,
    rect: [350, 40, 480, 100],
    color: [0.2, 0.6, 0.3],
  });
  const before = e.export(),
    info = e.info(),
    page = e.render(0, 0.5),
    line = page.lines.find((l) => l.text === "中文測試")!;
  const bytes = e.textBackdrop(
    { page: 0, line: line.id, text: line.text },
    0.5,
  );
  const image = new m.Image(bytes);
  assert.equal(image.getWidth(), 298);
  image.destroy();
  assert.equal(e.info().position, info.position);
  assert.deepEqual(e.export(), before);
  assert.equal(e.render(0, 0.2).annotations.length, page.annotations.length);
  assert.deepEqual(e.render(0, 0.5).png, page.png);
  e.undo();
  assert.equal(e.render(0, 0.2).annotations.length, 0);
});

test("original-line color changes are saved and a second managed-line edit honors new color", () => {
  const e = engine();
  e.open(brokenCMap());
  let line = e.render(0, 0.2).lines.find((l) => l.text === "中文測試")!;
  e.edit({
    kind: "replace",
    page: 0,
    line: line.id,
    text: "中文測試1",
    color: [0.8, 0.2, 0.1],
  });
  line = e.render(0, 0.2).lines.find((l) => l.text === "中文測試1")!;
  assert.ok(Math.abs(line.color[0] - 0.8) < 0.01);
  e.edit({
    kind: "replace",
    page: 0,
    line: line.id,
    text: "中文測試12",
    color: [0.1, 0.2, 0.8],
  });
  const copy = engine();
  copy.open(e.export());
  line = copy.render(0, 0.2).lines.find((l) => l.text === "中文測試12")!;
  assert.ok(Math.abs(line.color[2] - 0.8) < 0.01);
  assert.equal(line.size, 14);
});
