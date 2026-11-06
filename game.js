import {
  FLOORS, ACT, MOOD, MOOD_INFO, MONSTERS, REGULAR_KINDS, BOSS_NAMES, ITEM, STYLE, WEAPONS, ARMORS, SLINGS,
  SPECIAL_TEXT, BUFF_NAMES, BIOMES, CAVEIN_TURNS, PROGRESS_FIELDS,
  newRun, step, isOver, isOpen, score, playerStats, playerAtk, playerDef, slingDmg, biomeOf, isBossFloor,
  bossAlive, xpToLevel, fromProgress, progressOf, trapOut,
} from "./engine.js";
import { TILE, loadAtlas, recolor, rampFromSvg, drawFrame, has, iconStyle } from "./sprites.js";
import { sfx, toggleMute, isMuted } from "./audio.js";
import * as chain from "./chain.js";
import { EXPLORER } from "./config.js";

// ------------------------------------------------------------------ setup

const SCALE = 3;
const VW = 20; // viewport, in tiles
const VH = 13;
const TOP = 18; // HUD rows (low-res px) above and below the world
const BOTTOM = 18;
const LO_W = VW * TILE;
const VIEW_H = VH * TILE;
const STEP_MS = 95;

const $ = (id) => document.getElementById(id);
const screen = $("screen");
screen.width = LO_W * SCALE;
screen.height = (TOP + VIEW_H + BOTTOM) * SCALE;
const g = screen.getContext("2d");
const world = document.createElement("canvas");
world.width = LO_W; world.height = VIEW_H;
const w = world.getContext("2d");
const light = document.createElement("canvas");
light.width = LO_W; light.height = VIEW_H;
const lg = light.getContext("2d");
for (const c of [g, w, lg]) c.imageSmoothingEnabled = false;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const txLink = (h) => `<a target="_blank" rel="noopener" href="${EXPLORER}/tx/${h}">${h.slice(0, 10)}…</a>`;
const hexTape = (tape) => `0x${tape.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
const hexToBytes = (hex) => Array.from({ length: (hex.length - 2) / 2 }, (_, i) => parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16));
const hms = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}h ${String(m).padStart(2, "0")}m`; };
const hash3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// Per-biome look: ambient light, torch color, ambient particles, and which props glow.
const BIOME_FX = [
  { ambient: [46, 36, 34], torch: [255, 196, 128], part: { kind: "dust", color: [214, 180, 140] }, lights: {} },
  { ambient: [48, 30, 28], torch: [255, 176, 112], part: { kind: "dust", color: [222, 150, 120] }, lights: {} },
  { ambient: [24, 34, 52], torch: [214, 232, 255], part: { kind: "sparkle", color: [140, 240, 255] }, lights: { 0: [80, 230, 255], 1: [190, 120, 255] } },
  { ambient: [22, 38, 40], torch: [206, 255, 226], part: { kind: "spore", color: [110, 255, 210] }, lights: { 0: [80, 255, 210], 2: [150, 255, 210] } },
  { ambient: [38, 46, 62], torch: [224, 242, 255], part: { kind: "snow", color: [235, 245, 255] }, lights: { 3: [150, 225, 255] } },
  { ambient: [58, 22, 16], torch: [255, 156, 84], part: { kind: "ember", color: [255, 140, 50] }, lights: { 0: [255, 110, 30], 3: [255, 170, 90] } },
  { ambient: [32, 40, 32], torch: [255, 224, 168], part: { kind: "dust", color: [170, 200, 120] }, lights: {} },
  { ambient: [18, 12, 34], torch: [204, 176, 255], part: { kind: "mote", color: [190, 130, 255] }, lights: { 0: [180, 100, 255], 2: [220, 120, 255] } },
];
const BOSS_SPRITE = { 17: "boss_tabby", 18: "boss_weasel", 19: "boss_owl", 20: "boss_serpent", 21: "boss_fox", 22: "boss_emperor" };
const PROJ = { 3: "proj_web", 9: "proj_spit", 12: "proj_feather", 19: "proj_feather" };
const SLOT_ICON = { weapon: "wpn_", armor: "arm_", sling: "sl_" };

const app = {
  atlas: null, hero: null,
  mode: "title", // title | play | end | replay
  run: null, ranked: null, pending: [], cuts: [], chainTurn: 0,
  nft: null, squeeks: new Map(), token: null, season: null, mood: null,
  cam: { x: 0, y: 0 }, heroPos: { x: 0, y: 0 }, lunge: { x: 0, y: 0 }, squash: 1, facingLeft: false,
  enemyPos: [], enemyFlash: [], explored: null, seenBoss: false,
  fx: [], parts: [], texts: [], toasts: [], shake: 0, flash: 0, fade: 0, banner: null,
  lastInput: 0, queued: null, replay: null, aim: false, saving: false,
  title: null, spikeT0: 0,
};

// ------------------------------------------------------------ helpers

function spriteFor(kind, frame) {
  const name = kind >= REGULAR_KINDS ? BOSS_SPRITE[kind] : MONSTERS[kind].name;
  const n = `${name}_${frame}`;
  return has(app.atlas, n) ? n : `cat_${frame}`;
}
const visionRadius = (s) => (s.mood === MOOD.SNOOZE ? 3.8 : 5.8) + (s.vision ?? 0) * 0.8;
const visible = (s, x, y) => { const r = visionRadius(s); return (x - s.px) ** 2 + (y - s.py) ** 2 <= r * r; };
const chestName = (s, it) => (it.kind === ITEM.BOSS_CHEST || s.floor >= 80 ? "chest_gold" : s.floor >= 30 ? "chest_silver" : "chest");

const SPIKE_MS = 700;
function spikeNow(t) {
  return app.spikeT0 + (app.mode === "replay" ? app.replay?.i * SPIKE_MS : t);
}
function spikePhase(t) {
  return (spikeNow(t) / SPIKE_MS) % 6;
}
function drawSpike(t, x, y) {
  const p = spikePhase(t);
  const out = p >= 2 && p < 4;
  drawFrame(w, app.atlas, out ? "trap_spike_1" : "trap_spike_0", x * TILE, y * TILE);
}

function resetPresentation(snap = true) {
  const s = app.run;
  app.heroPos = { x: s.px * TILE, y: s.py * TILE };
  app.enemyPos = s.enemies.map((e) => ({ x: e.x * TILE, y: e.y * TILE }));
  app.enemyFlash = s.enemies.map(() => 0);
  app.explored = new Uint8Array(s.w * s.h);
  app.fx = [];
  app.parts = [];
  app.seenBoss = false;
  updateExplored();
  if (snap) { const c = camTarget(); app.cam = { ...c }; }
}

function updateExplored() {
  const s = app.run;
  const r = visionRadius(s);
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(s.py - r)); y <= Math.min(s.h - 1, Math.ceil(s.py + r)); y++) {
    for (let x = Math.max(0, Math.floor(s.px - r)); x <= Math.min(s.w - 1, Math.ceil(s.px + r)); x++) {
      if ((x - s.px) ** 2 + (y - s.py) ** 2 <= r2) app.explored[y * s.w + x] = 1;
    }
  }
  if (bossAlive(s) && visible(s, s.enemies[0].x, s.enemies[0].y)) app.seenBoss = true;
}

function camTarget() {
  const s = app.run;
  const mw = s.w * TILE;
  const mh = s.h * TILE;
  const hx = app.heroPos.x + 8;
  const hy = app.heroPos.y + 8;
  return { x: hx - LO_W / 2, y: hy - VIEW_H / 2, mw, mh };
}

function tileName(s, x, y) {
  const b = `b${biomeOf(s.floor)}_`;
  if (isOpen(s, x, y)) {
    if (x === s.stairs.x && y === s.stairs.y) return s.floor === FLOORS ? null : `${b}stairs`;
    const h = hash3(x, y, s.floor);
    const room = s.style !== STYLE.CAVE && isOpen(s, x - 1, y) && isOpen(s, x + 1, y) && isOpen(s, x, y - 1) && isOpen(s, x, y + 1);
    if (room) return `${b}room_${h % 2}`;
    const v = h % 10;
    return `${b}floor_${v < 6 ? 0 : v - 6}`;
  }
  return isOpen(s, x, y + 1) ? `${b}wall_face_${hash3(x, y, s.floor + 7) % 2}` : `${b}wall_top`;
}

function propAt(s, x, y) {
  if (!isOpen(s, x, y)) return -1;
  if ((x === s.start.x && y === s.start.y) || (x === s.stairs.x && y === s.stairs.y)) return -1;
  const h = hash3(x * 7 + 3, y * 13 + 1, s.floor);
  return h % 100 < 11 ? (h >>> 8) & 3 : -1;
}

// ---------------------------------------------------------------- particles

function burst(x, y, color, n, { speed = 0.9, life = 420, size = 1, glow = false, up = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random());
    app.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: life * (0.6 + Math.random() * 0.6), t: 0, color, size, glow, grav: 0.0025 });
  }
}

