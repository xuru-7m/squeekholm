// Tiny chiptune sound effects with WebAudio; no audio files needed.

let ctx = null;
let muted = localStorage.getItem("delve.muted") === "1";

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  localStorage.setItem("delve.muted", muted ? "1" : "0");
  return muted;
}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = "square", vol = 0.06, slide = 0, delay = 0 } = {}) {
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.08) {
  const a = ac();
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(g).connect(a.destination);
  s.start();
}

const SFX = {
  step: () => tone(180, 0.04, { type: "triangle", vol: 0.03 }),
  bump: () => tone(90, 0.06, { vol: 0.03 }),
  attack: () => { noise(0.08, 0.07); tone(320, 0.06, { slide: -200 }); },
  kill: () => { tone(520, 0.06); tone(780, 0.08, { delay: 0.06 }); },
  hurt: () => { tone(140, 0.15, { type: "sawtooth", slide: -80, vol: 0.07 }); noise(0.1, 0.05); },
  seed: () => { tone(880, 0.05); tone(1320, 0.07, { delay: 0.05 }); },
  heal: () => [523, 659, 784].forEach((f, i) => tone(f, 0.08, { type: "triangle", delay: i * 0.06 })),
  descend: () => tone(600, 0.4, { type: "triangle", slide: -480, vol: 0.06 }),
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.12, { delay: i * 0.1 })),
  die: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, { type: "triangle", delay: i * 0.15 })),
  flee: () => tone(300, 0.25, { type: "triangle", slide: 400 }),
  shoot: () => { tone(900, 0.05, { type: "triangle", slide: -500, vol: 0.05 }); noise(0.04, 0.03); },
  chest: () => { tone(240, 0.06, { type: "square", vol: 0.04 }); tone(360, 0.08, { type: "triangle", delay: 0.05 }); },
  loot: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.09, { type: "square", vol: 0.045, delay: i * 0.07 })),
  explode: () => { noise(0.35, 0.12); tone(110, 0.35, { type: "sawtooth", slide: -70, vol: 0.08 }); },
  levelup: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.1, { type: "square", vol: 0.04, delay: i * 0.06 })),
  boss: () => [196, 185, 175, 165].forEach((f, i) => tone(f, 0.3, { type: "sawtooth", vol: 0.06, delay: i * 0.22 })),
  save: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.12, { type: "triangle", vol: 0.05, delay: i * 0.08 })),
  ui: () => tone(660, 0.04, { type: "triangle", vol: 0.04 }),
};

export function sfx(name) {
  if (muted || !SFX[name]) return;
  try { SFX[name](); } catch { /* audio unavailable */ }
}
