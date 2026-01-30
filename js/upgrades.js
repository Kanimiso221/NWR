import { clamp } from "./math.js";

// ---------------------------------------------------------------------------
// Upgrade pool (v2): more variety, fewer "always-picks", and less runaway stacking.
// ---------------------------------------------------------------------------

export const RARITY = {
  // Stronger = much rarer.
  common:    { w: 78.0, tag: "common" },
  uncommon:  { w: 18.0, tag: "uncommon" },
  rare:      { w:  3.2, tag: "rare" },
  epic:      { w:  0.55, tag: "epic" },
  legendary: { w:  0.10, tag: "legendary" },
};

// Early rooms should mostly be common/uncommon. Boss rewards can skew slightly higher.
function rarityRoomMul(rarity, room, isBossReward){
  let m = 1.0;

  // Gate the very top early (so LEGENDARY feels like a... LEGEND).
  if (room <= 4){
    if (rarity === "rare") m *= 0.70;
    if (rarity === "epic") m *= 0.28;
    if (rarity === "legendary") m *= 0.0;
  } else if (room <= 8){
    if (rarity === "rare") m *= 0.90;
    if (rarity === "epic") m *= 0.60;
    if (rarity === "legendary") m *= 0.08;
  } else if (room <= 12){
    if (rarity === "epic") m *= 0.85;
    if (rarity === "legendary") m *= 0.20;
  } else if (room <= 18){
    if (rarity === "legendary") m *= 0.45;
  }

  if (isBossReward){
    if (rarity === "common") m *= 0.85;
    if (rarity === "uncommon") m *= 1.10;
    if (rarity === "rare") m *= 1.25;
    if (rarity === "epic") m *= 1.55;
    if (rarity === "legendary") m *= 2.40;
  }

  return m;
}


// Notes on fields used by rollChoices:
// - unique: if true, won't be offered again once owned.
// - stackPenalty: higher => stacking becomes rarer faster.
// - prefWeapon: favors appearing when player.weaponId matches.