function ambientParticles(s, dt) {
  const fx = BIOME_FX[biomeOf(s.floor)].part;
  const rate = { dust: 0.03, sparkle: 0.05, spore: 0.05, snow: 0.08, ember: 0.07, mote: 0.05 }[fx.kind] ?? 0.03;
  if (Math.random() < rate * dt / 16) {
    const x = app.cam.x + Math.random() * LO_W;
    const y = app.cam.y + Math.random() * VIEW_H;
    const p = { x, y, vx: 0, vy: 0, life: 2600 + Math.random() * 2400, t: 0, color: fx.color, size: 1, glow: false, grav: 0, amb: fx.kind };
    if (fx.kind === "dust") { p.vx = (Math.random() - 0.5) * 0.05; p.vy = -0.01 - Math.random() * 0.02; }
    if (fx.kind === "spore") { p.vx = (Math.random() - 0.5) * 0.03; p.vy = -0.03 - Math.random() * 0.03; p.glow = true; }
    if (fx.kind === "ember") { p.y = app.cam.y + VIEW_H; p.vx = (Math.random() - 0.5) * 0.06; p.vy = -0.07 - Math.random() * 0.06; p.glow = true; p.life = 2200; }
    if (fx.kind === "snow") { p.y = app.cam.y - 4; p.vx = 0.02 + Math.random() * 0.03; p.vy = 0.04 + Math.random() * 0.03; }
    if (fx.kind === "sparkle") { p.life = 900; p.glow = true; }
    if (fx.kind === "mote") { p.vx = (Math.random() - 0.5) * 0.04; p.vy = (Math.random() - 0.5) * 0.04; p.glow = true; }
    app.parts.push(p);
  }
}

function updateParticles(dt) {
  app.parts = app.parts.filter((p) => {
    p.t += dt;
    p.vy += p.grav * dt;
    p.x += p.vx * dt / 16 * 1.6;
    p.y += p.vy * dt / 16 * 1.6;
    if (p.amb === "spore" || p.amb === "mote") p.vx += Math.sin((p.t + p.x * 40) / 400) * 0.0008 * dt;
    return p.t < p.life;
  });
  if (app.parts.length > 400) app.parts.splice(0, app.parts.length - 400);
}

// --------------------------------------------------------------- rendering

function drawWorld(s, t, { reveal = false, hero = true } = {}) {
  const A = app.atlas;
  const frame = Math.floor(t / 420) % 2;
  const fxb = BIOME_FX[biomeOf(s.floor)];
  const cx = Math.round(app.cam.x);
  const cy = Math.round(app.cam.y);
  w.setTransform(1, 0, 0, 1, 0, 0);
  w.fillStyle = "#07060a";
  w.fillRect(0, 0, LO_W, VIEW_H);
  w.setTransform(1, 0, 0, 1, -cx, -cy);
  const x0 = Math.max(0, Math.floor(cx / TILE));
  const y0 = Math.max(0, Math.floor(cy / TILE));
  const x1 = Math.min(s.w - 1, Math.ceil((cx + LO_W) / TILE));
  const y1 = Math.min(s.h - 1, Math.ceil((cy + VIEW_H) / TILE));
  const seen = (x, y) => reveal || app.explored[y * s.w + x];
  const lights = [];

  // Tiles, wall shading and props.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!seen(x, y)) continue;
    const name = tileName(s, x, y);
    if (name) drawFrame(w, A, name, x * TILE, y * TILE);
    else { drawFrame(w, A, `b${biomeOf(s.floor)}_floor_0`, x * TILE, y * TILE); drawFrame(w, A, `exit_${frame}`, x * TILE, y * TILE); lights.push({ x: x * 16 + 8, y: y * 16 + 8, r: 44, c: [255, 210, 90], a: 0.9 }); }
    if (!isOpen(s, x, y)) continue;
    if (!isOpen(s, x, y - 1)) { w.fillStyle = "rgba(0,0,0,0.38)"; w.fillRect(x * TILE, y * TILE, TILE, 3); w.fillStyle = "rgba(0,0,0,0.18)"; w.fillRect(x * TILE, y * TILE + 3, TILE, 3); }
    if (!isOpen(s, x - 1, y)) { w.fillStyle = "rgba(0,0,0,0.22)"; w.fillRect(x * TILE, y * TILE, 2, TILE); }
    if (!isOpen(s, x + 1, y)) { w.fillStyle = "rgba(0,0,0,0.16)"; w.fillRect(x * TILE + TILE - 2, y * TILE, 2, TILE); }
    const pi = propAt(s, x, y);
    if (pi >= 0) {
      drawFrame(w, A, `b${biomeOf(s.floor)}_prop_${pi}`, x * TILE, y * TILE);
      const lc = fxb.lights[pi];
      if (lc) lights.push({ x: x * 16 + 8, y: y * 16 + 9, r: 30 + (hash3(x, y, 9) % 10), c: lc, a: 0.8 + Math.sin(t / 500 + x) * 0.1 });
    }
    if (((x * 17 + y * 31 + s.floor) % 11) === 0 && A.frames.trap_spike_0) drawSpike(t, x, y);
    if (x === s.stairs.x && y === s.stairs.y) {
      if (bossAlive(s)) {
        drawFrame(w, A, "seal", x * TILE, y * TILE, { alpha: 0.75 + Math.sin(t / 200) * 0.25 });
        lights.push({ x: x * 16 + 8, y: y * 16 + 8, r: 28, c: [255, 70, 70], a: 0.8 });
      } else if (s.floor !== FLOORS) {
        lights.push({ x: x * 16 + 8, y: y * 16 + 8, r: 20, c: [255, 220, 150], a: 0.35 });
      }
    }
  }

  const vis = (x, y) => reveal || visible(s, x, y);
  // Items.
  for (const it of s.items) {
    if (it.taken || !vis(it.x, it.y)) continue;
    const px = it.x * TILE;
    const py = it.y * TILE;
    w.fillStyle = "rgba(0,0,0,0.3)";
    w.fillRect(px + 4, py + 13, 8, 2);
    if (it.kind === ITEM.CHEST || it.kind === ITEM.BOSS_CHEST) {
      const n = chestName(s, it);
      drawFrame(w, A, n, px, py);
      lights.push({ x: px + 8, y: py + 8, r: it.kind === ITEM.BOSS_CHEST ? 30 : 18, c: [255, 210, 110], a: 0.45 + Math.sin(t / 300 + it.x) * 0.15 });
    } else {
      const bob = Math.round(Math.sin(t / 260 + it.x) * 1);
      drawFrame(w, A, it.kind === ITEM.SEED ? "seed" : "cheese", px, py + bob);
      if (it.kind === ITEM.SEED) lights.push({ x: px + 8, y: py + 8, r: 10, c: [255, 220, 120], a: 0.25 });
    }
  }

  // Monsters.
  s.enemies.forEach((e, i) => {
    const p = app.enemyPos[i];
    if (!e.alive || !p || !vis(e.x, e.y)) return;
    const boss = e.kind >= REGULAR_KINDS;
    const flash = app.enemyFlash[i] > 0 && Math.floor(t / 60) % 2 === 0;
    const flip = p.x > app.heroPos.x;
    const ox = boss ? -4 : 0;
    const oy = boss ? -8 : 0;
    w.fillStyle = "rgba(0,0,0,0.35)";
    w.beginPath(); w.ellipse(p.x + 8, p.y + 14, boss ? 9 : 6, 2.5, 0, 0, Math.PI * 2); w.fill();
    if (boss && e.hp * 3 < e.maxHp) lights.push({ x: p.x + 8, y: p.y + 6, r: 34, c: [255, 40, 40], a: 0.6 + Math.sin(t / 120) * 0.2 });
    drawFrame(w, A, spriteFor(e.kind, frame), p.x + ox, p.y + oy, { flip, alpha: flash ? 0.4 : 1 });
    if (e.beh === 4) lights.push({ x: p.x + 8, y: p.y + 10, r: 12, c: [255, 120, 40], a: 0.5 + Math.sin(t / 90) * 0.2 });
    if (e.hp < e.maxHp && !boss) {
      w.fillStyle = "#1a0b10"; w.fillRect(p.x + 2, p.y - 3, 12, 2);
      w.fillStyle = "#ff5a6a"; w.fillRect(p.x + 2, p.y - 3, Math.max(1, Math.ceil(12 * e.hp / e.maxHp)), 2);
    }
  });

  // Hero, and the torch it carries (the title screen keeps the torch but hides the hero).
  const hx = app.heroPos.x + app.lunge.x;
  const hy = app.heroPos.y + app.lunge.y;
  if (hero) {
    w.fillStyle = "rgba(0,0,0,0.35)";
    w.beginPath(); w.ellipse(hx + 8, hy + 14, 6, 2.5, 0, 0, Math.PI * 2); w.fill();
    if (app.mode === "end" && s.dead) drawFrame(w, A, "grave", app.heroPos.x, app.heroPos.y);
    else drawFrame(w, A, `hero_${frame}`, hx, hy, { flip: app.facingLeft, src: app.hero?.[`hero_${frame}`], scaleY: app.squash });
  }
  const fl = Math.sin(t / 90) * 2 + Math.sin(t / 37) * 1.2;
  lights.push({ x: hx + 8, y: hy + 6, r: (reveal ? 9 : visionRadius(s)) * TILE + fl, c: fxb.torch, a: 1, torch: true });

  // Effects and particles.
  for (const f of app.fx) {
    if (f.proj) {
      const k = Math.min(1, f.t / f.life);
      const x = f.fx + (f.x - f.fx) * k;
      const y = f.fy + (f.y - f.fy) * k;
      drawFrame(w, A, f.proj, x + (f.proj === "pebble" ? 0 : 4), y + (f.proj === "pebble" ? 0 : 4));
      lights.push({ x: x + 8, y: y + 8, r: 14, c: f.c ?? [255, 230, 160], a: 0.6 });
    } else {
      const n = Math.min(f.frames - 1, Math.floor((f.t / f.life) * f.frames));
      drawFrame(w, A, `${f.kind}_${n}`, f.x, f.y);
      if (f.kind === "explosion") lights.push({ x: f.x + 8, y: f.y + 8, r: 48 * (1 - f.t / f.life) + 10, c: [255, 140, 50], a: 1 });
      if (f.kind === "levelup") lights.push({ x: f.x + 8, y: f.y + 8, r: 40, c: [255, 230, 120], a: 0.8 });
    }
  }
  for (const p of app.parts) {
    if (!reveal && !app.explored[Math.floor(p.y / 16) * s.w + Math.floor(p.x / 16)]) continue;
    const a = Math.min(1, (p.life - p.t) / 400) * (p.amb === "sparkle" ? Math.abs(Math.sin(p.t / 120)) : 1);
    w.fillStyle = rgba(p.color, a);
    w.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    if (p.glow && a > 0.3) lights.push({ x: p.x, y: p.y, r: 6, c: p.color, a: a * 0.5 });
  }

  // Lighting: multiply a light map over the scene, then add a soft glow pass.
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalCompositeOperation = "source-over";
  lg.fillStyle = rgba(fxb.ambient, 1);
  lg.fillRect(0, 0, LO_W, VIEW_H);
  lg.setTransform(1, 0, 0, 1, -cx, -cy);
  lg.globalCompositeOperation = "lighter";
  for (const L of lights) {
    const grd = lg.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    grd.addColorStop(0, rgba(L.c, L.a));
    grd.addColorStop(L.torch ? 0.55 : 0.35, rgba(L.c, L.a * (L.torch ? 0.75 : 0.4)));
    grd.addColorStop(1, rgba(L.c, 0));
    lg.fillStyle = grd;
    lg.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
  }
  w.setTransform(1, 0, 0, 1, 0, 0);
  w.globalCompositeOperation = "multiply";
  w.drawImage(light, 0, 0);
  w.globalCompositeOperation = "lighter";
  w.globalAlpha = 0.16;
  w.drawImage(light, 0, 0);
  w.globalAlpha = 1;
  w.globalCompositeOperation = "source-over";
}

