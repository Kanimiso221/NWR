// Shop stock generation and pricing.
// Keeping this separate from game.js makes future tuning much easier.

const RARITY_W = {
  common: 1.0,
  uncommon: 0.62,
  rare: 0.28,
  epic: 0.12,
  legendary: 0.04,
};

function _rarityWeight(rarity, room){
  const r = String(rarity || "common").toLowerCase();
  let w = RARITY_W[r] ?? 1.0;

  // Early rooms: keep the spice locked away.
  if(room <= 3){
    if(r === "rare") w *= 0.65;
    if(r === "epic") w *= 0.35;
    if(r === "legendary") w *= 0.0;
  } else if(room <= 6){
    if(r === "epic") w *= 0.70;
    if(r === "legendary") w *= 0.08;
  } else if(room <= 10){
    if(r === "legendary") w *= 0.20;
  }

  return Math.max(0, w);
}

function _weightedPick(rng, arr, weightFn){
  if(!arr.length) return null;
  let total = 0;
  const wts = new Array(arr.length);
  for(let i=0;i<arr.length;i++){
    const w = Math.max(0, (weightFn(arr[i]) || 0));
    wts[i] = w;
    total += w;
  }
  if(total <= 0) return arr[(rng() * arr.length) | 0];
  let r = rng() * total;
  for(let i=0;i<arr.length;i++){
    r -= wts[i];
    if(r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function _weightedSplice(rng, arr, weightFn){
  if(!arr.length) return null;
  let total = 0;
  const wts = new Array(arr.length);
  for(let i=0;i<arr.length;i++){
    const w = Math.max(0, (weightFn(arr[i]) || 0));
    wts[i] = w;
    total += w;
  }
  let idx = 0;
  if(total <= 0){
    idx = (rng() * arr.length) | 0;
    return arr.splice(idx, 1)[0];
  }
  let r = rng() * total;
  for(let i=0;i<arr.length;i++){
    r -= wts[i];
    if(r <= 0){ idx = i; break; }
  }
  return arr.splice(idx, 1)[0];
}

export function getShopRerollCost(room, rerolls){
  const r = Math.max(1, room|0);
  const k = Math.max(0, rerolls|0);

  // Tuned to make "shop choices" matter.
  // Early: rerolls are a luxury. Late: still possible, but you'll feel it.
  return Math.max(18, Math.floor(28 + r * 2.4 + k * (18 + r * 0.35)));
}

export function rollShopStock(game){
  const items = [];
  const room = game.room|0;
  const weapon = game.player?.weaponId || "pulse";
  const rng = game._rng || Math.random;

  const push = (it) => items.push(it);
  const rw = (it) => _rarityWeight(it.rarity, room);

  // --- Utility slot (always)
  push({
    id: "repair_kit",
    rarity: "common",
    name: "リペアキット",
    cost: Math.floor(22 + room * 1.8),
    stats: "HP回復 +45",
    desc: "その場でHPを45回復する。",
    apply: (g) => { g.player.heal(45); },
  });

  // Optional: focus refill
  if(rng() < 0.55){
    push({
      id: "focus_gel",
      rarity: "common",
      name: "フォーカスジェル",
      cost: Math.floor(18 + room * 1.4),
      stats: "FOCUS回復 +60",
      desc: "その場でFOCUSを60回復する。",
      apply: (g) => { g.player.focus = Math.min(g.player.focusMax, g.player.focus + 60); },
    });
  }

  // --- Weapon offer (one)
  const weaponPool = [
    { id: "wp_pulse", weaponId: "pulse", name: "武器: Pulse", rarity: "common", cost: Math.floor(28 + room * 2.0), stats: "標準の単発",
    desc: "どの距離でも扱いやすい。迷ったらコレ。" },
    { id: "wp_needle", weaponId: "needle", name: "武器: Needle", rarity: "common", cost: Math.floor(34 + room * 2.4), stats: "短射程・高速連射",
    desc: "近～中距離の追い撃ちが得意。遠距離と集団は苦手。" },
    { id: "wp_burst", weaponId: "burst", name: "武器: Burst", rarity: "uncommon", cost: Math.floor(42 + room * 2.8), stats: "3点バースト",
    desc: "中距離が安定。近距離の群れには押されやすい。" },
    { id: "wp_prism", weaponId: "prism", name: "武器: Prism", rarity: "rare", cost: Math.floor(54 + room * 3.2), stats: "3方向ショット",
    desc: "狙いがブレても当たりやすい。1発は軽めで遠距離は削りづらい。" },
    { id: "wp_scatter", weaponId: "scatter", name: "武器: Scatter", rarity: "rare", cost: Math.floor(56 + room * 3.4), stats: "近距離ショットガン",
    desc: "接近戦は強いが、距離が離れると当たりにくい。" },
    { id: "wp_launcher", weaponId: "launcher", name: "武器: Launcher", rarity: "epic", cost: Math.floor(82 + room * 4.2), stats: "爆発・遅い連射",
    desc: "飛んで爆発する弾。群れに強いが連射が遅い。" },
    { id: "wp_rail", weaponId: "rail", name: "武器: Rail", rarity: "epic", cost: Math.floor(86 + room * 4.4), stats: "超高速・貫通",
    desc: "一直線にまとめて貫く。連射は遅いので外すと痛い。" },
  ].filter(w => w.weaponId !== weapon);

  if(weaponPool.length){
    const w = _weightedPick(rng, weaponPool, rw);
    push({
      id: w.id,
      rarity: w.rarity,
      name: w.name,
      cost: w.cost,
      desc: w.desc,
      apply: (g) => { g.player.setWeapon(w.weaponId); },
    });
  }

  // --- Augments (2)
  const augPool = [
    { id: "aug_plating", rarity: "uncommon", name: "プレーティング", cost: Math.floor(34 + room * 2.1), stats: "最大HP +24",
      desc: "最大HPが増える。買った瞬間に少し回復する。", apply: (g) => { g.player.hpMax += 24; g.player.hp = Math.min(g.player.hpMax, g.player.hp + 24); } },
    { id: "aug_capacitor", rarity: "uncommon", name: "キャパシタ", cost: Math.floor(34 + room * 1.9), stats: "最大FOCUS +60",
      desc: "最大FOCUSが増える。買った瞬間に少し回復する。", apply: (g) => { g.player.focusMax += 60; g.player.focus = Math.min(g.player.focusMax, g.player.focus + 40); } },
    { id: "aug_thrusters", rarity: "rare", name: "スラスター", cost: Math.floor(52 + room * 2.6), stats: "移動速度 +12%",
      desc: "移動が速くなり、被弾を減らしやすい。", apply: (g) => { g.player.mods.moveMul *= 1.12; } },
    { id: "aug_calibration", rarity: "common", name: "キャリブレーション", cost: Math.floor(26 + room * 1.6), stats: "弾速 +12%",
      desc: "弾が速くなり、動く敵に当てやすい。", apply: (g) => { g.player.mods.bulletSpeedMul *= 1.12; } },
    { id: "aug_overclock", rarity: "rare", name: "オーバークロック", cost: Math.floor(56 + room * 2.9), stats: "連射 +14%",
      desc: "連射が上がる。手数で押したい時に。", apply: (g) => { g.player.mods.fireMul *= 1.14; } },
    { id: "aug_stabilizer", rarity: "rare", name: "スタビライザー", cost: Math.floor(54 + room * 2.7), stats: "拡散 -18%",
      desc: "弾がまとまり、遠距離でも当てやすい。", apply: (g) => { g.player.mods.focusSpreadMul *= 0.82; } },

    // "Melee" flavored options (no new control scheme, still meaningful):
    { id: "aug_orbit_blades", rarity: "rare", name: "オービットブレード", cost: Math.floor(60 + room * 2.9), stats: "周回刃 2枚",
      desc: "周りに刃が回る。近づく敵への自衛になる。", apply: (g) => { g.player.mods.blades = Math.max(g.player.mods.blades, 2); } },
    { id: "aug_blood_siphon", rarity: "epic", name: "ブラッドサイフォン", cost: Math.floor(92 + room * 3.6), stats: "キル回復 +3",
      desc: "敵を倒すたびHP回復。長期戦が安定する。", apply: (g) => { g.player.mods.vamp = Math.max(g.player.mods.vamp, 3); } },
  ];

  // Add one "economy" slot sometimes so you can choose shop-forward runs.
  if(rng() < 0.45){
    augPool.push({
      id: "aug_force_extractor",
      rarity: "uncommon",
      name: "フォースエクストラクター",
      cost: Math.floor(44 + room * 2.2),
      stats: "FORCE獲得 +15%",
      desc: "FORCEが増えやすくなる。ショップ中心のランに。",
      apply: (g) => { g.player.mods.forceGainMul = Math.max(g.player.mods.forceGainMul || 1, 1.15); },
    });
  }

  for(let k=0;k<2;k++){
    const it = _weightedSplice(rng, augPool, rw);
    if(!it) break;
    push(it);
  }

  // Trim if we got too many items due to Focus Gel.
  // (UI has a 3-column layout; keeping 4-5 feels nice.)
  while(items.length > 5) items.splice(1, 1);

  return items;
}