export const UPGRADES = [
  // -------------------------------------------------------------------------
  // COMMON (bread, butter, and a bit of spice)
  // -------------------------------------------------------------------------
  {
    id: "rapid_trigger",
    name: "Rapid Trigger",
    rarity: "common",
    stats: "連射 +16%",
    desc: "連射が上がる。手数で押し切る基本強化。",
    stackPenalty: 1.8,
    apply(p){ p.mods.fireMul *= 1.16; }
  },
  {
    id: "heavy_caliber",
    name: "Heavy Caliber",
    rarity: "common",
    stats: "与ダメ +18%",
    desc: "1発が重くなる。硬い敵に強い。",
    stackPenalty: 1.8,
    apply(p){ p.mods.dmgMul *= 1.18; }
  },
  {
    id: "mag_rails",
    name: "Magnetic Rails",
    rarity: "common",
    stats: "弾速 +12%",
    desc: "弾が速くなる。動く敵に当てやすい。",
    apply(p){ p.mods.bulletSpeedMul *= 1.12; }
  },
  {
    id: "range_extender",
    name: "Range Extender",
    rarity: "common",
    stats: "射程 +18%",
    desc: "弾が遠くまで届く。距離を取って戦いやすい。",
    apply(p){ p.mods.bulletLifeMul *= 1.18; }
  },
  {
    id: "wide_bore",
    name: "Wide Bore",
    rarity: "common",
    stats: "弾サイズ +18% / 拡散 +6%",
    desc: "弾が大きくなって当てやすい。代わりに少し散る。",
    stackPenalty: 1.2,
    apply(p){
      p.mods.bulletRadiusMul *= 1.18;
      p.mods.focusSpreadMul *= 1.06;
    }
  },
  {
    id: "recoil_dampener",
    name: "Recoil Dampener",
    rarity: "common",
    stats: "拡散 -12%",
    desc: "拡散が減る。遠距離でも狙いやすい。",
    apply(p){ p.mods.focusSpreadMul *= 0.88; }
  },
  {
    id: "slick_boots",
    name: "Slick Boots",
    rarity: "common",
    stats: "移動速度 +10%",
    desc: "移動が速くなる。被弾を減らす万能強化。",
    apply(p){ p.mods.moveMul *= 1.10; }
  },
  {
    id: "kinetic_plating",
    name: "Kinetic Plating",
    rarity: "common",
    stats: "最大HP +18",
    desc: "最大HPが増える。被弾が多い時の保険。",
    apply(p){
      p.hpMax += 18;
      p.hp = clamp(p.hp + 18, 0, p.hpMax);
    }
  },
  {
    id: "focus_lens",
    name: "Focus Lens",
    rarity: "common",
    stats: "FOCUS消費 -20%",
    desc: "FOCUSが長持ち。減速を長く使える。",
    apply(p){ p.mods.focusCostMul *= 0.80; }
  },
  {
    id: "focus_capacitor",
    name: "Focus Capacitor",
    rarity: "common",
    stats: "FOCUS回復 +15%",
    desc: "FOCUSの回復が速くなる。減速を頻繁に使える。",
    apply(p){ p.mods.focusRegenMul *= 1.15; }
  },
  {
    id: "dash_cell",
    name: "Dash Cell",
    rarity: "common",
    stats: "ダッシュCD -14%",
    desc: "ダッシュが早く戻る。危ない時の逃げが楽。",
    apply(p){ p.mods.dashCdMul *= 0.86; }
  },
  {
    id: "micro_thrusters",
    name: "Micro Thrusters",
    rarity: "common",
    stats: "ダッシュ距離 +18%",
    desc: "ダッシュの距離が伸びる。囲まれた時に抜けやすい。",
    apply(p){ p.mods.dashDistMul *= 1.18; }
  },
  {
    id: "pickup_magnet",
    name: "Pickup Magnet",
    rarity: "common",
    stats: "回復/FOCUS吸引",
    desc: "回復やFOCUSを少し引き寄せる。拾いに行くリスクが減る。",
    unique: true,
    apply(p){ p.mods.magnet = Math.max(p.mods.magnet, 1); }
  },
  {
    id: "scrap_converter",
    name: "Scrap Converter",
    rarity: "common",
    stats: "FORCE獲得 +20%",
    desc: "FORCE獲得が増える。ショップを活かしたい時に。",
    stackPenalty: 1.3,
    apply(p){ p.mods.forceGainMul *= 1.20; }
  },
  {
    id: "critical_pin",
    name: "Critical Pin",
    rarity: "common",
    stats: "クリ率 +2%",
    desc: "クリティカルが出やすくなる。FOCUS中と相性◎。",
    stackPenalty: 1.4,
    apply(p){ p.mods.focusCritAdd += 0.02; }
  },

  // -------------------------------------------------------------------------
  // UNCOMMON (build pivots / small tradeoffs)
  // -------------------------------------------------------------------------
  {
    id: "frugal_trigger",
    name: "Frugal Trigger",
    rarity: "uncommon",
    stats: "連射 +12% / 与ダメ -6%",
    desc: "連射が上がる代わりに1発が少し軽くなる。手数型。",
    stackPenalty: 1.4,
    apply(p){
      p.mods.fireMul *= 1.12;
      p.mods.dmgMul *= 0.94;
    }
  },
  {
    id: "precision_coil",
    name: "Precision Coil",
    rarity: "uncommon",
    stats: "拡散 -20% / 弾速 -4%",
    desc: "弾がまとまり当てやすい。代わりに弾速が少し落ちる。",
    apply(p){
      p.mods.focusSpreadMul *= 0.80;
      p.mods.bulletSpeedMul *= 0.96;
    }
  },
  {
    id: "sharp_wires",
    name: "Sharp Wires",
    rarity: "uncommon",
    stats: "クリダメ +12%",
    desc: "クリティカルのダメージが上がる。",
    stackPenalty: 1.5,
    apply(p){ p.mods.critMul *= 1.12; }
  },
  {
    id: "chrono_budget",
    name: "Chrono Budget",
    rarity: "uncommon",
    stats: "FOCUS消費 -14% / 連射 -6%",
    desc: "FOCUSが長持ちする代わりに連射が少し落ちる。",
    apply(p){
      p.mods.focusCostMul *= 0.86;
      p.mods.fireMul *= 0.94;
    }
  },
  {
    id: "hyper_recovery",
    name: "Hyper Recovery",
    rarity: "uncommon",
    stats: "キルでHP+1 / 最大HP +10",
    desc: "キルで少し回復。最大HPも増えて粘りやすい。",
    unique: true,
    apply(p){
      p.mods.vamp = Math.max(p.mods.vamp, 1);
      p.hpMax += 10;
      p.hp = clamp(p.hp + 10, 0, p.hpMax);
    }
  },
  {
    id: "impulse_suspension",
    name: "Impulse Suspension",
    rarity: "uncommon",
    stats: "移動 +6% / ダッシュCD -10%",
    desc: "移動とダッシュ回転が少し良くなる。",
    apply(p){
      p.mods.moveMul *= 1.06;
      p.mods.dashCdMul *= 0.90;
    }
  },
  {
    id: "needle_spool",
    name: "Needle Spool",
    rarity: "uncommon",
    stats: "Needle: 連射 +22%",
    desc: "Needleが得意になる。違う武器でも少し連射アップ。",
    prefWeapon: "needle",
    stackPenalty: 1.6,
    apply(p){ if(p.weaponId === "needle") p.mods.fireMul *= 1.22; else p.mods.fireMul *= 1.06; }
  },
  {
    id: "prism_lens",
    name: "Prism Lens",
    rarity: "uncommon",
    stats: "Prism: 与ダメ +16%",
    desc: "Prismが得意になる。違う武器でも少し火力アップ。",
    prefWeapon: "prism",
    stackPenalty: 1.6,
    apply(p){ if(p.weaponId === "prism") p.mods.dmgMul *= 1.16; else p.mods.dmgMul *= 1.05; }
  },
  {
    id: "rail_capacitors",
    name: "Rail Capacitors",
    rarity: "uncommon",
    stats: "Rail: 与ダメ +22% / 拡散 +10%",
    desc: "Railの一撃が重くなる。代わりに少し散る。",
    prefWeapon: "rail",
    apply(p){
      if(p.weaponId === "rail"){
        p.mods.dmgMul *= 1.22;
        p.mods.focusSpreadMul *= 1.10;
      } else {
        p.mods.dmgMul *= 1.06;
      }
    }
  },

  // -------------------------------------------------------------------------
  // RARE (build engines)
  // -------------------------------------------------------------------------
  {
    id: "piercing_rounds",
    name: "Piercing Rounds",
    rarity: "rare",
    stats: "貫通 +1",
    desc: "弾が敵を貫通する。一直線にまとめて削れる。",
    stackPenalty: 1.6,
    apply(p){ p.mods.pierce += 1; }
  },
  {
    id: "overclock",
    name: "Overclock",
    rarity: "rare",
    stats: "連射 +14% / 与ダメ +10%",
    desc: "連射と火力が上がる。迷ったらコレ枠。",
    stackPenalty: 2.2,
    apply(p){
      p.mods.fireMul *= 1.14;
      p.mods.dmgMul *= 1.10;
    }
  },
  {
    id: "chrono_sights",
    name: "Chrono Sights",
    rarity: "rare",
    stats: "FOCUS中: 与ダメ +15% / クリ+4%",
    desc: "FOCUS中の火力とクリ率が上がる。減速を攻めに変える。",
    stackPenalty: 1.8,
    apply(p){
      p.mods.focusDmgMul *= 1.15;
      p.mods.focusCritAdd += 0.04;
    }
  },
  {
    id: "long_dash",
    name: "Long Dash",
    rarity: "rare",
    stats: "ダッシュ距離 +35%",
    desc: "ダッシュ距離が大きく伸びる。回避が一気に楽。",
    stackPenalty: 1.4,
    apply(p){ p.mods.dashDistMul *= 1.35; }
  },
  {
    id: "chain_spark",
    name: "Chain Spark",
    rarity: "rare",
    stats: "命中: 連鎖ジャンプ",
    desc: "命中が近くの敵へ連鎖する。群れに強い。",
    unique: true,
    apply(p){
      p.mods.chain = 1;
      p.mods.chainCount = Math.max(p.mods.chainCount || 0, 1);
      p.mods.chainRange = Math.max(p.mods.chainRange || 1, 1.0);
      p.mods.chainDamageMul = Math.max(p.mods.chainDamageMul || 0.55, 0.55);
    }
  },
  {
    id: "arc_lattice",
    name: "Arc Lattice",
    rarity: "rare",
    stats: "連鎖: +1跳 / 射程 +20%",
    desc: "連鎖が1回増え、届く距離も伸びる。",
    stackPenalty: 1.7,
    apply(p){
      p.mods.chain = 1;
      p.mods.chainCount = (p.mods.chainCount || 1) + 1;
      p.mods.chainRange = (p.mods.chainRange || 1) * 1.20;
    }
  },
  {
    id: "orbit_blades",
    name: "Orbit Blades",
    rarity: "rare",
    stats: "周回刃: 2枚",
    desc: "周りに刃が回る。近づく敵への自衛になる。",
    unique: true,
    apply(p){ p.mods.blades = Math.max(p.mods.blades, 2); }
  },
  {
    id: "vampiric_protocol",
    name: "Vampiric Protocol",
    rarity: "rare",
    stats: "キルでHP+2",
    desc: "キルでHPが回復する。長期戦が安定する。",
    unique: true,
    apply(p){ p.mods.vamp = Math.max(p.mods.vamp, 2); }
  },
  {
    id: "blast_radius",
    name: "Blast Radius",
    rarity: "rare",
    stats: "爆発半径 +22%",
    desc: "爆発の範囲が広がる。群れ処理が楽。",
    stackPenalty: 1.6,
    apply(p){ p.mods.explodeRadiusMul *= 1.22; }
  },
  {
    id: "shaped_charge",
    name: "Shaped Charge",
    rarity: "rare",
    stats: "爆発ダメ +18%",
    desc: "爆発のダメージが上がる。硬い敵にも効く。",
    stackPenalty: 1.7,
    apply(p){ p.mods.explodeDamageMul *= 1.18; }
  },

  // -------------------------------------------------------------------------
  // EPIC (run-defining)
  // -------------------------------------------------------------------------
  {
    id: "nova_core",
    name: "Nova Core",
    rarity: "epic",
    stats: "E: ARC NOVA",
    desc: "アクティブで衝撃波。囲まれた時に一掃できる。",
    unique: true,
    apply(p){
      p.mods.nova = 1;
      p.skill.novaCdMax = Math.max(7.0, p.skill.novaCdMax);
    }
  },
  {
    id: "glass_cannon",
    name: "Glass Cannon",
    rarity: "epic",
    stats: "与ダメ +50% / 最大HP -20%",
    desc: "火力が大きく上がるが最大HPが減る。上級者向け。",
    unique: true,
    apply(p){
      p.mods.dmgMul *= 1.50;
      p.hpMax = Math.max(40, Math.floor(p.hpMax * 0.80));
      p.hp = clamp(p.hp, 0, p.hpMax);
    }
  },
  {
    id: "storm_barrel",
    name: "Storm Barrel",
    rarity: "epic",
    stats: "弾速 +22% / 連射 +18%",
    desc: "弾が速く、連射も上がる。動く敵に強い。",
    unique: true,
    apply(p){
      p.mods.bulletSpeedMul *= 1.22;
      p.mods.fireMul *= 1.18;
    }
  },
  {
    id: "stabilizer",
    name: "Stabilizer",
    rarity: "epic",
    stats: "拡散 -30% / クリ+3%",
    desc: "拡散が大きく減り、クリ率も少し上がる。",
    unique: true,
    apply(p){
      p.mods.focusSpreadMul *= 0.70;
      p.mods.focusCritAdd += 0.03;
    }
  },
  {
    id: "blood_siphon",
    name: "Blood Siphon",
    rarity: "epic",
    stats: "命中回復: 与ダメの3%",
    desc: "命中した分だけ少し回復する。手数が多いほど嬉しい。",
    unique: true,
    apply(p){ p.mods.leech = Math.max(p.mods.leech || 0, 0.03); }
  },
  {
    id: "knife_edge",
    name: "Knife-Edge",
    rarity: "epic",
    stats: "与ダメ +28% / FOCUS消費 +12%",
    desc: "火力が上がるがFOCUS消費も増える。減速の使い所が大事。",
    stackPenalty: 2.0,
    apply(p){
      p.mods.dmgMul *= 1.28;
      p.mods.focusCostMul *= 1.12;
    }
  },

  // -------------------------------------------------------------------------
  // LEGENDARY (very rare, very loud)
  // -------------------------------------------------------------------------
  {
    id: "black_sun_reactor",
    name: "Black Sun Reactor",
    rarity: "legendary",
    stats: "連射 +18% / 与ダメ +18% / クリ+4% / 最大HP -15%",
    desc: "火力も連射も伸びる超強化。代わりに最大HPが減る。",
    unique: true,
    apply(p){
      p.mods.fireMul *= 1.18;
      p.mods.dmgMul *= 1.18;
      p.mods.focusCritAdd += 0.04;
      p.hpMax = Math.max(40, Math.floor(p.hpMax * 0.85));
      p.hp = clamp(p.hp, 0, p.hpMax);
    }
  },
];


