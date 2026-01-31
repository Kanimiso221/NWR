// FOCUS modes (select one on title screen). Hold Space in-game to activate.
// Each mode is a "playstyle switch": power now, tradeoff now, and a clear reason to pick it.

export const FOCUS_MODES = [
  {
    id: "chrono",
    name: "CHRONO SHIFT",
    tagline: "世界だけを遅くする",
    desc: "世界だけを遅くする",
    details: "周囲の時間が強くスロー。回避と精密が安定する代わりに、火力は控えめで燃費も重い。",
    // role: time control (万能すぎるので「高燃費 + 低火力」で釣り合いを取る)
    timeScale: 0.34,
    ease: 14,
    costPerSec: 42,
    startCost: 14,
    minFocusToActivate: 12,
    recoverFocus: 22,
    moveMul: 1.00,
    fireMul: 0.92,
    bulletSpeedMul: 1.03,
    bulletLifeMul: 1.00,
    dmgMul: 0.90,
    critAdd: 0.02,
    spreadMul: 0.84,
  },
  {
    id: "overdrive",
    name: "OVERDRIVE",
    tagline: "自分を加速する",
    desc: "自分を加速する",
    details: "時間スローなしで自分だけが速い。攻めが伸びる代わりに、被ダメが増えて弾が散る。",
    // role: self-acceleration (操作感の快感) + 明確なリスク
    timeScale: 1.00,
    ease: 12,
    costPerSec: 34,
    startCost: 8,
    minFocusToActivate: 8,
    recoverFocus: 14,
    moveMul: 1.22,
    fireMul: 1.24,
    bulletSpeedMul: 1.12,
    bulletLifeMul: 1.00,
    dmgMul: 1.05,
    dmgTakenMul: 1.22,
    critAdd: 0.00,
    spreadMul: 1.12,
  },
  {
    id: "aegis",
    name: "AEGIS FIELD",
    tagline: "防壁と押し返し",
    desc: "防壁と押し返し",
    details: "近距離の弾を“消す”防壁＋敵を押し返す。守りは硬いが、移動と火力は抑えめ。",
    // role: tank/guard
    timeScale: 0.98,
    ease: 12,
    costPerSec: 30,
    startCost: 12,
    minFocusToActivate: 12,
    recoverFocus: 22,
    moveMul: 0.92,
    fireMul: 0.90,
    bulletSpeedMul: 0.98,
    bulletLifeMul: 1.00,
    dmgMul: 0.95,
    dmgTakenMul: 0.70,
    // close barrier that deletes enemy bullets
    shield: { radius: 160 },
    // push enemies away (not as strong as REPULSOR)
    repelEnemies: { radius: 190, strength: 5600 },
    spreadMul: 0.92,
    critAdd: -0.01,
  },
  {
    id: "razor",
    name: "RAZORLINE",
    tagline: "貫通と精密射撃",
    desc: "貫通と精密射撃",
    details: "貫通・弾速・クリ率を強化。射線管理が強い代わりに、連射と移動が少し落ちる。",
    // role: line DPS / precision
    timeScale: 1.00,
    ease: 12,
    costPerSec: 32,
    startCost: 10,
    minFocusToActivate: 10,
    recoverFocus: 18,
    moveMul: 0.98,
    fireMul: 0.90,
    bulletSpeedMul: 1.28,
    bulletLifeMul: 1.18,
    dmgMul: 1.02,
    critAdd: 0.08,
    spreadMul: 0.55,
    pierceAdd: 4,
    pierceDamageMul: 0.80, // damage decay per pierce hit
  },
  {
    id: "siphon",
    name: "SIPHON",
    tagline: "当てるほど回復",
    desc: "当てるほど回復",
    details: "命中で少し回復。継戦能力が上がる代わりに、単発火力は落ちる（回復は上限あり）。",
    // role: sustain/economy (上限で無限化を防ぐ)
    timeScale: 0.98,
    ease: 12,
    costPerSec: 24,
    startCost: 7,
    minFocusToActivate: 8,
    recoverFocus: 14,
    moveMul: 1.04,
    fireMul: 0.96,
    bulletSpeedMul: 1.00,
    bulletLifeMul: 1.00,
    dmgMul: 0.86,
    spreadMul: 0.92,
    onHit: { focus: 2.0, hp: 0.45 },
    onHitCap: { focusPerSec: 14, hpPerSec: 3.6 },
  },
  {
    id: "seeker",
    name: "SEEKER",
    tagline: "弾が敵を追う",
    desc: "弾が敵を追う",
    details: "ホーミングで命中を保証する代わりに、弾速と火力が落ちる。雑魚処理向き。",
    // role: aim assistance
    timeScale: 0.96,
    ease: 12,
    costPerSec: 28,
    startCost: 10,
    minFocusToActivate: 10,
    recoverFocus: 18,
    moveMul: 1.00,
    fireMul: 0.95,
    bulletSpeedMul: 0.96,
    bulletLifeMul: 1.14,
    dmgMul: 0.90,
    critAdd: -0.02,
    spreadMul: 0.98,
    homing: { radius: 620, turn: 7.6 },
  },
  {
    id: "repulsor",
    name: "REPULSOR",
    tagline: "接近を拒む",
    desc: "接近を拒む",
    details: "侵入禁止のコア＋弾の反射。距離を作れる代わりに、火力は伸びない。",
    // role: zoning/deny
    timeScale: 0.96,
    ease: 12,
    costPerSec: 34,
    startCost: 12,
    minFocusToActivate: 12,
    recoverFocus: 22,
    moveMul: 1.02,
    fireMul: 0.90,
    bulletSpeedMul: 1.00,
    bulletLifeMul: 1.00,
    dmgMul: 0.92,
    spreadMul: 1.00,
    // enemy deny + drag near core (implemented in game.js enemy update)
    denyRadius: 140,
    drag: 8.5,
    repelEnemies: { radius: 230, strength: 8200 },
    repelBullets: { radius: 270, strength: 15000 },
    reflectBullets: { inner: 150, speedMul: 1.10, damageMul: 0.75 },
  },
  {
    id: "nova",
    name: "NOVAPULSE",
    tagline: "瞬間衝撃波",
    details:
      "押した瞬間に衝撃波を放ち、周囲の弾を消し飛ばして敵をノックバック。押し続けると一定周期で再発動。燃費は重め。",

    // Heavy but decisive: tap = panic button, hold = periodic control
    costPerSec: 20,
    startCost: 8,
    minActivate: 16,
    minSustain: 6,
    recoverMin: 28,

    timeScale: 0.96,
    dmgMul: 1.0,

    pulse: {
      // cadence (after the instant first pulse)
      period: 0.72,

      // impact
      radius: 420,
      damage: 22,
      mul: 0.95,
      falloff: 0.55,
      knock: 1.25,
      screenShake: 1.15,

      // make it actually usable in bullet hell / close calls
      clearBullets: true,
      clearRadiusMul: 1.10,
      iframes: 0.12,

      // balance knobs
      cost: 12,
      tapCd: 0.42,
      immediate: true,

      // brief keep-away window after each pulse
      barrier: { dur: 0.20, radius: 250, strength: 9000 },
    },
  }
];

// Back-compat for older UI patches
export const FOCUS_MODE_LIST = FOCUS_MODES;

export function defaultFocusModeId(){
  return (FOCUS_MODES[0] && FOCUS_MODES[0].id) ? FOCUS_MODES[0].id : "chrono";
}

export function getFocusMode(id){
  const s = String(id || "").toLowerCase();
  let m = FOCUS_MODES.find(v => v.id === s);
  if(!m){
    // allow some aliases
    m = FOCUS_MODES.find(v => v.id.startsWith(s)) || FOCUS_MODES[0];
  }
  return m || FOCUS_MODES[0];
}

export function listFocusModes(){
  return FOCUS_MODES.slice();
}
