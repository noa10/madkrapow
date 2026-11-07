// Generates the merchant order-alert sounds as 16-bit mono WAV files.
//
//   node scripts/generate-order-alert-sounds.mjs
//
// Deterministic output (no randomness) so re-running reproduces byte-identical
// files. Sounds are written to the Android res/raw directory, where
// flutter_local_notifications picks them up via RawResourceAndroidNotificationSound.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 44100
const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/merchant/android/app/src/main/res/raw',
)

/** Small seeded PRNG so the noise layers are reproducible byte-for-byte. */
function mulberry32(seed) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Band-limited-ish noise burst shaped by an exponential decay. */
function strike(buffer, start, gain, decaySeconds, random) {
  let lp = 0
  for (let i = 0; i < SAMPLE_RATE * decaySeconds; i++) {
    const index = start + i
    if (index >= buffer.length) break
    // One-pole lowpass keeps the click woody instead of hissy.
    lp += 0.35 * ((random() * 2 - 1) - lp)
    buffer[index] += gain * lp * Math.exp(-i / (0.0015 * SAMPLE_RATE))
  }
}

/** A struck-bar tone: fundamental plus marimba-like inharmonic partials. */
function malletNote(buffer, start, frequency, gain, decaySeconds, random) {
  const partials = [
    [1, 1],
    [4.1, 0.28],
    [9.2, 0.08],
  ]
  const samples = Math.floor(SAMPLE_RATE * decaySeconds * 6)
  for (let i = 0; i < samples; i++) {
    const index = start + i
    if (index >= buffer.length) break
    const t = i / SAMPLE_RATE
    const envelope = Math.exp(-t / decaySeconds)
    let value = 0
    for (const [ratio, level] of partials) {
      value += level * Math.sin(2 * Math.PI * frequency * ratio * t)
    }
    buffer[index] += gain * value * envelope
  }
  strike(buffer, start, gain * 0.9, 0.002, random)
}

/** A counter/service bell: bright inharmonic partials with a long ring. */
function bellDing(buffer, start, frequency, gain, decaySeconds) {
  const partials = [
    [1, 1],
    [2.0, 0.55],
    [2.74, 0.4],
    [3.76, 0.22],
    [5.4, 0.12],
  ]
  const samples = Math.floor(SAMPLE_RATE * decaySeconds * 7)
  for (let i = 0; i < samples; i++) {
    const index = start + i
    if (index >= buffer.length) break
    const t = i / SAMPLE_RATE
    const envelope = Math.exp(-t / decaySeconds)
    let value = 0
    for (const [ratio, level] of partials) {
      value += level * Math.sin(2 * Math.PI * frequency * ratio * t)
    }
    buffer[index] += gain * value * envelope
  }
}

/** A soft clean chime tone with a gentle attack. */
function chimeTone(buffer, start, frequency, gain, decaySeconds) {
  const partials = [
    [1, 1],
    [2, 0.3],
    [3, 0.1],
  ]
  const samples = Math.floor(SAMPLE_RATE * decaySeconds * 6)
  const attack = Math.floor(0.008 * SAMPLE_RATE)
  for (let i = 0; i < samples; i++) {
    const index = start + i
    if (index >= buffer.length) break
    const t = i / SAMPLE_RATE
    const envelope = Math.exp(-t / decaySeconds) * Math.min(1, i / attack)
    let value = 0
    for (const [ratio, level] of partials) {
      value += level * Math.sin(2 * Math.PI * frequency * ratio * t)
    }
    buffer[index] += gain * value * envelope
  }
}

/** A quiet band-passed sizzle that trails off, evoking a hot wok. */
function wokSizzle(buffer, start, gain, durationSeconds, random) {
  let hp = 0
  let lp = 0
  const samples = Math.floor(SAMPLE_RATE * durationSeconds)
  for (let i = 0; i < samples; i++) {
    const index = start + i
    if (index >= buffer.length) break
    const white = random() * 2 - 1
    hp = 0.65 * (hp + white) // high-pass: keep the frying texture, not rumble
    lp += 0.5 * (hp - lp) // low-pass the high band for a soft tail
    const envelope = Math.exp(-i / (0.35 * SAMPLE_RATE))
    buffer[index] += gain * lp * envelope
  }
}

function finalize(buffer, peak) {
  let max = 0
  for (const value of buffer) max = Math.max(max, Math.abs(value))
  const scale = peak / (max || 1)
  const samples = new Int16Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    const fade = Math.min(1, (buffer.length - i) / (0.01 * SAMPLE_RATE))
    samples[i] = Math.round(Math.tanh(buffer[i] * scale) * fade * 32767)
  }
  return samples
}

function wav(samples) {
  const header = Buffer.alloc(44)
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

function render(durationSeconds, layer) {
  const buffer = new Float64Array(Math.ceil(durationSeconds * SAMPLE_RATE))
  // Fixed seeds: identical output on every run, so regenerated files are
  // diff-stable in git.
  layer(buffer, mulberry32(0x6b7261))
  return wav(finalize(buffer, 0.82))
}

const at = (seconds) => Math.round(seconds * SAMPLE_RATE)

const sounds = {
  // Signature: four rising wooden-mallet strikes, a service-bell ping, and a
  // faint wok-sizzle tail. Short and bright so it cuts through kitchen noise
  // without being harsh on 10-second repeats.
  krapow_mallet: render(1.5, (b, random) => {
    malletNote(b, at(0.0), 440.0, 0.55, 0.14, random)
    malletNote(b, at(0.14), 523.25, 0.55, 0.14, random)
    malletNote(b, at(0.28), 659.26, 0.58, 0.16, random)
    malletNote(b, at(0.44), 880.0, 0.6, 0.18, random)
    bellDing(b, at(0.78), 1318.51, 0.5, 0.22)
    wokSizzle(b, at(0.9), 0.05, 0.55, random)
  }),
  // Classic double counter-bell ding.
  service_bell: render(1.1, (b) => {
    bellDing(b, at(0.0), 1567.98, 0.62, 0.3)
    bellDing(b, at(0.24), 1567.98, 0.5, 0.28)
  }),
  // Gentle two-note chime for quieter front-of-house use.
  light_chime: render(1.3, (b) => {
    chimeTone(b, at(0.0), 783.99, 0.5, 0.28)
    chimeTone(b, at(0.26), 1174.66, 0.45, 0.3)
  }),
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, data] of Object.entries(sounds)) {
  const path = join(OUT_DIR, `${name}.wav`)
  writeFileSync(path, data)
  console.log(`${path} (${data.length} bytes)`)
}
