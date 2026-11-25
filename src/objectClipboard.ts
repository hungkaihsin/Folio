import * as m from "mupdf";
import {
  entries,
  displayed,
  contentCommand,
  moveObject,
  store,
} from "./objects";
import type { ClipboardContent, Point, Rect } from "./types";

// Export only the chosen Form and its fonts, never the rest of the source page.
export function copyManaged(
  source: m.PDFDocument,
  page: m.PDFPage,
  id: string,
): ClipboardContent {
  const found = entries(page).find((e) => e.data.id === id);
  if (!found) throw new Error("Select an added text box or image to copy.");
  const fragment = new m.PDFDocument(),
    graft = fragment.newGraftMap();
  let p: m.PDFPage | undefined;
  try {
    const name = found.record.get("Name").asName();
    const form = page
      .getObject()
      .getInheritable("Resources")
      .get("XObject")
      .get(name);
    fragment.insertPage(
      -1,
      fragment.addPage(
        page.getObject().getInheritable("MediaBox").asJS() as Rect,
        page.getObject().getInheritable("Rotate").asNumber() as
          0 | 90 | 180 | 270,
        { XObject: { [name]: graft.graftObject(form) } },
        contentCommand(found.data.contentTransform, name),
      ),
    );
    p = fragment.loadPage(0);
    const crop = page.getObject().getInheritable("CropBox");
    if (!crop.isNull()) p.getObject().put("CropBox", crop.asJS());
    const record = fragment.newDictionary();
    record.put("Name", fragment.newName(name));
    record.put("Stream", p.getObject().get("Contents"));
    store(found.data, record, fragment);
    const fonts = found.record.get("FontSources");
    if (!fonts.isNull()) record.put("FontSources", graft.graftObject(fonts));
    p.getObject().put("FolioObjects", [record]);
    const buffer = fragment.saveToBuffer("garbage=4,compress");
    let bytes: Uint8Array;
    try {
      bytes = buffer.asUint8Array().slice();
    } finally {
      buffer.destroy();
    }
    let png: Uint8Array | undefined;
    if (found.data.kind === "image") {
      const rect = displayed(p, found.data).rect;
      p.getObject().put(
        "CropBox",
        m.Rect.transform(rect, m.Matrix.invert(p.getTransform())),
      );
      const b = p.getBounds(),
        scale = Math.min(
          2,
          Math.sqrt(18000000 / ((b[2] - b[0]) * (b[3] - b[1]))),
        );
      const pix = p.toPixmap(
        m.Matrix.scale(scale, scale),
        m.ColorSpace.DeviceRGB,
        true,
        false,
      );
      try {
        png = pix.asPNG().slice();
      } finally {
        pix.destroy();
      }
    }
    return {
      kind: "object",
      bytes,
      ...(found.data.kind === "text"
        ? { text: found.data.text || "" }
        : { png }),
    };
  } finally {
    p?.destroy();
    graft.destroy();
    fragment.destroy();
  }
}

export function pasteManaged(
  doc: m.PDFDocument,
  page: m.PDFPage,
  bytes: Uint8Array,
  point: Point,
) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 40 * 1024 * 1024 ||
    !new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-") ||
    !point.every(Number.isFinite)
  )
    throw new Error("Invalid copied object.");
  const source = m.Document.openDocument(bytes, "application/pdf").asPDF();
  if (!source) throw new Error("Invalid copied object.");
  source.disableJS();
  let p: m.PDFPage | undefined;
  const graft = doc.newGraftMap();
  try {
    if (source.needsPassword() || source.countPages() !== 1)
      throw new Error("Invalid copied object.");
    p = source.loadPage(0) as m.PDFPage;
    const list = entries(p);
    if (list.length !== 1) throw new Error("Invalid copied object.");
    const original = list[0],
      current = displayed(p, original.data);
    const resources = page.getObject().getInheritable("Resources"),
      own = doc.newDictionary(),
      xobjects = doc.newDictionary();
    resources.forEach((v, k) => own.put(k, v));
    resources.get("XObject").forEach((v, k) => xobjects.put(k, v));
    const name = `Folio${doc.countObjects()}Paste`;
    const oldName = original.record.get("Name").asName();
    xobjects.put(
      name,
      graft.graftObject(
        p.getObject().getInheritable("Resources").get("XObject").get(oldName),
      ),
    );
    own.put("XObject", xobjects);
    page.getObject().put("Resources", own);
    const matrix = m.Matrix.concat(
      original.data.contentTransform,
      m.Matrix.concat(p.getTransform(), m.Matrix.invert(page.getTransform())),
    );
    const stream = doc.addStream(contentCommand(matrix, name), {}),
      record = doc.newDictionary();
    record.put("Name", doc.newName(name));
    record.put("Stream", stream);
    const id = `folio-${crypto.randomUUID()}`;
    store(
      {
        ...original.data,
        ...current,
        id,
        pageTransform: page.getTransform(),
        contentTransform: matrix,
      },
      record,
      doc,
    );
    const fonts = original.record.get("FontSources");
    if (!fonts.isNull()) record.put("FontSources", graft.graftObject(fonts));
    let managed = page.getObject().get("FolioObjects");
    if (!managed.isArray()) {
      managed = doc.newArray();
      page.getObject().put("FolioObjects", managed);
    }
    managed.push(record);
    const old = page.getObject().get("Contents"),
      contents = doc.newArray();
    contents.push(doc.addStream("q", {}));
    if (old.isArray()) old.forEach((v) => contents.push(v));
    else if (!old.isNull()) contents.push(old);
    contents.push(doc.addStream("Q", {}));
    contents.push(stream);
    page.getObject().put("Contents", contents);
    const b = page.getBounds(),
      w = current.rect[2] - current.rect[0],
      h = current.rect[3] - current.rect[1];
    const factor = Math.min(1, (b[2] - point[0]) / w, (b[3] - point[1]) / h);
    if (!Number.isFinite(factor) || factor <= 0)
      throw new Error("Paste farther from the page edge.");
    moveObject(doc, page, id, [
      point[0],
      point[1],
      point[0] + w * factor,
      point[1] + h * factor,
    ]);
    return id;
  } finally {
    p?.destroy();
    graft.destroy();
    source.destroy();
  }
}
