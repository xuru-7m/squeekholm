// Squeekholm rules engine. Deterministic and integer-only.
// src/DelveRules.sol re-implements these rules exactly to verify runs onchain, floor by floor;
// any change here must be mirrored there (tools/parity.mjs + test/DelveParity.t.sol check it).
// Data tables are shared: tools/gen-tables.mjs writes src/DelveTables.sol from the tables below.

export const FLOORS = 200;
export const MAX_W = 47;
export const MAX_H = 35;
export const MAX_ENEMIES = 40;
export const MAX_ITEMS = 48;
export const CAVEIN_TURNS = 300;
export const BOSS_EVERY = 10;
const PLACE_TRIES = 100;
const CARVE_CAP = 12000;

export const ACT = {
  UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, WAIT: 4, FLEE: 5,
  FIRE_UP: 6, FIRE_RIGHT: 7, FIRE_DOWN: 8, FIRE_LEFT: 9,
};
export const MOOD = { SNOOZE: 0, POTTER: 1, JOG: 2, ZOOMIES: 3 };
export const MOOD_INFO = [
  { name: "Snooze", emoji: "💤", text: "The hamster slept. The burrow is dark and monsters are drowsy (they act every other turn)." },
  { name: "Potter", emoji: "🐾", text: "A few laps. A normal burrow." },
  { name: "Jog", emoji: "🏃", text: "Proper running. Seeds +2 and an extra chest on every floor." },
  { name: "Zoomies", emoji: "⚡", text: "Full sprint! One extra monster per floor, but every seed is worth double." },
];
export const STYLE = { CAVE: 0, ROOMS: 1, MIXED: 2 };
export const ITEM = { SEED: 0, CHEESE: 1, CHEST: 2, BOSS_CHEST: 3 };
export const BEH = { CHASE: 0, FAST: 1, SLOW: 2, RANGED: 3, BOMB: 4, REGEN: 5 };
export const BIOMES = ["Topsoil", "Rootclay", "Crystal Deep", "Fungal Grotto", "Frost Hollow", "Magma Vent", "Sunken Ruins", "Void Burrow"];

// name, behavior, hp, atk, sight, value, minFloor (bosses: 0), drop %.
export const MONSTERS = [
  ["beetle", BEH.CHASE, 3, 1, 4, 3, 1, 10],
  ["rat", BEH.FAST, 3, 1, 6, 4, 1, 12],
  ["snake", BEH.CHASE, 5, 2, 5, 6, 2, 15],
  ["spider", BEH.RANGED, 4, 1, 6, 6, 3, 15],
  ["mole", BEH.SLOW, 9, 2, 3, 9, 4, 30],
  ["bat", BEH.FAST, 3, 2, 7, 6, 6, 12],
  ["fireant", BEH.BOMB, 3, 3, 5, 6, 8, 10],
  ["worm", BEH.REGEN, 8, 2, 3, 8, 10, 20],
  ["scorpion", BEH.CHASE, 8, 3, 5, 10, 13, 20],
  ["toad", BEH.RANGED, 7, 2, 6, 10, 16, 20],
  ["ferret", BEH.FAST, 7, 3, 7, 12, 20, 20],
  ["slime", BEH.REGEN, 12, 3, 4, 12, 24, 25],
  ["owl", BEH.RANGED, 9, 4, 8, 15, 30, 25],
  ["badger", BEH.SLOW, 22, 5, 4, 18, 36, 35],
  ["wasp", BEH.FAST, 8, 5, 8, 16, 44, 20],
  ["golem", BEH.SLOW, 30, 6, 4, 25, 55, 40],
  ["wraith", BEH.FAST, 14, 6, 9, 28, 70, 30],
  ["tabby", BEH.CHASE, 18, 2, 9, 60, 0, 0],
  ["weasel", BEH.FAST, 22, 2, 9, 80, 0, 0],
  ["owlking", BEH.RANGED, 26, 3, 10, 100, 0, 0],
  ["serpent", BEH.REGEN, 32, 3, 9, 120, 0, 0],
  ["fox", BEH.FAST, 38, 4, 10, 150, 0, 0],
  ["emperor", BEH.CHASE, 260, 10, 12, 2000, 0, 0],
].map(([name, beh, hp, atk, sight, value, minFloor, drop], kind) => ({ kind, name, beh, hp, atk, sight, value, minFloor, drop, boss: kind >= 17 }));
export const REGULAR_KINDS = 17;
export const BOSS_NAMES = { 17: "The Tabby", 18: "Weasel Warlord", 19: "Great Horned Owl", 20: "Serpent Queen", 21: "Fox Shogun", 22: "The Cat Emperor" };
export const EMPEROR = 22;
const RANGE = 4;