function icon(name, x, y, scale = SCALE, alpha = 1) {
  const f = app.atlas.frames[name];
  if (!f) return;
  g.globalAlpha = alpha;
  g.drawImage(f.img, f.frame.x, f.frame.y, f.frame.w, f.frame.h, Math.round(x), Math.round(y), f.frame.w * scale, f.frame.h * scale);
  g.globalAlpha = 1;
}

function text(str, x, y, { color = "#f3e6c8", size = 12, align = "left", shadow = true } = {}) {
  g.font = `${size}px "Press Start 2P", monospace`;
  g.textAlign = align;
  g.textBaseline = "top";
  if (shadow) { g.fillStyle = "#000"; g.fillText(str, x + 2, y + 2); }
  g.fillStyle = color;
  g.fillText(str, x, y);
  g.textAlign = "left";
}

function bar(x, y, wdt, h, frac, c1, c2, label) {
  g.fillStyle = "#0b0a0f"; g.fillRect(x - 3, y - 3, wdt + 6, h + 6);
  g.fillStyle = "#2a2333"; g.fillRect(x, y, wdt, h);
  const grd = g.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, c1); grd.addColorStop(1, c2);
  g.fillStyle = grd; g.fillRect(x, y, Math.max(0, Math.min(1, frac)) * wdt, h);
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x, y, Math.max(0, Math.min(1, frac)) * wdt, 2);
  if (label) text(label, x + wdt / 2, y + (h - 10) / 2 + 1, { size: 10, align: "center" });
}

function drawHud(s, t) {
  const A = app.atlas;
  const H = screen.height;
  const top = TOP * SCALE;
  const by = (TOP + VIEW_H) * SCALE;
  g.fillStyle = "#0e0c13"; g.fillRect(0, 0, screen.width, top); g.fillRect(0, by, screen.width, H - by);
  g.fillStyle = "#2b2438"; g.fillRect(0, top - 3, screen.width, 3); g.fillRect(0, by, screen.width, 3);

  // Top: HP, XP, floor, seeds, kills.
  bar(14, 9, 250, 16, s.hp / s.maxHp, "#ff6b7a", "#b5223a", `HP ${s.hp}/${s.maxHp}`);
  bar(14, 33, 250, 8, s.xp / xpToLevel(s.lvl), "#8fd3ff", "#3a6fd8");
  icon("icon_lvl", 272, 28, 2);
  text(`LV ${s.lvl}`, 292, 30, { size: 10, color: "#8fd3ff" });
  const boss = isBossFloor(s.floor);
  text(`B${s.floor}`, 350, 10, { size: 18, color: boss ? "#ff7a7a" : "#F5C451" });
  text(`${BIOMES[biomeOf(s.floor)].toUpperCase()}${boss ? " · BOSS" : ""}`, 350, 34, { size: 9, color: "#a89fb8" });
  icon("icon_seed", 640, 12, 3);
  text(`${s.gold}`, 670, 16, { size: 14, color: "#F5C451" });
  icon("icon_skull", 790, 12, 3);
  text(`${s.kills}`, 820, 16, { size: 14 });
  const mi = MOOD_INFO[s.mood];
  text(mi.emoji, 925, 12, { size: 18, shadow: false });

  // Bottom: gear and stats.
  const y = by + 12;
  const slot = (name, x, val, label, color) => {
    g.fillStyle = "#1d1827"; g.fillRect(x, y - 4, 44, 44);
    g.strokeStyle = "#3a3248"; g.lineWidth = 2; g.strokeRect(x, y - 4, 44, 44);
    if (A.frames[name]) icon(name, x - 2, y - 6, 3);
    text(val, x + 52, y + 2, { size: 13, color });
    text(label, x + 52, y + 22, { size: 7, color: "#8f86a3" });
  };
  const wpn = WEAPONS[s.weapon];
  const arm = ARMORS[s.armor];
  const sl = SLINGS[s.sling];
  slot(`wpn_${s.weapon}`, 12, `${playerAtk(s)}`, wpn.name.toUpperCase(), "#ffd2a0");
  slot(`arm_${s.armor}`, 210, `${playerDef(s)}`, arm.name.toUpperCase(), "#9fc6ff");
  slot(`sl_${s.sling}`, 408, `${slingDmg(s)}×${s.pebbles}`, sl.name.toUpperCase(), s.pebbles ? "#f3e6c8" : "#ff7a7a");
  const stats = [["icon_crit", `${s.crit}%`, "#ffe08a"], ["icon_luck", `+${s.luck}`, "#d7d0ff"], ["swiftpaw", `${s.dodge}%`, "#bdf5c9"], ["leechfang", `${s.leech}`, "#ff9db0"], ["wheelspirit", `+${s.regen}`, "#ffe9a8"], ["seedmagnet", `${s.goldPct}%`, "#F5C451"]];
  stats.forEach(([n, v, c], i) => {
    const x = 505 + i * 70;
    icon(n, x, y + (n.startsWith("icon") ? 6 : -2), n.startsWith("icon") ? 3 : 2);
    text(v, x + 34, y + 10, { size: 10, color: c });
  });

  // Status line over the world: cave-in warning, unsaved floors.
  const left = CAVEIN_TURNS - s.floorTurn;
  if (!isOver(s) && left < 60) text(left > 0 ? `CAVE-IN IN ${left}` : "THE BURROW IS COLLAPSING!", screen.width / 2, top + 10, { size: 12, align: "center", color: left > 20 ? "#ffcf7a" : "#ff5a6a" });
  if (app.ranked && app.cuts.length && app.mode === "play") text(`${app.cuts.length} FLOOR${app.cuts.length > 1 ? "S" : ""} NOT SAVED · PRESS C`, 14, by - 26, { size: 9, color: "#F5C451" });
  if (app.aim) text("AIM: PICK A DIRECTION", screen.width / 2, by - 26, { size: 10, align: "center", color: "#ffe08a" });

  // Boss bar.
  if (bossAlive(s) && app.seenBoss) {
    const e = s.enemies[0];
    const name = BOSS_NAMES[e.kind].toUpperCase();
    const enraged = e.hp * 3 < e.maxHp;
    text(name + (enraged ? " · ENRAGED" : ""), screen.width / 2, top + 30, { size: 12, align: "center", color: enraged ? "#ff5a6a" : "#ffd2a0" });
    bar(screen.width / 2 - 230, top + 50, 460, 12, e.hp / e.maxHp, enraged ? "#ff5a3a" : "#e0a040", enraged ? "#8a1010" : "#8a4a10");
  }
  drawMinimap(s, t);
}

