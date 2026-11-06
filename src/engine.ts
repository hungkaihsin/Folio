import * as m from "mupdf";
import { zip } from "./zip";
import { FontLibrary, type TextPlan } from "./fonts";
import type {
  DocumentInfo,
  Edit,
  RenderedPage,
  TextLine,
  RGB,
  Rect,
  PageObject,
  ExportOptions,
  ExportedFile,
  FontQuery,
  FontReport,
  TextSelection,
  Point,
} from "./types";

import {
  entries,
  migrateLegacyObjects,
  objects,
  displayed,
  store,
  contentCommand,
  moveObject,
  rotateObject,
  transformManaged,
  deleteObject,
  type ManagedData,
} from "./objects";
import { copyManaged, pasteManaged } from "./objectClipboard";

export class PDFEngine {
  private doc: m.PDFDocument | null = null;
  private focusObjectId: string | undefined;
  private serif = new m.Font("Times-Roman");
  private mono = new m.Font("Courier");
  private stateIds = [0];
  private nextStateId = 1;
  private font: m.Font;
  private fontLibrary: FontLibrary;
  private latin = new m.Font("Helvetica");
  constructor(fontBytes?: Uint8Array, serifBytes?: Uint8Array) {
    this.font = fontBytes
      ? new m.Font("Noto Sans CJK TC", fontBytes)
      : this.latin;
    const cjkSerif = serifBytes
      ? new m.Font("Noto Serif CJK TC", serifBytes)
      : this.font;
    this.fontLibrary = new FontLibrary(
      this.latin,
      this.serif,
      this.mono,
      this.font,
      cjkSerif,
      [
        ...(fontBytes ? [{ font: this.font, bytes: fontBytes }] : []),
        ...(serifBytes ? [{ font: cjkSerif, bytes: serifBytes }] : []),
      ],
    );
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
      migrateLegacyObjects(next);
      next.enableJournal();
    } catch (e) {
      next.destroy();
      throw e;
    }
    this.doc?.destroy();
    this.doc = next;
    this.fontLibrary.reset(next);
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
      const pageObjects = extras ? objects(page) : [];
      const lines = extras ? this.lines(page).lines : [];
      for (const line of lines) {
        const object = pageObjects.find(
          (o) =>
            o.kind === "text" &&
            !o.id.startsWith("annotation:") &&
            line.origin[0] >= o.rect[0] - 1 &&
            line.origin[0] <= o.rect[2] + 1 &&
            line.origin[1] >= o.rect[1] - 1 &&
            line.origin[1] <= o.rect[3] + 1,
        );
        if (object) line.objectId = object.id;
      }

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
        objects: pageObjects,
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
  exportFile(options: ExportOptions, name = "document.pdf"): ExportedFile {
    const d = this.current(),
      pages = options.pages;
    if (
      !pages.length ||
      pages.length > 65535 ||
      new Set(pages).size !== pages.length ||
      pages.some((i) => !Number.isInteger(i) || i < 0 || i >= d.countPages())
    )
      throw new Error("Choose valid pages to export.");
    const base =
      name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_") || "document";
    if (options.format === "pdf") {
      const snapshot = d.saveToBuffer("");
      let copy: m.PDFDocument | null = null;
      try {
        copy = m.Document.openDocument(snapshot, "application/pdf").asPDF()!;
        let subset: m.PDFDocument | null = null;
        const partial =
          pages.length !== copy.countPages() || pages.some((p, i) => p !== i);
        if (partial) {
          subset = new m.PDFDocument();
          try {
            for (const page of pages) this.copyPage(-1, copy, page, subset);
          } catch (e) {
            subset.destroy();
            throw new Error(
              "Selected-page PDF export does not support interactive form pages. Export all pages as PDF or use an image format.",
            );
          }
        }
        let bytes: m.Buffer;
        try {
          bytes = (subset || copy).saveToBuffer("garbage=4,compress");
        } finally {
          subset?.destroy();
        }
        try {
          return {
            name: base + "-export.pdf",
            extension: "pdf",
            mime: "application/pdf",
            bytes: bytes.asUint8Array().slice(),
          };
        } finally {
          bytes.destroy();
        }
      } finally {
        copy?.destroy();
        snapshot.destroy();
      }
    }
    if (options.format === "txt") {
      const text = pages.map((i) => this.extract(i)).join("\n\f\n");
      return {
        name: base + ".txt",
        extension: "txt",
        mime: "text/plain",
        bytes: new TextEncoder().encode(text),
      };
    }
    if (!["png", "jpeg"].includes(options.format))
      throw new Error("Unsupported export format.");
    const scale = options.scale || 2;
    if (!Number.isFinite(scale) || scale < 0.5 || scale > 3)
      throw new Error("Choose a resolution between 36 and 216 DPI.");
    const extension = options.format === "jpeg" ? "jpg" : "png",
      mime = options.format === "jpeg" ? "image/jpeg" : "image/png";
    let total = 0;
    const files = [];
    for (const index of pages) {
      const p = this.page(index);
      try {
        const b = p.getBounds(),
          s = Math.min(
            scale,
            Math.sqrt(18000000 / ((b[2] - b[0]) * (b[3] - b[1]))),
          ),
          pix = p.toPixmap(
            m.Matrix.scale(s, s),
            m.ColorSpace.DeviceRGB,
            false,
            true,
          );
        let bytes: Uint8Array;
        try {
          bytes = (
            extension === "png"
              ? pix.asPNG()
              : pix.asJPEG(Math.min(100, Math.max(10, options.quality || 90)))
          ).slice();
        } finally {
          pix.destroy();
        }
        total += bytes.length;
        if (total > 240 * 1024 * 1024)
          throw new Error(
            "This export is too large. Export fewer pages or reduce the resolution.",
          );
        files.push({ name: `${base}-page-${index + 1}.${extension}`, bytes });
      } finally {
        p.destroy();
      }
    }
    if (files.length === 1) return { ...files[0], extension, mime };
    return {
      name: base + "-pages.zip",
      extension: "zip",
      mime: "application/zip",
      bytes: zip(files),
    };
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
    this.fontLibrary.invalidate();
    return this.info();
  }
  redo() {
    this.current().redo();
    this.fontLibrary.invalidate();
    return this.info();
  }
  loadFont(bytes: Uint8Array, name: string) {
    return this.fontLibrary.register(bytes, name);
  }
  copyObject(page: number, id: string) {
    const p = this.page(page);
    try {
      return copyManaged(this.current(), p, id);
    } finally {
      p.destroy();
    }
  }
  inspectFont(query: FontQuery): FontReport {
    const p = this.page(query.page);
    try {
      const data = this.lines(p),
        line = query.line !== undefined ? data.lines[query.line] : undefined;
      const object = query.objectId
        ? entries(p).find((e) => e.data.id === query.objectId)
        : undefined;
      const matching = object
        ? data.lines.find((l) => {
            const r = displayed(p, object.data).rect;
            return (
              l.origin[0] >= r[0] - 1 &&
              l.origin[0] <= r[2] + 1 &&
              l.origin[1] >= r[1] - 1 &&
              l.origin[1] <= r[3] + 1
            );
          })
        : undefined;
      const original =
        object?.data.sourceFont ||
        (matching ? data.fonts[matching.id] : undefined) ||
        (line ? data.fonts[line.id] : undefined);
      const plan = this.fontLibrary.plan(
        query.text,
        original,
        query.font || "original",
        object?.data.actualFonts,
      );
      const size = query.size || line?.size || object?.data.size || 14;
      const available = line
        ? query.fitOriginal
          ? line.rect[2] - line.rect[0]
          : p.getBounds()[2] - line.origin[0] - 8
        : object?.data.wrapWidth || p.getBounds()[2] - 8;
      const rawWidth = plan.width(query.text.split("\n")[0], size),
        effective =
          line && query.fitOriginal && rawWidth > available
            ? (size * available) / rawWidth
            : size;
      const width = plan.width(query.text.split("\n")[0], effective);
      return {
        ...plan.report,
        ...(query.browserFonts
          ? {
              browserFonts: this.fontLibrary.browserFonts(
                plan,
                query.knownFonts,
              ),
            }
          : {}),
        size: effective,
        width,
        availableWidth: available,
        overflow: !!line && width > available + 0.1 && !query.fitOriginal,
      };
    } finally {
      p.destroy();
    }
  }
  selectText(page: number, start: Point, end: Point): TextSelection {
    if (![...start, ...end].every(Number.isFinite))
      throw new Error("Invalid text selection.");
    const p = this.page(page),
      text = p.toStructuredText("");
    try {
      return {
        text: text.copy(start, end),
        quads: text.highlight(start, end, 4096),
        start,
        end,
      };
    } finally {
      text.destroy();
      p.destroy();
    }
  }
  textBackdrop(query: FontQuery, scale: number): Uint8Array {
    const copy = m.Document.openDocument(
      this.export(),
      "application/pdf",
    ).asPDF()!;
    copy.disableJS();
    const p = copy.loadPage(query.page) as m.PDFPage;
    try {
      if (query.objectId) deleteObject(copy, p, query.objectId);
      else if (query.line !== undefined) {
        const line = this.lines(p).lines[query.line];
        if (!line) throw new Error("Select the line again.");
        const a = p.createAnnotation("Redact");
        a.setRect([
          line.rect[0],
          line.origin[1] - line.size * 0.55,
          line.rect[2],
          line.origin[1] - line.size * 0.15,
        ]);
        a.update();
        a.applyRedaction(0, 0, 0, 0);
      }
      const bounds = p.getBounds();
      const factor = Math.min(
        3,
        Math.max(0.1, scale),
        Math.sqrt(
          18000000 / ((bounds[2] - bounds[0]) * (bounds[3] - bounds[1])),
        ),
      );
      const pix = p.toPixmap(
        m.Matrix.scale(factor, factor),
        m.ColorSpace.DeviceRGB,
        false,
        true,
      );
      try {
        return pix.asPNG();
      } finally {
        pix.destroy();
      }
    } finally {
      p.destroy();
      copy.destroy();
    }
  }
  private overlay(
    page: m.PDFPage,
    draw: (dev: m.Device) => void,
    managed?: Partial<ManagedData> & { kind: "text" | "image" },
    fontPlan?: TextPlan,
    drawingBounds?: Rect,
  ) {
    const d = this.current(),
      bounds = page.getBounds(),
      buffer = new m.Buffer();
    const writer = new m.DocumentWriter(buffer, "pdf", "");
    let overlay: m.PDFDocument | null = null;
    try {
      const dev = writer.beginPage(drawingBounds || bounds);
      try {
        draw(dev);
      } finally {
        writer.endPage();
      }
      writer.close();
      overlay = m.Document.openDocument(buffer, "application/pdf").asPDF()!;
      const op = overlay.loadPage(0);
      if (fontPlan)
        this.fontLibrary.repairResources(
          overlay,
          op.getObject().getInheritable("Resources"),
          fontPlan,
        );
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
          const stream = d.addStream(contentCommand(matrix, name), {});
          if (managed) {
            let rect = managed.rect;
            if (!rect) {
              const lines = this.lines(op).lines;
              if (!lines.length) throw new Error("Enter some text first.");
              rect = [
                Math.min(...lines.map((l) => l.rect[0])),
                Math.min(...lines.map((l) => l.rect[1])),
                Math.max(...lines.map((l) => l.rect[2])),
                Math.max(...lines.map((l) => l.rect[3])),
              ];
            }
            const data = {
              ...managed,
              id: managed.id || `folio-${crypto.randomUUID()}`,
              rect,
              pageTransform: page.getTransform(),
              contentTransform: matrix,
            } as ManagedData;
            const record = d.newDictionary();
            record.put("Stream", stream);
            record.put("Name", d.newName(name));
            if (fontPlan)
              this.fontLibrary.persist(d, record, fontPlan, resources);
            store(data, record, d);
            let list = po.get("FolioObjects");
            if (!list.isArray()) {
              list = d.newArray();
              po.put("FolioObjects", list);
            }
            list.push(record);
            this.focusObjectId = data.id;
          }
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
    plan: TextPlan,
    managed?: Partial<ManagedData> & { kind: "text" },
    drawingBounds?: Rect,
  ) {
    this.overlay(
      page,
      (dev) => this.fontLibrary.draw(dev, plan, text, x, y, size, color),
      managed
        ? {
            ...managed,
            baseline: [x, y],
            sourceFont: plan.report.requestedFont,
            actualFonts: plan.report.usedFonts,
          }
        : undefined,
      plan,
      drawingBounds,
    );
  }
  private addText(
    page: m.PDFPage,
    values: {
      point: [number, number];
      text: string;
      size: number;
      color: RGB;
      font?: string;
      width?: number;
      id?: string;
      allowSubstitution?: boolean;
      drawingBounds?: Rect;
    },
    original?: m.Font | string,
    originalFamilies?: string[],
  ) {
    const plan = this.fontLibrary.plan(
        values.text,
        original,
        values.font,
        originalFamilies,
      ),
      bounds = values.drawingBounds || page.getBounds(),
      available = Math.min(
        values.width || Infinity,
        bounds[2] - values.point[0] - 8,
      );
    if (
      !Number.isFinite(values.size) ||
      values.size < 6 ||
      values.size > 120 ||
      available < values.size
    )
      throw new Error("Place the text farther from the page edge.");
    if (
      values.allowSubstitution === false &&
      plan.report.substitutedCharacters.length
    )
      throw new Error(
        "Import the matching font or explicitly allow substitute characters.",
      );
    const measure = (str: string) => plan.width(str, values.size);
    const wrapped: string[] = [];
    for (const paragraph of values.text.split("\n")) {
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
      values.point[1] +
        values.size +
        (wrapped.length - 1) * values.size * 1.35 >
      bounds[3] - 8
    )
      throw new Error(
        "This text does not fit above the bottom of the page. Use fewer lines or a smaller size.",
      );
    this.drawText(
      page,
      wrapped.join("\n"),
      values.point[0],
      values.point[1] + values.size,
      values.size,
      values.color,
      plan,
      {
        id: values.id,
        kind: "text",
        text: values.text,
        size: values.size,
        color: values.color,
        font: values.font || "auto",
        point: values.point,
        lines: wrapped,
        wrapWidth: available,
      },
      values.drawingBounds,
    );
  }
  private updateText(
    page: m.PDFPage,
    id: string,
    text: string,
    size: number,
    color: RGB,
    font?: string,
    width?: number,
    allowSubstitution?: boolean,
  ) {
    const existing = entries(page).find((o) => o.data.id === id);
    if (!existing || existing.data.kind !== "text")
      throw new Error("Select a Folio text object first.");
    const current = displayed(page, existing.data),
      rect = current.rect;
    if (!text.trim()) {
      deleteObject(this.current(), page, id);
      return;
    }
    const content = this.lines(page),
      first = content.lines.find(
        (l) =>
          l.origin[0] >= rect[0] - 1 &&
          l.origin[0] <= rect[2] + 1 &&
          l.origin[1] >= rect[1] - 1 &&
          l.origin[1] <= rect[3] + 1,
      );
    const original =
      existing.data.sourceFont || (first ? content.fonts[first.id] : undefined);
    const baseline = current.baseline ||
      first?.origin || [rect[0], rect[1] + size];
    // Keep the actual baseline; approximate ascent offsets drift on repeated edits.
    const angle = current.rotation || 0;
    const rotated = Math.abs(angle) > 0.01;
    // Lay rotated text out in a local Form, then map its baseline back to the
    // page. This avoids flattening rotated text or changing its orientation.
    const wrap = width || existing.data.wrapWidth || rect[2] - rect[0];
    this.addText(
      page,
      {
        point: rotated ? [8, 8] : [baseline[0], baseline[1] - size],
        text,
        size,
        color,
        font: font || "original",
        allowSubstitution,
        width: wrap,
        id,
        ...(rotated
          ? {
              drawingBounds: [
                0,
                0,
                wrap + 16,
                Math.max(
                  page.getBounds()[3],
                  page.getBounds()[2] + size * 2 + 32,
                ),
              ] as Rect,
            }
          : {}),
      },
      original,
      existing.data.actualFonts,
    );
    const list = this.current().newArray();
    page
      .getObject()
      .get("FolioObjects")
      .forEach((value, index) => {
        if (Number(index) !== existing.index) list.push(value);
      });
    page.getObject().put("FolioObjects", list);
    existing.record.get("Stream").writeStream("");
    page
      .getObject()
      .getInheritable("Resources")
      .get("XObject")
      .delete(existing.record.get("Name"));
    if (rotated) {
      const delta = m.Matrix.concat(
        m.Matrix.concat(
          m.Matrix.translate(-8, -8 - size),
          m.Matrix.rotate(angle),
        ),
        m.Matrix.translate(baseline[0], baseline[1]),
      );
      transformManaged(this.current(), page, id, delta, angle);
    }
  }
  private copyPage(
    at: number,
    source: m.PDFDocument,
    index: number,
    d = this.current(),
  ) {
    const original = source.loadPage(index);
    try {
      if (original.getWidgets().length)
        throw new Error(
          "Pages with interactive forms cannot be duplicated or merged yet. Save a static copy in another PDF tool first.",
        );
      const targetIndex = at < 0 ? d.countPages() : at;
      const graft = d.newGraftMap();
      graft.graftPage(at, source, index);
      const metadata = original.getObject().get("FolioObjects");
      if (metadata.isArray())
        d.findPage(targetIndex).put(
          "FolioObjects",
          graft.graftObject(metadata),
        );
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
          const copied = graft.graftObject(clean);
          copied.put("P", d.findPage(targetIndex));
          annots.push(d.addObject(copied));
        });
      if (annots.length) d.findPage(targetIndex).put("Annots", annots);
      graft.destroy();
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
    this.focusObjectId = undefined;
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
          const plan = this.fontLibrary.plan(
            e.text,
            fonts[e.line],
            e.font || "original",
          );
          if (
            e.allowSubstitution === false &&
            plan.report.substitutedCharacters.length
          )
            throw new Error(
              "Import the matching font or explicitly allow substitute characters.",
            );
          let size = e.size || line.size;
          if (!Number.isFinite(size) || size < 5 || size > 120)
            throw new Error("Choose a text size from 5 to 120 pt.");
          const width = plan.width(e.text, size),
            available = e.fitOriginal
              ? line.rect[2] - line.rect[0]
              : p.getBounds()[2] - line.origin[0] - 8;
          if (width > available && width > 0) {
            if (e.fitOriginal) size *= available / width;
            else
              throw new Error(
                "The replacement exceeds the page width. Shorten it or enable Fit to original line.",
              );
          }
          if (size < 5)
            throw new Error(
              "The replacement is too long for this line. Shorten it or use a smaller edit.",
            );
          const managed = entries(p).find(
            (o) =>
              o.data.kind === "text" &&
              line.origin[0] >= displayed(p!, o.data).rect[0] - 1 &&
              line.origin[0] <= displayed(p!, o.data).rect[2] + 1 &&
              line.origin[1] >= displayed(p!, o.data).rect[1] - 1 &&
              line.origin[1] <= displayed(p!, o.data).rect[3] + 1,
          );
          if (managed) {
            const rows = managed.data.lines || [managed.data.text || ""];
            const candidates = lines.filter(
              (l) =>
                l.origin[0] >= displayed(p!, managed.data).rect[0] - 1 &&
                l.origin[0] <= displayed(p!, managed.data).rect[2] + 1 &&
                l.origin[1] >= displayed(p!, managed.data).rect[1] - 1 &&
                l.origin[1] <= displayed(p!, managed.data).rect[3] + 1,
            );
            const at = candidates.findIndex((l) => l.id === line.id);
            const next = [...rows];
            next[Math.max(0, at)] = e.text;
            this.updateText(
              p,
              managed.data.id,
              next.join("\n"),
              managed.data.size || line.size,
              e.color || managed.data.color || line.color,
              e.font || "original",
              managed.data.wrapWidth,
            );
          } else {
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
                e.color || line.color,
                plan,
                {
                  kind: "text",
                  text: e.text,
                  size,
                  color: e.color || line.color,
                  font: "original",
                  point: [line.origin[0], line.origin[1] - size],
                  lines: [e.text],
                  wrapWidth: Math.max(available, 12),
                },
              );
          }
        } else if (e.kind === "text") {
          this.addText(p, e);
        } else if (e.kind === "image") {
          const image = new m.Image(e.bytes);
          try {
            const bounds = p.getBounds(),
              width = Math.min(
                e.width,
                bounds[2] - e.point[0],
                ((bounds[3] - e.point[1]) * image.getWidth()) /
                  image.getHeight(),
              );
            if (width < 2)
              throw new Error("Place the image farther from the page edge.");
            const h = (width * image.getHeight()) / image.getWidth();
            this.overlay(
              p,
              (dev) =>
                dev.fillImage(
                  image,
                  [width, 0, 0, h, e.point[0], e.point[1]],
                  1,
                ),
              {
                kind: "image",
                rect: [
                  e.point[0],
                  e.point[1],
                  e.point[0] + width,
                  e.point[1] + h,
                ],
              },
            );
          } finally {
            image.destroy();
          }
        } else if (e.kind === "highlightText") {
          const selected = this.selectText(e.page, e.start, e.end);
          if (!selected.text.trim() || !selected.quads.length)
            throw new Error(
              "Select text to highlight. Scanned pages need OCR.",
            );
          const a = p.createAnnotation("Highlight");
          a.setQuadPoints(selected.quads);
          a.setColor(e.color);
          a.setOpacity(0.4);
          a.update();
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
        } else if (e.kind === "objectTransform") {
          moveObject(d, p, e.id, e.rect);
        } else if (e.kind === "objectRotate") {
          rotateObject(d, p, e.id, e.degrees);
        } else if (e.kind === "objectPaste") {
          this.focusObjectId = pasteManaged(d, p, e.bytes, e.point);
        } else if (e.kind === "objectText") {
          this.updateText(
            p,
            e.id,
            e.text,
            e.size,
            e.color,
            e.font,
            e.width,
            e.allowSubstitution,
          );
        } else if (e.kind === "objectDelete") {
          deleteObject(d, p, e.id);
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
      if (p && ["highlight", "rectangle", "ink", "note"].includes(e.kind))
        this.focusObjectId = `annotation:${p.getAnnotations().length - 1}`;
      d.endOperation();
      this.fontLibrary.invalidate();
      const position = d.getJournal().position;
      this.stateIds.splice(position);
      this.stateIds[position] = this.nextStateId++;
      return { ...this.info(), focusObjectId: this.focusObjectId };
    } catch (error) {
      d.abandonOperation();
      throw error;
    } finally {
      p?.destroy();
      duplicateSource?.destroy();
    }
  }
}