export const SPECIAL = { NONE: 0, PIERCE: 1, CLEAVE: 2, LEECH: 3, CRIT: 4 };
export const SPECIAL_TEXT = ["", "Pierces 2 foes", "Cleaves both sides", "Heals +2 per strike", "+10% crit"];
// name, atk, special
export const WEAPONS = [
  ["Twig", 1, 0], ["Thorn Dagger", 2, 0], ["Pencil Spear", 2, 1], ["Acorn Hammer", 3, 0],
  ["Golden Fork", 4, 1], ["Bone Club", 5, 0], ["Bramble Whip", 5, 2], ["Crystal Shard", 6, 4],
  ["Mushroom Staff", 7, 3], ["Frost Needle", 8, 1], ["Ember Blade", 9, 2], ["Rune Pick", 11, 4],
  ["Moonsickle", 12, 3], ["Comet Lance", 14, 1], ["Void Fang", 16, 3], ["Wheel of Fate", 19, 2],
].map(([name, atk, special]) => ({ name, atk, special }));
export const ARMORS = [
  ["Bare fur", 0], ["Walnut Helm", 1], ["Thimble Mail", 2], ["Chestnut Plate", 3], ["Beetle Shell", 4],
  ["Pinecone Guard", 5], ["Bark Mail", 6], ["Crystal Vest", 8], ["Frost Cloak", 9], ["Magma Plate", 11],
  ["Rune Aegis", 13], ["Starweave", 16],
].map(([name, def]) => ({ name, def }));
export const SLINGS = [
  ["Pebble Toss", 1, 4], ["Rubber Sling", 2, 5], ["Pea Shooter", 3, 6], ["Acorn Catapult", 5, 6],
  ["Crystal Sling", 7, 7], ["Ember Bow", 9, 7], ["Frost Crossbow", 12, 8], ["Star Cannon", 16, 8],
].map(([name, dmg, range]) => ({ name, dmg, range }));
export const BUFFS = ["pouch", "vitamin", "clover", "whisker", "bigcheese", "sunflower", "ironfur", "nighteye", "wheelspirit", "leechfang", "seedmagnet", "swiftpaw"];
export const BUFF_NAMES = {
  pouch: "Pebble Pouch", vitamin: "Vitamin", clover: "Four-leaf Clover", whisker: "Lucky Whisker",
  bigcheese: "Big Cheese", sunflower: "Sunflower Heart", ironfur: "Iron Fur", nighteye: "Night Eyes",
  wheelspirit: "Wheel Spirit", leechfang: "Vampire Tooth", seedmagnet: "Seed Magnet", swiftpaw: "Swift Paws",
};

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** One xorshift32 step on a uint32 held in a JS number. */
function xs(x) {
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  return (x ^ (x << 5)) >>> 0;
}

