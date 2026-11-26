// Convert apps/web/public/madkrapow-logo.png into the 1-bit ESC/POS raster the
// receipt header prints, emitting it as a TypeScript constant.
//
//   node scripts/generate-logo-raster.mjs [widthDots] [threshold] [none|dither]
//
// Defaults (192 dots, 0.30, no dither) render the artwork as line art: only the
// navy outlines fall below the threshold, so the receipt gets a crisp small
// logo instead of a dithered blob. Set PREVIEW=0 to skip the ASCII preview.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(repoRoot, 'apps/web/public/madkrapow-logo.png')
const OUT = resolve(repoRoot, 'apps/web/src/lib/printing/logo-raster.ts')
const TARGET_W = Number(process.argv[2] ?? 192)
const THRESHOLD = Number(process.argv[3] ?? 0.3) // luminance below this prints black
const DITHER = process.argv[4] !== 'none'

const png = readFileSync(SRC)
// --- minimal PNG decode (8-bit RGBA, non-interlaced) ---
let pos = 8
let width = 0, height = 0, bitDepth = 0, colorType = 0
const idat = []
while (pos < png.length) {
  const len = png.readUInt32BE(pos)
  const type = png.toString('ascii', pos + 4, pos + 8)
  const data = png.subarray(pos + 8, pos + 8 + len)
  if (type === 'IHDR') {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4)
    bitDepth = data[8]; colorType = data[9]
  } else if (type === 'IDAT') idat.push(data)
  else if (type === 'IEND') break
  pos += 12 + len
}
if (bitDepth !== 8 || colorType !== 6) throw new Error(`unsupported PNG ${bitDepth}/${colorType}`)
const raw = inflateSync(Buffer.concat(idat))
const bpp = 4
const stride = width * bpp
const px = Buffer.alloc(height * stride)
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)]
  const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
  const out = px.subarray(y * stride, (y + 1) * stride)
  const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? out[x - bpp] : 0
    const b = prev ? prev[x] : 0
    const c = prev && x >= bpp ? prev[x - bpp] : 0
    let v = line[x]
    if (filter === 1) v += a
    else if (filter === 2) v += b
    else if (filter === 3) v += (a + b) >> 1
    else if (filter === 4) {
      const p = a + b - c
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
    out[x] = v & 0xff
  }
}

// --- trim transparent margins ---
let minX = width, minY = height, maxX = -1, maxY = -1
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (px[(y * width + x) * 4 + 3] > 16) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
const cropW = maxX - minX + 1
const cropH = maxY - minY + 1
const scale = TARGET_W / cropW
const outW = TARGET_W
const outH = Math.max(1, Math.round(cropH * scale))

// --- box downsample, composite over white, luminance ---
const gray = new Float64Array(outW * outH)
for (let oy = 0; oy < outH; oy++) {
  for (let ox = 0; ox < outW; ox++) {
    const sx0 = minX + Math.floor((ox * cropW) / outW)
    const sx1 = minX + Math.max(Math.floor(((ox + 1) * cropW) / outW), Math.floor((ox * cropW) / outW) + 1)
    const sy0 = minY + Math.floor((oy * cropH) / outH)
    const sy1 = minY + Math.max(Math.floor(((oy + 1) * cropH) / outH), Math.floor((oy * cropH) / outH) + 1)
    let r = 0, g = 0, b = 0, a = 0, n = 0
    for (let sy = sy0; sy < sy1 && sy <= maxY; sy++) {
      for (let sx = sx0; sx < sx1 && sx <= maxX; sx++) {
        const i = (sy * width + sx) * 4
        const al = px[i + 3] / 255
        r += px[i] * al; g += px[i + 1] * al; b += px[i + 2] * al; a += al; n++
      }
    }
    // Composite over white paper: colour coverage a/n, rest is paper.
    const cover = n ? a / n : 0
    const ar = n && a ? r / a : 255
    const ag = n && a ? g / a : 255
    const ab = n && a ? b / a : 255
    const lum = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255
    const onPaper = lum * cover + 1 * (1 - cover)
    gray[oy * outW + ox] = onPaper
  }
}

// --- binarise (1 = black) ---
const bits = new Uint8Array(outW * outH)
if (DITHER) {
  const buf = Float64Array.from(gray)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const i = y * outW + x
      const old = buf[i]
      const on = old < THRESHOLD ? 1 : 0
      bits[i] = on
      const err = old - (on ? 0 : 1)
      const push = (xx, yy, f) => {
        if (xx < 0 || xx >= outW || yy >= outH) return
        buf[yy * outW + xx] += err * f
      }
      push(x + 1, y, 7 / 16); push(x - 1, y + 1, 3 / 16)
      push(x, y + 1, 5 / 16); push(x + 1, y + 1, 1 / 16)
    }
  }
} else {
  for (let i = 0; i < bits.length; i++) bits[i] = gray[i] < THRESHOLD ? 1 : 0
}

// --- pack to ESC/POS GS v 0 raster (1 bit per dot, MSB first) ---
const bytesPerRow = Math.ceil(outW / 8)
const raster = Buffer.alloc(bytesPerRow * outH)
for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    if (bits[y * outW + x]) raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
  }
}

// --- ASCII preview for eyeballing ---
if (process.env.PREVIEW !== '0') {
  let art = ''
  for (let y = 0; y < outH; y += 2) {
    for (let x = 0; x < outW; x += 1) {
      const on = bits[y * outW + x] || (y + 1 < outH && bits[(y + 1) * outW + x])
      art += on ? '#' : '.'
    }
    art += '\n'
  }
  console.error(art)
}

const base64 = raster.toString('base64')
writeFileSync(OUT, `/**
 * Mad Krapow logo as a 1-bit ESC/POS raster (GS v 0), generated from
 * apps/web/public/madkrapow-logo.png.
 *
 * Thermal printers are monochrome, so the artwork is trimmed to its opaque
 * bounds, box-downsampled to ${outW}x${outH}, composited over white and
 * thresholded${DITHER ? ' with Floyd-Steinberg dithering' : ' to line art'}.
 * Regenerate with scripts/generate-logo-raster.mjs after changing the
 * artwork; do not hand-edit.
 */
export const LOGO_RASTER = {
  widthDots: ${outW},
  heightDots: ${outH},
  /** Packed rows, ${bytesPerRow} bytes per row, MSB-first, 1 = black. */
  data: '${base64}',
} as const
`)
console.error(`wrote ${OUT}: ${outW}x${outH}, ${raster.length} bytes`)