function drawMinimap(s, t) {
  const cell = s.w > 30 ? 3 : 4;
  const mw = s.w * cell;
  const mh = s.h * cell;
  const x0 = screen.width - mw - 14;
  const y0 = TOP * SCALE + 12;
  g.fillStyle = "rgba(8,6,12,0.62)";
  g.fillRect(x0 - 6, y0 - 6, mw + 12, mh + 12);
  g.strokeStyle = "rgba(245,196,81,0.35)"; g.lineWidth = 2; g.strokeRect(x0 - 6, y0 - 6, mw + 12, mh + 12);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (!app.explored[y * s.w + x] || !isOpen(s, x, y)) continue;
    g.fillStyle = visible(s, x, y) ? "#8a7d72" : "#4a4250";
    g.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
  }
  for (const it of s.items) {
    if (it.taken || !app.explored[it.y * s.w + it.x] || it.kind < ITEM.CHEST) continue;
    g.fillStyle = "#F5C451"; g.fillRect(x0 + it.x * cell, y0 + it.y * cell, cell, cell);
  }
  if (app.explored[s.stairs.y * s.w + s.stairs.x]) {
    g.fillStyle = bossAlive(s) ? "#ff4a4a" : "#7fe0ff";
    g.fillRect(x0 + s.stairs.x * cell - 1, y0 + s.stairs.y * cell - 1, cell + 2, cell + 2);
  }
  for (const e of s.enemies) {
    if (!e.alive || !visible(s, e.x, e.y)) continue;
    g.fillStyle = e.kind >= REGULAR_KINDS ? "#ff40ff" : "#ff5a5a";
    g.fillRect(x0 + e.x * cell, y0 + e.y * cell, cell, cell);
  }
  if (Math.floor(t / 300) % 2 === 0) { g.fillStyle = "#ffffff"; g.fillRect(x0 + s.px * cell - 1, y0 + s.py * cell - 1, cell + 2, cell + 2); }
}

function drawTexts() {
  for (const tx of app.texts) {
    const a = Math.max(0, 1 - tx.t / 950);
    g.globalAlpha = a;
    const x = (tx.x + 8 - app.cam.x) * SCALE;
    const y = (TOP + tx.y - app.cam.y - tx.t / 40) * SCALE;
    text(tx.text, x, y, { size: tx.big ? 16 : 11, align: "center", color: tx.color });
  }
  g.globalAlpha = 1;
  let y = (TOP + VIEW_H) * SCALE - 40;
  for (const t of app.toasts.slice(-3).reverse()) {
    const a = Math.min(1, t.t < 200 ? t.t / 200 : (t.life - t.t) / 300);
    g.globalAlpha = Math.max(0, a);
    g.font = '12px "Press Start 2P", monospace';
    const tw = Math.max(g.measureText(t.text).width, g.measureText(t.sub ?? "").width * 0.75);
    g.fillStyle = "rgba(11,10,15,0.88)"; g.fillRect(12, y - 58, tw + 84, 56);
    g.strokeStyle = t.color; g.lineWidth = 3; g.strokeRect(12, y - 58, tw + 84, 56);
    icon(t.icon, 20, y - 54, 3, Math.max(0, a));
    text(t.text, 74, y - 48, { size: 12, color: t.color });
    text(t.sub ?? "", 74, y - 26, { size: 9, color: "#c9bfa6" });
    y -= 62;
  }
  g.globalAlpha = 1;
}

function drawBanner() {
  const b = app.banner;
  if (!b) return;
  const a = Math.min(1, b.t < 300 ? b.t / 300 : (b.life - b.t) / 300);
  g.globalAlpha = Math.max(0, a);
  const cy = screen.height / 2 - 40;
  g.fillStyle = b.boss ? "rgba(40,6,10,0.85)" : "rgba(11,10,15,0.78)";
  g.fillRect(0, cy - 50, screen.width, 110);
  g.fillStyle = b.boss ? "#ff4a4a" : "#F5C451";
  g.fillRect(0, cy - 50, screen.width, 3); g.fillRect(0, cy + 57, screen.width, 3);
  text(b.text, screen.width / 2, cy - 30, { size: 30, align: "center", color: b.boss ? "#ff6b6b" : "#F5C451" });
  text(b.sub ?? "", screen.width / 2, cy + 20, { size: 12, align: "center" });
  g.globalAlpha = 1;
}

