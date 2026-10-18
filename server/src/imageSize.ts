/** Minimal PNG/JPEG/WebP dimension parser, no deps. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  // PNG: IHDR at fixed offset
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF markers
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
    return null;
  }
  // WebP: RIFF....WEBP VP8/VP8L/VP8X
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
    }
    if (fmt === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/** Nearest named aspect ratio for APIs that take an enum. */
export function nearestAspect(width: number, height: number, options: string[]): string {
  const r = width / height;
  let best = options[0];
  let bestDiff = Infinity;
  for (const o of options) {
    const [w, h] = o.split(':').map(Number);
    if (!w || !h) continue;
    const diff = Math.abs(Math.log(r / (w / h)));
    if (diff < bestDiff) { bestDiff = diff; best = o; }
  }
  return best;
}
