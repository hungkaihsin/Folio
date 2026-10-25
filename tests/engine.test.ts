import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
const font = fs.readFileSync(
  new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
);
function setup() {
  const e = new PDFEngine(font);
  e.create();
  return e;
}
test("added text is rendered, extractable, and survives reopening", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [60, 80],
    text: "Original sentence",
    size: 16,
    color: [0, 0, 0],
  });
  assert.match(e.extract(0), /Original sentence/);
  assert.ok(e.render(0, 0.4).png.length > 1000);
  const b = e.export();
  const reopened = new PDFEngine(font);
  reopened.open(b);
  assert.match(reopened.extract(0), /Original sentence/);
});
test("replacement removes source text, retains neighbors, survives save, undo and redo", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [60, 80],
    text: "Original sentence\nNeighbor remains.",
    size: 14,
    color: [0, 0, 0],
  });
  const lines = e.render(0, 0.3).lines;
  const line = lines.find((l) => l.text === "Original sentence")!;
  assert.ok(line);
  e.edit({ kind: "replace", page: 0, line: line.id, text: "Revised sentence" });
  assert.doesNotMatch(e.extract(0), /Original sentence/);
  assert.match(e.extract(0), /Revised sentence/);
  assert.match(e.extract(0), /Neighbor remains/);
  const out = e.export();
  const r = new PDFEngine(font);
  r.open(out);
  assert.doesNotMatch(r.extract(0), /Original sentence/);
  assert.match(r.extract(0), /Revised sentence/);
  e.undo();
  assert.match(e.extract(0), /Original sentence/);
  e.redo();
  assert.match(e.extract(0), /Revised sentence/);
});
test("Traditional Chinese can be added, replaced, saved and searched", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "你好，世界。",
    size: 18,
    color: [0, 0, 0],
  });
  assert.match(e.extract(0), /你好，世界。/);
  const line = e.render(0, 0.2).lines[0];
  e.edit({ kind: "replace", page: 0, line: line.id, text: "編輯文字。" });
  assert.match(e.extract(0), /編輯文字。/);
  assert.doesNotMatch(e.extract(0), /你好/);
  assert.ok(e.search("編輯").length);
  const r = new PDFEngine(font);
  r.open(e.export());
  assert.match(r.extract(0), /編輯文字。/);
});
test("page insert, duplicate, move, rotate, delete, and merge persist", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [50, 50],
    text: "First page",
    size: 12,
    color: [0, 0, 0],
  });
  e.edit({ kind: "blank", page: 0 });
  e.edit({ kind: "duplicate", page: 0 });
  assert.equal(e.info().pages.length, 3);
  assert.match(e.extract(1), /First page/);
  e.edit({ kind: "move", page: 1, to: 2 });
  assert.match(e.extract(2), /First page/);
  e.edit({ kind: "rotate", page: 0 });
  assert.equal(e.info().pages[0].width, 842);
  e.edit({ kind: "delete", page: 1 });
  assert.equal(e.info().pages.length, 2);
  const other = setup();
  e.edit({ kind: "merge", bytes: other.export() });
  assert.equal(e.info().pages.length, 3);
  const r = new PDFEngine(font);
  r.open(e.export());
  assert.equal(r.info().pages.length, 3);
});
test("annotations remain native PDF annotations and can be removed with undo", () => {
  const e = setup();
  e.edit({
    kind: "highlight",
    page: 0,
    rect: [40, 40, 120, 60],
    color: [1, 1, 0],
  });
  e.edit({ kind: "note", page: 0, point: [100, 100], text: "Review this" });
  e.edit({
    kind: "ink",
    page: 0,
    points: [
      [20, 20],
      [40, 40],
      [50, 25],
    ],
    color: [0, 0, 1],
    width: 2,
  });
  assert.equal(e.render(0, 0.2).annotations.length, 3);
  const r = new PDFEngine(font);
  r.open(e.export());
  assert.equal(r.render(0, 0.2).annotations.length, 3);
  e.edit({ kind: "removeAnnotation", page: 0, index: 0 });
  assert.equal(e.render(0, 0.2).annotations.length, 2);
  e.undo();
  assert.equal(e.render(0, 0.2).annotations.length, 3);
});
test("failure rolls back without removing content or adding undo history", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "Keep this",
    size: 12,
    color: [0, 0, 0],
  });
  const pos = e.info().position;
  assert.throws(
    () => e.edit({ kind: "replace", page: 0, line: 0, text: "a\nb" }),
    /one line/,
  );
  assert.equal(e.info().position, pos);
  assert.match(e.extract(0), /Keep this/);
  assert.throws(() => e.edit({ kind: "delete", page: 0 }), /at least one/);
});
test("original page annotations are not applied as redactions during text editing", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "Original sentence\nKeep this neighbor",
    size: 14,
    color: [0, 0, 0],
  });
  const bytes = e.export();
  const d = m.Document.openDocument(bytes, "application/pdf").asPDF()!;
  const p = d.loadPage(0),
    a = p.createAnnotation("Redact");
  a.setRect([35, 73, 230, 100]);
  a.update();
  const b = d.saveToBuffer("");
  e.open(b.asUint8Array().slice());
  b.destroy();
  p.destroy();
  d.destroy();
  e.edit({ kind: "replace", page: 0, line: 0, text: "Changed sentence" });
  assert.match(e.extract(0), /Keep this neighbor/);
  assert.ok(e.render(0, 0.2).annotations.some((a) => a.type === "Redact"));
});
test("cropped pages and rotated-page overlays use the displayed coordinates", () => {
  const d = new m.PDFDocument();
  d.insertPage(-1, d.addPage([20, 30, 420, 630], 90, {}, ""));
  const p = d.loadPage(0);
  p.setPageBox("CropBox", [30, 40, 390, 600]);
  p.destroy();
  const b = d.saveToBuffer(""),
    e = new PDFEngine(font);
  e.open(b.asUint8Array().slice());
  b.destroy();
  d.destroy();
  e.edit({
    kind: "text",
    page: 0,
    point: [50, 70],
    text: "Located text",
    size: 16,
    color: [0, 0, 0],
  });
  const line = e.render(0, 0.3).lines[0];
  assert.ok(Math.abs(line.origin[0] - 50) < 1, JSON.stringify(line));
  assert.ok(Math.abs(line.origin[1] - 86) < 1, JSON.stringify(line));
  e.edit({ kind: "replace", page: 0, line: 0, text: "Edited text" });
  assert.match(e.extract(0), /Edited text/);
  assert.doesNotMatch(e.extract(0), /Located text/);
});
test("new edits after undo get unique dirty-state identifiers", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [20, 20],
    text: "Version one",
    size: 12,
    color: [0, 0, 0],
  });
  const saved = e.info().position;
  e.undo();
  e.edit({
    kind: "text",
    page: 0,
    point: [20, 20],
    text: "Different version",
    size: 12,
    color: [0, 0, 0],
  });
  assert.notEqual(e.info().position, saved);
});
test("PNG image insertion draws on a rotated page and survives a save", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [30, 30],
    text: "Image source",
    size: 20,
    color: [0, 0, 0],
  });
  const png = e.render(0, 0.3).png;
  e.edit({ kind: "blank", page: 0 });
  e.edit({ kind: "rotate", page: 1 });
  const blank = e.render(1, 0.5).png;
  e.edit({ kind: "image", page: 1, point: [80, 80], bytes: png, width: 150 });
  const before = e.render(1, 0.5).png;
  assert.notDeepEqual(before, blank);
  const r = new PDFEngine(font);
  r.open(e.export());
  assert.deepEqual(r.render(1, 0.5).png, before);
});
test("AcroForm text and checkbox canonical values persist after saving", () => {
  const d = new m.PDFDocument();
  d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, {}, ""));
  const text = d.addObject({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Tx",
    T: d.newString("Full name"),
    V: d.newString("Before"),
    Rect: [40, 700, 240, 730],
    P: d.findPage(0),
    DA: d.newString("/Helv 12 Tf 0 g"),
  });
  const off = d.addStream("", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 20, 20],
    }),
    on = d.addStream("0 0 0 rg 2 2 16 16 re f", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 20, 20],
    });
  const check = d.addObject({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Btn",
    T: d.newString("Accept"),
    Rect: [40, 650, 60, 670],
    P: d.findPage(0),
    AP: { N: { Off: off, Yes: on } },
    AS: "Off",
    V: "Off",
  });
  d.findPage(0).put("Annots", [text, check]);
  d.getTrailer()
    .get("Root")
    .put("AcroForm", {
      Fields: [text, check],
      DA: d.newString("/Helv 12 Tf 0 g"),
      DR: { Font: { Helv: d.addSimpleFont(new m.Font("Helvetica")) } },
    });
  const b = d.saveToBuffer("");
  const e = new PDFEngine(font);
  e.open(b.asUint8Array().slice());
  b.destroy();
  d.destroy();
  const widgets = e.render(0, 0.2).widgets;
  assert.equal(widgets[0].type, "text");
  e.edit({ kind: "form", page: 0, index: 0, value: "Daniel Hung" });
  e.edit({ kind: "form", page: 0, index: 1, value: "" });
  const saved = e.export();
  const r = new PDFEngine(font);
  r.open(saved);
  assert.equal(r.render(0, 0.2).widgets[0].value, "Daniel Hung");
  assert.equal(r.render(0, 0.2).widgets[1].value, "Yes");
  const raw = m.Document.openDocument(saved, "application/pdf").asPDF()!;
  assert.equal(
    raw.getTrailer().get("Root", "AcroForm", "Fields", 0, "V").asString(),
    "Daniel Hung",
  );
  raw.destroy();
});