function compose(s, t) {
  const sx = app.shake ? (Math.random() - 0.5) * app.shake / 20 : 0;
  const sy = app.shake ? (Math.random() - 0.5) * app.shake / 20 : 0;
  g.fillStyle = "#07060a";
  g.fillRect(0, 0, screen.width, screen.height);
  g.drawImage(world, 0, 0, LO_W, VIEW_H, Math.round(sx), TOP * SCALE + Math.round(sy), LO_W * SCALE, VIEW_H * SCALE);
  // Vignette.
  const vg = g.createRadialGradient(screen.width / 2, screen.height / 2, screen.height * 0.35, screen.width / 2, screen.height / 2, screen.height * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vg; g.fillRect(0, TOP * SCALE, screen.width, VIEW_H * SCALE);
  if (s) drawHud(s, t);
  drawTexts();
  if (app.flash) { g.fillStyle = `rgba(200,30,40,${app.flash / 700})`; g.fillRect(0, 0, screen.width, screen.height); }
  if (app.fade) { g.fillStyle = `rgba(7,6,10,${Math.min(1, app.fade / 300)})`; g.fillRect(0, 0, screen.width, screen.height); }
  drawBanner();
}

// ------------------------------------------------------------------ title

function titleScene() {
  const biome = Math.floor(Math.random() * 8);
  const floor = 1 + biome * 10 + 3 + Math.floor(Math.random() * 5);
  const seed = randomSeed();
  const s = fromProgress(seed, MOOD.POTTER, { ...progressOf(newRun(seed, 5, MOOD.POTTER)), floor });
  return { s, t0: performance.now() };
}

function drawTitle(t) {
  if (!app.title || t - app.title.t0 > 9000) app.title = titleScene();
  const s = app.title.s;
  app.run = s;
  if (!app.explored || app.explored.length !== s.w * s.h || app.title.fresh !== s) {
    app.title.fresh = s;
    resetPresentation();
  }
  const k = (t - app.title.t0) / 9000;
  const mw = s.w * TILE;
  const mh = s.h * TILE;
  app.cam.x = Math.max(0, mw - LO_W) * (0.5 + 0.5 * Math.sin(k * Math.PI - Math.PI / 2));
  app.cam.y = Math.max(0, mh - VIEW_H) * (0.5 + 0.35 * Math.sin(k * Math.PI * 2));
  app.heroPos = { x: app.cam.x + LO_W / 2 - 8, y: app.cam.y + VIEW_H / 2 - 8 };
  s.px = Math.round(app.heroPos.x / TILE);
  s.py = Math.round(app.heroPos.y / TILE);
  ambientParticles(s, 16);
  drawWorld(s, t, { reveal: true, hero: false });
  app.run = null;
  compose(null, t);
  const fadeIn = Math.min(1, (t - app.title.t0) / 600);
  const fadeOut = Math.min(1, (9000 - (t - app.title.t0)) / 600);
  g.fillStyle = `rgba(7,6,10,${1 - Math.min(fadeIn, fadeOut)})`;
  g.fillRect(0, TOP * SCALE, screen.width, VIEW_H * SCALE);
  g.fillStyle = "rgba(7,6,10,0.45)"; g.fillRect(0, 120, screen.width, 210);
  text("SQUEEKHOLM", screen.width / 2 + 5, 150, { size: 52, align: "center", color: "#3a2a14", shadow: false });
  text("SQUEEKHOLM", screen.width / 2, 145, { size: 52, align: "center", color: "#F5C451" });
  text(`200 FLOORS · 23 MONSTERS · 6 BOSSES · 40+ ITEMS`, screen.width / 2, 222, { size: 12, align: "center" });
  text(`NOW SHOWING: ${BIOMES[biomeOf(s.floor)].toUpperCase()}`, screen.width / 2, 250, { size: 10, align: "center", color: "#a89fb8" });
  const frame = Math.floor(t / 420) % 2;
  ["hero", "beetle", "rat", "spider", "bat", "fireant", "scorpion", "toad", "slime", "owl", "golem", "wraith"].forEach((n, i) => {
    const x = 120 + i * 62;
    const y = 290 + Math.round(Math.sin(t / 300 + i) * 3);
    if (n === "hero" && app.hero?.[`hero_${frame}`]) g.drawImage(app.hero[`hero_${frame}`], x, y, 48, 48);
    else icon(`${n}_${frame}`, x, y, 3);
  });
  if (Math.floor(t / 600) % 2 === 0) text("ENTER: PRACTICE  ·  R: RANKED RUN", screen.width / 2, screen.height - 110, { size: 13, align: "center", color: "#F5C451" });
}

// ---------------------------------------------------------------- loop

let last = performance.now();
function frame(t) {
  const dt = Math.min(50, t - last);
  last = t;
  app.fx = app.fx.filter((f) => (f.t += dt) < f.life);
  app.texts = app.texts.filter((x) => (x.t += dt) < 950);
  app.toasts = app.toasts.filter((x) => (x.t += dt) < x.life);
  if (app.banner && (app.banner.t += dt) > app.banner.life) app.banner = null;
  app.shake = Math.max(0, app.shake - dt);
  app.flash = Math.max(0, app.flash - dt);
  app.fade = Math.max(0, app.fade - dt);
  updateParticles(dt);
  if (app.mode === "title" || !app.run) {
    drawTitle(t);
    requestAnimationFrame(frame);
    return;
  }
  const s = app.run;
  const k = Math.min(1, dt * 0.02);
  app.heroPos.x += (s.px * TILE - app.heroPos.x) * k;
  app.heroPos.y += (s.py * TILE - app.heroPos.y) * k;
  app.lunge.x *= 0.75; app.lunge.y *= 0.75;
  app.squash += (1 - app.squash) * 0.25;
  while (app.enemyPos.length < s.enemies.length) { app.enemyPos.push({ x: 0, y: 0 }); app.enemyFlash.push(0); }
  s.enemies.forEach((e, i) => {
    const p = app.enemyPos[i];
    p.x += (e.x * TILE - p.x) * k;
    p.y += (e.y * TILE - p.y) * k;
    app.enemyFlash[i] = Math.max(0, app.enemyFlash[i] - dt);
  });
  const ct = camTarget();
  app.cam.x = ct.x;
  app.cam.y = ct.y;
  ambientParticles(s, dt);
  drawWorld(s, t);
  compose(s, t);
  if (app.mode === "replay") {
    g.fillStyle = "rgba(11,10,15,0.8)"; g.fillRect(0, (TOP + VIEW_H) * SCALE - 44, screen.width, 40);
    text(`REPLAY · SQUEEK #${app.replay.tokenId} · RUN ${app.replay.runId} · ${app.replay.speed}× (+/-) · ESC`, 14, (TOP + VIEW_H) * SCALE - 32, { size: 10, color: "#F5C451" });
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ play

function toast(iconName, txt, sub, color = "#F5C451") { app.toasts.push({ icon: iconName, text: txt, sub, color, t: 0, life: 2800 }); }

const LOOT_SUB = {
  weapon: (s) => `ATK ${playerAtk(s)}${WEAPONS[s.weapon].special ? " · " + SPECIAL_TEXT[WEAPONS[s.weapon].special].toUpperCase() : ""}`,
  armor: (s) => `DEF ${playerDef(s)}: BLOCKS ${playerDef(s)} PER HIT`,
  sling: (s) => `SHOT ${slingDmg(s)} DMG · RANGE ${SLINGS[s.sling].range}`,
  pouch: (s) => `PEBBLES: ${s.pebbles}`,
  vitamin: (s) => `MAX HP ${s.maxHp}`,
  clover: (s) => `CRIT CHANCE ${s.crit}%`,
  whisker: (s) => `EVERY SEED +${s.luck}`,
  bigcheese: () => "FULLY HEALED",
  sunflower: (s) => `BASE ATTACK UP · ATK ${playerAtk(s)}`,
  ironfur: (s) => `DEF ${playerDef(s)}`,
  nighteye: () => "SEE FARTHER IN THE DARK · +2 PEBBLES",
  wheelspirit: (s) => `HEAL +${s.regen} EXTRA ON EVERY STAIRWAY`,
  leechfang: (s) => `HEAL ${s.leech} ON EVERY STRIKE`,
  seedmagnet: (s) => `SEEDS +${s.goldPct}%`,
  swiftpaw: (s) => `DODGE CHANCE ${s.dodge}%`,
};

function applyEvents(ev) {
  const s = app.run;
  for (const e of ev) {
    switch (e.t) {
      case "face": if (e.dir === 1) app.facingLeft = false; if (e.dir === 3) app.facingLeft = true; break;
      case "move": sfx("step"); app.squash = 0.85; break;
      case "bump": sfx("bump"); break;
      case "attack":
        sfx("attack");
        app.lunge = { x: (e.x - s.px) * 6, y: (e.y - s.py) * 6 };
        break;
      case "shot":
        sfx("shoot");
        app.fx.push({ proj: s.sling >= 5 ? "proj_star" : "pebble", fx: e.fx * TILE, fy: e.fy * TILE, x: e.x * TILE, y: e.y * TILE, t: 0, life: 150 });
        break;
      case "eshot":
        sfx("shoot");
        app.fx.push({ proj: PROJ[e.kind] ?? "proj_fire", fx: e.fx * TILE, fy: e.fy * TILE, x: e.x * TILE, y: e.y * TILE, t: 0, life: 170, c: [255, 160, 120] });
        break;
      case "empty":
        sfx("bump");
        app.texts.push({ text: "NO PEBBLES", x: s.px * TILE, y: s.py * TILE - 4, color: "#ff7a7a", t: 0 });
        break;
      case "hit":
        app.fx.push({ kind: "hit", frames: 3, x: e.x * TILE, y: e.y * TILE, t: 0, life: 210 });
        app.enemyFlash[e.i] = 300;
        burst(e.x * TILE + 8, e.y * TILE + 8, e.crit ? [255, 230, 120] : [255, 255, 255], e.crit ? 10 : 5, { speed: 1.2, life: 300 });
        app.texts.push({ text: e.crit ? `CRIT ${e.dmg}!` : `-${e.dmg}`, x: e.x * TILE, y: e.y * TILE, color: e.crit ? "#ffe08a" : "#ffffff", t: 0, big: e.crit });
        if (e.crit) app.shake = 140;
        break;
      case "kill":
        sfx(e.kind >= REGULAR_KINDS ? "win" : "kill");
        app.fx.push({ kind: "poof", frames: 2, x: e.x * TILE, y: e.y * TILE, t: 0, life: 360 });
        burst(e.x * TILE + 8, e.y * TILE + 8, [200, 190, 180], 8, { speed: 0.8, life: 500 });
        app.texts.push({ text: `+${e.value}`, x: e.x * TILE, y: e.y * TILE - 10, color: "#9be27a", t: 0 });
        if (e.kind >= REGULAR_KINDS) {
          app.shake = 500; app.flash = 0;
          app.banner = { text: `${BOSS_NAMES[e.kind].toUpperCase()} FALLS!`, sub: s.floor === FLOORS ? "THE GOLDEN WHEEL AWAITS" : "THE SEAL BREAKS · A BOSS CHEST DROPS", t: 0, life: 2400 };
          burst(e.x * TILE + 8, e.y * TILE + 8, [255, 210, 90], 40, { speed: 1.8, life: 900, glow: true });
          if (app.ranked) setTimeout(() => toast("icon_key", "BOSS DOWN!", "PRESS C TO SAVE YOUR PROGRESS ONCHAIN"), 2500);
        }
        break;
      case "drop":
        app.fx.push({ kind: "sparkle", frames: 2, x: e.x * TILE, y: e.y * TILE, t: 0, life: 500 });
        break;
      case "seed":
        sfx("seed");
        burst(e.x * TILE + 8, e.y * TILE + 8, [255, 214, 90], 6, { speed: 0.7, life: 450, glow: true, up: 0.3 });
        app.texts.push({ text: `+${e.value}`, x: e.x * TILE, y: e.y * TILE, color: "#F5C451", t: 0 });
        break;
      case "heal":
        sfx("heal");
        app.fx.push({ kind: "heal", frames: 2, x: e.x * TILE, y: e.y * TILE, t: 0, life: 500 });
        app.texts.push({ text: `+${e.value}HP`, x: e.x * TILE, y: e.y * TILE, color: "#ff9db0", t: 0 });
        break;
      case "leech":
        app.texts.push({ text: `+${e.value}`, x: s.px * TILE, y: s.py * TILE - 6, color: "#ff9db0", t: 0 });
        break;
      case "chest":
        sfx("chest");
        burst(e.x * TILE + 8, e.y * TILE + 8, [255, 220, 120], e.boss ? 30 : 12, { speed: 1.2, life: 700, glow: true, up: 0.4 });
        break;
      case "loot": {
        sfx("loot");
        const ic = SLOT_ICON[e.slot] ? `${SLOT_ICON[e.slot]}${e.tier}` : e.slot;
        toast(ic, e.name.toUpperCase(), LOOT_SUB[e.slot](s), SLOT_ICON[e.slot] && e.tier >= 10 ? "#ff9cff" : "#F5C451");
        break;
      }
      case "salvage":
        sfx("seed");
        toast(`${SLOT_ICON[e.slot]}${e.tier}`, e.name.toUpperCase(), `NOT BETTER · SALVAGED FOR ${e.value} SEEDS`, "#a89f8a");
        break;
      case "levelup":
        sfx("levelup");
        app.fx.push({ kind: "levelup", frames: 3, x: s.px * TILE, y: s.py * TILE - 4, t: 0, life: 700 });
        burst(s.px * TILE + 8, s.py * TILE + 8, [255, 230, 120], 18, { speed: 1, life: 800, glow: true, up: 0.5 });
        app.texts.push({ text: `LEVEL ${e.lvl}!`, x: s.px * TILE, y: s.py * TILE - 14, color: "#8fd3ff", t: 0, big: true });
        break;
      case "explode":
        sfx("explode");
        app.fx.push({ kind: "explosion", frames: 4, x: e.x * TILE, y: e.y * TILE, t: 0, life: 480 });
        burst(e.x * TILE + 8, e.y * TILE + 8, [255, 140, 50], 24, { speed: 1.6, life: 700, glow: true });
        app.shake = 380;
        break;
      case "miss":
        app.texts.push({ text: "DODGE!", x: s.px * TILE, y: s.py * TILE - 6, color: "#bdf5c9", t: 0 });
        break;
      case "hurt":
        sfx("hurt");
        app.shake = 220; app.flash = 260;
        burst(s.px * TILE + 8, s.py * TILE + 8, [255, 80, 90], 6, { speed: 1, life: 350 });
        app.texts.push({ text: `-${e.dmg}`, x: s.px * TILE, y: s.py * TILE, color: "#ff5a6a", t: 0 });
        break;
      case "cavein":
        sfx("hurt");
        app.shake = 300;
        burst(s.px * TILE + 8, s.py * TILE - 6, [150, 120, 100], 10, { speed: 0.6, life: 600 });
        app.texts.push({ text: `ROCKS -${e.dmg}`, x: s.px * TILE, y: s.py * TILE - 4, color: "#d9b38c", t: 0 });
        break;
      case "locked":
        sfx("bump");
        toast("icon_chain", "THE STAIRS ARE SEALED", `DEFEAT ${BOSS_NAMES[s.enemies[0].kind].toUpperCase()} FIRST`, "#ff9db0");
        break;
      case "descend":
        sfx(isBossFloor(e.floor) ? "boss" : "descend");
        app.fade = 450;
        resetPresentation();
        floorBanner();
        if (e.heal) app.texts.push({ text: `REST +${e.heal}HP`, x: s.px * TILE, y: s.py * TILE - 8, color: "#ff9db0", t: 0 });
        break;
      case "win": sfx("win"); break;
      case "die": sfx("die"); app.shake = 500; break;
      case "flee": sfx("flee"); break;
      default: break;
    }
  }
  updateExplored();
}

function floorBanner() {
  const s = app.run;
  if (isBossFloor(s.floor)) {
    const kind = s.enemies[0]?.kind;
    app.banner = { boss: true, text: s.floor === FLOORS ? "THE FINAL FLOOR" : `BOSS FLOOR ${s.floor}`, sub: kind >= REGULAR_KINDS ? `${BOSS_NAMES[kind].toUpperCase()} GUARDS THE STAIRS` : "", t: 0, life: 2300 };
  } else {
    const st = ["CAVERN", "BURROW ROOMS", "WARREN"][s.style];
    app.banner = { text: `FLOOR ${s.floor}`, sub: `${BIOMES[biomeOf(s.floor)].toUpperCase()} · ${st} · ${s.w}×${s.h}`, t: 0, life: 1700 };
  }
}

function doAction(a) {
  const s = app.run;
  if (!s || isOver(s)) return;
  s.spikePhase = spikePhase(performance.now());
  const ev = step(s, a);
  applyEvents(ev);
  if (app.ranked && app.mode === "play") {
    app.pending.push(a);
    if (s.boundary) app.cuts.push(app.pending.length);
    saveLocal();
  }
  if (isOver(s)) setTimeout(() => endRun(), app.mode === "replay" ? 1500 : 800);
}

function beginRun(seed, level, mood, ranked = null) {
  app.run = newRun(seed, level, mood);
  app.ranked = ranked;
  app.pending = [];
  app.cuts = [];
  app.chainTurn = 0;
  app.spikeT0 = (seed >>> 0) % (SPIKE_MS * 6);
  app.mode = "play";
  app.facingLeft = false;
  app.toasts = [];
  app.texts = [];
  resetPresentation();
  hideOverlay();
  floorBanner();
  app.banner.sub = `${MOOD_INFO[mood].emoji} ${MOOD_INFO[mood].name.toUpperCase()} BURROW · ${ranked ? `RANKED RUN ${ranked.runId}` : "PRACTICE"}`;
  sfx("descend");
  screen.focus();
}

function startPractice() {
  const sq = app.token ? app.squeeks.get(app.token) : null;
  beginRun(randomSeed(), sq?.level ?? 1, app.mood ?? MOOD.POTTER, null);
  // ?practiceFloor=N starts practice deeper (with matching gear), to preview later biomes.
  const deep = Number(new URLSearchParams(location.search).get("practiceFloor"));
  if (deep > 1 && deep <= FLOORS) {
    const s = app.run;
    const k = Math.floor(deep / 10);
    app.run = fromProgress(s.seed, s.mood, {
      ...progressOf(s), floor: deep, lvl: 1 + k * 3, maxHp: s.maxHp + deep * 4, hp: s.maxHp + deep * 4,
      atk: s.atk + k * 3, weapon: Math.min(15, Math.floor(deep / 8)), armor: Math.min(11, Math.floor(deep / 10)),
      sling: Math.min(7, Math.floor(deep / 14)), pebbles: 20, crit: 15,
    });
    resetPresentation();
    floorBanner();
  }
}

async function startRanked() {
  const sq = app.token ? app.squeeks.get(app.token) : null;
  if (!chain.gameAddress) { setPanelStatus("Game contract not configured; practice runs still work.", true); return; }
  if (!chain.account) { setPanelStatus("Connect a wallet first.", true); return; }
  if (!sq?.ok) { setPanelStatus("Pick one of your Squeeks first.", true); return; }
  try {
    const { events } = await chain.write("startRun", [app.token], (m, h) => setPanelStatus(h ? `${esc(m)} ${txLink(h)}` : esc(m)));
    const ev = events.find((e) => e.eventName === "RunStarted");
    if (!ev) throw new Error("RunStarted event not found in the receipt.");
    const { runId, seed, level, mood, tokenId } = ev.args;
    const info = await chain.read("run", [runId]);
    setPanelStatus(`Ranked run ${runId} started: a fresh burrow, ${MOOD_INFO[mood].name} mood.`);
    beginRun(Number(seed), Number(level), Number(mood), { runId, seed: Number(seed), level: Number(level), mood: Number(mood), tokenId, startBlock: info.startBlock });
    saveLocal();
    refreshSqueek(app.token);
  } catch (e) { setPanelStatus(esc(e.shortMessage ?? e.message), true); }
}

// ------------------------------------------------------------ checkpoints

const runKey = (runId) => `delve3.${chain.gameAddress}.${runId}`;
function saveLocal() {
  const r = app.ranked;
  if (!r) return;
  localStorage.setItem(runKey(r.runId), JSON.stringify({
    runId: String(r.runId), tokenId: String(r.tokenId), seed: r.seed, level: r.level, mood: r.mood,
    startBlock: String(r.startBlock), chainTurn: app.chainTurn, pending: app.pending,
  }));
}

/** Sends every completed floor to the chain, as few transactions as the gas budget allows. */
async function saveProgress(statusEl) {
  const r = app.ranked;
  if (!r || app.saving || !app.cuts.length) return;
  app.saving = true;
  const say = (html, cls = "") => { if (statusEl) statusEl.innerHTML = `<span class="${cls}">${html}</span>`; else setPanelStatus(html, cls === "red"); };
  try {
    while (app.cuts.length) {
      let n = app.cuts.length;
      let gas = null;
      for (;;) {
        const tape = hexTape(app.pending.slice(0, app.cuts[n - 1]));
        say(`Checking gas for ${n} floor${n > 1 ? "s" : ""}…`);
        gas = await chain.estimate("advance", [r.runId, tape]);
        if (gas !== null && gas <= chain.GAS_BUDGET) break;
        if (n === 1) break;
        n = Math.max(1, Math.floor(n / 2));
      }
      if (gas === null) throw new Error("The contract rejected this checkpoint. Your local run may be out of sync; use RESUME to reload it.");
      const cut = app.cuts[n - 1];
      const tape = hexTape(app.pending.slice(0, cut));
      const { hash } = await chain.write("advance", [r.runId, tape], (m, h) => say(h ? `${esc(m)} ${txLink(h)}` : esc(m)), (gas * 12n) / 10n);
      app.pending = app.pending.slice(cut);
      app.cuts = app.cuts.slice(n).map((c) => c - cut);
      const p = await chain.read("progressOf", [r.runId]);
      app.chainTurn = Number(p.turn);
      saveLocal();
      say(`✔ Saved through floor ${p.floor} onchain ${txLink(hash)}`, "good");
      sfx("save");
    }
    if (app.run && isOver(app.run) && !app.pending.length) localStorage.removeItem(runKey(r.runId));
    await Promise.all([refreshSqueek(r.tokenId), refreshBoards()]);
  } catch (e) {
    say(esc(e.shortMessage ?? e.message), "red");
  } finally {
    app.saving = false;
  }
}

function chainProgress(p) {
  return Object.fromEntries(PROGRESS_FIELDS.map((k) => [k, typeof p[k] === "boolean" ? p[k] : Number(p[k])]));
}

async function resumeRun(local) {
  try {
    const runId = BigInt(local.runId);
    const [info, p] = await Promise.all([chain.read("run", [runId]), chain.read("progressOf", [runId])]);
    const prog = chainProgress(p);
    const pending = Number(p.turn) === local.chainTurn ? local.pending : [];
    app.ranked = { runId, seed: Number(info.seed), level: Number(info.level), mood: Number(info.mood), tokenId: info.tokenId, startBlock: info.startBlock };
    app.run = fromProgress(app.ranked.seed, app.ranked.mood, prog);
    app.pending = [];
    app.cuts = [];
    app.chainTurn = Number(p.turn);
    app.spikeT0 = (app.ranked.seed >>> 0) % (SPIKE_MS * 6);
    for (const a of pending) {
      if (isOver(app.run)) break;
      app.run.spikePhase = (pending.indexOf(a) * SPIKE_MS + app.spikeT0) / SPIKE_MS;
      step(app.run, a);
      app.pending.push(a);
      if (app.run.boundary) app.cuts.push(app.pending.length);
    }
    app.mode = "play";
    app.toasts = [];
    resetPresentation();
    hideOverlay();
    app.banner = { text: "RESUMED", sub: `RANKED RUN ${runId} · FLOOR ${app.run.floor}`, t: 0, life: 1500 };
    saveLocal();
    if (isOver(app.run)) endRun();
    screen.focus();
  } catch (e) { setPanelStatus(esc(e.shortMessage ?? e.message), true); }
}

// ---------------------------------------------------------------- input

const MOVE_KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const FIRE_KEYS = { KeyI: 0, KeyL: 1, KeyK: 2, KeyJ: 3 };

function input(a) {
  if (app.mode !== "play") return;
  if (a === ACT.FLEE && !confirm("Leave the burrow now? The run ends here and keeps its score.")) return;
  const now = performance.now();
  if (now - app.lastInput < STEP_MS) { app.queued = a; return; }
  app.lastInput = now;
  doAction(a);
}
setInterval(() => {
  if (app.queued !== null && performance.now() - app.lastInput >= STEP_MS) {
    const a = app.queued; app.queued = null; app.lastInput = performance.now(); doAction(a);
  }
}, 20);

function setAim(on) {
  app.aim = on;
  $("aimBtn").classList.toggle("on", on);
  document.querySelector(".pad").classList.toggle("aiming", on);
}

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (app.mode === "title" || app.mode === "end") {
    if (e.code === "Enter") { e.preventDefault(); startPractice(); return; }
    if (e.code === "KeyR") { e.preventDefault(); startRanked(); return; }
  }
  if (app.mode === "replay") {
    if (e.code === "Escape") stopReplay();
    if (e.key === "+" || e.key === "=") app.replay.speed = Math.min(8, app.replay.speed * 2);
    if (e.key === "-") app.replay.speed = Math.max(1, app.replay.speed / 2);
    return;
  }
  if (app.mode !== "play") return;
  if (e.code === "KeyC") { e.preventDefault(); saveProgress(); return; }
  if (e.code === "KeyF") { e.preventDefault(); setAim(!app.aim); return; }
  if (e.code in FIRE_KEYS) { e.preventDefault(); input(ACT.FIRE_UP + FIRE_KEYS[e.code]); return; }
  if (e.code in MOVE_KEYS) {
    e.preventDefault();
    const d = MOVE_KEYS[e.code];
    const fire = e.shiftKey || app.aim;
    if (app.aim) setAim(false);
    input(fire ? ACT.FIRE_UP + d : d);
    return;
  }
  if (e.code === "Space" || e.code === "Period") { e.preventDefault(); input(ACT.WAIT); return; }
  if (e.code === "KeyQ") { e.preventDefault(); input(ACT.FLEE); }
});
document.querySelectorAll("[data-dir]").forEach((b) => {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const d = Number(b.dataset.dir);
    const fire = app.aim;
    if (fire) setAim(false);
    input(fire ? ACT.FIRE_UP + d : d);
  });
});
document.querySelectorAll("[data-act]").forEach((b) => {
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); input(Number(b.dataset.act)); });
});
$("aimBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); if (app.mode === "play") setAim(!app.aim); });

// -------------------------------------------------------------- overlays

function showOverlay(html) { $("overlay").innerHTML = html; $("overlay").classList.remove("hidden"); }
function hideOverlay() { $("overlay").classList.add("hidden"); $("overlay").innerHTML = ""; }
const ico = (name, scale = 2) => `<span class="ico" style="${iconStyle(app.atlas, name, scale)}"></span>`;

function endRun() {
  if (app.mode === "replay") { stopReplay(); return; }
  app.mode = "end";
  setAim(false);
  const s = app.run;
  const sc = score(s);
  const title = s.won ? "VICTORY!" : s.dead ? "YOU FELL" : "ESCAPED";
  const sub = s.won ? "You conquered all 200 floors and spun the golden wheel." : s.dead ? `Floor ${s.floor}, ${BIOMES[biomeOf(s.floor)]}. The burrow claims another delver.` : `You climbed out of floor ${s.floor}.`;
  const r = app.ranked;
  showOverlay(`
    <div class="modal">
      <h2 class="${s.won ? "gold" : s.dead ? "red" : ""}">${title}</h2>
      <p class="muted">${sub}</p>
      <div class="stats">
        <div><span>SCORE</span><b class="gold">${sc}</b></div>
        <div><span>FLOOR</span><b>${s.floor}</b></div>
        <div><span>LEVEL</span><b>${s.lvl}</b></div>
        <div><span>KILLS</span><b>${s.kills}</b></div>
        <div><span>BOSSES</span><b>${s.bossKills}</b></div>
        <div><span>SEEDS</span><b>${s.gold}</b></div>
      </div>
      <div class="gear">${ico(`wpn_${s.weapon}`)}<span>${WEAPONS[s.weapon].name}</span>${ico(`arm_${s.armor}`)}<span>${ARMORS[s.armor].name}</span>${ico(`sl_${s.sling}`)}<span>${SLINGS[s.sling].name}</span></div>
      ${r ? `
        <p class="small" id="saveNote">Ranked run ${r.runId} · Squeek #${r.tokenId} · ${app.cuts.length ? `${app.cuts.length} floor(s) not saved yet` : "everything is saved onchain"}</p>
        <div class="row"><button class="px-btn gold" id="saveBtn" ${app.cuts.length ? "" : "disabled"}>${app.cuts.length ? "SAVE FINAL RESULT ONCHAIN" : "SAVED ✔"}</button></div>
        <div id="runStatus" class="small"></div>` : `<p class="muted small">Practice run. Ranked runs draw their burrow onchain and every floor you save is replayed and verified by the contract.</p>`}
      <div class="row">
        <button class="px-btn" id="againBtn">PRACTICE AGAIN</button>
        <button class="px-btn ${r ? "" : "gold"}" id="rankedAgainBtn">RANKED RUN</button>
        <button class="px-btn" id="menuBtn">MENU</button>
      </div>
    </div>`);
  $("againBtn").onclick = () => { sfx("ui"); startPractice(); };
  $("rankedAgainBtn").onclick = () => { sfx("ui"); startRanked(); };
  $("menuBtn").onclick = () => { sfx("ui"); app.mode = "title"; app.run = null; app.ranked = null; hideOverlay(); };
  const sb = $("saveBtn");
  if (sb) {
    sb.onclick = async () => {
      sb.disabled = true;
      await saveProgress($("runStatus"));
      if (app.cuts.length) { sb.disabled = false; return; }
      sb.textContent = "SAVED ✔";
      $("saveNote").textContent = `Ranked run ${r.runId} · Squeek #${r.tokenId} · everything is saved onchain`;
    };
  }
}

// ---------------------------------------------------------------- replay

async function startReplay(runId, tokenId) {
  if (app.mode === "play" && app.run && !isOver(app.run) && !confirm("Leave your current run to watch a replay? (Unsaved floors stay saved in this browser.)")) return;
  try {
    setPanelStatus(`Loading replay of run ${runId}…`);
    const info = await chain.read("run", [runId]);
    const tapes = await chain.runTape(runId, info.startBlock);
    if (!tapes.length) throw new Error("No checkpoints found for this run.");
    const tape = tapes.flatMap(hexToBytes);
    app.run = newRun(Number(info.seed), Number(info.level), Number(info.mood));
    app.ranked = null;
    app.mode = "replay";
    app.spikeT0 = (Number(info.seed) >>> 0) % (SPIKE_MS * 6);
    app.replay = { tokenId, runId, tape, i: 0, speed: 2 };
    app.toasts = [];
    hideOverlay();
    resetPresentation();
    floorBanner();
    setPanelStatus("");
    const tick = () => {
      if (!app.replay) return;
      if (app.replay.i >= tape.length || isOver(app.run)) { setTimeout(stopReplay, 1800); return; }
      doAction(tape[app.replay.i++]);
      app.replay.timer = setTimeout(tick, 150 / app.replay.speed);
    };
    tick();
  } catch (e) { setPanelStatus(esc(e.shortMessage ?? e.message), true); }
}
function stopReplay() {
  clearTimeout(app.replay?.timer);
  app.replay = null;
  app.mode = "title";
  app.run = null;
}

// ------------------------------------------------------------ side panels

function setPanelStatus(html, bad = false) { $("panelStatus").innerHTML = html ? `<span class="${bad ? "red" : ""}">${html}</span>` : ""; }

async function refreshSeason() {
  if (!chain.gameAddress) {
    $("seasonBody").innerHTML = `<p class="muted small">Game contract not configured. Practice runs still work.</p>`;
    return;
  }
  const [season, mood] = await Promise.all([chain.read("currentSeason"), chain.read("hamsterMood")]);
  const ends = await chain.read("seasonEndsAt", [season]);
  app.season = season;
  app.mood = Number(mood[0]);
  const mi = MOOD_INFO[app.mood];
  $("seasonTitle").textContent = `SEASON ${season}`;
  $("seasonBody").innerHTML = `
    <div class="mood"><span class="emoji">${mi.emoji}</span><div><b>HAMSTER MOOD: ${mi.name.toUpperCase()}</b><div class="small muted">${mi.text}</div></div></div>
    <div class="kv"><span>Wheel work, last 6 certified rounds</span><b>${mood[1]}</b></div>
    <div class="kv"><span>Season ends in</span><b id="seasonClock" data-ends="${ends}">${hms(Number(ends) - Date.now() / 1000)}</b></div>
    <p class="small muted">New runs take the mood the hamster is in when they start.</p>`;
}

function boardHtml(ids, bests) {
  if (!ids.length) return `<p class="muted small">No runs yet. The first delver sets the bar.</p>`;
  return ids.map((id, i) => {
    const b = bests[i];
    const mark = b.won ? "🏆" : `B${b.floor}`;
    return `<div class="brow ${app.token === id ? "me" : ""}"><span class="rank">${i + 1}</span><span>#${id} <i>L${b.level}</i></span><span class="gearmini">${ico(`wpn_${b.weapon}`, 1)}${ico(`arm_${b.armor}`, 1)}</span><span>${mark}</span><b>${b.score}</b><button class="px-btn tiny" data-replay="${b.runId}" data-token="${id}" title="Watch replay">▶</button></div>`;
  }).join("");
}

async function refreshBoards() {
  if (!chain.gameAddress || app.season === null) {
    $("board").innerHTML = `<p class="muted small">No runs yet.</p>`;
    $("allTime").innerHTML = `<p class="muted small">No runs yet.</p>`;
    return;
  }
  const [[ids, bests], [aIds, aBests]] = await Promise.all([chain.read("leaderboard", [app.season]), chain.read("allTimeBoard")]);
  $("board").innerHTML = boardHtml(ids, bests);
  $("allTime").innerHTML = boardHtml(aIds, aBests);
  document.querySelectorAll("[data-replay]").forEach((b) => { b.onclick = () => startReplay(BigInt(b.dataset.replay), BigInt(b.dataset.token)); });
}

async function connect() {
  try {
    await chain.connectWallet();
    $("connect").textContent = short(chain.account);
    setPanelStatus("Looking for your Squeeks…");
    const ids = await chain.suggestedSqueeks(chain.account);
    await Promise.all(ids.map((id) => addSqueek(id)));
    setPanelStatus(ids.length ? "" : "No Squeeks found. Add a token ID if you hold one.");
    const first = [...app.squeeks.entries()].find(([, s]) => s.ok);
    if (first) await selectSqueek(first[0]);
    renderDelver();
  } catch (e) { setPanelStatus(esc(e.shortMessage ?? e.message), true); }
}

async function addSqueek(id) {
  if (id < 1n || id > 9999n || app.squeeks.has(id)) return;
  const [ok, level] = await Promise.all([chain.read("canPlay", [chain.account, id]), chain.read("levelOf", [id])]);
  app.squeeks.set(id, { ok, level });
  await refreshSqueek(id);
}

async function refreshSqueek(id) {
  const sq = app.squeeks.get(id);
  if (!sq) return;
  const [rec, started] = await Promise.all([
    chain.read("record", [id]),
    app.season !== null ? chain.read("runsStarted", [app.season, id]) : 0,
  ]);
  Object.assign(sq, { rec, started: Number(started) });
  renderDelver();
}

async function selectSqueek(id) {
  const sq = app.squeeks.get(id);
  if (!sq?.ok) return;
  app.token = id;
  if (!sq.art && app.nft) {
    sq.art = await chain.squeekArt(app.nft, id);
    sq.ramp = sq.art ? rampFromSvg(sq.art.svg) : null;
  }
  app.hero = recolor(app.atlas, ["hero_0", "hero_1"], sq.ramp);
  renderDelver();
  refreshBoards();
}

async function unfinishedRuns() {
  if (!chain.gameAddress || !chain.account) return [];
  const out = [];
  const prefix = `delve3.${chain.gameAddress}.`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(prefix)) continue;
    try {
      const local = JSON.parse(localStorage.getItem(k));
      const info = await chain.read("run", [BigInt(local.runId)]);
      const pr = info.progress;
      const over = pr.dead || pr.fled || pr.won;
      if (info.player !== chain.account || (over && !local.pending.length)) { localStorage.removeItem(k); continue; }
      out.push({ ...local, floor: Number(pr.floor) });
    } catch { /* transient RPC error; try again later */ }
  }
  return out;
}

