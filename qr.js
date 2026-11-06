// A small QR encoder, written for this page so it loads nothing from anywhere.
// Byte mode, error correction L, versions 1–9 (up to 230 bytes). Enough for a link.
//   qrMatrix(text) -> { size, get(x, y) }      qrSvg(text, px) -> '<svg …>'
'use strict'
;(function (root) {
  // [data codewords, error-correction codewords per block, blocks], level L
  const SPEC = [null, [19, 7, 1], [34, 10, 1], [55, 15, 1], [80, 20, 1], [108, 26, 1], [136, 18, 2], [156, 20, 2], [194, 24, 2], [232, 30, 2]]
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]]

  // GF(256), x^8 + x^4 + x^3 + x^2 + 1
  const mul = (a, b) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((b >>> i) & 1) * a } return z }
  function divisor(degree) {
    const r = new Array(degree).fill(0); r[degree - 1] = 1
    let rootPow = 1
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) { r[j] = mul(r[j], rootPow); if (j + 1 < degree) r[j] ^= r[j + 1] }
      rootPow = mul(rootPow, 2)
    }
    return r
  }
  function remainder(data, div) {
    const r = new Array(div.length).fill(0)
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f) }) }
    return r
  }

  function codewords(bytes) {
    let v = 1
    while (v <= 9 && bytes.length + 2 > SPEC[v][0]) v++   // 4 bits mode + 8 bits count + 4 bits end ≈ 2 bytes
    if (v > 9) throw new Error('too long for a QR code here (230 bytes at most)')
    const [nData, nEc, nBlocks] = SPEC[v]
    const bits = []
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
    put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8)
    put(0, Math.min(4, nData * 8 - bits.length))
    while (bits.length % 8) bits.push(0)
    for (let pad = 0xec; bits.length < nData * 8; pad ^= 0xec ^ 0x11) put(pad, 8)
    const data = []
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
    // Split into blocks (all the same length for the versions used here), add the remainder, interleave.
    const len = nData / nBlocks, div = divisor(nEc), blocks = []
    for (let b = 0; b < nBlocks; b++) { const d = data.slice(b * len, (b + 1) * len); blocks.push([d, remainder(d, div)]) }
    const out = []
    for (let i = 0; i < len; i++) for (const [d] of blocks) out.push(d[i])
    for (let i = 0; i < nEc; i++) for (const [, e] of blocks) out.push(e[i])
    return { v, out }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
  ]

  function build(v, cw, mask) {
    const size = v * 4 + 17
    const m = Array.from({ length: size }, () => new Array(size).fill(false))
    const fn = Array.from({ length: size }, () => new Array(size).fill(false))
    const set = (x, y, dark) => { if (x >= 0 && x < size && y >= 0 && y < size) { m[y][x] = !!dark; fn[y][x] = true } }
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4) } }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
    const a = ALIGN[v]
    for (const cy of a) for (const cx of a) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
    const format = (mk) => {
      const d = (1 << 3) | mk   // level L = 01
      let rem = d
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
      const b = ((d << 10) | rem) ^ 0x5412
      const bit = (i) => (b >>> i) & 1
      for (let i = 0; i <= 5; i++) set(8, i, bit(i))
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
      set(8, size - 8, true)
    }
    format(0)   // reserve the cells before data goes in
    if (v >= 7) {
      let rem = v
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
      const b = (v << 12) | rem
      for (let i = 0; i < 18; i++) { const x = size - 11 + (i % 3), y = Math.floor(i / 3); set(x, y, (b >>> i) & 1); set(y, x, (b >>> i) & 1) }
    }
    let i = 0
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert
        if (!fn[y][x] && i < cw.length * 8) { m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++ }
      }
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x]
    format(mask)
    return { size, m }
  }

  // The four penalty rules of the standard. The mask with the lowest score is the easiest to scan.
  function penalty({ size, m }) {
    let p = 0, dark = 0
    const line = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1, s = ''
        for (let b = 0; b < size; b++) {
          s += get(a, b) ? '1' : '0'
          if (b > 0 && get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1
        }
        for (const pat of ['10111010000', '00001011101']) { let at = -1; while ((at = s.indexOf(pat, at + 1)) !== -1) p += 40 }
      }
    }
    line((y, x) => m[y][x]); line((x, y) => m[y][x])
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++
      if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3
    }
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10
  }

  function qrMatrix(text) {
    const { v, out } = codewords(Array.from(new TextEncoder().encode(text)))
    let best = null
    for (let k = 0; k < 8; k++) { const q = build(v, out, k), s = penalty(q); if (!best || s < best.s) best = { q, s } }
    const { size, m } = best.q
    return { size, version: v, get: (x, y) => m[y][x] }
  }

  function qrSvg(text, px = 220) {
    const q = qrMatrix(text), quiet = 4, n = q.size + quiet * 2
    let d = ''
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.get(x, y)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR code for this record"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
  }

  root.qrMatrix = qrMatrix; root.qrSvg = qrSvg
  if (typeof module !== 'undefined') module.exports = { qrMatrix, qrSvg }
})(typeof globalThis !== 'undefined' ? globalThis : this)