export function rollChoices(rng, player, room=1, count=3, isBossReward=false){
  // Avoid duplicates in a single pick; allow stacking by rerolling with weight penalty
  const owned = new Map(player.upgrades.map(u => [u.id, u.stack]));
  const rnum = room|0;

  // Be defensive: ignore holes/undefined entries and unknown rarities.
  const pool = UPGRADES.filter(Boolean).map(u => {
    const stack = owned.get(u.id) || 0;
    const rarityKey = String(u.rarity || "common").toLowerCase();
    const rarity = RARITY[rarityKey] || RARITY.common;
    const baseW = rarity.w || 1;

    // Room-based skew: high rarities become slightly more likely later, boss rewards skew higher.
    const stageMul = rarityRoomMul(rarityKey, rnum, !!isBossReward);

    // prevent "dead" repeats for one-time engines
    if (u.unique && stack > 0) {
      return { ...u, rarity: rarityKey, _w: 0 };
    }

    // Stacking becomes less likely (but possible). Certain upgrades opt into harsher stacking.
    const stackPenalty = (typeof u.stackPenalty === "number") ? u.stackPenalty : 0.9;
    let w = (baseW * stageMul) / (1 + stack * stackPenalty);

    // Mild weapon bias (still possible to "plan ahead", but rare).
    if (u.prefWeapon) {
      w *= (player.weaponId === u.prefWeapon) ? 1.65 : 0.35;
    }

    // Guard NaN/negatives.
    if (!isFinite(w) || w < 0) w = 0;
    return { ...u, rarity: rarityKey, _w: w };
  });

  const chosen = [];
  const used = new Set();
  for(let i=0;i<count;i++){
    const pick = weightedPick(rng, pool, used);
    if(!pick) break;
    used.add(pick.id);
    chosen.push(pick);
  }
  return chosen;
}

function weightedPick(rng, pool, used){
  let total = 0;
  for(const u of pool){
    if(used.has(u.id)) continue;
    total += u._w;
  }
  if(total <= 0) return null;

  let r = rng() * total;
  for(const u of pool){
    if(used.has(u.id)) continue;
    r -= u._w;
    if(r <= 0) return u;
  }
  // fallback
  for(const u of pool){
    if(!used.has(u.id)) return u;
  }
  return null;
}