test("added text wraps within the page and rejects vertical overflow without changing the document", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [480, 40],
    text: "A longer sentence that needs to wrap inside this narrow area.",
    size: 14,
    color: [0, 0, 0],
  });
  assert.ok(e.render(0, 0.2).lines.length > 1);
  assert.ok(e.render(0, 0.2).lines.every((l) => l.rect[2] <= 588));
  const pos = e.info().position;
  assert.throws(
    () =>
      e.edit({
        kind: "text",
        page: 0,
        point: [40, 830],
        text: "Too low",
        size: 14,
        color: [0, 0, 0],
      }),
    /bottom/,
  );
  assert.equal(e.info().position, pos);
});
test("editing a duplicated page does not alter its sibling", () => {
  const e = setup();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "Shared original",
    size: 14,
    color: [0, 0, 0],
  });
  e.edit({ kind: "duplicate", page: 0 });
  e.edit({ kind: "replace", page: 0, line: 0, text: "First page edit" });
  assert.match(e.extract(0), /First page edit/);
  assert.match(e.extract(1), /Shared original/);
  assert.doesNotMatch(e.extract(1), /First page edit/);
});
test("duplicate and merge retain native annotations as independent copies", () => {
  const e = setup();
  e.edit({ kind: "note", page: 0, point: [40, 40], text: "Source comment" });
  e.edit({ kind: "duplicate", page: 0 });
  assert.equal(e.render(1, 0.2).annotations[0].contents, "Source comment");
  e.edit({ kind: "removeAnnotation", page: 1, index: 0 });
  assert.equal(e.render(0, 0.2).annotations.length, 1);
  assert.equal(e.render(1, 0.2).annotations.length, 0);
  const target = setup();
  target.edit({ kind: "merge", bytes: e.export() });
  assert.equal(target.render(1, 0.2).annotations[0].contents, "Source comment");
});
