// Uncompressed ZIP container. PNG/JPEG payloads are already compressed.
const table = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let j = 0; j < 8; j++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder(),
    parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name),
      crc = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length),
      lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x800, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.bytes.length, true);
    lv.setUint32(22, file.bytes.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, file.bytes);
    const header = new Uint8Array(46 + name.length),
      v = new DataView(header.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x800, true);
    v.setUint32(16, crc, true);
    v.setUint32(20, file.bytes.length, true);
    v.setUint32(24, file.bytes.length, true);
    v.setUint16(28, name.length, true);
    v.setUint32(42, offset, true);
    header.set(name, 46);
    central.push(header);
    offset += local.length + file.bytes.length;
  }
  const size = central.reduce((n, h) => n + h.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + end.length);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