export const moodForWork = (work) => (work >= 300 ? 3 : work >= 100 ? 2 : work >= 1 ? 1 : 0);
/** Visual only: biomes cycle every 10 floors, and the last ten floors are always the Void. */
export const biomeOf = (floor) => (floor > 190 ? 7 : Math.floor((floor - 1) / 10) % 8);
export const isBossFloor = (floor) => floor % BOSS_EVERY === 0;
export function dims(floor) {
  return { w: 17 + 2 * Math.min(15, Math.floor((floor - 1) / 5)), h: 13 + 2 * Math.min(11, Math.floor((floor - 1) / 7)) };
}
export function bossKind(floor) {
  if (floor === FLOORS) return EMPEROR;
  return 17 + ((floor / BOSS_EVERY - 1) % 5);
}
export const playerStats = (level) => {
  const l = Math.min(10, Math.max(1, level));
  return { maxHp: 10 + 2 * l, atk: 1 + Math.floor(l / 3) };
};
export const scaledHp = (kind, floor) => Math.max(1, Math.floor((MONSTERS[kind].hp * (100 + 12 * (floor - 1))) / 100));
export const scaledAtk = (kind, floor) => MONSTERS[kind].atk + Math.floor((floor - 1) / 4);
export const killValue = (kind, floor) => Math.floor((MONSTERS[kind].value * (10 + floor)) / 10);
export const xpToLevel = (lvl) => 5 + 5 * lvl * lvl;
const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

// ------------------------------------------------------------- generation

export function genFloor(seed, floor, mood) {
  let rng = (seed ^ Math.imul(floor, 0x9e3779b9)) >>> 0 || 1;
  const next = () => (rng = xs(rng));
  const { w: W, h: H } = dims(floor);
  const area = W * H;
  const open = new Uint8Array(W * H);
  let count = 0;
  const carve = (x, y) => { if (!open[y * W + x]) { open[y * W + x] = 1; count++; } };
  const walk = (x, y, target) => {
    for (let i = 0; i < CARVE_CAP && count < target; i++) {
      const d = next() % 4;
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 1 || nx > W - 2 || ny < 1 || ny > H - 2) continue;
      x = nx;
      y = ny;
      carve(x, y);
    }
  };

  const boss = isBossFloor(floor);
  const style = boss ? STYLE.ROOMS : next() % 3;
  let startX = 0;
  let startY = 0;
  if (style === STYLE.CAVE) {
    startX = 2 + (next() % (W - 4));
    startY = 2 + (next() % (H - 4));
    carve(startX, startY);
    walk(startX, startY, Math.floor(((W - 2) * (H - 2) * 40) / 100));
  } else {
    const nRooms = (style === STYLE.ROOMS ? 4 + (next() % 3) : 3 + (next() % 2)) + Math.floor(area / 250);
    const rwSpan = 3 + Math.floor((W - 17) / 8);
    const rhSpan = 2 + Math.floor((H - 13) / 8);
    let px = 0;
    let py = 0;
    for (let k = 0; k < nRooms; k++) {
      const rw = 3 + (next() % rwSpan);
      const rh = 3 + (next() % rhSpan);
      const rx = 1 + (next() % (W - 1 - rw));
      const ry = 1 + (next() % (H - 1 - rh));
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) carve(x, y);
      const cx = rx + Math.floor(rw / 2);
      const cy = ry + Math.floor(rh / 2);
      if (k === 0) {
        startX = cx;
        startY = cy;
      } else {
        let x = px;
        let y = py;
        if (next() % 2 === 0) {
          while (x !== cx) { x += Math.sign(cx - x); carve(x, y); }
          while (y !== cy) { y += Math.sign(cy - y); carve(x, y); }
        } else {
          while (y !== cy) { y += Math.sign(cy - y); carve(x, y); }
          while (x !== cx) { x += Math.sign(cx - x); carve(x, y); }
        }
      }
      px = cx;
      py = cy;
    }
    if (style === STYLE.MIXED) walk(px, py, count + 25 + Math.floor(area / 40));
  }

  let sx = startX;
  let sy = startY;
  let best = 0;
  for (let cy = 1; cy <= H - 2; cy++) {
    for (let cx = 1; cx <= W - 2; cx++) {
      const dd = dist(cx, cy, startX, startY);
      if (open[cy * W + cx] && dd > best) { best = dd; sx = cx; sy = cy; }
    }
  }

  const enemies = [];
  const items = [];
  const enemyOcc = new Uint8Array(W * H);
  const itemOcc = new Uint8Array(W * H);
  const free = (cx, cy) => !(cx === startX && cy === startY) && !(cx === sx && cy === sy)
    && !enemyOcc[cy * W + cx] && !itemOcc[cy * W + cx];
  const place = (minDist) => {
    for (let t = 0; t < PLACE_TRIES; t++) {
      const cx = 1 + (next() % (W - 2));
      const cy = 1 + (next() % (H - 2));
      if (open[cy * W + cx] && free(cx, cy) && dist(cx, cy, startX, startY) >= minDist) return [cx, cy];
    }
    return null;
  };

  let eligible = 0;
  while (eligible < REGULAR_KINDS && MONSTERS[eligible].minFloor <= floor) eligible++;
  const window = Math.min(6, eligible);
  const nEnemies = Math.min(MAX_ENEMIES, 2 + Math.floor(floor / 4) + Math.floor(area / 110) + (mood === MOOD.ZOOMIES ? 1 : 0));
  for (let k = 0; k < nEnemies; k++) {
    const r = next();
    let kind;
    let p;
    if (boss && k === 0) {
      kind = bossKind(floor);
      p = place(6) ?? place(3);
    } else {
      kind = eligible - 1 - (r % window);
      p = place(3);
    }
    if (!p) continue;
    const m = MONSTERS[kind];
    const hp = scaledHp(kind, floor);
    enemies.push({ kind, beh: m.beh, x: p[0], y: p[1], hp, maxHp: hp, atk: scaledAtk(kind, floor), alive: true });
    enemyOcc[p[1] * W + p[0]] = enemies.length;
  }
  const addItems = (kind, n, minDist) => {
    for (let k = 0; k < n; k++) {
      const p = place(minDist);
      if (!p) continue;
      items.push({ kind, x: p[0], y: p[1], taken: false });
      itemOcc[p[1] * W + p[0]] = items.length;
    }
  };
  addItems(ITEM.SEED, 3 + Math.floor(area / 90) + (next() % 3), 1);
  addItems(ITEM.CHEESE, 1 + Math.min(3, Math.floor(floor / 20)) + (floor >= 3 ? next() % 2 : 0), 1);
  addItems(ITEM.CHEST, 1 + Math.floor(area / 250) + (next() % 2) + (mood === MOOD.JOG ? 1 : 0), 2);

  return { w: W, h: H, style, boss, open, enemyOcc, itemOcc, start: { x: startX, y: startY }, stairs: { x: sx, y: sy }, enemies, items };
}

