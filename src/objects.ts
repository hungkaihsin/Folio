import * as m from "mupdf";
import type { PageObject, Rect, Point } from "./types";

// Custom page metadata references the actual PDF streams, so objects stay editable
// after save/reopen. Ordinary PDF readers render the same vector content.
export interface ManagedData extends PageObject {
  pageTransform: m.Matrix;
  contentTransform: m.Matrix;
  point?: Point;
  lines?: string[];
  wrapWidth?: number;
}
export function entries(page: m.PDFPage) {
  const array = page.getObject().get("FolioObjects");
  const result: { index: number; record: m.PDFObject; data: ManagedData }[] =
    [];
  array.forEach((record, index) => {
    try {
      const data = JSON.parse(record.get("Data").asString()) as ManagedData;
      if (
        typeof data.id === "string" &&
        ["text", "image"].includes(data.kind) &&
        Array.isArray(data.rect) &&
        data.rect.length === 4 &&
        data.rect.every(Number.isFinite) &&
        Array.isArray(data.pageTransform) &&
        data.pageTransform.length === 6 &&
        data.pageTransform.every(Number.isFinite) &&
        Array.isArray(data.contentTransform) &&
        data.contentTransform.length === 6 &&
        data.contentTransform.every(Number.isFinite) &&
        record.get("Stream").isStream()
      )
        result.push({ index: Number(index), record, data });
    } catch {
      /* Ignore unrecognized metadata from other producers. */
    }
  });
  return result;
}
export function displayed(page: m.PDFPage, data: ManagedData): PageObject {
  const matrix = m.Matrix.concat(
    m.Matrix.invert(data.pageTransform),
    page.getTransform(),
  );
  return {
    ...data,
    rect: m.Rect.transform(data.rect, matrix),
    rotation:
      ((data.rotation || 0) +
        (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI +
        360) %
      360,
    ...(data.baseline
      ? { baseline: transformPoint(data.baseline, matrix) }
      : {}),
  };
}
export function objects(page: m.PDFPage): PageObject[] {
  const native = page.getAnnotations().map((a, index) => {
    const type = a.getType();
    return {
      id: `annotation:${index}`,
      kind:
        (
          {
            Highlight: "highlight",
            Square: "rectangle",
            Ink: "ink",
            Text: "note",
            FreeText: "text",
          } as Record<string, PageObject["kind"]>
        )[type] || "annotation",
      rect: a.getBounds(),
      text: a.getContents(),
    } as PageObject;
  });
  return [...entries(page).map((e) => displayed(page, e.data)), ...native];
}
export function store(
  data: ManagedData,
  record: m.PDFObject,
  doc: m.PDFDocument,
) {
  record.put("Data", doc.newString(JSON.stringify(data)));
}
export function contentCommand(matrix: m.Matrix, name: string) {
  // PDF numbers do not support exponent notation (quarter turns introduce
  // near-zero floating point values such as 6e-17).
  const numbers = matrix.map((value) =>
    Math.abs(value) < 1e-10 ? "0" : value.toFixed(10).replace(/\.?0+$/, ""),
  );
  return `q ${numbers.join(" ")} cm /${name} Do Q`;
}
export function validateRect(rect: Rect, bounds: Rect) {
  if (
    rect.length !== 4 ||
    !rect.every(Number.isFinite) ||
    rect[2] - rect[0] < 2 ||
    rect[3] - rect[1] < 2
  )
    throw new Error("The object must be at least 2 points wide and high.");
  if (
    rect[0] < bounds[0] - 0.01 ||
    rect[1] < bounds[1] - 0.01 ||
    rect[2] > bounds[2] + 0.01 ||
    rect[3] > bounds[3] + 0.01
  )
    throw new Error("Keep the entire object inside the page.");
}
export function rectTransform(from: Rect, to: Rect): m.Matrix {
  const sx = (to[2] - to[0]) / (from[2] - from[0]),
    sy = (to[3] - to[1]) / (from[3] - from[1]);
  return [sx, 0, 0, sy, to[0] - from[0] * sx, to[1] - from[1] * sy];
}
export function transformPoint(p: Point, t: m.Matrix): Point {
  return [p[0] * t[0] + p[1] * t[2] + t[4], p[0] * t[1] + p[1] * t[3] + t[5]];
}
export function moveObject(
  doc: m.PDFDocument,
  page: m.PDFPage,
  id: string,
  rect: Rect,
) {
  validateRect(rect, page.getBounds());
  const managed = entries(page).find((e) => e.data.id === id);
  if (managed) {
    const current = displayed(page, managed.data);
    if (managed.data.kind === "text") {
      const sx = (rect[2] - rect[0]) / (current.rect[2] - current.rect[0]),
        sy = (rect[3] - rect[1]) / (current.rect[3] - current.rect[1]);
      if (Math.abs(sx - sy) > 0.01)
        throw new Error(
          "Resize text proportionally to avoid distorting its font. Change the text size or wrapping width instead.",
        );
      rect = [
        rect[0],
        rect[1],
        rect[2],
        rect[1] + (current.rect[3] - current.rect[1]) * sx,
      ];
    }
    const delta = rectTransform(current.rect, rect);
    if (current.baseline)
      managed.data.baseline = transformPoint(current.baseline, delta);
    const pageMatrix = page.getTransform();
    const rawDelta = m.Matrix.concat(
      m.Matrix.concat(pageMatrix, delta),
      m.Matrix.invert(pageMatrix),
    );
    if (managed.data.kind === "text" && managed.data.size)
      managed.data.size *=
        (rect[3] - rect[1]) / (current.rect[3] - current.rect[1]);
    if (
      managed.data.kind === "text" &&
      Math.abs(rect[2] - rect[0] - (current.rect[2] - current.rect[0])) > 0.01
    )
      managed.data.wrapWidth =
        ((managed.data.wrapWidth || current.rect[2] - current.rect[0]) *
          (rect[2] - rect[0])) /
        (current.rect[2] - current.rect[0]);
    managed.data.contentTransform = m.Matrix.concat(
      managed.data.contentTransform,
      rawDelta,
    );
    managed.data.rect = rect;
    managed.data.rotation = current.rotation;
    managed.data.pageTransform = pageMatrix;
    managed.record
      .get("Stream")
      .writeStream(
        contentCommand(
          managed.data.contentTransform,
          managed.record.get("Name").asName(),
        ),
      );
    store(managed.data, managed.record, doc);
    return;
  }
  const index = Number(id.replace("annotation:", "")),
    annot = page.getAnnotations()[index];
  if (!id.startsWith("annotation:") || !annot)
    throw new Error("Select the object again.");
  const delta = rectTransform(annot.getBounds(), rect),
    type = annot.getType();
  if (
    ["Highlight", "Underline", "StrikeOut", "Squiggly", "Redact"].includes(type)
  )
    annot.setQuadPoints(
      annot.getQuadPoints().map((q) => {
        const points = [0, 2, 4, 6].flatMap((i) =>
          transformPoint([q[i], q[i + 1]], delta),
        );
        return points as m.Quad;
      }),
    );
  else if (type === "Ink")
    annot.setInkList(
      annot
        .getInkList()
        .map((stroke) => stroke.map((p) => transformPoint(p, delta))),
    );
  else if (type === "Line") {
    const line = annot.getLine();
    annot.setLine(
      transformPoint(line[0], delta),
      transformPoint(line[1], delta),
    );
  } else if (["Polygon", "PolyLine"].includes(type))
    annot.setVertices(annot.getVertices().map((p) => transformPoint(p, delta)));
  else if (annot.hasRect()) annot.setRect(rect);
  else throw new Error("This annotation type cannot be moved.");
  annot.update();
}
// Apply a display-space matrix to the actual Form stream and its metadata.
export function transformManaged(
  doc: m.PDFDocument,
  page: m.PDFPage,
  id: string,
  delta: m.Matrix,
  rotation: number,
) {
  const found = entries(page).find((e) => e.data.id === id);
  if (!found) throw new Error("Select a Folio text box or image first.");
  const current = displayed(page, found.data),
    matrix = page.getTransform();
  const rect = m.Rect.transform(current.rect, delta);
  validateRect(rect, page.getBounds());
  found.data.contentTransform = m.Matrix.concat(
    found.data.contentTransform,
    m.Matrix.concat(m.Matrix.concat(matrix, delta), m.Matrix.invert(matrix)),
  );
  found.data.rect = rect;
  found.data.rotation = ((rotation % 360) + 360) % 360;
  found.data.pageTransform = matrix;
  if (current.baseline)
    found.data.baseline = transformPoint(current.baseline, delta);
  found.record
    .get("Stream")
    .writeStream(
      contentCommand(
        found.data.contentTransform,
        found.record.get("Name").asName(),
      ),
    );
  store(found.data, found.record, doc);
}
export function rotateObject(
  doc: m.PDFDocument,
  page: m.PDFPage,
  id: string,
  degrees: number,
) {
  if (![90, -90, 180].includes(degrees))
    throw new Error("Rotate by 90 or 180 degrees.");
  const found = entries(page).find((e) => e.data.id === id);
  if (!found) throw new Error("Select a Folio text box or image first.");
  const current = displayed(page, found.data),
    r = current.rect;
  const cx = (r[0] + r[2]) / 2,
    cy = (r[1] + r[3]) / 2;
  const rotation = m.Matrix.rotate(degrees);
  const delta = m.Matrix.concat(
    m.Matrix.concat(m.Matrix.translate(-cx, -cy), rotation),
    m.Matrix.translate(cx, cy),
  );
  // Keep the rotated object inside the page when close to an edge.
  const next = m.Rect.transform(r, delta),
    b = page.getBounds();
  if (
    next[2] - next[0] > b[2] - b[0] + 0.01 ||
    next[3] - next[1] > b[3] - b[1] + 0.01
  )
    throw new Error("Resize this object before rotating it to fit the page.");
  delta[4] += Math.max(b[0] - next[0], Math.min(0, b[2] - next[2]));
  delta[5] += Math.max(b[1] - next[1], Math.min(0, b[3] - next[3]));
  transformManaged(doc, page, id, delta, (current.rotation || 0) + degrees);
}
export function deleteObject(doc: m.PDFDocument, page: m.PDFPage, id: string) {
  const list = entries(page),
    found = list.find((e) => e.data.id === id);
  if (found) {
    found.record.get("Stream").writeStream("");
    const next = doc.newArray();
    page
      .getObject()
      .get("FolioObjects")
      .forEach((value, index) => {
        if (Number(index) !== found.index) next.push(value);
      });
    page.getObject().put("FolioObjects", next);
    page
      .getObject()
      .getInheritable("Resources")
      .get("XObject")
      .delete(found.record.get("Name"));
    return;
  }
  const index = Number(id.replace("annotation:", "")),
    a = page.getAnnotations()[index];
  if (!id.startsWith("annotation:") || !a)
    throw new Error("Select an object first.");
  page.deleteAnnotation(a);
}

// Recover the isolated Form XObjects produced by Folio 0.1.0. This deliberately
// excludes arbitrary imported content streams and never changes their pixels.
export function migrateLegacyObjects(doc: m.PDFDocument) {
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    try {
      const po = page.getObject(),
        old = po.get("Contents"),
        streams: m.PDFObject[] = [];
      if (old.isArray()) old.forEach((v) => streams.push(v));
      else if (old.isStream()) streams.push(old);
      const known = new Set(
        entries(page).map((e) => e.record.get("Stream").asIndirect()),
      );
      for (const stream of streams) {
        if (!stream.isStream() || known.has(stream.asIndirect())) continue;
        const buffer = stream.readStream();
        let code: string;
        try {
          code = buffer.asString();
        } finally {
          buffer.destroy();
        }
        const match = code.match(
          /^\s*q\s+([-+\d.eE\s]+)\s+cm\s+\/(Folio\d+)\s+Do\s+Q\s*$/,
        );
        if (!match) continue;
        const matrix = match[1].trim().split(/\s+/).map(Number) as m.Matrix;
        if (matrix.length !== 6 || !matrix.every(Number.isFinite)) continue;
        const form = po.getInheritable("Resources").get("XObject", match[2]);
        if (!form.isStream()) continue;
        const temp = new m.PDFDocument(),
          bounds = page.getBounds();
        let tp: m.PDFPage | null = null;
        try {
          temp.insertPage(
            -1,
            temp.addPage(
              [0, 0, bounds[2] - bounds[0], bounds[3] - bounds[1]],
              0,
              {},
              "",
            ),
          );
          tp = temp.loadPage(0);
          const tm = m.Matrix.concat(
            m.Matrix.concat(matrix, page.getTransform()),
            m.Matrix.invert(tp.getTransform()),
          );
          tp.getObject().put("Resources", {
            XObject: { Object: temp.graftObject(form) },
          });
          tp.getObject().put(
            "Contents",
            temp.addStream(contentCommand(tm, "Object"), {}),
          );
          const st = tp.toStructuredText("preserve-images");
          let rect: Rect | null = null,
            size = 12,
            color: [number, number, number] = [0, 0, 0],
            text = "",
            lines: string[] = [],
            row = "";
          const include = (r: Rect) => {
            rect = rect
              ? [
                  Math.min(rect[0], r[0]),
                  Math.min(rect[1], r[1]),
                  Math.max(rect[2], r[2]),
                  Math.max(rect[3], r[3]),
                ]
              : r;
          };
          let images = 0;
          try {
            st.walk({
              beginLine: (r) => {
                include(r);
                row = "";
              },
              onChar: (c, _o, _f, s, _q, col) => {
                if (!text && !row) {
                  size = s;
                  if (col.length === 3) color = col as [number, number, number];
                }
                row += c;
              },
              endLine: () => {
                lines.push(row);
                text += row + "\n";
              },
              onImageBlock: (r) => {
                include(r);
                images++;
              },
            });
          } finally {
            st.destroy();
          }
          if (!rect || (!text.trim() && !images)) continue;
          const data: ManagedData = {
            id: `legacy-${match[2]}-${stream.asIndirect()}`,
            kind: text.trim() ? "text" : "image",
            rect,
            pageTransform: page.getTransform(),
            contentTransform: matrix,
            ...(text.trim()
              ? {
                  text: text.trimEnd(),
                  lines,
                  size,
                  color,
                  font: "auto",
                  wrapWidth: Math.max(
                    (rect as Rect)[2] - (rect as Rect)[0],
                    size * 3,
                  ),
                }
              : {}),
          };
          const record = doc.newDictionary();
          record.put("Stream", stream);
          record.put("Name", doc.newName(match[2]));
          store(data, record, doc);
          let list = po.get("FolioObjects");
          if (!list.isArray()) {
            list = doc.newArray();
            po.put("FolioObjects", list);
          }
          list.push(record);
        } finally {
          tp?.destroy();
          temp.destroy();
        }
      }
    } finally {
      page.destroy();
    }
  }
}
