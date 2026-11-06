// Build a Unicode cmap for on-page editing from the same proven glyph IDs used
// by the PDF renderer. Embedded subsets often retain outlines without a cmap.
export function browserFont(
  bytes: Uint8Array,
  glyphs: Map<string, number>,
  faceIndex = 0,
): Uint8Array | undefined {
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) return;
  let start = 0;
  if (input.getUint32(0) === 0x74746366) {
    if (
      !Number.isInteger(faceIndex) ||
      faceIndex < 0 ||
      faceIndex >= Math.min(64, input.getUint32(8)) ||
      12 + faceIndex * 4 + 4 > bytes.length
    )
      return;
    start = input.getUint32(12 + faceIndex * 4);
    if (start + 12 > bytes.length) return;
  }
  const signature = input.getUint32(start);
  if (signature !== 0x00010000 && signature !== 0x4f54544f) return;
  const count = input.getUint16(start + 4);
  if (count > 512 || start + 12 + count * 16 > bytes.length) return;
  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const at = start + 12 + i * 16,
      offset = input.getUint32(at + 8),
      length = input.getUint32(at + 12);
    if (offset + length > bytes.length) return;
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    if (!["cmap", "DSIG"].includes(tag))
      tables.set(tag, bytes.slice(offset, offset + length));
  }
  const pairs = [...glyphs]
    .filter(([char, gid]) => char.length > 0 && gid > 0 && gid < 65536)
    .map(([char, gid]) => [char.codePointAt(0)!, gid])
    .sort((a, b) => a[0] - b[0]);
  if (!pairs.length) return;
  const cmap = new Uint8Array(12 + 16 + pairs.length * 12),
    cv = new DataView(cmap.buffer);
  cv.setUint16(2, 1);
  cv.setUint16(4, 3);
  cv.setUint16(6, 10);
  cv.setUint32(8, 12);
  cv.setUint16(12, 12);
  cv.setUint32(16, 16 + pairs.length * 12);
  cv.setUint32(24, pairs.length);
  pairs.forEach(([code, gid], i) => {
    const at = 28 + i * 12;
    cv.setUint32(at, code);
    cv.setUint32(at + 4, code);
    cv.setUint32(at + 8, gid);
  });
  tables.set("cmap", cmap);
  const head = tables.get("head");
  if (head && head.length >= 12) new DataView(head.buffer).setUint32(8, 0);
  // PDF subsets can leave invalid placeholders in unused glyph slots. OTS
  // validates every glyph, so rebuild only referenced outlines and their
  // composite dependencies, preserving glyph numbers and metrics.
  const glyf = tables.get("glyf"),
    loca = tables.get("loca"),
    maxp = tables.get("maxp");
  if (glyf && loca && head && head.length >= 54 && maxp && maxp.length >= 6) {
    const long = new DataView(head.buffer).getInt16(50) !== 0;
    const total = new DataView(maxp.buffer).getUint16(4),
      lv = new DataView(loca.buffer);
    if (loca.length < (total + 1) * (long ? 4 : 2)) return;
    const positions = Array.from({ length: total + 1 }, (_, i) =>
      long ? lv.getUint32(i * 4) : lv.getUint16(i * 2) * 2,
    );
    const keep = new Set<number>(),
      pending = pairs.map(([, gid]) => gid);
    while (pending.length) {
      const gid = pending.pop()!;
      if (keep.has(gid) || gid <= 0 || gid >= total) continue;
      keep.add(gid);
      const start = positions[gid],
        end = positions[gid + 1];
      if (end <= start || end > glyf.length) continue;
      const view = new DataView(
        glyf.buffer,
        glyf.byteOffset + start,
        end - start,
      );
      if (view.byteLength < 10 || view.getInt16(0) >= 0) continue;
      let at = 10,
        flags = 0;
      do {
        if (at + 4 > view.byteLength) break;
        flags = view.getUint16(at);
        pending.push(view.getUint16(at + 2));
        at +=
          4 +
          (flags & 1 ? 4 : 2) +
          (flags & 8 ? 2 : flags & 64 ? 4 : flags & 128 ? 8 : 0);
      } while (flags & 32);
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    const newLoca = new Uint8Array((total + 1) * 4),
      nl = new DataView(newLoca.buffer);
    for (let gid = 0; gid < total; gid++) {
      nl.setUint32(gid * 4, length);
      if (!keep.has(gid)) continue;
      const start = positions[gid],
        end = positions[gid + 1];
      if (end < start || end > glyf.length) return;
      const chunk = new Uint8Array((end - start + 3) & ~3);
      chunk.set(glyf.subarray(start, end));
      if (chunk.length >= 12) {
        const v = new DataView(chunk.buffer),
          contours = v.getInt16(0);
        if (contours > 0 && 10 + contours * 2 + 2 <= chunk.length) {
          const points = v.getUint16(8 + contours * 2) + 1;
          let flagAt = 12 + contours * 2 + v.getUint16(10 + contours * 2),
            seen = 0;
          while (seen < points && flagAt < chunk.length) {
            const flags = chunk[flagAt];
            chunk[flagAt++] &= 0x7f;
            seen++;
            if (flags & 8) {
              if (flagAt >= chunk.length) break;
              seen += chunk[flagAt++];
            }
          }
        }
      }
      chunks.push(chunk);
      length += chunk.length;
    }
    nl.setUint32(total * 4, length);
    const newGlyf = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      newGlyf.set(chunk, at);
      at += chunk.length;
    }
    tables.set("glyf", newGlyf);
    tables.set("loca", newLoca);
    new DataView(head.buffer).setInt16(50, 1);
  }
  if (!tables.has("post")) {
    const post = new Uint8Array(32);
    new DataView(post.buffer).setUint32(0, 0x00030000);
    tables.set("post", post);
  }
  const sorted = [...tables].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const length =
    12 +
    sorted.length * 16 +
    sorted.reduce((n, [, data]) => n + ((data.length + 3) & ~3), 0);
  const result = new Uint8Array(length),
    out = new DataView(result.buffer);
  out.setUint32(0, signature);
  out.setUint16(4, sorted.length);
  const power = 2 ** Math.floor(Math.log2(sorted.length));
  out.setUint16(6, power * 16);
  out.setUint16(8, Math.log2(power));
  out.setUint16(10, sorted.length * 16 - power * 16);
  const sum = (start: number, length: number) => {
    let sum = 0;
    for (let p = start; p < start + length; p += 4)
      sum = (sum + out.getUint32(p)) >>> 0;
    return sum;
  };
  let offset = 12 + sorted.length * 16,
    headAt = 0;
  sorted.forEach(([tag, data], i) => {
    const at = 12 + i * 16;
    for (let j = 0; j < 4; j++) result[at + j] = tag.charCodeAt(j);
    result.set(data, offset);
    out.setUint32(at + 4, sum(offset, (data.length + 3) & ~3));
    out.setUint32(at + 8, offset);
    out.setUint32(at + 12, data.length);
    if (tag === "head") headAt = offset;
    offset += (data.length + 3) & ~3;
  });
  if (headAt)
    out.setUint32(headAt + 8, (0xb1b0afba - sum(0, result.length)) >>> 0);
  return result;
}