// ------------------------------------------------------------------ state

/** A fresh run. The state at a floor boundary is all the contract needs to store. */
export function newRun(seed, level, mood) {
  const { maxHp, atk } = playerStats(level);
  const s = {
    seed: seed >>> 0, level, mood,
    floor: 1, hp: maxHp, maxHp, atk, def: 0, weapon: 0, armor: 0, sling: 0, pebbles: 5, crit: 5,
    luck: 0, goldPct: 0, leech: 0, regen: 0, dodge: 0, vision: 0, xp: 0, lvl: 1,
    gold: 0, kills: 0, killScore: 0, bossKills: 0, turn: 0, floorTurn: 0,
    rng: (seed ^ 0x85ebca6b) >>> 0 || 1,
    dead: false, fled: false, won: false,
    tape: [], boundary: true,
  };
  enterFloor(s);
  return s;
}

/** Fields saved at each checkpoint, in the order DelveRules.Progress uses. */
export const PROGRESS_FIELDS = [
  "floor", "hp", "maxHp", "atk", "def", "weapon", "armor", "sling", "pebbles", "crit", "luck", "goldPct",
  "leech", "regen", "dodge", "vision", "xp", "lvl", "gold", "kills", "killScore", "bossKills", "turn", "rng",
  "dead", "fled", "won",
];
export const progressOf = (s) => Object.fromEntries(PROGRESS_FIELDS.map((k) => [k, s[k]]));

