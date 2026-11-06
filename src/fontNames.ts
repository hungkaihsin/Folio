// Read SFNT name records, including every face in a TTC, without accessing paths.
export function fontNames(bytes: Uint8Array, fallback: string): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    inside = (at: number, length: number) =>
      Number.isInteger(at) && at >= 0 && at + length <= bytes.length;
  const u16 = (p: number) => (inside(p, 2) ? view.getUint16(p, false) : 0),
    u32 = (p: number) => (inside(p, 4) ? view.getUint32(p, false) : 0),
    tag = (p: number) => String.fromCharCode(...bytes.subarray(p, p + 4));
  const offsets =
    tag(0) === "ttcf"
      ? Array.from({ length: Math.min(u32(8), 64) }, (_, i) => u32(12 + i * 4))
      : [0];
  return offsets.map((offset, face) => {
    if (!inside(offset, 12)) return `${fallback} ${face + 1}`;
    const count = Math.min(u16(offset + 4), 512);
    let nameTable = 0;
    for (let i = 0; i < count; i++) {
      const at = offset + 12 + i * 16;
      if (inside(at, 16) && tag(at) === "name") {
        nameTable = u32(at + 8);
        break;
      }
    }
    const records = [];
    if (nameTable && inside(nameTable, 6))
      for (let i = 0; i < Math.min(u16(nameTable + 2), 4096); i++) {
        const at = nameTable + 6 + i * 12;
        if (!inside(at, 12)) break;
        const platform = u16(at),
          language = u16(at + 4),
          id = u16(at + 6),
          length = u16(at + 8),
          textAt = nameTable + u16(nameTable + 4) + u16(at + 10);
        if (![4, 6].includes(id) || length > 2048 || !inside(textAt, length))
          continue;
        let text = "";
        if (platform === 0 || platform === 3) {
          for (let j = 0; j + 1 < length; j += 2)
            text += String.fromCharCode(u16(textAt + j));
        } else if (platform === 1)
          text = new TextDecoder("latin1").decode(
            bytes.subarray(textAt, textAt + length),
          );
        if (text.trim())
          records.push({
            text: text.trim(),
            rank:
              (id === 6 ? 10 : 0) +
              (language === 0x409 ? 4 : language === 0 ? 2 : 0),
          });
      }
    return (
      records.sort((a, b) => b.rank - a.rank)[0]?.text ||
      (offsets.length === 1 ? fallback : `${fallback} ${face + 1}`)
    );
  });
}

export function unicodeGlyphs(
  bytes: Uint8Array,
  face = 0,
): Map<string, number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ok = (p: number, n: number) => p >= 0 && p + n <= bytes.length,
    u16 = (p: number) => (ok(p, 2) ? view.getUint16(p, false) : 0),
    u32 = (p: number) => (ok(p, 4) ? view.getUint32(p, false) : 0),
    tag = (p: number) => String.fromCharCode(...bytes.subarray(p, p + 4));
  const offset = tag(0) === "ttcf" ? u32(12 + face * 4) : 0;
  let table = 0;
  for (let i = 0; i < Math.min(u16(offset + 4), 512); i++) {
    const p = offset + 12 + i * 16;
    if (tag(p) === "cmap") {
      table = u32(p + 8);
      break;
    }
  }
  const result = new Map<string, number>();
  let budget = 200000;
  if (!table) return result;
  const add = (code: number, gid: number) => {
    if (
      code > 0 &&
      code <= 0x10ffff &&
      !(code >= 0xd800 && code <= 0xdfff) &&
      gid > 0 &&
      result.size < 100000
    )
      result.set(String.fromCodePoint(code), gid);
  };
  const subtables = [];
  for (let i = 0; i < Math.min(u16(table + 2), 512); i++) {
    const p = table + 4 + i * 8,
      platform = u16(p),
      encoding = u16(p + 2);
    if (platform === 0 || (platform === 3 && [1, 10].includes(encoding)))
      subtables.push(table + u32(p + 4));
  }
  for (const sub of subtables) {
    if (budget <= 0) break;
    const format = u16(sub);
    if (format === 4) {
      const n = u16(sub + 6) / 2;
      if (n > 32768) continue;
      for (let i = 0; i < n; i++) {
        const end = u16(sub + 14 + i * 2),
          start = u16(sub + 16 + n * 2 + i * 2),
          delta = u16(sub + 16 + n * 4 + i * 2),
          rangeAt = sub + 16 + n * 6 + i * 2,
          range = u16(rangeAt);
        for (
          let code = start;
          code <= end && code < 65535 && budget-- > 0;
          code++
        ) {
          let gid = range ? u16(rangeAt + range + (code - start) * 2) : code;
          if (gid) gid = (gid + delta) & 65535;
          add(code, gid);
        }
      }
    } else if (format === 12) {
      const groups = Math.min(u32(sub + 12), 65536);
      for (let i = 0; i < groups; i++) {
        const p = sub + 16 + i * 12,
          start = u32(p),
          end = Math.min(u32(p + 4), 0x10ffff),
          gid = u32(p + 8);
        if (end - start > 100000) continue;
        for (
          let code = start;
          code <= end && result.size < 100000 && budget-- > 0;
          code++
        )
          add(code, gid + code - start);
      }
    }
  }
  return result;
}
