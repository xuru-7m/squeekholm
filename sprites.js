// Sprite atlases: several pxl sheets merged into one name -> frame lookup, plus hero recoloring.

export const TILE = 16;
const FUR = ["#E8B07A", "#C98A54", "#8A5A34"]; // light, mid, dark placeholders in hero frames
const SHEETS = ["sprites", "monsters", "items", "biomes", "gear", "traps"];

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Loads every sheet; `frames[name]` is { img, frame } and works across sheets. */
export async function loadAtlas(base = "./assets/") {
  const frames = {};
  const sheets = {};
  await Promise.all(SHEETS.map(async (name) => {
    try {
      const [img, json] = await Promise.all([loadImage(`${base}${name}.png`), fetch(`${base}${name}.json`).then((r) => r.json())]);
      sheets[name] = { img, w: img.width, h: img.height };
      for (const [k, v] of Object.entries(json.frames)) frames[k.replace(/\.png$/, "")] = { img, sheet: name, frame: v.frame };
    } catch { /* a missing sheet just means fewer sprites */ }
  }));
  return { frames, sheets };
}

export const has = (atlas, name) => Boolean(atlas.frames[name]);

/** Returns canvases holding recolored copies of the given frames (hero only). */
export function recolor(atlas, names, ramp) {
  const out = {};
  const from = FUR.map(hexToRgb);
  for (const name of names) {
    const f = atlas.frames[name];
    if (!f) continue;
    const { x, y, w, h } = f.frame;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(f.img, x, y, w, h, 0, 0, w, h);
    if (ramp) {
      const data = g.getImageData(0, 0, w, h);
      const d = data.data;
      for (let p = 0; p < d.length; p += 4) {
        for (let k = 0; k < 3; k++) {
          if (d[p] === from[k][0] && d[p + 1] === from[k][1] && d[p + 2] === from[k][2]) {
            [d[p], d[p + 1], d[p + 2]] = ramp[k];
            break;
          }
        }
      }
      g.putImageData(data, 0, 0);
    }
    out[name] = c;
  }
  return out;
}

/**
 * Builds a 3-step fur ramp from a Squeek's onchain SVG. The SVG is only read as text to find
 * its `color="#rrggbb"` groups; it is never injected into the page.
 */
export function rampFromSvg(svgText) {
  const counts = new Map();
  for (const m of svgText.matchAll(/color="(#[0-9A-Fa-f]{6})"/g)) {
    const hex = m[1].toUpperCase();
    const [r, g, b] = hexToRgb(hex);
    if (0.299 * r + 0.587 * g + 0.114 * b < 40) continue; // skip near-black background tones
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const main = hexToRgb([...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return [mix(main, [255, 255, 255], 0.3), main, mix(main, [0, 0, 0], 0.45)];
}

/** Draws a frame with its top-left at (x, y); `src` overrides with a pre-rendered canvas. */
export function drawFrame(g, atlas, name, x, y, { flip = false, alpha = 1, src = null, scaleY = 1 } = {}) {
  const f = atlas.frames[name];
  if (!f && !src) return;
  const w = src ? src.width : f.frame.w;
  const h = src ? src.height : f.frame.h;
  g.save();
  g.globalAlpha = alpha;
  g.translate(Math.round(x) + (flip ? w : 0), Math.round(y) + h);
  g.scale(flip ? -1 : 1, scaleY);
  if (src) g.drawImage(src, 0, -h);
  else g.drawImage(f.img, f.frame.x, f.frame.y, w, h, 0, -h, w, h);
  g.restore();
}

/** CSS for showing a frame as a DOM icon at `scale`. */
export function iconStyle(atlas, name, scale = 2) {
  const f = atlas.frames[name];
  if (!f) return "display:none";
  const s = atlas.sheets[f.sheet];
  return `width:${f.frame.w * scale}px;height:${f.frame.h * scale}px;background-image:url(./assets/${f.sheet}.png);`
    + `background-size:${s.w * scale}px ${s.h * scale}px;background-position:${-f.frame.x * scale}px ${-f.frame.y * scale}px`;
}