/** Resume from a checkpointed progress (a floor boundary). */
export function fromProgress(seed, mood, p) {
  const s = { seed: seed >>> 0, mood, ...p, floorTurn: 0, tape: [], boundary: true };
  if (!isOver(s)) enterFloor(s);
  return s;
}

function enterFloor(s) {
  Object.assign(s, genFloor(s.seed, s.floor, s.mood));
  s.px = s.start.x;
  s.py = s.start.y;
  s.floorTurn = 0;
}

const roll = (s) => (s.rng = xs(s.rng));
export const isOver = (s) => s.dead || s.won || s.fled;
export const isOpen = (s, x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h && s.open[y * s.w + x] === 1;
const enemyAt = (s, x, y) => (x >= 0 && y >= 0 && x < s.w && y < s.h ? s.enemyOcc[y * s.w + x] - 1 : -1);
export const bossAlive = (s) => s.boss && s.enemies.length > 0 && s.enemies[0].kind >= REGULAR_KINDS && s.enemies[0].alive;
export const playerAtk = (s) => s.atk + WEAPONS[s.weapon].atk;
export const playerDef = (s) => s.def + ARMORS[s.armor].def;
export const slingDmg = (s) => SLINGS[s.sling].dmg + Math.floor(s.atk / 3);

function gainXp(s, v, ev) {
  s.xp += v;
  while (s.xp >= xpToLevel(s.lvl)) {
    s.xp -= xpToLevel(s.lvl);
    s.lvl++;
    s.maxHp += 3;
    s.hp += 3;
    if (s.lvl % 2 === 0) s.atk++;
    ev.push({ t: "levelup", lvl: s.lvl });
  }
}

function hit(s, i, dmg, ev, crit) {
  const e = s.enemies[i];
  e.hp -= dmg;
  ev.push({ t: "hit", i, x: e.x, y: e.y, dmg, crit });
  if (e.hp > 0) return;
  e.alive = false;
  s.enemyOcc[e.y * s.w + e.x] = 0;
  s.kills++;
  const value = killValue(e.kind, s.floor);
  s.killScore += value;
  if (e.kind >= REGULAR_KINDS) s.bossKills++;
  ev.push({ t: "kill", i, x: e.x, y: e.y, value, kind: e.kind });
  gainXp(s, value, ev);
  if (e.kind >= REGULAR_KINDS) {
    dropItem(s, ITEM.BOSS_CHEST, e.x, e.y, ev);
    return;
  }
  if (roll(s) % 100 < MONSTERS[e.kind].drop) dropItem(s, roll(s) % 2 === 0 ? ITEM.CHEST : ITEM.CHEESE, e.x, e.y, ev);
}

function dropItem(s, kind, x, y, ev) {
  if (s.items.length >= MAX_ITEMS || s.itemOcc[y * s.w + x]) return;
  s.items.push({ kind, x, y, taken: false });
  s.itemOcc[y * s.w + x] = s.items.length;
  ev.push({ t: "drop", x, y, kind });
}

function gear(s, slot, list, div, bonus, ev) {
  const cap = list.length - 1;
  const maxT = Math.min(cap, 1 + Math.floor(s.floor / div) + bonus);
  const minT = Math.max(1, maxT - 3);
  const t = minT + (roll(s) % (maxT - minT + 1));
  if (t > s[slot]) {
    s[slot] = t;
    ev.push({ t: "loot", slot, tier: t, name: list[t].name });
  } else {
    const v = 4 * t;
    s.gold += v;
    ev.push({ t: "salvage", slot, tier: t, name: list[t].name, value: v });
  }
}

function openChest(s, bonus, ev) {
  const c = roll(s) % 100;
  if (c < 20) gear(s, "weapon", WEAPONS, 8, bonus, ev);
  else if (c < 38) gear(s, "armor", ARMORS, 10, bonus, ev);
  else if (c < 48) gear(s, "sling", SLINGS, 14, bonus, ev);
  else {
    const b = roll(s) % 12;
    const f = s.floor;
    switch (b) {
      case 0: s.pebbles += 4 + Math.floor(f / 10); break;
      case 1: { const v = 3 + Math.floor(f / 10); s.maxHp += v; s.hp += v; break; }
      case 2: s.crit = Math.min(60, s.crit + 5); break;
      case 3: s.luck += 1 + Math.floor(f / 25); break;
      case 4: s.hp = s.maxHp; break;
      case 5: s.atk += 1 + Math.floor(f / 40); break;
      case 6: s.def += 1; break;
      case 7: s.vision += 1; s.pebbles += 2; break;
      case 8: s.regen += 2; break;
      case 9: s.leech += 1; break;
      case 10: s.goldPct += 20; break;
      default: s.dodge = Math.min(40, s.dodge + 5); break;
    }
    ev.push({ t: "loot", slot: BUFFS[b], name: BUFF_NAMES[BUFFS[b]] });
  }
}

function pickup(s, x, y, ev) {
  const idx = s.itemOcc[y * s.w + x];
  if (!idx) return;
  const it = s.items[idx - 1];
  it.taken = true;
  s.itemOcc[y * s.w + x] = 0;
  if (it.kind === ITEM.SEED) {
    let v = 3 + s.floor;
    if (s.mood === MOOD.JOG) v += 2;
    if (s.mood === MOOD.ZOOMIES) v *= 2;
    v = Math.floor((v * (100 + s.goldPct)) / 100) + s.luck;
    s.gold += v;
    ev.push({ t: "seed", x, y, value: v });
  } else if (it.kind === ITEM.CHEESE) {
    const before = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + 5 + Math.floor(s.maxHp / 5));
    ev.push({ t: "heal", x, y, value: s.hp - before });
  } else {
    ev.push({ t: "chest", x, y, boss: it.kind === ITEM.BOSS_CHEST });
    openChest(s, it.kind === ITEM.BOSS_CHEST ? 2 : 0, ev);
    if (it.kind === ITEM.BOSS_CHEST) openChest(s, 2, ev);
  }
}