async function renderDelver() {
  const el = $("delver");
  if (!chain.account) {
    el.innerHTML = `<p class="muted small">Connect a wallet that holds a Squeek (in your wallet or staked). Your Squeek becomes your delver: its colors, its level, its records. You can practice without one.</p>`;
    return;
  }
  const sq = app.token ? app.squeeks.get(app.token) : null;
  const chips = [...app.squeeks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, s]) =>
    `<button class="chip ${app.token === id ? "on" : ""}" data-sq="${id}" ${s.ok ? "" : "disabled title=\"Not held by this wallet\""}>#${id} <i>L${s.level}</i></button>`).join("");
  let card = "";
  if (sq) {
    const st = playerStats(sq.level);
    const left = 3 - (sq.started ?? 0);
    card = `
      <div class="delver">
        <div class="portrait">${sq.art ? `<img alt="Squeek #${app.token}" src="${sq.art.image}">` : ""}</div>
        <div>
          <b>SQUEEK #${app.token}</b>
          <div class="small">Level ${sq.level} · ${st.maxHp} HP · ${st.atk + 1} ATK</div>
          <div class="small muted">Runs ${sq.rec?.runs ?? 0} · Deepest B${sq.rec?.deepest ?? 0} · Bosses ${sq.rec?.bossKills ?? 0}</div>
          <div class="small muted">Best ${sq.rec?.bestScore ?? 0} · Wins ${sq.rec?.victories ?? 0} · Crowns ${sq.rec?.crowns ?? 0}</div>
        </div>
      </div>
      <button class="px-btn gold wide" id="rankedSide" ${left > 0 ? "" : "disabled"}>RANKED RUN (${left}/3 TODAY)</button>`;
  }
  el.innerHTML = `${card}<div id="pending"></div><div class="chips">${chips}</div>
    <div class="row"><input id="manualId" type="number" min="1" max="9999" placeholder="Token ID"><button class="px-btn tiny" id="addId">ADD</button></div>`;
  el.querySelectorAll("[data-sq]").forEach((b) => { b.onclick = () => { sfx("ui"); selectSqueek(BigInt(b.dataset.sq)); }; });
  $("addId").onclick = async () => { const v = $("manualId").value; if (v) { await addSqueek(BigInt(v)); renderDelver(); } };
  const rs = $("rankedSide");
  if (rs) rs.onclick = () => { sfx("ui"); startRanked(); };
  const runs = await unfinishedRuns();
  const pel = $("pending");
  if (pel && runs.length) {
    pel.innerHTML = runs.map((r) => `<div class="kv small"><span>Run ${r.runId} · #${r.tokenId} · saved at B${r.floor}${r.pending.length ? ` (+${r.pending.length} moves local)` : ""}</span><b><button class="px-btn tiny" data-resume="${r.runId}">RESUME</button></b></div>`).join("");
    pel.querySelectorAll("[data-resume]").forEach((b) => { b.onclick = () => resumeRun(runs.find((r) => r.runId === b.dataset.resume)); });
  }
}

