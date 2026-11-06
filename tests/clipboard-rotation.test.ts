import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
const font = fs.readFileSync(
  new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
);
const make = () => {
  const e = new PDFEngine(font);
  e.create();
  return e;
};
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.02, `${a} != ${b}`);
test("text rotation changes actual text direction; edit, move, resize, save, reopen and history retain orientation", () => {
  const e = make();
  const id = e.edit({
    kind: "text",
    page: 0,
    point: [180, 180],
    text: "Rotate this",
    size: 16,
    color: [0.2, 0.3, 0.4],
    font: "serif",
  }).focusObjectId!;
  const before = e.render(0, 0.2).objects[0];
  e.edit({ kind: "objectRotate", page: 0, id, degrees: 90 });
  let object = e.render(0, 0.2).objects[0];
  close(object.rotation!, 90);
  close(object.rect[2] - object.rect[0], before.rect[3] - before.rect[1]);
  const doc = m.Document.openDocument(e.export(), "application/pdf"),
    p = doc.loadPage(0),
    st = p.toStructuredText("");
  let direction: number[] = [];
  st.walk({
    beginLine(_b, _w, dir) {
      direction = dir;
    },
  });
  close(direction[0], 0);
  close(direction[1], 1);
  st.destroy();
  p.destroy();
  doc.destroy();
  const baseline = object.baseline!.slice();
  e.edit({
    kind: "objectText",
    page: 0,
    id,
    text: "Rotated edit",
    size: 16,
    color: [0.2, 0.3, 0.4],
    font: "original",
  });
  object = e.render(0, 0.2).objects[0];
  close(object.rotation!, 90);
  object.baseline!.forEach((n, i) => close(n, baseline[i]));
  assert.match(e.extract(0), /Rotated edit/);
  assert.doesNotMatch(e.extract(0), /Rotate this/);
  const r = object.rect;
  e.edit({
    kind: "objectTransform",
    page: 0,
    id,
    rect: [r[0] + 10, r[1] + 10, r[2] + 10, r[3] + 10],
  });
  object = e.render(0, 0.2).objects[0];
  close(object.rotation!, 90);
  const b = object.rect,
    w = b[2] - b[0],
    h = b[3] - b[1];
  e.edit({
    kind: "objectTransform",
    page: 0,
    id,
    rect: [b[0], b[1], b[0] + w * 1.2, b[1] + h * 1.2],
  });
  object = e.render(0, 0.2).objects[0];
  close(object.size!, 19.2);
  close(object.wrapWidth!, before.wrapWidth! * 1.2);
  const reopened = make();
  reopened.open(e.export());
  close(reopened.render(0, 0.2).objects[0].rotation!, 90);
  e.undo();
  close(e.render(0, 0.2).objects[0].size!, 16);
  e.redo();
  close(e.render(0, 0.2).objects[0].size!, 19.2);
});
test("copy isolates one formatted rotated text object and paste to another document stays editable and independent", () => {
  const e = make();
  e.edit({
    kind: "text",
    page: 0,
    point: [50, 50],
    text: "PRIVATE NEIGHBOR",
    size: 14,
    color: [0, 0, 0],
  });
  const id = e.edit({
    kind: "text",
    page: 0,
    point: [180, 180],
    text: "中文 Copied",
    size: 18,
    color: [0.6, 0.1, 0.2],
  }).focusObjectId!;
  e.edit({ kind: "objectRotate", page: 0, id, degrees: -90 });
  const original = e.export(),
    clip = e.copyObject(0, id);
  assert.equal(clip.kind, "object");
  if (clip.kind !== "object") throw Error();
  const isolated = m.Document.openDocument(clip.bytes, "application/pdf"),
    p = isolated.loadPage(0),
    st = p.toStructuredText("");
  assert.match(st.asText(), /中文 Copied/);
  assert.doesNotMatch(st.asText(), /PRIVATE/);
  st.destroy();
  p.destroy();
  isolated.destroy();
  assert.deepEqual(e.export(), original);
  const target = make(),
    newId = target.edit({
      kind: "objectPaste",
      page: 0,
      point: [60, 60],
      bytes: clip.bytes,
    }).focusObjectId!;
  let object = target.render(0, 0.2).objects[0];
  const report = target.inspectFont({
    page: 0,
    objectId: newId,
    text: "中文 Updated",
    font: "original",
    size: 18,
  });
  assert.deepEqual(report.substitutedCharacters, []);
  assert.equal(report.preserved, true);
  assert.notEqual(newId, id);
  close(object.rotation!, 270);
  close(object.size!, 18);
  close(object.rect[0], 60);
  target.edit({
    kind: "objectText",
    page: 0,
    id: newId,
    text: "中文 Updated",
    size: 18,
    color: [0.6, 0.1, 0.2],
    font: "original",
  });
  assert.match(target.extract(0), /中文 Updated/);
  assert.match(e.extract(0), /中文 Copied/);
  target.undo();
  assert.match(target.extract(0), /中文 Copied/);
  target.undo();
  assert.equal(target.render(0, 0.2).objects.length, 0);
  target.redo();
  const reopened = make();
  reopened.open(target.export());
  assert.match(reopened.extract(0), /中文 Copied/);
  close(reopened.render(0, 0.2).objects[0].rotation!, 270);
});
test("images rotate independently, copy with a transparent PNG and paste across rotated pages with independent IDs", () => {
  const e = make();
  const png = e.render(0, 0.1).png;
  const id = e.edit({
    kind: "image",
    page: 0,
    point: [200, 200],
    width: 120,
    bytes: png,
  }).focusObjectId!;
  const original = e.render(0, 0.2).objects[0];
  e.edit({ kind: "objectRotate", page: 0, id, degrees: 90 });
  const rotated = e.render(0, 0.2).objects[0];
  close(rotated.rect[2] - rotated.rect[0], original.rect[3] - original.rect[1]);
  const clip = e.copyObject(0, id);
  if (clip.kind !== "object") throw Error();
  assert.ok(clip.png!.length > 100);
  const image = new m.Image(clip.png!);
  assert.ok(image.getWidth() > image.getHeight());
  image.destroy();
  const target = make();
  target.edit({ kind: "rotate", page: 0 });
  target.edit({
    kind: "objectPaste",
    page: 0,
    point: [60, 70],
    bytes: clip.bytes,
  });
  let object = target.render(0, 0.2).objects[0];
  close(object.rotation!, 90);
  close(object.rect[0], 60);
  close(object.rect[1], 70);
  target.edit({ kind: "objectRotate", page: 0, id: object.id, degrees: -90 });
  close(target.render(0, 0.2).objects[0].rotation!, 0);
  target.undo();
  close(target.render(0, 0.2).objects[0].rotation!, 90);
  const re = make();
  re.open(target.export());
  object = re.render(0, 0.2).objects[0];
  close(object.rotation!, 90);
});
test("four quarter turns restore pixels and invalid rotation/paste are rejected without mutation", () => {
  const e = make(),
    id = e.edit({
      kind: "text",
      page: 0,
      point: [180, 180],
      text: "Four turns",
      size: 18,
      color: [0, 0, 0],
    }).focusObjectId!;
  const before = e.render(0, 1).png;
  for (let i = 0; i < 4; i++)
    e.edit({ kind: "objectRotate", page: 0, id, degrees: 90 });
  assert.deepEqual(e.render(0, 1).png, before);
  const history = e.info().position;
  assert.throws(
    () => e.edit({ kind: "objectRotate", page: 0, id, degrees: 17 }),
    /90/,
  );
  assert.equal(e.info().position, history);
  assert.deepEqual(e.render(0, 1).png, before);
  assert.throws(() =>
    e.edit({
      kind: "objectPaste",
      page: 0,
      point: [50, 50],
      bytes: Uint8Array.of(1, 2, 3),
    }),
  );
  assert.equal(e.info().position, history);
  assert.deepEqual(e.render(0, 1).png, before);
});