function trapHere(s, x, y) {
  return ((x * 17 + y * 31 + s.floor) % 11) === 0;
}
/** Damage only while spikes are fully out. Phase is the same clock the canvas draws. Display only. */
export function trapOut(phase) {
  const p = ((phase % 6) + 6) % 6;
  return p >= 2 && p < 4;
}

function hurtPlayer(s, raw, ev, info) {
  if (s.dodge > 0 && roll(s) % 100 < s.dodge) {
    ev.push({ t: "miss", ...info });
    return;
  }
  const dmg = Math.max(1, raw - playerDef(s));
  s.hp -= dmg;
  ev.push({ t: "hurt", dmg, ...info });
  if (s.hp <= 0) {
    s.hp = 0;
    s.dead = true;
    ev.push({ t: "die" });
  }
}

function stepToward(s, i, ev) {
  const e = s.enemies[i];
  const dx = s.px - e.x;
  const dy = s.py - e.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tries = Math.abs(dx) >= Math.abs(dy) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
  for (const [mx, my] of tries) {
    if (mx === 0 && my === 0) continue;
    const nx = e.x + mx;
    const ny = e.y + my;
    if (isOpen(s, nx, ny) && !(nx === s.px && ny === s.py) && enemyAt(s, nx, ny) < 0) {
      ev.push({ t: "emove", i, fx: e.x, fy: e.y, x: nx, y: ny });
      s.enemyOcc[e.y * s.w + e.x] = 0;
      e.x = nx;
      e.y = ny;
      s.enemyOcc[ny * s.w + nx] = i + 1;
      return true;
    }
  }
  return false;
}