async function pollWheel() {
  const wh = await chain.liveWheel();
  $("wheel").textContent = !wh.known ? "wheel: unknown" : wh.spinning ? `wheel: running ${wh.rpm.toFixed(1)} rpm` : "wheel: hamster resting";
}

function renderCodex() {
  const mons = MONSTERS.map((m) => `<div class="cx" title="${m.name}">${ico(m.boss ? `${BOSS_SPRITE[m.kind]}_0` : `${m.name}_0`, m.boss ? 1.5 : 2)}<span>${m.boss ? BOSS_NAMES[m.kind] : m.name}${m.boss ? "" : ` · B${m.minFloor}+`}</span></div>`).join("");
  const gear = [...WEAPONS.map((x, i) => [`wpn_${i}`, `${x.name} · ATK ${x.atk}${x.special ? " · " + SPECIAL_TEXT[x.special] : ""}`]),
    ...ARMORS.slice(1).map((x, i) => [`arm_${i + 1}`, `${x.name} · DEF ${x.def}`]),
    ...SLINGS.map((x, i) => [`sl_${i}`, `${x.name} · ${x.dmg} dmg, range ${x.range}`]),
    ...Object.entries(BUFF_NAMES).map(([k, n]) => [k, n])].map(([n, t]) => `<span class="cx-item" title="${esc(t)}">${ico(n, 2)}</span>`).join("");
  $("codex").innerHTML = `<div class="cx-grid">${mons}</div><p class="small muted">Hover to inspect. Deeper floors roll better tiers.</p><div class="cx-items">${gear}</div>`;
}

