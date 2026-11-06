import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
const font = fs.readFileSync(
  new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
);
const engine = () => {
  const e = new PDFEngine(font);
  e.create();
  return e;
};
test("text is a persistent movable editable object; save, reopen, update, resize and history preserve actual content", () => {
  const e = engine();
  const result = e.edit({
    kind: "text",
    page: 0,
    point: [50, 50],
    text: "Move me",
    size: 14,
    color: [0, 0, 0],
  });
  const before = e.render(0, 0.3).objects[0];
  assert.equal(before.id, result.focusObjectId);
  const r = before.rect;
  e.edit({
    kind: "objectTransform",
    page: 0,
    id: before.id,
    rect: [r[0] + 80, r[1] + 60, r[2] + 80, r[3] + 60],
  });
  let after = e.render(0, 0.3).objects[0];
  assert.ok(Math.abs(after.rect[0] - before.rect[0] - 80) < 0.01);
  const reopened = new PDFEngine(font);
  reopened.open(e.export());
  after = reopened.render(0, 0.3).objects[0];
  assert.equal(after.id, before.id);
  reopened.edit({
    kind: "objectText",
    page: 0,
    id: after.id,
    text: "改成中文",
    size: 16,
    color: [1, 0, 0],
    font: "auto",
    width: 180,
  });
  assert.match(reopened.extract(0), /改成中文/);
  assert.doesNotMatch(reopened.extract(0), /Move me/);
  reopened.undo();
  assert.match(reopened.extract(0), /Move me/);
  reopened.redo();
  assert.match(reopened.extract(0), /改成中文/);
  reopened.edit({ kind: "objectDelete", page: 0, id: before.id });
  assert.equal(reopened.render(0, 0.3).objects.length, 0);
  assert.doesNotMatch(reopened.extract(0), /改成中文/);
});
test("image, drawing, highlight and comment can move and resize independently, including on a rotated page", () => {
  const e = engine();
  const png = e.render(0, 0.1).png;
  e.edit({ kind: "image", page: 0, point: [20, 20], bytes: png, width: 120 });
  e.edit({
    kind: "ink",
    page: 0,
    points: [
      [200, 200],
      [240, 210],
      [225, 245],
    ],
    width: 2,
    color: [0, 0, 1],
  });
  e.edit({
    kind: "highlight",
    page: 0,
    rect: [50, 150, 170, 170],
    color: [1, 1, 0],
  });
  e.edit({ kind: "note", page: 0, point: [100, 300], text: "Move note" });
  for (const object of e.render(0, 0.2).objects) {
    const r = object.rect;
    e.edit({
      kind: "objectTransform",
      page: 0,
      id: object.id,
      rect: [r[0] + 10, r[1] + 20, r[2] + 10, r[3] + 20],
    });
    const changed = e.render(0, 0.2).objects.find((o) => o.id === object.id)!;
    assert.ok(Math.abs(changed.rect[0] - r[0] - 10) < 1);
    assert.ok(Math.abs(changed.rect[1] - r[1] - 20) < 1);
  }
  e.edit({ kind: "rotate", page: 0 });
  const image = e.render(0, 0.2).objects.find((o) => o.kind === "image")!,
    r = image.rect;
  e.edit({
    kind: "objectTransform",
    page: 0,
    id: image.id,
    rect: [r[0] - 30, r[1] + 10, r[2] - 30, r[3] + 10],
  });
  const saved = engine();
  saved.open(e.export());
  assert.equal(saved.render(0, 0.2).objects.length, 4);
  assert.ok(
    Math.abs(
      saved.render(0, 0.2).objects.find((o) => o.kind === "image")!.rect[0] -
        r[0] +
        30,
    ) < 1,
  );
});
test("duplicated and merged managed objects remain independently movable after reopening", () => {
  const e = engine();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "First object",
    size: 14,
    color: [0, 0, 0],
  });
  e.edit({ kind: "duplicate", page: 0 });
  let obj = e.render(1, 0.2).objects[0],
    r = obj.rect;
  e.edit({
    kind: "objectTransform",
    page: 1,
    id: obj.id,
    rect: [r[0] + 90, r[1], r[2] + 90, r[3]],
  });
  assert.ok(Math.abs(e.render(0, 0.2).objects[0].rect[0] - r[0]) < 0.01);
  const target = engine();
  target.edit({ kind: "merge", bytes: e.export() });
  target.open(target.export());
  obj = target.render(1, 0.2).objects[0];
  target.edit({
    kind: "objectText",
    page: 1,
    id: obj.id,
    text: "Independent",
    size: 14,
    color: [0, 0, 0],
    width: 200,
  });
  assert.match(target.extract(1), /Independent/);
  assert.match(target.extract(2), /First object/);
});
test("PNG/JPEG/text/page-range PDF and multipage ZIP exports reflect edits without altering undo", () => {
  const e = engine();
  e.edit({
    kind: "text",
    page: 0,
    point: [30, 30],
    text: "Exported 中文",
    size: 18,
    color: [0, 0, 0],
  });
  e.edit({ kind: "blank", page: 0 });
  const position = e.info().position;
  const png = e.exportFile({ format: "png", pages: [0], scale: 1 });
  assert.deepEqual(
    [...png.bytes.slice(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  const jpeg = e.exportFile({ format: "jpeg", pages: [0], scale: 1 });
  assert.equal(jpeg.bytes[0], 255);
  assert.equal(jpeg.bytes[1], 216);
  const text = e.exportFile({ format: "txt", pages: [0] });
  assert.match(new TextDecoder().decode(text.bytes), /Exported 中文/);
  const archive = e.exportFile({ format: "png", pages: [0, 1], scale: 1 });
  assert.equal(archive.extension, "zip");
  assert.equal(
    new DataView(archive.bytes.buffer).getUint32(0, true),
    0x04034b50,
  );
  const pdf = e.exportFile({ format: "pdf", pages: [1] });
  const check = engine();
  check.open(pdf.bytes);
  assert.equal(check.info().pages.length, 1);
  assert.doesNotMatch(check.extract(0), /Exported/);
  assert.equal(e.info().position, position);
  e.undo();
  assert.equal(e.info().pages.length, 1);
});
test("legacy Folio 0.1 text/images are recovered as movable objects without changing their rendering", () => {
  const e = engine();
  e.edit({
    kind: "text",
    page: 0,
    point: [50, 60],
    text: "Old text",
    size: 16,
    color: [0, 0, 0],
  });
  const png = e.render(0, 0.15).png;
  e.edit({ kind: "image", page: 0, point: [200, 200], bytes: png, width: 100 });
  const data = e.export(),
    d = m.Document.openDocument(data, "application/pdf").asPDF()!;
  d.findPage(0).delete("FolioObjects");
  const buffer = d.saveToBuffer("garbage=4,compress"),
    raw = buffer.asUint8Array().slice();
  buffer.destroy();
  d.destroy();
  const legacy = m.Document.openDocument(raw, "application/pdf").asPDF()!,
    p = legacy.loadPage(0),
    pix = p.toPixmap(
      m.Matrix.scale(0.3, 0.3),
      m.ColorSpace.DeviceRGB,
      false,
      true,
    ),
    before = pix.asPNG().slice();
  pix.destroy();
  p.destroy();
  legacy.destroy();
  const reopened = engine();
  reopened.open(raw);
  const view = reopened.render(0, 0.3);
  assert.deepEqual(view.png, before);
  assert.equal(view.objects.length, 2);
  const obj = view.objects.find((o) => o.kind === "text")!,
    r = obj.rect;
  reopened.edit({
    kind: "objectTransform",
    page: 0,
    id: obj.id,
    rect: [r[0] + 40, r[1], r[2] + 40, r[3]],
  });
  assert.ok(
    Math.abs(
      reopened.render(0, 0.3).objects.find((o) => o.id === obj.id)!.rect[0] -
        r[0] -
        40,
    ) < 1,
  );
});
test("moving an object moves actual text content and exported page images, not only its selection metadata", () => {
  const e = engine();
  e.edit({
    kind: "text",
    page: 0,
    point: [40, 40],
    text: "Real coordinates",
    size: 16,
    color: [0, 0, 0],
  });
  let view = e.render(0, 0.5),
    object = view.objects[0],
    line = view.lines[0],
    r = object.rect;
  e.edit({
    kind: "objectTransform",
    page: 0,
    id: object.id,
    rect: [r[0] + 70, r[1] + 50, r[2] + 70, r[3] + 50],
  });
  const moved = e.render(0, 0.5);
  assert.ok(Math.abs(moved.lines[0].origin[0] - line.origin[0] - 70) < 0.01);
  assert.ok(Math.abs(moved.lines[0].origin[1] - line.origin[1] - 50) < 0.01);
  assert.notDeepEqual(moved.png, view.png);
  const exported = e.exportFile({ format: "pdf", pages: [0] });
  const check = engine();
  check.open(exported.bytes);
  assert.ok(
    Math.abs(check.render(0, 0.5).lines[0].origin[0] - line.origin[0] - 70) <
      0.01,
  );
});
