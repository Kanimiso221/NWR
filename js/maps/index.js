import { clamp } from "../math.js";

function rr(rng, a=1, b=0){
  // random in [b,a)
  return b + rng() * (a - b);
}
function rri(rng, a, b){
  const lo = Math.min(a,b), hi = Math.max(a,b);
  return Math.floor(lo + rng() * (hi - lo + 1));
}

function rect(x,y,w,h, extra={}){
  return { shape:"rect", x, y, w, h, ...extra };
}
function circle(x,y,r, extra={}){
  return { shape:"circle", x, y, r, ...extra };
}

// normalized (unit) hazard descriptors resolved per-room in game.js
function urect(ux, uy, wMul, hMul, extra={}){
  return { shape:"rect", ux, uy, wMul, hMul, ...extra };
}
function ucircle(ux, uy, rMul, extra={}){
  return { shape:"circle", ux, uy, rMul, ...extra };
}

const STAGES = [
  {
    id: "neon_alley",
    name: "NEON ALLEY",
    gimmick: "Baseline layout. Mixed cover (some blocks bullets, some doesn't).",
    rooms: ["Backstreet", "Sign Canyon", "Billboard Row", "Crosswalk", "Overpass", "Terminal"],
    theme: { bg0: [8, 10, 26], bg1: [14, 20, 42], grid: [180, 230, 255, 0.12] },
    hazards: [],
    fields: { magnet: [], void: [] },
    obstacle: { rectBulletsBlock: true, circleBulletsBlockChance: 0.20, materials: ["neon","glass","metal"] }
  },
  {
    id: "lava_works",
    name: "LAVA WORKS",
    gimmick: "Lava scorches (fast HP drain).",
    rooms: ["Furnace Walk", "Smelter Floor", "Cinder Ramp", "Crucible", "Red Pipe Maze", "Foundry"],
    theme: { bg0: [18, 6, 6], bg1: [32, 10, 10], grid: [255, 160, 90, 0.12] },
    hazards: [],

    hazardLayouts: [
      // 0) Pools
      [
        urect(0.0, 0.0, 0.62, 0.38, { type:"lava", dps: 18 }),
        urect(-0.62, 0.55, 0.46, 0.30, { type:"lava", dps: 16 }),
        urect(0.62, -0.55, 0.46, 0.30, { type:"lava", dps: 16 }),
      ],
      // 1) River
      [
        urect(0.0, 0.0, 1.42, 0.22, { type:"lava", dps: 17 }),
        ucircle(-0.58, -0.52, 0.22, { type:"lava", dps: 16 }),
        ucircle(0.58, 0.52, 0.22, { type:"lava", dps: 16 }),
      ],
      // 2) Corners + hot core
      [
        ucircle(-0.68, -0.48, 0.26, { type:"lava", dps: 16 }),
        ucircle(0.68, -0.48, 0.26, { type:"lava", dps: 16 }),
        ucircle(-0.68, 0.48, 0.26, { type:"lava", dps: 16 }),
        ucircle(0.68, 0.48, 0.26, { type:"lava", dps: 16 }),
        urect(0.0, 0.0, 0.36, 0.22, { type:"lava", dps: 18 }),
      ],
      // 3) Ring (safe-ish center)
      [
        urect(0.0, -0.68, 1.55, 0.22, { type:"lava", dps: 17 }),
        urect(0.0,  0.68, 1.55, 0.22, { type:"lava", dps: 17 }),
        urect(-0.78, 0.0, 0.22, 1.25, { type:"lava", dps: 17 }),
        urect( 0.78, 0.0, 0.22, 1.25, { type:"lava", dps: 17 }),
      ],
      // 4) Cross
      [
        urect(0.0, 0.0, 1.20, 0.22, { type:"lava", dps: 17 }),
        urect(0.0, 0.0, 0.22, 1.15, { type:"lava", dps: 17 }),
        ucircle(0.55, -0.55, 0.18, { type:"lava", dps: 16 }),
        ucircle(-0.55, 0.55, 0.18, { type:"lava", dps: 16 }),
      ],
    ],
    fields: { magnet: [], void: [] },
    obstacle: { rectBulletsBlock: true, circleBulletsBlockChance: 0.28, materials: ["lavaRock","metal"] }
  },
  {
    id: "cryo_vault",
    name: "CRYO VAULT",
    gimmick: "Ice is VERY slippery (ice-skate glide).",
    rooms: ["Cold Corridor", "Frost Hall", "Ice Shelf", "Cryo Chamber", "Blue Lab", "Freezer"],
    theme: { bg0: [5, 14, 22], bg1: [10, 26, 40], grid: [170, 230, 255, 0.12] },
    hazards: [],

    hazardLayouts: [
      // 0) Wide slick floor + side shelves (classic)
      [
        urect(0.0, 0.0, 0.88, 0.52, { type:"ice", frictionMul: 0.03, speedMul: 1.22, antiFriction: 14.0, maxSpeed: 760 }),
        urect(-0.70, -0.25, 0.42, 0.34, { type:"ice", frictionMul: 0.05, speedMul: 1.18, antiFriction: 12.0, maxSpeed: 720 }),
        urect(0.70, 0.25, 0.42, 0.34, { type:"ice", frictionMul: 0.05, speedMul: 1.18, antiFriction: 12.0, maxSpeed: 720 }),
      ],
      // 1) Two long lanes (skate tracks)
      [
        urect(0.0, -0.55, 1.45, 0.20, { type:"ice", frictionMul: 0.03, speedMul: 1.20, antiFriction: 14.5, maxSpeed: 770 }),
        urect(0.0,  0.55, 1.45, 0.20, { type:"ice", frictionMul: 0.03, speedMul: 1.20, antiFriction: 14.5, maxSpeed: 770 }),
        urect(-0.62, 0.0, 0.30, 0.90, { type:"ice", frictionMul: 0.04, speedMul: 1.16, antiFriction: 13.0, maxSpeed: 740 }),
      ],
      // 2) Cross
      [
        urect(0.0, 0.0, 1.40, 0.18, { type:"ice", frictionMul: 0.03, speedMul: 1.20, antiFriction: 14.0, maxSpeed: 760 }),
        urect(0.0, 0.0, 0.18, 1.20, { type:"ice", frictionMul: 0.03, speedMul: 1.20, antiFriction: 14.0, maxSpeed: 760 }),
        ucircle(-0.62, -0.46, 0.18, { type:"ice", frictionMul: 0.05, speedMul: 1.14, antiFriction: 12.0, maxSpeed: 720 }),
        ucircle(0.62, 0.46, 0.18, { type:"ice", frictionMul: 0.05, speedMul: 1.14, antiFriction: 12.0, maxSpeed: 720 }),
      ],
      // 3) Diagonal slabs (fake diagonal)
      [
        urect(-0.60, -0.45, 0.45, 0.25, { type:"ice", frictionMul: 0.03, speedMul: 1.20, antiFriction: 14.0, maxSpeed: 760 }),
        urect(-0.20, -0.15, 0.45, 0.25, { type:"ice", frictionMul: 0.03, speedMul: 1.20, antiFriction: 14.0, maxSpeed: 760 }),
        urect(0.20,  0.15, 0.45, 0.25, { type:"ice", frictionMul: 0.03, speedMul: 1.20, antiFriction: 14.0, maxSpeed: 760 }),
        urect(0.60,  0.45, 0.45, 0.25, { type:"ice", frictionMul: 0.03, speedMul: 1.20, antiFriction: 14.0, maxSpeed: 760 }),
      ],
      // 4) Ice islands
      [
        ucircle(-0.55, -0.35, 0.28, { type:"ice", frictionMul: 0.03, speedMul: 1.21, antiFriction: 14.5, maxSpeed: 770 }),
        ucircle(0.55, -0.35, 0.28, { type:"ice", frictionMul: 0.03, speedMul: 1.21, antiFriction: 14.5, maxSpeed: 770 }),
        ucircle(-0.55, 0.35, 0.28, { type:"ice", frictionMul: 0.03, speedMul: 1.21, antiFriction: 14.5, maxSpeed: 770 }),
        ucircle(0.55, 0.35, 0.28, { type:"ice", frictionMul: 0.03, speedMul: 1.21, antiFriction: 14.5, maxSpeed: 770 }),
      ],
    ],
    fields: { magnet: [], void: [] },
    obstacle: { rectBulletsBlock: true, circleBulletsBlockChance: 0.18, materials: ["ice","glass","metal"] }
  },{
  id: "ice_skating_rink",
  name: "アイススケートリンク",
  gimmick: "全面氷: アイススケート級にツルツル滑る。",
  // Extremely rare special map (weight is relative to normal stages ~1.0)
  weight: 0.03,
  fixedRoom: { w: 2600, h: 1400 },
  rooms: ["Warmup", "Center Ice", "Rinkside", "Overtime", "Last Lap"],
  theme: { bg0: [6, 16, 30], bg1: [10, 26, 52], grid: [190, 240, 255, 0.15] },
  hazards: [],
  hazardPad: 0,
    hazardJitterMul: 0.0,
  hazardLayouts: [
    // Full ice field (fills the arena)
    [
      urect(0.0, 0.0, 99.0, 99.0, { type:"ice", frictionMul: 0.03 })
    ],
  ],
  fields: { magnet: [], void: [] },
  obstacle: { rectBulletsBlock: true, circleBulletsBlockChance: 0.10, materials: ["ice","glass","metal"] }
},

  {
    id: "toxic_bog",
    name: "TOXIC BOG",
    gimmick: "Toxic sludge drains HP slowly, slows you, and drains FOCUS.",
    rooms: ["Spore Yard", "Green Channel", "Moss Pit", "Leach Lane", "Vapor Park", "Greenhouse"],
    theme: { bg0: [6, 16, 12], bg1: [10, 26, 20], grid: [120, 255, 190, 0.12] },
    hazards: [],

    hazardLayouts: [
      // 0) Central sludge + side pools (classic)
      [
        urect(0.0, 0.0, 0.80, 0.50, { type:"toxic", dps: 3.0, slow: 0.78, focusDrain: 14, focusRegenMul: 0.25, focusCostMul: 2.3 }),
        ucircle(-0.72, 0.45, 0.22, { type:"toxic", dps: 2.6, slow: 0.82, focusDrain: 10, focusRegenMul: 0.35, focusCostMul: 2.0 }),
        ucircle(0.72, -0.45, 0.22, { type:"toxic", dps: 2.6, slow: 0.82, focusDrain: 10, focusRegenMul: 0.35, focusCostMul: 2.0 }),
      ],
      // 1) Vertical river
      [
        urect(0.0, 0.0, 0.26, 1.25, { type:"toxic", dps: 3.2, slow: 0.80, focusDrain: 12, focusRegenMul: 0.30, focusCostMul: 2.2 }),
        ucircle(-0.60, -0.48, 0.22, { type:"toxic", dps: 2.6, slow: 0.84, focusDrain: 10, focusRegenMul: 0.40, focusCostMul: 2.0 }),
        ucircle(0.60, 0.48, 0.22, { type:"toxic", dps: 2.6, slow: 0.84, focusDrain: 10, focusRegenMul: 0.40, focusCostMul: 2.0 }),
      ],
      // 2) Pockets
      [
        ucircle(-0.55, -0.40, 0.24, { type:"toxic", dps: 2.8, slow: 0.82, focusDrain: 10, focusRegenMul: 0.35, focusCostMul: 2.1 }),
        ucircle(0.55, -0.40, 0.24, { type:"toxic", dps: 2.8, slow: 0.82, focusDrain: 10, focusRegenMul: 0.35, focusCostMul: 2.1 }),
        ucircle(-0.60, 0.46, 0.20, { type:"toxic", dps: 2.6, slow: 0.84, focusDrain: 9, focusRegenMul: 0.40, focusCostMul: 2.0 }),
        ucircle(0.20, 0.52, 0.20, { type:"toxic", dps: 2.6, slow: 0.84, focusDrain: 9, focusRegenMul: 0.40, focusCostMul: 2.0 }),
        ucircle(-0.10, -0.05, 0.18, { type:"toxic", dps: 2.5, slow: 0.86, focusDrain: 8, focusRegenMul: 0.45, focusCostMul: 1.9 }),
      ],
      // 3) Ring (safe-ish center)
      [
        urect(0.0, -0.68, 1.55, 0.20, { type:"toxic", dps: 2.7, slow: 0.82, focusDrain: 10, focusRegenMul: 0.35, focusCostMul: 2.0 }),
        urect(0.0,  0.68, 1.55, 0.20, { type:"toxic", dps: 2.7, slow: 0.82, focusDrain: 10, focusRegenMul: 0.35, focusCostMul: 2.0 }),
        urect(-0.78, 0.0, 0.20, 1.25, { type:"toxic", dps: 2.7, slow: 0.82, focusDrain: 10, focusRegenMul: 0.35, focusCostMul: 2.0 }),
        urect( 0.78, 0.0, 0.20, 1.25, { type:"toxic", dps: 2.7, slow: 0.82, focusDrain: 10, focusRegenMul: 0.35, focusCostMul: 2.0 }),
      ],
      // 4) One-side swamp
      [
        urect(0.55, 0.0, 0.72, 1.05, { type:"toxic", dps: 3.1, slow: 0.78, focusDrain: 13, focusRegenMul: 0.28, focusCostMul: 2.2 }),
        ucircle(-0.55, -0.45, 0.22, { type:"toxic", dps: 2.5, slow: 0.86, focusDrain: 9, focusRegenMul: 0.40, focusCostMul: 2.0 }),
      ],
    ],
    fields: { magnet: [], void: [] },
    obstacle: { rectBulletsBlock: true, circleBulletsBlockChance: 0.22, materials: ["toxic","glass","metal"] }
  },
  {
    id: "magnetic_foundry",
    name: "MAGNETIC FOUNDRY",
    gimmick: "Magnetic field: bullets bend harder the closer they fly to each coil core.",
    rooms: ["Flux Hall", "Coilworks", "Arc Gallery", "Induction Bay", "Field Room", "Magnet Spine"],
    theme: { bg0: [6, 10, 18], bg1: [12, 14, 28], grid: [120, 255, 240, 0.12] },
    hazards: [],
    
    fieldLayouts: {
      magnet: [
        // 0) Single core (classic)
        [{ ux: 0.0, uy: 0.0, rMul: 0.98, omega: 52, soft: 150, pow: 2.7, dir: 1 }],
        // 1) Twin coils (left/right, opposite swirl)
        [{ ux: -0.45, uy: 0.0, rMul: 0.70, omega: 60, soft: 120, pow: 2.8, dir: 1 },
         { ux:  0.45, uy: 0.0, rMul: 0.70, omega: 60, soft: 120, pow: 2.8, dir: -1 }],
        // 2) Triangle coils
        [{ ux: 0.0,  uy: -0.40, rMul: 0.62, omega: 64, soft: 110, pow: 2.9, dir: 1 },
         { ux: -0.42, uy:  0.32, rMul: 0.62, omega: 64, soft: 110, pow: 2.9, dir: -1 },
         { ux: 0.42,  uy:  0.32, rMul: 0.62, omega: 64, soft: 110, pow: 2.9, dir: 1 }],
        // 3) Corner coils (smaller, creates weird lanes)
        [{ ux: -0.55, uy: -0.40, rMul: 0.55, omega: 72, soft: 105, pow: 3.0, dir: 1 },
         { ux:  0.55, uy: -0.40, rMul: 0.55, omega: 72, soft: 105, pow: 3.0, dir: -1 },
         { ux: -0.55, uy:  0.40, rMul: 0.55, omega: 72, soft: 105, pow: 3.0, dir: -1 },
         { ux:  0.55, uy:  0.40, rMul: 0.55, omega: 72, soft: 105, pow: 3.0, dir: 1 }],
      ],
      void: []
    },
    fields: { magnet: [], void: [] },
    obstacle: { rectBulletsBlock: true, circleBulletsBlockChance: 0.44, materials: ["metal","metal","glass"] }
  },
  {
    id: "void_rift",
    name: "VOID RIFT",
    gimmick: "Quicksand wells: pulled inward and slowed near the core. Keep moving.",
    rooms: ["Event Horizon", "Singularity", "Black Hall", "Riftline", "Null Atrium", "Gravity Well"],
    theme: { bg0: [4, 4, 10], bg1: [8, 8, 18], grid: [210, 170, 255, 0.11] },
    hazards: [],
    
    fieldLayouts: {
      magnet: [],
      void: [
        // 0) Single well (classic)
        [{ ux: 0.0, uy: 0.0, rMul: 0.92, pull: 2100, playerMul: 0.33, enemyMul: 0.55 }],
        // 1) Off-center well (creates a "bad side" of the room)
        [{ ux: 0.35, uy: -0.20, rMul: 0.86, pull: 2200, playerMul: 0.32, enemyMul: 0.58 }],
        // 2) Twin wells (tug-of-war)
        [{ ux: -0.40, uy: 0.18, rMul: 0.66, pull: 1900, playerMul: 0.30, enemyMul: 0.60 },
         { ux:  0.40, uy:-0.18, rMul: 0.66, pull: 1900, playerMul: 0.30, enemyMul: 0.60 }],
        // 3) Triple wells (churn)
        [{ ux: 0.0,  uy: -0.40, rMul: 0.56, pull: 1750, playerMul: 0.28, enemyMul: 0.62 },
         { ux: -0.46, uy:  0.30, rMul: 0.56, pull: 1750, playerMul: 0.28, enemyMul: 0.62 },
         { ux:  0.46, uy:  0.30, rMul: 0.56, pull: 1750, playerMul: 0.28, enemyMul: 0.62 }],
      ]
    },
    fields: { magnet: [], void: [] },
    obstacle: { rectBulletsBlock: true, circleBulletsBlockChance: 0.24, materials: ["void","metal","glass"] }
  },
];

