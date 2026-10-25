import * as m from "mupdf";
import type {
  DocumentInfo,
  Edit,
  RenderedPage,
  TextLine,
  RGB,
  Rect,
} from "./types";

export class PDFEngine {
  private doc: m.PDFDocument | null = null;
  private stateIds = [0];
  private nextStateId = 1;
  private font: m.Font;
  private latin = new m.Font("Helvetica");
  constructor(fontBytes?: Uint8Array) {
    this.font = fontBytes
      ? new m.Font("Noto Sans CJK TC", fontBytes)
      : this.latin;
  }
  private current() {
    if (!this.doc) throw new Error("Open a PDF first.");
    return this.doc;
  }
  open(bytes: Uint8Array, password = "") {
    const next = m.Document.openDocument(bytes, "application/pdf").asPDF();
    if (!next) throw new Error("This file is not a PDF.");
    try {
      if (next.needsPassword() && !next.authenticatePassword(password))
        throw new Error("PASSWORD_REQUIRED");
      if (!next.countPages()) throw new Error("This PDF has no pages.");
      next.disableJS();
      next.enableJournal();
    } catch (e) {
      next.destroy();
      throw e;
    }
    this.doc?.destroy();
    this.doc = next;
    this.stateIds = [0];
    this.nextStateId = 1;
    return this.info();
  }
  create() {
    const d = new m.PDFDocument();
    d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, {}, ""));
    const b = d.saveToBuffer("");
    try {
      return this.open(b.asUint8Array().slice());
    } finally {
      b.destroy();
      d.destroy();
    }
  }
  info(): DocumentInfo {
    const d = this.current();
    const pages = [];
    for (let i = 0; i < d.countPages(); i++) {
      const p = d.loadPage(i);
      try {
        const b = p.getBounds();
        pages.push({ width: b[2] - b[0], height: b[3] - b[1] });
      } finally {
        p.destroy();
      }
    }
    return {
      pages,
      canUndo: d.canUndo(),
      canRedo: d.canRedo(),
      position: this.stateIds[d.getJournal().position] ?? 0,
      title: d.getMetaData("info:Title") || "",
      editable: d.hasPermission("edit"),
    };
  }
  private page(index: number) {
    const d = this.current();
    if (!Number.isInteger(index) || index < 0 || index >= d.countPages())
      throw new Error("Invalid page.");
    return d.loadPage(index);
  }
  private lines(page: m.PDFPage) {
    const s = page.toStructuredText("");
    const lines: TextLine[] = [];
    const fonts: m.Font[] = [];
    let line: TextLine;
    s.walk({
      beginLine: (rect, _mode, dir) => {
        line = {
          id: lines.length,
          text: "",
          rect,
          origin: [rect[0], rect[3]],
          size: 12,
          font: "Helvetica",
          color: [0, 0, 0],
          horizontal: Math.abs(dir[0] - 1) < 0.01 && Math.abs(dir[1]) < 0.01,
        };
        lines.push(line);
      },
      onChar: (c, origin, font, size, _quad, color) => {
        if (!line.text) {
          line.origin = origin;
          line.font = font.getName();
          line.size = size;
          line.color = color.length === 3 ? (color as RGB) : [0, 0, 0];
          fonts[line.id] = font;
        }
        line.text += c;
      },
    });
    s.destroy();
    return { lines, fonts };
  }
  render(index: number, scale: number, extras = true): RenderedPage {
    const page = this.page(index);
    try {
      const bounds = page.getBounds();
      const maxScale = Math.min(
        3,
        Math.sqrt(
          18000000 / ((bounds[2] - bounds[0]) * (bounds[3] - bounds[1])),
        ),
      );
      const pix = page.toPixmap(
        m.Matrix.scale(
          Math.max(0.1, Math.min(scale, maxScale)),
          Math.max(0.1, Math.min(scale, maxScale)),
        ),
        m.ColorSpace.DeviceRGB,
        false,
        true,
      );
      let png: Uint8Array;
      try {
        png = pix.asPNG().slice();
      } finally {
        pix.destroy();
      }
      const lines = extras ? this.lines(page).lines : [];
      const annotations = extras
        ? page.getAnnotations().map((a, index) => ({
            index,
            type: a.getType(),
            contents: a.getContents(),
          }))
        : [];
      const widgets = extras
        ? page.getWidgets().map((w, index) => ({
            index,
            name: w.getLabel() || w.getName(),
            value: w.getValue(),
            type: w.getFieldType(),
            readonly: w.isReadOnly(),
            options: w.isChoice() ? w.getOptions() : [],
          }))
        : [];
      return {
        png,
        width: bounds[2] - bounds[0],
        height: bounds[3] - bounds[1],
        lines,
        annotations,
        widgets,
      };
    } finally {
      page.destroy();
    }
  }
  export() {
    // Garbage collection renumbers objects: run it on a clone to preserve the live undo journal.
    const snapshot = this.current().saveToBuffer("");
    let clone: m.PDFDocument | null = null;
    try {
      clone = m.Document.openDocument(snapshot, "application/pdf").asPDF()!;
      const out = clone.saveToBuffer("garbage=4,compress");
      try {
        return out.asUint8Array().slice();
      } finally {
        out.destroy();
      }
    } finally {
      clone?.destroy();
      snapshot.destroy();
    }
  }
  extract(index: number) {
    const p = this.page(index);
    const s = p.toStructuredText("");
    try {
      return s.asText();
    } finally {
      s.destroy();
      p.destroy();
    }
  }
  search(query: string) {
    if (!query.trim()) return [];
    const d = this.current();
    const hits = [];
    for (let i = 0; i < d.countPages(); i++) {
      const p = this.page(i);
      try {
        const quads = p.search(query, "");
        for (const group of quads)
          for (const q of group)
            hits.push({
              page: i,
              rect: [
                Math.min(q[0], q[2], q[4], q[6]),
                Math.min(q[1], q[3], q[5], q[7]),
                Math.max(q[0], q[2], q[4], q[6]),
                Math.max(q[1], q[3], q[5], q[7]),
              ] as Rect,
            });
      } finally {
        p.destroy();
      }
    }
    return hits;
  }
  undo() {
    this.current().undo();
    return this.info();
  }
  redo() {
    this.current().redo();
    return this.info();
  }
  private chooseFont(text: string, original?: m.Font) {
    const supports = (f: m.Font) =>
      [...text.replace(/\n/g, "")].every(
        (c) => f.encodeCharacter(c) !== 0 || c === "\t",
      );
    const f =
      original && supports(original)
        ? original
        : supports(this.latin)
          ? this.latin
          : this.font;
    if (!supports(f))
      throw new Error(
        "This text contains characters that the available fonts cannot draw.",
      );
    return f;
  }
  private overlay(page: m.PDFPage, draw: (dev: m.Device) => void) {
    const d = this.current(),
      bounds = page.getBounds(),
      buffer = new m.Buffer();
    const writer = new m.DocumentWriter(buffer, "pdf", "");
    let overlay: m.PDFDocument | null = null;
    try {
      const dev = writer.beginPage(bounds);
      try {
        draw(dev);
      } finally {
        writer.endPage();
      }
      writer.close();
      overlay = m.Document.openDocument(buffer, "application/pdf").asPDF()!;
      const op = overlay.loadPage(0);
      try {
        const graft = d.newGraftMap();
        try {
          const resources = graft.graftObject(
            op.getObject().getInheritable("Resources"),
          );
          const form = d.addStream(
            op.getObject().get("Contents").readStream(),
            {
              Type: "XObject",
              Subtype: "Form",
              BBox: op.getObject().get("MediaBox").asJS(),
              Resources: resources,
            },
          );
          const po = page.getObject(),
            oldResources = po.getInheritable("Resources");
          const own = d.newDictionary();
          oldResources.forEach((v, k) => own.put(k, v));
          const oldX = own.get("XObject"),
            x = d.newDictionary();
          if (!oldX.isNull()) oldX.forEach((v, k) => x.put(k, v));
          const name = `Folio${d.countObjects()}`;
          x.put(name, form);
          own.put("XObject", x);
          po.put("Resources", own);
          const matrix = m.Matrix.concat(
            op.getTransform(),
            m.Matrix.invert(page.getTransform()),
          );
          const stream = d.addStream(
            `q ${matrix.join(" ")} cm /${name} Do Q`,
            {},
          );
          // Isolate inherited graphics state before appending new content.
          const contents = po.get("Contents"),
            arr = d.newArray();
          arr.push(d.addStream("q", {}));
          if (contents.isArray()) contents.forEach((v) => arr.push(v));
          else if (!contents.isNull()) arr.push(contents);
          arr.push(d.addStream("Q", {}));
          arr.push(stream);
          po.put("Contents", arr);
        } finally {
          graft.destroy();
        }
      } finally {
        op.destroy();
      }
    } finally {
      overlay?.destroy();
      writer.destroy();
      buffer.destroy();
    }
  }
  private drawText(
    page: m.PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
    color: RGB,
    font: m.Font,
  ) {
    this.overlay(page, (dev) => {
      const t = new m.Text();
      try {
        for (const [i, line] of text.split("\n").entries())
          t.showString(font, [size, 0, 0, -size, x, y + i * size * 1.35], line);
        dev.fillText(t, m.Matrix.identity, m.ColorSpace.DeviceRGB, color, 1);
      } finally {
        t.destroy();
      }
    });
  }
  private copyPage(at: number, source: m.PDFDocument, index: number) {
    const d = this.current(),
      original = source.loadPage(index);
    try {
      if (original.getWidgets().length)
        throw new Error(
          "Pages with interactive forms cannot be duplicated or merged yet. Save a static copy in another PDF tool first.",
        );
      const targetIndex = at < 0 ? d.countPages() : at;
      d.graftPage(at, source, index);
      const annots = d.newArray();
      original
        .getObject()
        .get("Annots")
        .forEach((ref) => {
          if (ref.get("Subtype").asName() === "Popup") return;
          const clean = source.newDictionary();
          // Avoid copying the source page tree and cross-page reply relationships.
          ref.forEach((value, key) => {
            if (!["P", "Parent", "Popup", "IRT"].includes(String(key)))
              clean.put(key, value);
          });
          const copied = d.graftObject(clean);
          copied.put("P", d.findPage(targetIndex));
          annots.push(d.addObject(copied));
        });
      if (annots.length) d.findPage(targetIndex).put("Annots", annots);
    } finally {
      original.destroy();
    }
  }
  edit(e: Edit) {
    const d = this.current();
    if (!d.hasPermission("edit"))
      throw new Error("This PDF does not permit editing.");
    let duplicateSource: m.PDFDocument | null = null;
    if (e.kind === "duplicate") {
      const snapshot = d.saveToBuffer("");
      try {
        duplicateSource = m.Document.openDocument(
          snapshot,
          "application/pdf",
        ).asPDF();
      } finally {
        snapshot.destroy();
      }
    }
    d.beginOperation(e.kind);
    let p: m.PDFPage | null = null;
    try {
      if (e.kind === "merge") {
        const src = m.Document.openDocument(e.bytes, "application/pdf").asPDF();
        if (!src) throw new Error("Select a PDF.");
        try {
          if (src.needsPassword())
            throw new Error("Unlock this PDF before merging.");
          for (let i = 0; i < src.countPages(); i++) this.copyPage(-1, src, i);
        } finally {
          src.destroy();
        }
      } else {
        p = this.page(e.page);
        if (e.kind === "replace") {
          const { lines, fonts } = this.lines(p),
            line = lines[e.line];
          if (!line) throw new Error("Select the line again.");
          if (!line.horizontal)
            throw new Error(
              "Rotate the page until this text is horizontal before editing.",
            );
          if (e.text.includes("\n"))
            throw new Error(
              "Replace one line at a time. Use Add text for multiline text.",
            );
          const font = this.chooseFont(e.text, fonts[e.line]);
          let size = e.size || line.size;
          const width = [...e.text].reduce(
              (w, c) => w + font.advanceGlyph(font.encodeCharacter(c)) * size,
              0,
            ),
            available = line.rect[2] - line.rect[0];
          if (width > available && width > 0) size *= available / width;
          if (size < 5)
            throw new Error(
              "The replacement is too long for this line. Shorten it or use a smaller edit.",
            );
          const a = p.createAnnotation("Redact");
          a.setRect([
            line.rect[0],
            line.origin[1] - line.size * 0.55,
            line.rect[2],
            line.origin[1] - line.size * 0.15,
          ]);
          a.update();
          a.applyRedaction(0, 0, 0, 0);
          if (e.text)
            this.drawText(
              p,
              e.text,
              line.origin[0],
              line.origin[1],
              size,
              line.color,
              font,
            );
        } else if (e.kind === "text") {
          const font = this.chooseFont(e.text),
            bounds = p.getBounds(),
            available = bounds[2] - e.point[0] - 8;
          if (
            !Number.isFinite(e.size) ||
            e.size < 6 ||
            e.size > 120 ||
            available < e.size
          )
            throw new Error("Place the text farther from the page edge.");
          const measure = (str: string) =>
            [...str].reduce(
              (w, c) => w + font.advanceGlyph(font.encodeCharacter(c)) * e.size,
              0,
            );
          const wrapped: string[] = [];
          for (const paragraph of e.text.split("\n")) {
            let line = "";
            for (const token of paragraph.match(/\s+|[^\s]+/g) || [""]) {
              if (line && measure(line + token) > available) {
                wrapped.push(line.trimEnd());
                line = "";
              }
              for (const char of token) {
                if (measure(line + char) > available && line) {
                  wrapped.push(line.trimEnd());
                  line = "";
                }
                line += char;
              }
            }
            wrapped.push(line.trimEnd());
          }
          if (
            e.point[1] + e.size + (wrapped.length - 1) * e.size * 1.35 >
            bounds[3] - 8
          )
            throw new Error(
              "This text does not fit above the bottom of the page. Use fewer lines or a smaller size.",
            );
          this.drawText(
            p,
            wrapped.join("\n"),
            e.point[0],
            e.point[1] + e.size,
            e.size,
            e.color,
            font,
          );
        } else if (e.kind === "image") {
          const image = new m.Image(e.bytes);
          try {
            const h = (e.width * image.getHeight()) / image.getWidth();
            this.overlay(p, (dev) =>
              dev.fillImage(
                image,
                [e.width, 0, 0, h, e.point[0], e.point[1]],
                1,
              ),
            );
          } finally {
            image.destroy();
          }
        } else if (e.kind === "highlight") {
          const [x0, y0, x1, y1] = e.rect,
            a = p.createAnnotation("Highlight");
          a.setQuadPoints([[x0, y0, x1, y0, x0, y1, x1, y1]]);
          a.setColor(e.color);
          a.setOpacity(0.4);
          a.update();
        } else if (e.kind === "rectangle") {
          const a = p.createAnnotation("Square");
          a.setRect(e.rect);
          a.setColor(e.color);
          a.setBorderWidth(1.5);
          a.update();
        } else if (e.kind === "ink") {
          if (e.points.length < 2) throw new Error("Draw a longer stroke.");
          const a = p.createAnnotation("Ink");
          a.setInkList([e.points]);
          a.setColor(e.color);
          a.setBorderWidth(e.width);
          a.update();
        } else if (e.kind === "note") {
          const a = p.createAnnotation("Text");
          a.setRect([e.point[0], e.point[1], e.point[0] + 24, e.point[1] + 24]);
          a.setContents(e.text);
          a.setColor([0.95, 0.67, 0.15]);
          a.update();
        } else if (e.kind === "removeAnnotation") {
          const a = p.getAnnotations()[e.index];
          if (!a) throw new Error("Annotation no longer exists.");
          p.deleteAnnotation(a);
        } else if (e.kind === "rotate") {
          const obj = p.getObject();
          obj.put(
            "Rotate",
            (obj.getInheritable("Rotate").asNumber() + 90) % 360,
          );
        } else if (e.kind === "delete") {
          if (d.countPages() === 1) throw new Error("Keep at least one page.");
          d.deletePage(e.page);
        } else if (e.kind === "blank") {
          const b = p.getBounds();
          d.insertPage(
            e.page + 1,
            d.addPage([0, 0, b[2] - b[0], b[3] - b[1]], 0, {}, ""),
          );
        } else if (e.kind === "duplicate") {
          this.copyPage(e.page + 1, duplicateSource!, e.page);
        } else if (e.kind === "move") {
          if (!Number.isInteger(e.to) || e.to < 0 || e.to >= d.countPages())
            throw new Error("Invalid destination.");
          const order = Array.from({ length: d.countPages() }, (_, i) => i);
          order.splice(e.to, 0, order.splice(e.page, 1)[0]);
          d.rearrangePages(order);
        } else if (e.kind === "form") {
          const w = p.getWidgets()[e.index];
          if (!w || w.isReadOnly())
            throw new Error("This field cannot be edited.");
          if (w.isCheckbox() || w.isRadioButton()) w.toggle();
          else if (w.isText()) {
            if (!w.setTextValue(e.value))
              throw new Error("The field rejected this value.");
          } else if (w.isChoice()) {
            if (!w.setChoiceValue(e.value))
              throw new Error("The field rejected this value.");
          } else throw new Error("This field type is not supported.");
          p.update();
        }
      }
      d.endOperation();
      const position = d.getJournal().position;
      this.stateIds.splice(position);
      this.stateIds[position] = this.nextStateId++;
      return this.info();
    } catch (error) {
      d.abandonOperation();
      throw error;
    } finally {
      p?.destroy();
      duplicateSource?.destroy();
    }
  }
}
