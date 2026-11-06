# Squeekholm 🐹⛏️

**A holder-only pixel roguelike for Squeek NFT holders: 200 floors, verified onchain on Sepolia.**

Live: https://squeekholm.site

squeekchain-project: def61077-98bb-4ba0-bd36-3b3a54fcd9c6

Your Squeek is your delver. Dig through 200 floors of a hamster burrow across 8 biomes. The maps get
bigger, the monsters deadlier and the loot better the deeper you go. Every 10th floor is sealed by a
boss, and floor 200 hides the Cat Emperor and the golden wheel.

Ranked runs draw their burrow seed **onchain**. Whenever you like, you checkpoint your progress: the
contract rebuilds those floors and **replays every single move** (monster AI, crits, loot rolls) to
record your depth and score. No server, no oracle, no trusted client.

The real hamster matters too: a run's mood comes from the work Squeektoshi did in SqueekCore's last
6 certified rounds when the run started.

| Mood | Hamster work | Burrow |
|---|---|---|
| 💤 Snooze | 0 | Dark (small torch radius); monsters are drowsy and act every other turn |
| 🐾 Potter | 1–99 | Normal |
| 🏃 Jog | 100–299 | Seeds +2 and one extra chest per floor |
| ⚡ Zoomies | 300+ | One extra monster per floor, seeds worth double |

## What's in the burrow

- **200 floors, 8 biomes** (Topsoil, Rootclay, Crystal Deep, Fungal Grotto, Frost Hollow, Magma Vent,
  Sunken Ruins, Void Burrow). Maps grow from 17×13 to 47×35. Three generators (caverns, dug-out rooms,
  warrens), random start, and more monsters and chests on bigger maps.
- **23 monsters with 6 behaviors:** chasers, fast movers (2 steps a turn), slow tanks, ranged
  spitters (web, spit, feathers), exploding fire ants, regenerators. Kinds unlock with depth (beetle
  and rat on B1 up to golem on B55 and wraith on B70), and every monster scales with depth.
- **6 bosses:** the Tabby, the Weasel Warlord, the Great Horned Owl, the Serpent Queen and the Fox
  Shogun take turns on boss floors; the Cat Emperor waits on floor 200. Bosses enrage (two actions a
  turn) below a third of their HP and always drop a boss chest with two boosted rolls.
- **40+ items.** 16 weapons (Twig → Wheel of Fate), some piercing, cleaving, leeching or with bonus
  crit; 12 armors (Walnut Helm → Starweave); 8 slings (Pebble Toss → Star Cannon); 12 charms. Chest
  tiers climb with depth; worse gear is salvaged for seeds.
- **Traps** punctuate open floor. Spikes sit in the ground for two turns, hold open for two, then
  retract. They only bite while the spikes are fully out.
- **Growth.** Kills give XP and level you up (+HP, +ATK); stairways let you rest; your Squeek's NFT
  level sets your starting HP and attack, and its onchain art colors your hero.
- **Pressure.** Linger past 300 turns on one floor and the burrow caves in. This also bounds how much
  gas one floor's replay can cost.
- **Score** = seeds + monster bounties (scaled by depth) + 50 per floor descended, + 5000 for winning.

## Layout

```
index.html                  shell, HUD, side panels
style.css                   pixel UI
engine.js                   deterministic rules engine (integer only)
game.js                     canvas renderer, input, presentation
sprites.js                  atlas loading, hero recoloring
chain.js                    Sepolia reads and writes
abi.js                      generated contract ABI
config.js                   RPC, explorer, GAME_ADDRESS
assets/                     pxl sprite sheets + frame JSON
```

The site is static. There is no build step: open `index.html`, or serve the folder.

## Play locally

```sh
cd web && python3 -m http.server 8080
```

Open `http://localhost:8080/?practiceFloor=75` to practice from a deeper floor with matching gear.

## Controls

`WASD` / arrows move and melee · `Shift`+direction, `IJKL`, or `F`+direction slings a pebble ·
`Space` waits · `C` saves floors onchain · `Q` leaves the burrow.

## Onchain

Sepolia only, chain id `11155111`.

| Contract | Address |
|---|---|
| SqueekDelve | `0x4c33Ec2dC78Ec3EAE3d5c25907736E950218222a` |
| DelveRules | `0x1FB93d5120846b6c85f77533Ec03661772c2fe71` |

Gameplay never needs a wallet: practice runs are local and free. Ranked runs check `SqueekNFT`
ownership, draw a seed, and every saved floor is replayed by `DelveRules` onchain.

## Credit

Art, rules and contracts built for Squeekchain. Squeek NFT holders only for ranked play.