export function pickStage(roomNumber, rng){
  // Weighted random selection; stages can declare "weight".
  // Extremely rare stages can use weight << 1 (e.g. Ice Skating Rink).
  const boss = (roomNumber % 5) === 0;

  // Optional filters (kept simple to avoid breaking older saves):
  // - stage.noBoss: do not appear on boss rooms.
  // - stage.bossOnly: appear only on boss rooms.
  const candidates = [];
  for(const s of STAGES){
    if(!s) continue;
    if(boss && s.noBoss) continue;
    if(!boss && s.bossOnly) continue;
    candidates.push(s);
  }
  const pool = candidates.length ? candidates : STAGES;

  let total = 0;
  for(const s of pool){
    total += (s.weight != null ? s.weight : 1);
  }
  let t = rng() * Math.max(0.000001, total);
  for(const s of pool){
    const w = (s.weight != null ? s.weight : 1);
    t -= w;
    if(t <= 0) return s;
  }
  return pool[pool.length - 1];
}


export function stagePointFx(stage, x, y){
  // returns {type, a, data} where a is 0..1 intensity
  let best = { type:"none", a:0, data:null };

  // hazards first
  for(const h of stage.hazards || []){
    let inside = false;
    if(h.shape === "rect"){
      inside = (Math.abs(x - h.x) <= h.w*0.5) && (Math.abs(y - h.y) <= h.h*0.5);
      if(inside){
        // intensity based on distance to edge
        const dx = 1 - Math.abs(x - h.x) / (h.w*0.5);
        const dy = 1 - Math.abs(y - h.y) / (h.h*0.5);
        const a = clamp(Math.min(dx,dy), 0, 1);
        if(a > best.a) best = { type: h.type, a, data: h };
      }
    }else if(h.shape === "circle"){
      const dx = x - h.x, dy = y - h.y;
      const d = Math.hypot(dx,dy);
      if(d <= h.r){
        const a = clamp(1 - d / h.r, 0, 1);
        if(a > best.a) best = { type: h.type, a, data: h };
      }
    }
  }

  // fields (magnet/void) if no stronger hazard, or if stronger field
  const checkField = (type, nodes, weight=0.85) => {
    for(const n of nodes || []){
      const dx = x - n.x, dy = y - n.y;
      const d = Math.hypot(dx,dy);
      if(d <= n.r){
        const a = clamp((1 - d / n.r) * weight, 0, 1);
        if(a > best.a) best = { type, a, data: n };
      }
    }
  };

  checkField("void", stage.fields?.void, 0.97);
  checkField("magnet", stage.fields?.magnet, 0.90);

  return best;
}

export function _maps(){
  return STAGES;
}