function clearShot(s, e) {
  if (e.x !== s.px && e.y !== s.py) return false;
  const d = dist(e.x, e.y, s.px, s.py);
  if (d > RANGE) return false;
  const sx = Math.sign(s.px - e.x);
  const sy = Math.sign(s.py - e.y);
  for (let k = 1; k < d; k++) {
    const x = e.x + sx * k;
    const y = e.y + sy * k;
    if (!isOpen(s, x, y) || enemyAt(s, x, y) >= 0) return false;
  }
  return true;
}

/** One enemy action. Returns 2 for an attack, 1 for a move, 0 otherwise. */
function enemyAct(s, i, ev) {
  const e = s.enemies[i];
  const d = dist(e.x, e.y, s.px, s.py);
  const info = { i, x: e.x, y: e.y, kind: e.kind };
  if (d === 1) {
    if (e.beh === BEH.BOMB) {
      e.alive = false;
      s.enemyOcc[e.y * s.w + e.x] = 0;
      ev.push({ t: "explode", i, x: e.x, y: e.y });
      hurtPlayer(s, e.atk * 2, ev, info);
    } else {
      hurtPlayer(s, e.atk, ev, info);
    }
    return 2;
  }
  if (e.beh === BEH.RANGED && clearShot(s, e)) {
    ev.push({ t: "eshot", i, kind: e.kind, fx: e.x, fy: e.y, x: s.px, y: s.py });
    hurtPlayer(s, e.atk, ev, info);
    return 2;
  }
  if (d <= MONSTERS[e.kind].sight) {
    if (trapHere(s, e.x, e.y) && trapOut(s.spikePhase)) {
      hit(s, i, 3, ev, false);
      ev.push({ t: "trap", x: e.x, y: e.y });
      return 1;
    }
    return stepToward(s, i, ev) ? 1 : 0;
  }
  return 0;
}