// ------------------------------------------------------------------ boot

async function boot() {
  $("connect").onclick = connect;
  $("mute").textContent = isMuted() ? "♪ OFF" : "♪ ON";
  $("mute").onclick = () => { $("mute").textContent = toggleMute() ? "♪ OFF" : "♪ ON"; };
  $("practiceBtn").onclick = () => { sfx("ui"); startPractice(); };
  $("rankedBtn").onclick = () => { sfx("ui"); startRanked(); };
  $("saveNow").onclick = () => saveProgress();
  await document.fonts.load('12px "Press Start 2P"').catch(() => {});
  app.atlas = await loadAtlas();
  app.hero = recolor(app.atlas, ["hero_0", "hero_1"], null);
  renderCodex();
  requestAnimationFrame(frame);
  renderDelver();
  pollWheel(); setInterval(pollWheel, 6000);
  if (chain.gameAddress) {
    $("gameLink").innerHTML = `Contract <a target="_blank" rel="noopener" href="${EXPLORER}/address/${chain.gameAddress}">${short(chain.gameAddress)}</a>`;
    app.nft = await chain.read("nft");
  }
  await refreshSeason().catch((e) => setPanelStatus(esc(e.shortMessage ?? e.message), true));
  await refreshBoards().catch(() => {});
  setInterval(() => {
    const c = $("seasonClock");
    if (c) c.textContent = hms(Number(c.dataset.ends) - Date.now() / 1000);
    $("saveNow").disabled = !(app.ranked && app.cuts.length && !app.saving);
    $("saveNow").textContent = app.ranked && app.cuts.length ? `SAVE ${app.cuts.length} FLOOR${app.cuts.length > 1 ? "S" : ""} (C)` : "NOTHING TO SAVE";
  }, 1000);
  setInterval(() => { if (app.mode !== "play") refreshSeason().then(refreshBoards).catch(() => {}); }, 30000);
}
boot().catch((e) => setPanelStatus(esc(e.shortMessage ?? e.message), true));
