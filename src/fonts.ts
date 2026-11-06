import * as m from "mupdf";
import { browserFont } from "./browserFont";
import { fontNames, unicodeGlyphs } from "./fontNames";
import type { FontReport } from "./types";
export const familyName = (name: string) =>
  name.replace(/^(?:[A-Z]{6}\+)+/, "");
export const fontKey = (name: string) =>
  familyName(name)
    .replace(/[\s_-]/g, "")
    .replace(/regular$/i, "")
    .toLowerCase();
interface Face {
  font: m.Font;
  name: string;
  glyphs: Map<string, number>;
  proven: Set<string>;
  unicode?: Map<string, number>;
  full?: boolean;
  program?: Uint8Array;
  faceIndex?: number;
}
export interface Glyph {
  face: Face;
  gid: number;
  char: string;
  advance: number;
}
export interface TextPlan {
  glyphs: Glyph[];
  report: FontReport;
  sources: Face[];
  width: (text: string, size: number) => number;
}
export class FontLibrary {
  private doc: m.PDFDocument | null = null;
  private faces: Face[] = [];
  private byPointer = new Map<number, Face>();
  private dirty = true;
  private visibility = new Map<string, boolean>();
  private custom = new Map<
    string,
    { name: string; bytes: Uint8Array; index: number; face?: Face }
  >();
  private browserCache = new Map<Face, { id: string; bytes?: Uint8Array }>();
  private styled = new Map<string, m.Font>();
  constructor(
    private sans: m.Font,
    private serif: m.Font,
    private mono: m.Font,
    private cjk: m.Font,
    private cjkSerif: m.Font,
    private programs: { font: m.Font; bytes: Uint8Array }[] = [],
  ) {}
  invalidate() {
    this.dirty = true;
  }
  reset(doc: m.PDFDocument) {
    this.doc = doc;
    this.faces = [];
    this.byPointer.clear();
    this.visibility.clear();
    this.browserCache.clear();
    this.dirty = true;
  }
  private face(font: m.Font) {
    let f = this.byPointer.get(Number(font.pointer));
    if (!f) {
      f = { font, name: font.getName(), glyphs: new Map(), proven: new Set() };
      f.full = [this.sans, this.serif, this.mono, this.cjk, this.cjkSerif].some(
        (known) => known.pointer === font.pointer,
      );
      f.program = this.programs.find(
        (p) => p.font.pointer === font.pointer,
      )?.bytes;
      this.byPointer.set(Number(font.pointer), f);
    }
    return f;
  }
  private collect() {
    if (!this.doc || !this.dirty) return;
    this.dirty = false;
    const doc = this.doc;
    // Keep maps from the original document across edits, including chars removed from a page.
    const seen = new Set(this.faces);
    const walk = (text: m.Text) =>
      text.walk({
        showGlyph: (font, _trm, gid, unicode) => {
          if (unicode <= 0 || unicode > 0x10ffff || gid < 0) return;
          const face = this.face(font),
            char = String.fromCodePoint(unicode);
          if (gid > 0) {
            face.glyphs.set(char, gid);
            face.proven.add(char);
          }
          if (!seen.has(face)) {
            seen.add(face);
            this.faces.push(face);
          }
        },
      });
    const device = new m.Device({ fillText: walk, strokeText: walk });
    try {
      for (let i = 0; i < doc.countPages(); i++) {
        const p = doc.loadPage(i);
        try {
          p.runPageContents(device, m.Matrix.identity);
          p.getObject()
            .get("FolioObjects")
            .forEach((record) => {
              record.get("FontSources").forEach((source) => {
                const name = source.get("Name").asString();
                let fd = source.get("Font").get("FontDescriptor");
                if (fd.isNull())
                  fd = source
                    .get("Font")
                    .get("DescendantFonts", 0, "FontDescriptor");
                for (const key of ["FontFile2", "FontFile3", "FontFile"]) {
                  const embedded = fd.get(key);
                  if (!embedded.isStream()) continue;
                  const bytes = embedded.readStream();
                  try {
                    const map = JSON.parse(source.get("Glyphs").asString());
                    if (!Array.isArray(map) || map.length > 100000) break;
                    const existing = this.faces.find(
                      (f) =>
                        f.name === name &&
                        map.every(
                          ([char, gid]: [string, number]) =>
                            f.glyphs.get(char) === gid,
                        ),
                    );
                    if (existing) {
                      const values = source.get("Unicode");
                      if (values.isString())
                        try {
                          const parsed = JSON.parse(values.asString());
                          if (Array.isArray(parsed) && parsed.length <= 100000)
                            existing.unicode = new Map(parsed);
                        } catch {}
                      break;
                    }
                    const font = new m.Font(name, bytes.asUint8Array()),
                      face = this.face(font);
                    for (const pair of map) {
                      if (
                        Array.isArray(pair) &&
                        typeof pair[0] === "string" &&
                        Number.isInteger(pair[1]) &&
                        pair[1] > 0
                      ) {
                        face.glyphs.set(pair[0], pair[1]);
                        face.proven.add(pair[0]);
                      }
                    }
                    const values = source.get("Unicode");
                    if (values.isString())
                      try {
                        const parsed = JSON.parse(values.asString());
                        if (Array.isArray(parsed) && parsed.length <= 100000)
                          face.unicode = new Map(parsed);
                      } catch {}
                    this.faces.push(face);
                  } catch {
                    /* Unrecognized font metadata is ignored. */
                  } finally {
                    bytes.destroy();
                  }
                  break;
                }
              });
            });
        } finally {
          p.destroy();
        }
      }
    } finally {
      device.close();
      device.destroy();
    }
  }
  private hasInk(face: Face, gid: number, char: string) {
    if (/\s/u.test(char)) return true;
    const key = `${face.font.pointer}:${gid}`;
    const saved = this.visibility.get(key);
    if (saved !== undefined) return saved;
    // A subset's cmap may map characters whose outlines were omitted. Verify
    // unobserved glyphs instead of accepting a nonzero glyph ID as coverage.
    const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 128, 128], false);
    pix.clear(255);
    const device = new m.DrawDevice(m.Matrix.identity, pix),
      text = new m.Text();
    let ink = false;
    try {
      text.showGlyph(
        face.font,
        [64, 0, 0, -64, 32, 92],
        gid,
        char.codePointAt(0)!,
      );
      device.fillText(
        text,
        m.Matrix.identity,
        m.ColorSpace.DeviceRGB,
        [0, 0, 0],
        1,
      );
      device.close();
      const pixels = pix.getPixels();
      for (let i = 0; i < pixels.length; i++)
        if (pixels[i] < 240) {
          ink = true;
          break;
        }
    } catch {
      ink = false;
    } finally {
      text.destroy();
      device.destroy();
      pix.destroy();
    }
    this.visibility.set(key, ink);
    return ink;
  }
  private glyph(face: Face, char: string): number {
    const mapped = face.glyphs.get(char);
    if (mapped !== undefined) return mapped;
    const gid = face.unicode?.get(char) || face.font.encodeCharacter(char);
    if (gid > 0 && this.hasInk(face, gid, char)) {
      face.glyphs.set(char, gid);
      return gid;
    }
    return 0;
  }
  private customFace(key: string) {
    const entry = this.custom.get(key)!;
    if (!entry.face) {
      entry.face = this.face(new m.Font(entry.name, entry.bytes, entry.index));
      entry.face.unicode = unicodeGlyphs(entry.bytes, entry.index);
      entry.face.full = true;
      entry.face.program = entry.bytes;
      entry.face.faceIndex = entry.index;
    }
    return entry.face;
  }
  register(bytes: Uint8Array, name: string) {
    if (bytes.length > 40 * 1024 * 1024)
      throw new Error("Choose a font smaller than 40 MB.");
    const names = fontNames(bytes, name.replace(/\.(?:ttf|otf|ttc)$/i, ""));
    if (!names.length)
      throw new Error("This font file contains no readable faces.");
    const first = this.face(new m.Font(names[0], bytes, 0));
    first.unicode = unicodeGlyphs(bytes, 0);
    first.full = true;
    first.program = bytes;
    first.faceIndex = 0;
    return names.map((label, index) => {
      const key = "custom:" + crypto.randomUUID();
      this.custom.set(key, {
        name: label,
        bytes,
        index,
        ...(index === 0 ? { face: first } : {}),
      });
      return { key, name: index === 0 ? first.name : label };
    });
  }
  plan(
    text: string,
    original: m.Font | string | undefined,
    family = "auto",
    originalFamilies: string[] = [],
  ): TextPlan {
    this.collect();
    const requested = family.startsWith("document:")
      ? family.slice(9)
      : typeof original === "string"
        ? original
        : original?.getName();
    const preferred =
      typeof original === "object" && !family.startsWith("document:")
        ? this.face(original)
        : undefined;
    const preserve =
      family.startsWith("document:") ||
      family === "auto" ||
      family === "original" ||
      (!this.custom.has(family) && family.startsWith("custom:"));
    let candidates: Face[] = [];
    if (this.custom.has(family)) candidates = [this.customFace(family)];
    else if (preserve && requested) {
      candidates = [
        ...(preferred ? [preferred] : []),
        ...this.faces.filter((f) => fontKey(f.name) === fontKey(requested)),
      ];
    } else {
      const font =
        (
          {
            serif: this.serif,
            mono: this.mono,
            cjk: this.cjk,
            "cjk-serif": this.cjkSerif,
          } as Record<string, m.Font>
        )[family] || this.sans;
      candidates = [this.face(font)];
    }
    if (preserve && requested)
      for (const [key, entry] of this.custom) {
        if (fontKey(entry.name) === fontKey(requested))
          candidates.push(this.customFace(key));
      }
    // Folio-created mixed-script objects can intentionally use more than one
    // family. Retain those declared families when editing the same object.
    const retained =
      preserve && !family.startsWith("document:") ? originalFamilies : [];
    for (const name of retained)
      candidates.push(
        ...this.faces.filter((face) => fontKey(face.name) === fontKey(name)),
      );
    if (!candidates.length) candidates = [this.face(this.sans)];
    candidates = [...new Set(candidates)];
    const source = candidates[0],
      serif =
        family === "serif" || family === "cjk-serif" || source.font.isSerif(),
      bold = source.font.isBold(),
      italic = source.font.isItalic();
    const latinName = bold
      ? italic
        ? "Times-BoldItalic"
        : "Times-Bold"
      : italic
        ? "Times-Italic"
        : "Times-Roman";
    let latin = serif ? this.serif : this.sans;
    if (serif && (bold || italic)) {
      if (!this.styled.has(latinName))
        this.styled.set(latinName, new m.Font(latinName));
      latin = this.styled.get(latinName)!;
    }
    const fallbacks = [
      this.face(latin),
      this.face(serif ? this.cjkSerif : this.cjk),
      this.face(this.cjk),
    ];
    const substituted = new Set<string>(),
      used = new Set<string>();
    const glyphs: Glyph[] = [];
    for (const char of text) {
      if (char === "\n") continue;
      const normalized = char === "\t" ? " " : char;
      let face: Face | undefined,
        gid = 0;
      // Prefer proven glyphs in sibling subsets before guessing from a broken cmap.
      for (const candidate of candidates) {
        const known = candidate.glyphs.get(normalized);
        if (known !== undefined) {
          face = candidate;
          gid = known;
          break;
        }
      }
      if (!face)
        for (const candidate of candidates) {
          const id = this.glyph(candidate, normalized);
          if (id) {
            face = candidate;
            gid = id;
            break;
          }
        }
      if (!face)
        for (const candidate of fallbacks) {
          const id = this.glyph(candidate, normalized);
          if (id) {
            face = candidate;
            gid = id;
            substituted.add(normalized);
            break;
          }
        }
      if (!face)
        throw new Error(
          "This text contains characters that the available fonts cannot draw.",
        );
      used.add(familyName(face.name));
      glyphs.push({
        face,
        gid,
        char: normalized,
        advance: face.font.advanceGlyph(gid),
      });
    }
    if (!requested && family === "auto") substituted.clear();
    const report: FontReport = {
      requestedFont:
        preserve && requested
          ? familyName(requested)
          : !requested && family === "auto" && used.size === 1
            ? [...used][0]
            : familyName(source.name),
      usedFonts: [...used],
      substitutedCharacters: [...substituted],
      preserved:
        !!requested &&
        preserve &&
        substituted.size === 0 &&
        [...used].every((n) =>
          [requested, ...retained].some((name) => fontKey(n) === fontKey(name)),
        ),
    };
    const advances = new Map(glyphs.map((g) => [g.char, g.advance]));
    return {
      glyphs,
      report,
      sources: [...new Set([...candidates, ...glyphs.map((g) => g.face)])],
      width: (value, size) => {
        let total = 0;
        for (const char of value) {
          if (char === "\n") continue;
          total +=
            (advances.get(char === "\t" ? " " : char) || 0) *
            size *
            (char === "\t" ? 4 : 1);
        }
        return total;
      },
    };
  }
  browserFonts(plan: TextPlan, known: string[] = []) {
    return [...new Set(plan.glyphs.map((g) => g.face))].map((face) => {
      const saved = this.browserCache.get(face);
      if (face.full && saved)
        return {
          id: saved.id,
          name: familyName(face.name),
          ...(!known.includes(saved.id) ? { bytes: saved.bytes } : {}),
        };
      const makeId = (pairs: Map<string, number>) => {
        let hash = 2166136261;
        for (const char of JSON.stringify(
          [...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ))
          hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
        return `folio-${face.font.pointer}-${hash >>> 0}`;
      };
      let pairs = new Map(face.full ? face.unicode : []);
      for (const [char, gid] of face.glyphs) pairs.set(char, gid);
      let id = makeId(pairs);
      if (saved?.id === id)
        return {
          id,
          name: familyName(face.name),
          ...(!known.includes(id) ? { bytes: saved.bytes } : {}),
        };
      const temp = new m.PDFDocument();
      let bytes: Uint8Array | undefined;
      if (face.program) {
        if (face.full) {
          pairs = unicodeGlyphs(face.program, face.faceIndex);
          for (const [char, gid] of face.glyphs) pairs.set(char, gid);
          id = makeId(pairs);
        }
        bytes = browserFont(face.program, pairs, face.faceIndex);
        temp.destroy();
        this.browserCache.set(face, { id, bytes });
        return {
          id,
          name: familyName(face.name),
          ...(!known.includes(id) ? { bytes } : {}),
        };
      }
      try {
        const resource = temp.addFont(face.font);
        let fd = resource.get("FontDescriptor");
        if (fd.isNull())
          fd = resource.get("DescendantFonts", 0, "FontDescriptor");
        for (const key of ["FontFile2", "FontFile3", "FontFile"]) {
          const ref = fd.get(key);
          if (!ref.isStream()) continue;
          const buf = ref.readStream();
          try {
            if (face.full) {
              pairs = unicodeGlyphs(buf.asUint8Array());
              for (const [char, gid] of face.glyphs) pairs.set(char, gid);
              id = makeId(pairs);
            }
            bytes = browserFont(buf.asUint8Array(), pairs);
          } finally {
            buf.destroy();
          }
          break;
        }
      } finally {
        temp.destroy();
      }
      this.browserCache.set(face, { id, bytes });
      return {
        id,
        name: familyName(face.name),
        ...(!known.includes(id) ? { bytes } : {}),
      };
    });
  }
  repairUnicode(
    doc: m.PDFDocument,
    font: m.PDFObject,
    pairs: Map<string, number>,
  ) {
    if (
      font.get("Subtype").asName() !== "Type0" ||
      !font.get("Encoding").asName().startsWith("Identity-")
    )
      return;
    const unique = new Map<number, string>();
    for (const [char, gid] of pairs) {
      if (gid > 0 && gid <= 65535 && !unique.has(gid)) unique.set(gid, char);
    }
    const utf16 = (char: string) =>
      Array.from({ length: char.length }, (_, i) =>
        char.charCodeAt(i).toString(16).padStart(4, "0"),
      ).join("");
    const rows = [...unique].map(
        ([gid, char]) =>
          `<${gid.toString(16).padStart(4, "0")}> <${utf16(char)}>`,
      ),
      blocks = [];
    for (let i = 0; i < rows.length; i += 100) {
      const part = rows.slice(i, i + 100);
      blocks.push(`${part.length} beginbfchar\n${part.join("\n")}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /FolioUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${blocks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    font.put("ToUnicode", doc.addStream(cmap, {}));
  }
  repairResources(doc: m.PDFDocument, resources: m.PDFObject, plan: TextPlan) {
    resources.get("Font").forEach((font) => {
      const name = font.get("BaseFont").asName();
      let selected = plan.sources.filter((f) => f.name === name);
      if (!selected.length)
        selected = plan.sources.filter(
          (f) => familyName(f.name) === familyName(name),
        );
      if (!selected.length) return;
      const pairs = new Map<string, number>();
      for (const f of selected)
        for (const [char, gid] of f.glyphs) pairs.set(char, gid);
      for (const g of plan.glyphs)
        if (selected.includes(g.face)) pairs.set(g.char, g.gid);
      if (pairs.size) this.repairUnicode(doc, font, pairs);
    });
  }
  persist(
    doc: m.PDFDocument,
    record: m.PDFObject,
    plan: TextPlan,
    resources: m.PDFObject,
  ) {
    const sources = doc.newArray(),
      spare = new m.PDFDocument();
    try {
      for (const face of plan.sources) {
        let font: m.PDFObject | undefined;
        resources.get("Font").forEach((candidate) => {
          if (candidate.get("BaseFont").asName() === face.name)
            font = candidate;
        });
        // addFont caches PDF object numbers and cannot safely be used in a live
        // undo journal. Reuse the drawn font, or graft an anchor from a temp doc.
        if (!font) {
          const anchor = spare.addFont(face.font);
          this.repairUnicode(spare, anchor, face.glyphs);
          font = doc.graftObject(anchor);
        }
        sources.push({
          Name: doc.newString(face.name),
          Font: font,
          Glyphs: doc.newString(JSON.stringify([...face.glyphs])),
          ...(face.unicode
            ? { Unicode: doc.newString(JSON.stringify([...face.unicode])) }
            : {}),
        });
      }
    } finally {
      spare.destroy();
    }
    record.put("FontSources", sources);
  }
  draw(
    device: m.Device,
    plan: TextPlan,
    text: string,
    x: number,
    y: number,
    size: number,
    color: m.Color,
  ) {
    const glyphs = new Map(plan.glyphs.map((g) => [g.char, g]));
    const object = new m.Text();
    let index = 0;
    try {
      for (const [lineIndex, line] of text.split("\n").entries()) {
        let cursor = x;
        for (const char of line) {
          const glyph = glyphs.get(char === "\t" ? " " : char);
          if (!glyph) continue;
          object.showGlyph(
            glyph.face.font,
            [size, 0, 0, -size, cursor, y + lineIndex * size * 1.35],
            glyph.gid,
            glyph.char.codePointAt(0)!,
          );
          cursor += glyph.advance * size * (char === "\t" ? 4 : 1);
        }
      }
      device.fillText(
        object,
        m.Matrix.identity,
        m.ColorSpace.DeviceRGB,
        color,
        1,
      );
    } finally {
      object.destroy();
    }
  }
}