/** Apply one action. Mutates `s`; returns animation events (display only). */
export function step(s, action) {
  const ev = [];
  if (isOver(s)) return ev;
  s.tape.push(action);
  s.boundary = false;
  s.turn++;
  s.floorTurn++;
  if (action === ACT.FLEE) {
    s.fled = true;
    s.boundary = true;
    ev.push({ t: "flee" });
    return ev;
  }
  if (action <= 3) {
    const tx = s.px + DX[action];
    const ty = s.py + DY[action];
    ev.push({ t: "face", dir: action });
    if (!isOpen(s, tx, ty)) {
      ev.push({ t: "bump", x: tx, y: ty });
    } else {
      const ei = enemyAt(s, tx, ty);
      if (ei >= 0) {
        const w = WEAPONS[s.weapon];
        let dmg = playerAtk(s);
        const crit = roll(s) % 100 < s.crit + (w.special === SPECIAL.CRIT ? 10 : 0);
        if (crit) dmg *= 2;
        ev.push({ t: "attack", x: tx, y: ty, dir: action });
        hit(s, ei, dmg, ev, crit);
        if (w.special === SPECIAL.PIERCE) {
          const bj = enemyAt(s, tx + DX[action], ty + DY[action]);
          if (bj >= 0) hit(s, bj, dmg, ev, crit);
        } else if (w.special === SPECIAL.CLEAVE) {
          const side = (action + 1) % 4;
          const aj = enemyAt(s, tx + DX[side], ty + DY[side]);
          if (aj >= 0) hit(s, aj, dmg, ev, crit);
          const bj = enemyAt(s, tx - DX[side], ty - DY[side]);
          if (bj >= 0) hit(s, bj, dmg, ev, crit);
        }
        const heal = s.leech + (w.special === SPECIAL.LEECH ? 2 : 0);
        if (heal > 0 && s.hp < s.maxHp) {
          s.hp = Math.min(s.maxHp, s.hp + heal);
          ev.push({ t: "leech", value: heal });
        }
      } else {
        ev.push({ t: "move", fx: s.px, fy: s.py, x: tx, y: ty });
        s.px = tx;
        s.py = ty;
        if (trapHere(s, tx, ty) && trapOut(s.spikePhase)) hurtPlayer(s, 3, ev, { src: "trap" });
        pickup(s, tx, ty, ev);
        if (tx === s.stairs.x && ty === s.stairs.y) {
          if (bossAlive(s)) {
            ev.push({ t: "locked" });
          } else if (s.floor === FLOORS) {
            s.won = true;
            s.boundary = true;
            ev.push({ t: "win" });
            return ev;
          } else {
            const heal = Math.floor(s.maxHp / 4) + s.regen;
            s.hp = Math.min(s.maxHp, s.hp + heal);
            s.floor++;
            enterFloor(s);
            s.boundary = true;
            ev.push({ t: "descend", floor: s.floor, heal });
            return ev;
          }
        }
      }
    }
  } else if (action >= ACT.FIRE_UP && action <= ACT.FIRE_LEFT) {
    const d = action - ACT.FIRE_UP;
    ev.push({ t: "face", dir: d });
    if (s.pebbles > 0) {
      s.pebbles--;
      const sl = SLINGS[s.sling];
      let ex = s.px;
      let ey = s.py;
      let target = -1;
      for (let k = 1; k <= sl.range; k++) {
        const x = s.px + DX[d] * k;
        const y = s.py + DY[d] * k;
        if (!isOpen(s, x, y)) break;
        ex = x;
        ey = y;
        target = enemyAt(s, x, y);
        if (target >= 0) break;
      }
      ev.push({ t: "shot", fx: s.px, fy: s.py, x: ex, y: ey });
      if (target >= 0) hit(s, target, slingDmg(s), ev, false);
    } else {
      ev.push({ t: "empty" });
    }
  }

  if (s.floorTurn > CAVEIN_TURNS) {
    // The burrow collapses fast: this bounds how long one floor (and its onchain replay) can be.
    const dmg = 1 + Math.floor((s.maxHp * (s.floorTurn - CAVEIN_TURNS)) / 50);
    s.hp -= dmg;
    ev.push({ t: "cavein", dmg });
    if (s.hp <= 0) {
      s.hp = 0;
      s.dead = true;
      s.boundary = true;
      ev.push({ t: "die" });
      return ev;
    }
  }
  if (s.mood === MOOD.SNOOZE && s.turn % 2 === 1) return ev;
  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i];
    if (!e.alive) continue;
    if (e.beh === BEH.SLOW && s.turn % 2 === 1) continue;
    if (e.beh === BEH.REGEN && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + 1 + Math.floor(e.maxHp / 20));
    const r = enemyAct(s, i, ev);
    if (s.dead) break;
    if (!e.alive) continue;
    if (e.beh === BEH.FAST && r !== 2) {
      const d = dist(e.x, e.y, s.px, s.py);
      if (d > 1 && d <= MONSTERS[e.kind].sight) stepToward(s, i, ev);
    }
    if (e.kind >= REGULAR_KINDS && e.hp * 3 < e.maxHp) {
      enemyAct(s, i, ev);
      if (s.dead) break;
    }
  }
  if (s.dead) s.boundary = true;
  return ev;
}

export function score(s) {
  return s.gold + s.killScore + 50 * (s.floor - 1) + (s.won ? 5000 + 10 * s.hp : 0);
}

/** Replay a tape from a checkpoint. Throws if it does not end at a floor boundary. */
export function advance(seed, mood, progress, tape) {
  const s = fromProgress(seed, mood, progress);
  for (const a of tape) {
    if (isOver(s)) break;
    step(s, a);
  }
  if (!s.boundary) throw new Error("tape must end at a floor boundary or the end of the run");
  return progressOf(s);
}

/** Splits a run's tape at floor boundaries: returns the tape index after each completed floor. */
export function boundaries(seed, level, mood, tape) {
  const s = newRun(seed, level, mood);
  const cuts = [];
  for (let i = 0; i < tape.length; i++) {
    if (isOver(s)) break;
    step(s, tape[i]);
    if (s.boundary) cuts.push(i + 1);
  }
  return cuts;
}
