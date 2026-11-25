import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as m from "mupdf";
import { PDFEngine } from "../src/engine";
import { printLayout } from "../src/printLayout";
import type { PrintOptions } from "../src/types";

const defaults: PrintOptions = {
  pages: [0, 1, 2, 3, 4, 5, 6, 7],
  layout: "booklet",
  paper: "A4",
  orientation: "portrait",
  binding: "left",
  sides: "both",
  reverse: false,
  margin: 12,
  copies: 1,
  duplex: "shortEdge",
};
function fixture(count = 8) {
  const doc = new m.PDFDocument();
  for (let page = 1; page <= count; page++)
    doc.insertPage(
      -1,
      doc.addPage(
        [0, 0, 300, 420],
        0,
        { Font: { F: doc.addSimpleFont(new m.Font("Helvetica")) } },
        `.95 .97 1 rg 0 0 300 420 re f .2 .3 .4 rg BT /F 40 Tf 40 340 Td (PAGE ${page}) Tj ET .3 .5 .7 RG 2 w 10 10 280 400 re S`,
      ),
    );
  const buffer = doc.saveToBuffer("");
  try {
    return buffer.asUint8Array().slice();
  } finally {
    buffer.destroy();
    doc.destroy();
  }
}
test("booklet order, padding, binding and manual duplex cover each selected page exactly once", () => {
  assert.deepEqual(
    printLayout(defaults, 8).sides.map((side) => side.pages),
    [
      [7, 0],
      [1, 6],
      [5, 2],
      [3, 4],
    ],
  );
  assert.deepEqual(
    printLayout({ ...defaults, pages: [0, 1, 2, 3, 4, 5] }, 6).sides.map(
      (side) => side.pages,
    ),
    [
      [null, 0],
      [1, null],
      [5, 2],
      [3, 4],
    ],
  );
  assert.deepEqual(
    printLayout({ ...defaults, binding: "right" }, 8).sides[0].pages,
    [0, 7],
  );
  const backs = printLayout({ ...defaults, sides: "back", reverse: true }, 8);
  assert.deepEqual(
    backs.sides.map((side) => side.pages),
    [
      [3, 4],
      [1, 6],
    ],
  );
  assert.equal(backs.duplex, "simplex");
  for (let count = 1; count <= 37; count++) {
    const result = printLayout(
      { ...defaults, pages: Array.from({ length: count }, (_, page) => page) },
      count,
    );
    const pages = result.sides
      .flatMap((side) => side.pages)
      .filter((page) => page !== null)
      .sort((a, b) => a - b);
    assert.deepEqual(
      pages,
      Array.from({ length: count }, (_, page) => page),
    );
    assert.equal(result.blanks, (4 - (count % 4)) % 4);
  }
});
test("booklet PDF keeps real searchable text in the expected physical positions and retains source/history", () => {
  const engine = new PDFEngine();
  engine.open(fixture());
  const before = engine.export(),
    position = engine.info().position;
  const file = engine.printDocument(defaults, "Review.pdf");
  const doc = m.Document.openDocument(file.bytes, "application/pdf");
  assert.equal(doc.countPages(), 4);
  const first = doc.loadPage(0),
    text = first.toStructuredText("");
  assert.match(text.asText(), /PAGE 8/);
  assert.match(text.asText(), /PAGE 1/);
  let current = "",
    left = 0,
    right = 0;
  text.walk({
    beginLine() {
      current = "";
    },
    onChar(char, point) {
      current += char;
      if (current === "PAGE 8") left = point[0];
      if (current === "PAGE 1") right = point[0];
    },
  });
  assert.ok(left < first.getBounds()[2] / 2);
  assert.ok(right > first.getBounds()[2] / 2);
  assert.ok(first.getBounds()[2] > first.getBounds()[3]);
  text.destroy();
  first.destroy();
  doc.destroy();
  assert.equal(engine.info().position, position);
  assert.deepEqual(engine.export(), before);
  fs.mkdirSync("work/printing", { recursive: true });
  fs.writeFileSync("work/printing/booklet-eight-pages.pdf", file.bytes);
});
test("normal print preserves cropped/rotated pages, annotation appearances without mutating source", () => {
  const source = m.Document.openDocument(
    fixture(1),
    "application/pdf",
  ).asPDF()!;
  const p = source.loadPage(0) as m.PDFPage;
  p.getObject().put("CropBox", [20, 20, 280, 400]);
  p.getObject().put("Rotate", 90);
  const note = p.createAnnotation("FreeText");
  note.setRect([80, 160, 220, 210]);
  note.setContents("PRINTED ANNOTATION");
  note.update();
  const buffer = source.saveToBuffer("");
  const engine = new PDFEngine();
  engine.open(buffer.asUint8Array().slice());
  buffer.destroy();
  p.destroy();
  source.destroy();
  const before = engine.export(),
    normal = {
      ...defaults,
      pages: [0],
      layout: "normal" as const,
      paper: "Letter" as const,
    };
  const output = engine.printDocument(normal);
  const check = m.Document.openDocument(output.bytes, "application/pdf");
  const page = check.loadPage(0),
    text = page.toStructuredText("");
  assert.match(text.asText(), /PAGE 1/);
  assert.match(text.asText(), /PRINTED ANNOTATION/);
  assert.deepEqual(page.getBounds(), [0, 0, 612, 792]);
  text.destroy();
  page.destroy();
  check.destroy();
  assert.deepEqual(engine.export(), before);
});
test("Chinese font data survives vector print and raster print pages use the requested sheet orientation", () => {
  const font = fs.readFileSync(
    new URL("../src/assets/NotoSansCJKtc-Regular.otf", import.meta.url),
  );
  const engine = new PDFEngine(font);
  engine.create();
  engine.edit({
    kind: "text",
    page: 0,
    point: [60, 70],
    text: "中文列印測試",
    size: 22,
    color: [0, 0, 0],
    font: "cjk",
  });
  const options = { ...defaults, pages: [0], layout: "normal" as const };
  const output = engine.printDocument(options);
  const printed = new PDFEngine(font);
  printed.open(output.bytes);
  assert.match(printed.extract(0), /中文列印測試/);
  fs.writeFileSync("work/printing/chinese-print.pdf", output.bytes);
  const images = engine.printImages({ ...options, layout: "booklet" });
  assert.equal(images.pages.length, 2);
  assert.equal(images.landscape, true);
  const image = new m.Image(images.pages[0]);
  assert.ok(image.getWidth() > image.getHeight());
  assert.ok(image.getWidth() * image.getHeight() <= 18100000);
  image.destroy();
});
test("invalid print requests cannot change the source document", () => {
  const engine = new PDFEngine();
  engine.open(fixture());
  const before = engine.export();
  for (const patch of [
    { pages: [] },
    { pages: [-1] },
    { pages: [0, 0] },
    { paper: "bad" },
    { copies: 0 },
    { margin: Infinity },
  ])
    assert.throws(() =>
      engine.printDocument({ ...defaults, ...patch } as PrintOptions),
    );
  assert.deepEqual(engine.export(), before);
});
