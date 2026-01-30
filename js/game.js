import { clamp, lerp, rand, v2dist } from "./math.js";
import { Player, Enemy, Bullet, spawnPickup, insideSafeSpawn, Obstacle, circlePushOut, circleRectPushOut } from "./entities.js";
import { rollChoices } from "./upgrades.js";
import { rollShopStock, getShopRerollCost } from "./shop.js";
import { pickStage, stagePointFx } from "./maps/index.js";
import { getFocusMode } from "./focus_modes.js";

function cloneStage(stage){
  // pickStage returns a reference from STAGES; clone so per-room field layouts can mutate safely.
  if(!stage) return stage;
  try{
    return JSON.parse(JSON.stringify(stage));
  }catch(e){
    // fallback shallow clone
    return { ...stage, theme: { ...stage.theme }, hazards: (stage.hazards||[]).slice(), fields: { ...(stage.fields||{}) } };
  }
}

function resolveStageFields(stage, world, roomNumber, rng){
  if(!stage || !world) return;
  const layouts = stage.fieldLayouts;
  if(!layouts) return;

  const hx = Math.max(1, (world.maxX - world.minX) * 0.5);
  const hy = Math.max(1, (world.maxY - world.minY) * 0.5);
  const hmin = Math.min(hx, hy);

  const pad = 240; // keep cores away from walls a bit
  const jitter = ((stage && stage.hazardJitterMul != null) ? stage.hazardJitterMul : 0.06) * hmin;

  const pick = (arr) => {
    if(!arr || !arr.length) return null;
    // bias by roomNumber so patterns vary even with similar RNG state
    const k = (roomNumber * 131 + Math.floor(rng() * 9999)) % arr.length;
    return arr[k];
  };

  const resolveNodes = (descList) => {
    if(!descList) return [];
    const out = [];
    for(const d of descList){
      // ux/uy are normalized positions in [-1..1], scaled to room
      const x = clamp(d.ux * hx * 0.78 + (rng()*2-1) * jitter, world.minX + pad, world.maxX - pad);
      const y = clamp(d.uy * hy * 0.78 + (rng()*2-1) * jitter, world.minY + pad, world.maxY - pad);
      const r = clamp((d.rMul || 0.8) * hmin * 1.05, 520, 1700);

      const n = { ...d, x, y, r };
      delete n.ux; delete n.uy; delete n.rMul;
      out.push(n);
    }
    return out;
  };

  if(layouts.magnet && layouts.magnet.length){
    stage.fields = stage.fields || {};
    stage.fields.magnet = resolveNodes(pick(layouts.magnet));
  }
  if(layouts.void && layouts.void.length){
    stage.fields = stage.fields || {};
    stage.fields.void = resolveNodes(pick(layouts.void));
  }
}


function resolveStageHazards(stage, world, roomNumber, rng){
  if(!stage || !world) return;
  const layouts = stage.hazardLayouts;
  if(!layouts || !layouts.length) return;

  const hx = Math.max(1, (world.maxX - world.minX) * 0.5);
  const hy = Math.max(1, (world.maxY - world.minY) * 0.5);
  const hmin = Math.min(hx, hy);

  const pad = (stage && stage.hazardPad != null) ? stage.hazardPad : 260;
  const jitter = ((stage && stage.hazardJitterMul != null) ? stage.hazardJitterMul : 0.06) * hmin;

  const pick = (arr) => {
    if(!arr || !arr.length) return null;
    const k = (roomNumber * 197 + Math.floor(rng() * 9999)) % arr.length;
    return arr[k];
  };

  const resolveDesc = (descList) => {
    if(!descList) return [];
    const out = [];
    for(const d of descList){
      if(!d) continue;
      if(d.shape === "rect"){
        const w = clamp((d.wMul || 0.5) * hmin, 180, (world.maxX - world.minX) - pad*2);
        const h = clamp((d.hMul || 0.35) * hmin, 160, (world.maxY - world.minY) - pad*2);

        const x = clamp(d.ux * hx * 0.78 + (rng()*2-1) * jitter, world.minX + pad + w*0.5, world.maxX - pad - w*0.5);
        const y = clamp(d.uy * hy * 0.78 + (rng()*2-1) * jitter, world.minY + pad + h*0.5, world.maxY - pad - h*0.5);

        const hobj = { ...d, x, y, w, h };
        delete hobj.ux; delete hobj.uy; delete hobj.wMul; delete hobj.hMul;
        out.push(hobj);
      }else if(d.shape === "circle"){
        const r = clamp((d.rMul || 0.25) * hmin, 120, hmin * 0.98);

        const x = clamp(d.ux * hx * 0.78 + (rng()*2-1) * jitter, world.minX + pad + r, world.maxX - pad - r);
        const y = clamp(d.uy * hy * 0.78 + (rng()*2-1) * jitter, world.minY + pad + r, world.maxY - pad - r);

        const hobj = { ...d, x, y, r };
        delete hobj.ux; delete hobj.uy; delete hobj.rMul;
        out.push(hobj);
      }
    }
    return out;
  };

  const chosen = pick(layouts);
  if(chosen){
    stage.hazards = resolveDesc(chosen);
  }
}
function isFocusHeld(input){
  if(!input) return false;
  // support both KeyboardEvent.code ("Space") and key (" ")
  const keys = ["Space", "Spacebar", " "];
  for(const k of keys){
    try{
      if(typeof input.isDown === "function" && input.isDown(k)) return true;
    }catch(e){}
    // some input implementations store held keys in maps
    if(input.keys && input.keys[k]) return true;
    if(input.down && input.down[k]) return true;
    if(input.held && input.held[k]) return true;
  }
  return false;
}


// --- CCD helpers: prevent fast bullets from "tunneling" through enemies/obstacles.
function segCircleTOI(x0, y0, x1, y1, cx, cy, r){
  // returns earliest t in [0,1] where segment is within r of (cx,cy), or null if no hit
  const dx = x1 - x0;
  const dy = y1 - y0;
  const a = dx*dx + dy*dy;
  if(a < 1e-8){
    const ex = x0 - cx;
    const ey = y0 - cy;
    return (ex*ex + ey*ey <= r*r) ? 0 : null;
  }
  const t = clamp(((cx - x0)*dx + (cy - y0)*dy) / a, 0, 1);
  const px = x0 + dx*t;
  const py = y0 + dy*t;
  const ex = px - cx;
  const ey = py - cy;
  if(ex*ex + ey*ey <= r*r) return t;
  return null;
}

function segAabbTOI(x0, y0, x1, y1, minX, minY, maxX, maxY){
  // Liang-Barsky segment vs AABB, returns entry t or null
  const dx = x1 - x0;
  const dy = y1 - y0;

  let t0 = 0, t1 = 1;

  const clip = (p, q) => {
    if(Math.abs(p) < 1e-8){
      return q >= 0;
    }
    const r = q / p;
    if(p < 0){
      if(r > t1) return false;
      if(r > t0) t0 = r;
    }else{
      if(r < t0) return false;
      if(r < t1) t1 = r;
    }
    return true;
  };

  if(!clip(-dx, x0 - minX)) return null;
  if(!clip( dx, maxX - x0)) return null;
  if(!clip(-dy, y0 - minY)) return null;
  if(!clip( dy, maxY - y0)) return null;

  return t0;
}


export class Game {
  constructor({ w, h, sfx, particles }) {
    this.w = w; this.h = h;
    this.sfx = sfx;
    this.particles = particles;

    this.camera = { x: 0, y: 0 };
    this.state = "title"; // title | playing | paused | gameover | reward | shop

    this.time = 0;
    this.spawnTimer = 0;
    this.timeScale = 1;


    // FOCUS system
    this.focusModeId = "chrono";
    this._focusMode = getFocusMode(this.focusModeId);
    this._focusActive = false;
    this._focusPulseT = 0;
    this._focusTapCD = 0; // prevents tap-spam pulses (mainly NOVA)
    this._pulseBarrierT = 0; // short post-pulse keep-away window
    this._pulseBarrierR = 0;
    this._pulseBarrierStr = 0;
    this._focusExhausted = false; // lockout after hitting 0 focus
    this._focusHeldPrev = false;
    this._onHitBudgetT = 0;
    this._onHitFocusGained = 0;
    this._onHitHpGained = 0;


    // perf: cap total bullets to keep bullet-hell moments stable
    this._bulletCap = 900;
    this.room = 1;
    this.killsThisRoom = 0;
    this.killsTarget = 10;
    this.roomIsBoss = false;

    this.roomIntro = 0; // seconds

    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    this._rng = this._makeRng((Math.random() * 1e9) | 0);

    this.reset();
  }

  reset() {
    this.player = new Player(0, 0);
    this._focusExhausted = false;
    this._focusHeldPrev = false;
    this._onHitBudgetT = 0;
    this._onHitFocusGained = 0;
    this._onHitHpGained = 0;
    this._focusPulseT = 0;
    this._focusTapCD = 0;
    this._pulseBarrierT = 0;
    this._pulseBarrierR = 0;
    this._pulseBarrierStr = 0;
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];

    // shop
    this.shopStock = [];
    this.shopRerolls = 0;
    this.shopVersion = 0;
    this.lastShopRoom = 0;

    this.time = 0;
    this.room = 1;
    this.player.room = 1;
    this.killsThisRoom = 0;
    this.killsTarget = this._calcTarget(this.room);
    this.roomIsBoss = this._isBossRoom(this.room);

    this.stage = null;
    this.stageId = "";
    this.stageName = "";
    this.stageGimmick = "";
    this.roomTitle = "";

    this._genRoom(this.room);

    this.spawnTimer = 0.85;
    this.shake = 0;

    this.state = "title";
    this.timeScale = 1;
  }

  start(focusModeId) {
    this.reset();
    if(focusModeId) this.focusModeId = String(focusModeId);
    this.state = "playing";
    if (this.roomIsBoss) {
      this._spawnBoss();
      this.sfx.boss();
    }
  }

  pause() {
    if (this.state === "playing") this.state = "paused";
  }

  resume() {
    if (this.state === "paused") this.state = "playing";
  }

  gameOver() {
    this.state = "gameover";
  }

  _makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      // xorshift32
      s ^= (s << 13) >>> 0;
      s ^= (s >>> 17) >>> 0;
      s ^= (s << 5) >>> 0;
      return (s >>> 0) / 4294967296;
    };
  }

  _isBossRoom(room) {
    return room % 5 === 0;
  }

  _calcTarget(room) {
    return 10 + Math.floor(room * 3.2);
  }

  _aiLevel() {
    // Smooth AI ramp: every room matters (roughly +1 per 3 rooms).
    return clamp((this.room - 1) / 3, 0, 8);
  }

_forceGainFor(enemy) {
    // FORCE gain per kill. Stronger enemies and deeper rooms yield more.
    const t = enemy?.type || "shooter";
    let base = 2;

    if (t === "warden") base = 40;
    else if (t === "boss_lava" || t === "boss_ice" || t === "boss_magnet" || t === "boss_void") base = 44;
    else if (t === "pylon") base = 10;
    else if (t === "bomber") base = 8;
    else if (t === "sniper") base = 8;
    else if (t === "splitter") base = 7;
    else if (t === "charger") base = 7;
    else if (t === "stalker") base = 7;
    else if (t === "weaver") base = 6;
    else if (t === "shooter") base = 6;
    else if (t === "mote") base = 2;

    const roomMul = 1 + Math.min(0.85, Math.max(0, (this.room - 1) * 0.04));
    const eliteMul = enemy?.elite ? 1.5 : 1;

    // Keep numbers readable: return an integer >= 1
    return Math.max(1, Math.floor(base * roomMul * eliteMul));
  }

  _genRoom(roomNumber) {
    const boss = this._isBossRoom(roomNumber);

    // pick stage (map theme + gimmick) for this room
    let stage = pickStage(roomNumber, this._rng);
    // avoid immediate repeats
    if (this.stageId && stage && stage.id === this.stageId) {
      stage = pickStage(roomNumber + 7, this._rng);
    }
    stage = cloneStage(stage);

    this.stageId = stage?.id || "";
    this.stageName = stage?.name || "";
    this.stageGimmick = stage?.gimmick || "";
    const rooms = stage?.rooms || [];
    this.roomTitle = boss ? this._bossTitleForType(this._bossTypeForStage()) : (rooms.length ? rooms[Math.floor(this._rng() * rooms.length)] : "ROOM");

    // room size: some stages can request a fixed rectangular arena (e.g., Ice Skating Rink)
    let baseW, baseH;
    if(stage && stage.fixedRoom && stage.fixedRoom.w && stage.fixedRoom.h){
      baseW = stage.fixedRoom.w;
      baseH = stage.fixedRoom.h;
    }else{
      // vary room size so it actually feels like "rooms"
      baseW = boss ? rand(2600, 2200) : rand(2400, 1700);
      baseH = boss ? rand(2400, 2000) : rand(2300, 1600);
    }

    this.world = {
      minX: -Math.floor(baseW * 0.5),
      maxX: Math.floor(baseW * 0.5),
      minY: -Math.floor(baseH * 0.5),
      maxY: Math.floor(baseH * 0.5),
    };

    // resolve per-room hazards (lava/ice/toxic layouts vary by room)
    resolveStageHazards(stage, this.world, roomNumber, this._rng);

    // resolve per-room field layout (MAGNET/VOID cores vary by room)
    resolveStageFields(stage, this.world, roomNumber, this._rng);
    this.stage = stage;

    this.obstacles = this._makeObstacles(roomNumber, boss, this.stage);

    // room intro flash
    this.roomIntro = 1.10;

    // choose a spawn that doesn't instantly touch damaging gimmicks (lava/toxic),
    // and prefers "no-gimmick" tiles when possible.
    const sp = this._pickPlayerSpawn(this.stage, boss);
    this.player.x = sp.x;
    this.player.y = sp.y;
    this.player.vx = 0;
    this.player.vy = 0;

    // camera recenters quickly
    this.camera.x = -this.w * 0.5;
    this.camera.y = -this.h * 0.5;
  }


  _pickPlayerSpawn(stage, boss){
    const pad = boss ? 360 : 300;
    const tries = boss ? 560 : 520;

    let best = null;

    const accept = (x,y, pass) => {
      if(!insideSafeSpawn(x, y, this.obstacles, 0, 0, 0)) return false;

      const fx = stagePointFx(stage, x, y);
      if(fx && (fx.type === "lava" || fx.type === "toxic")) return false;

      // Pass 0: try to spawn on totally clean tiles (no gimmick influence)
      if(pass === 0){
        if(fx && fx.type !== "none" && fx.a > 0.10) return false;
      }

      // Even if we allow gimmicks, avoid spawning deep inside strong void pull.
      if(fx && fx.type === "void" && fx.a > 0.30) return false;

      return true;
    };

    for(let pass = 0; pass < 2; pass++){
      for(let i = 0; i < tries; i++){
        const x = rand(this.world.maxX - pad, this.world.minX + pad);
        const y = rand(this.world.maxY - pad, this.world.minY + pad);

        if(!accept(x,y,pass)) continue;

        const d = Math.hypot(x, y);
        if(!best || d < best.d){
          best = { x, y, d };
        }
      }
      if(best) return best;
    }

    // Fallback: try a few stable spots.
    const cands = [
      { x: 0, y: 0 },
      { x: -pad, y: 0 },
      { x: pad, y: 0 },
      { x: 0, y: -pad },
      { x: 0, y: pad },
    ];
    for(const c of cands){
      if(accept(c.x, c.y, 1)) return c;
    }
    return { x: 0, y: 0 };
  }

  _makeObstacles(roomNumber, boss, stage) {
    // mix of circular debris + rect walls (some block bullets, some don't)
    const obs = [];

    const oset = stage?.obstacle || {};
    const circleBlockChance = (oset.circleBulletsBlockChance !== undefined) ? oset.circleBulletsBlockChance : 0.22;
    const mats = Array.isArray(oset.materials) && oset.materials.length ? oset.materials : ["metal","glass"];
    const count = boss ? 12 : (10 + Math.floor(roomNumber * 0.25));

    for (let i = 0; i < count; i++) {
      const useRect = (Math.random() < (boss ? 0.32 : 0.24)) && i > 1;

      if (useRect) {
        const thin = rand(78, 46);
        const long = rand(640, 280);
        const horiz = Math.random() < 0.5;

        const ww = horiz ? long : thin;
        const hh = horiz ? thin : long;

        const hw = ww * 0.5;
        const hh2 = hh * 0.5;

        let x = 0, y = 0;
        for (let k = 0; k < 320; k++) {
          x = rand(this.world.maxX - (hw + 130), this.world.minX + (hw + 130));
          y = rand(this.world.maxY - (hh2 + 130), this.world.minY + (hh2 + 130));
          if (Math.hypot(x, y) > 240 && insideSafeSpawn(x, y, obs, 0, 0, 280)) {
            break;
          }
        }
        const mat = mats[(Math.floor(Math.random() * mats.length)) % mats.length];
        obs.push(new Obstacle(x, y, ww, hh, { blocksBullets: true, solid: true, material: mat }));
      } else {
        const r = rand(68, 28);
        let x = 0, y = 0;
        for (let k = 0; k < 260; k++) {
          x = rand(this.world.maxX - 120, this.world.minX + 120);
          y = rand(this.world.maxY - 120, this.world.minY + 120);
          if (Math.hypot(x, y) > 220 && insideSafeSpawn(x, y, obs, 0, 0, 260)) {
            break;
          }
        }
        const blocksBullets = Math.random() < circleBlockChance;
        const mat = blocksBullets ? (mats[0] || "metal") : (mats[1] || "glass");
        obs.push(new Obstacle(x, y, r, { blocksBullets, solid: true, material: mat }));
      }
    }

    return obs;
  }

_separateEnemies(dt){
  const es = this.enemies;
  const n = es.length;
  if(n <= 1) return;

  // Spatial hash grid so we don't do O(n^2) full checks every frame.
  const cell = 96;
  const gx0 = this.world.minX;
  const gy0 = this.world.minY;
  const buckets = new Map();

  for(let i=0;i<n;i++){
    const e = es[i];
    const cx = Math.floor((e.x - gx0) / cell);
    const cy = Math.floor((e.y - gy0) / cell);
    const key = cx + "," + cy;
    let arr = buckets.get(key);
    if(!arr){ arr = []; buckets.set(key, arr); }
    arr.push(i);
  }

  const clampToWorld = (e) => {
    e.x = clamp(e.x, this.world.minX + e.r, this.world.maxX - e.r);
    e.y = clamp(e.y, this.world.minY + e.r, this.world.maxY - e.r);
  };

  for(let i=0;i<n;i++){
    const a = es[i];
    const cx = Math.floor((a.x - gx0) / cell);
    const cy = Math.floor((a.y - gy0) / cell);

    for(let ox=-1; ox<=1; ox++){
      for(let oy=-1; oy<=1; oy++){
        const key = (cx+ox) + "," + (cy+oy);
        const arr = buckets.get(key);
        if(!arr) continue;

        for(const j of arr){
          if(j <= i) continue;
          const b = es[j];

          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const minD = a.r + b.r + 2.0;

          if(d < minD){
            const nx = dx / d;
            const ny = dy / d;
            const push = (minD - d) * 0.52;

            // separate positions
            a.x += nx * push;
            a.y += ny * push;
            b.x -= nx * push;
            b.y -= ny * push;

            // reduce "sticking": remove closing velocity along the normal
            const rvx = (a.vx || 0) - (b.vx || 0);
            const rvy = (a.vy || 0) - (b.vy || 0);
            const vn = rvx * nx + rvy * ny;
            if(vn < 0){
              const imp = (-vn) * 0.35;
              a.vx += nx * imp;
              a.vy += ny * imp;
              b.vx -= nx * imp;
              b.vy -= ny * imp;
            }

            clampToWorld(a);
            clampToWorld(b);
          }
        }
      }
    }
  }

  // one more obstacle pass after separation keeps everyone legal
  for(const e of es){
    this._applyObstacleCollisions(e);
  }
}


  _applyObstacleCollisions(ent) {
    let collided = false;

    // a couple of iterations prevents "sticky" edge cases when multiple circles overlap
    for (let iter = 0; iter < 2; iter++) {
      for (const o of this.obstacles) {
        const res = (o.shape === "rect") ? circleRectPushOut(ent.x, ent.y, ent.r, o) : circlePushOut(ent.x, ent.y, ent.r, o.x, o.y, o.r);
        if (!res) continue;
        collided = true;

        ent.x += res.nx * res.push;
        ent.y += res.ny * res.push;

        if ("vx" in ent) {
          // remove velocity component that pushes into the obstacle
          const vn = ent.vx * res.nx + ent.vy * res.ny;
          if (vn < 0) {
            ent.vx -= res.nx * vn;
            ent.vy -= res.ny * vn;
          }
          // tiny friction so you slide off instead of buzzing forever
          ent.vx *= 0.985;
          ent.vy *= 0.985;
        }
      }
    }

    return collided;
  }

  _bossTypeForStage() {
    const id = this.stageId || "";
    if (id === "lava_works") return "boss_lava";
    if (id === "cryo_vault" || id === "ice_skating_rink") return "boss_ice";
    if (id === "magnetic_foundry") return "boss_magnet";
    if (id === "void_rift") return "boss_void";
    return "warden"; // Arsenal Warden (weapon mimic boss)
  }

  _bossTitleForType(t) {
    if (t === "boss_lava") return "LAVA TITAN";
    if (t === "boss_ice") return "CRYO EMPRESS";
    if (t === "boss_magnet") return "COIL TYRANT";
    if (t === "boss_void") return "SINK WARDEN";
    return "ARSENAL WARDEN";
  }
  _spawnBoss() {
    // Spawn a single boss away from player, chosen by the current stage.
    const bossType = this._bossTypeForStage();
    const px = this.player.x, py = this.player.y;
    const ring = Math.min(this.world.maxX - this.world.minX, this.world.maxY - this.world.minY) * 0.38;
    const ang = rand(Math.PI * 2, 0);
    let x = px + Math.cos(ang) * ring;
    let y = py + Math.sin(ang) * ring;
    x = clamp(x, this.world.minX + 90, this.world.maxX - 90);
    y = clamp(y, this.world.minY + 90, this.world.maxY - 90);

    for (let k = 0; k < 160; k++) {
      if (insideSafeSpawn(x, y, this.obstacles, px, py, 660)) break;
      const a2 = rand(Math.PI * 2, 0);
      x = px + Math.cos(a2) * ring;
      y = py + Math.sin(a2) * ring;
      x = clamp(x, this.world.minX + 90, this.world.maxX - 90);
      y = clamp(y, this.world.minY + 90, this.world.maxY - 90);
    }

    const boss = new Enemy(x, y, bossType, { elite: false });

    // gentle scaling by boss index (room 5,10,15...)
    const bossIndex = Math.max(1, Math.floor((this.room || 5) / 5));
    const hpMul = 1 + Math.min(0.85, Math.max(0, (bossIndex - 1) * 0.12));
    boss.hp = Math.floor(boss.hp * hpMul);
    boss.maxHp = boss.hp;

    this.enemies.push(boss);
  }

  _pickEnemyType() {
    const room = this.room;

    // 3-way ("weaver") is very strong early: delay it until AFTER the first boss (room 5).
    // Then ramp it in gradually so it doesn't jump-scare the early game.
    const postBossT = clamp((room - 5) / 5, 0, 1); // 0: <=5, 1: >=10

    const roll = (entries) => {
      let sum = 0;
      for (const e of entries) sum += Math.max(0, e[1]);
      let x = Math.random() * sum;
      for (const [t, w0] of entries) {
        const w = Math.max(0, w0);
        x -= w;
        if (x <= 0) return t;
      }
      return entries[0][0];
    };

    // Rooms 1-2: readable, low bullet density
    if (room <= 2) {
      return roll([
        ["stalker", 0.56],
        ["shooter", 0.44],
      ]);
    }

    // Rooms 3-6: introduce bomber/charger, weave-in weaver only AFTER boss1
    if (room <= 6) {
      const wWeaver = 0.22 * postBossT;                 // 0 until room 6
      const wShooter = 0.18 + 0.22 * (1 - postBossT);   // compensate
      return roll([
        ["stalker", 0.34],
        ["weaver", wWeaver],
        ["shooter", wShooter],
        ["bomber", 0.12],
        ["charger", 0.14],
      ]);
    }

    // Rooms 7-12: add sniper/pylon, weaver continues to ramp
    if (room <= 12) {
      const wWeaver = 0.20 * postBossT;
      const wShooter = 0.16 + 0.20 * (1 - postBossT);
      return roll([
        ["stalker", 0.28],
        ["weaver", wWeaver],
        ["shooter", wShooter],
        ["bomber", 0.12],
        ["charger", 0.10],
        ["sniper", 0.08],
        ["pylon", 0.06],
      ]);
    }

    // Late game mix
    return roll([
      ["splitter", 0.20],
      ["pylon", 0.14],
      ["bomber", 0.16],
      ["stalker", 0.14],
      ["weaver", 0.12],
      ["shooter", 0.10],
      ["charger", 0.08],
      ["sniper", 0.06],
    ]);
  }


  _spawnEnemy() {
    const px = this.player.x, py = this.player.y;

    const roomW = this.world.maxX - this.world.minX;
    const roomH = this.world.maxY - this.world.minY;
    const ring = Math.min(roomW, roomH) * rand(0.46, 0.36);

    const ang = rand(Math.PI * 2, 0);
    let x = px + Math.cos(ang) * ring;
    let y = py + Math.sin(ang) * ring;

    x = clamp(x, this.world.minX + 80, this.world.maxX - 80);
    y = clamp(y, this.world.minY + 80, this.world.maxY - 80);

    const type = this._pickEnemyType();

    // elites scale with room
    const eliteChance = Math.min(0.28, 0.05 + this.room * 0.012);
    const elite = Math.random() < eliteChance;

    for (let k = 0; k < 120; k++) {
      if (insideSafeSpawn(x, y, this.obstacles, px, py, 540)) break;
      const a2 = rand(Math.PI * 2, 0);
      x = px + Math.cos(a2) * ring;
      y = py + Math.sin(a2) * ring;
      x = clamp(x, this.world.minX + 80, this.world.maxX - 80);
      y = clamp(y, this.world.minY + 80, this.world.maxY - 80);
    }

    this.enemies.push(new Enemy(x, y, type, { elite }));
  }

  _shake(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  _buildText() {
    const weapon = this._weaponLabel(this.player.weaponId);
    if (this.player.upgrades.length === 0) return `Weapon: ${weapon} | Build: -`;
    const parts = this.player.upgrades
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(u => u.stack > 1 ? `${u.name} x${u.stack}` : u.name);
    return `Weapon: ${weapon} | Build: ` + parts.join(" / ");
  }

  getStageHUD(){
    return {
      mapName: this.stageName || "",
      mapGimmick: this.stageGimmick || "",
      roomTitle: this.roomTitle || "",
    };
  }

  getIntroLines(){
    const rn = this.room | 0;
    const l1 = `ROOM ${rn}`;
    const l2 = this.stageName || "ROOM";
    const l3 = this.roomTitle || "";
    return { l1, l2, l3 };
  }


  _completeRoom() {
    this.state = "reward";
    this.enemies = [];
    this.bullets = [];

    // reward heal and focus top-up
    this.player.heal(18);
    this.player.focus = Math.min(this.player.focusMax, this.player.focus + 40);

    this.rewardChoices = rollChoices(this._rng, this.player, 3);
  }

  pickReward(upgrade) {
    if (this.state !== "reward") return;
    this.player.addUpgrade(upgrade);
    this.sfx.upgrade();

    // next room
    this.room += 1;
    this.player.room = this.room;
    this.killsThisRoom = 0;
    this.killsTarget = this._calcTarget(this.room);
    this.roomIsBoss = this._isBossRoom(this.room);

    this.pickups = [];
    this.bullets = [];
    this.enemies = [];
    this.spawnTimer = 0.75;

    this._genRoom(this.room);

    // go to shop sometimes (every 3 rooms, and always before boss)
    if (this._shouldShop(this.room)) {
      this._enterShop();
    } else {
      this._startCombat();
    }
  }

  update(dt, input, reducedMotion = false) {
    if (this.state !== "playing") return { timeScale: 1, roomIntro: 0 };

    this.time += dt;
    this.roomIntro = Math.max(0, this.roomIntro - dt);


    // FOCUS (ability) - mode based (hold Space)
    // NOTE: older Input implementations use KeyboardEvent.key (" "), newer use code ("Space").
    const _focusHeld = isFocusHeld(input);
    // allow start() param OR localStorage fallback (so title select works even if main.js forgets to pass)
    if(!this.focusModeId && typeof localStorage !== "undefined"){
      this.focusModeId = localStorage.getItem("nw_focusModeId") || localStorage.getItem("nw_focus_mode") || "chrono";
    }
    const fm = getFocusMode(this.focusModeId || "chrono");
    this._focusMode = fm;

    // Exhaustion lockout: if you "bottom out" you must release and recharge before re-activating.
    const wasActive = !!this._focusActive;

    // Thresholds: activate at a meaningful amount, sustain above a small floor, recover to reactivate.
    // Floors prevent "hold Space all run" even with heavy cost-reduction stacking.
    const minActivate = Math.max((fm.minFocusToActivate ?? 0), 10);
    const minSustain = Math.max((fm.minFocusToSustain ?? 0), 2);
    const recoverMin = Math.max((fm.recoverFocus ?? 0), minActivate);

    // If exhausted, you MUST release and recharge before you can use FOCUS again.
    if(this._focusExhausted){
      if(!_focusHeld && this.player.focus >= recoverMin){
        this._focusExhausted = false;
      }
    }

    let focusActive = false;
    if(_focusHeld && !this._focusExhausted){
      // Once active, allow it to run down to a small floor; but starting requires a meaningful chunk.
      focusActive = wasActive ? (this.player.focus >= minSustain) : (this.player.focus >= minActivate);
    }

    // one-time activation cost (prevents "tap spam" and adds texture to balance)
    // NOTE: we key off "wasActive" so holding Space doesn't repeatedly charge.
    if(focusActive && !wasActive){
      const startCost = (fm.startCost ?? 0);
      if(startCost > 0){
        this.player.focus = Math.max(0, this.player.focus - startCost);
      }
      if(this.player.focus < minSustain){
        // tried to start with too little: burn out immediately
        this.player.focus = 0;
        this._focusExhausted = true;
        focusActive = false;
      }
    }

    this._focusHeldPrev = _focusHeld;

    this._focusActive = focusActive;
    this.player.focusActive = focusActive;
    this.player.focusModeId = fm.id;

    const targetScale = focusActive ? (fm.timeScale ?? 0.28) : 1.0;
    const ease = 1 - Math.exp(-(fm.ease ?? 12) * dt);
    this.timeScale = lerp(this.timeScale, targetScale, ease);

    const dtWorld = dt * this.timeScale;
    // keep player close to realtime while focusing so it feels "powerful"
    const dtPlayer = dt * ((fm.playerDtBase ?? 0.82) + (fm.playerDtFollow ?? 0.18) * this.timeScale);

    // drain / regen focus
    if (focusActive) {
      // clamp cost reduction so you can't trivialize the resource and hold forever
      const costMul = Math.max(0.70, (this.player.mods.focusCostMul || 1));
      const cost = (fm.costPerSec ?? 32) * costMul * (this.player.envFocusCostMul || 1);

      this.player.focus = Math.max(0, this.player.focus - cost * dt);

      // If you hit the floor while holding, force a burnout lockout.
      if(this.player.focus < minSustain){
        this.player.focus = 0;
        this._focusExhausted = true;
        focusActive = false;
        this._focusActive = false;
        this.player.focusActive = false;

        // Snap back faster so it's obvious the power ended.
        const easeOff = 1 - Math.exp(-22 * dt);
        this.timeScale = lerp(this.timeScale, 1.0, easeOff);
      }
    } else {
      // clamp regen stacking a bit so "focus battery" doesn't get silly
      const regenMul = Math.min(3.0, (this.player.mods.focusRegenMul || 1));
      const regen = (7.5 * regenMul + (this.player.mods.focusRegenAdd || 0)) * (this.player.envFocusRegenMul || 1);
      this.player.focus = Math.min(this.player.focusMax, this.player.focus + regen * dt);
    }



    // on-hit budget (for modes like SIPHON to prevent infinite sustain)
    this._onHitBudgetT -= dt;
    if(this._onHitBudgetT <= 0){
      this._onHitBudgetT = 1.0;
      this._onHitFocusGained = 0;
      this._onHitHpGained = 0;
    }

    // per-frame focus multipliers (entities.js reads these)
    this.player.focusMoveMul = focusActive ? (fm.moveMul ?? 1) : 1;
    this.player.focusFireMul = focusActive ? (fm.fireMul ?? 1) : 1;
    this.player.focusBulletSpeedMul = focusActive ? (fm.bulletSpeedMul ?? 1) : 1;
    this.player.focusBulletLifeMul = focusActive ? (fm.bulletLifeMul ?? 1) : 1;
    this.player.focusModeDmgMul = focusActive ? (fm.dmgMul ?? 1) : 1;
    this.player.focusModeCritAdd = focusActive ? (fm.critAdd ?? 0) : 0;
    this.player.focusModeSpreadMul = focusActive ? (fm.spreadMul ?? 1) : 1;
    this.player.focusModePierceAdd = focusActive ? (fm.pierceAdd ?? 0) : 0;
    this.player.focusModeDmgTakenMul = focusActive ? (fm.dmgTakenMul ?? 1) : 1;

    // Focus pulse (NOVA): on-demand + periodic while active
    this._focusTapCD = Math.max(0, (this._focusTapCD || 0) - dt);

    if(focusActive && fm.pulse){
      const pulse = fm.pulse;
      const period = pulse.period ?? 0.65;

      // First pulse should be immediate so it can be used as a real "panic button".
      const justActivated = !wasActive;
      const tapCd = pulse.tapCd ?? 0;
      if(justActivated && (pulse.immediate !== false)){
        if(this._focusTapCD <= 0){
          this._focusPulse(fm, reducedMotion);
          if(tapCd > 0) this._focusTapCD = tapCd;
        }
        this._focusPulseT = 0;
      }

      this._focusPulseT = (this._focusPulseT || 0) + dtWorld;
      while(this._focusPulseT >= period){
        this._focusPulseT -= period;
        this._focusPulse(fm, reducedMotion);
      }
    } else {
      this._focusPulseT = 0;
    }

    // short post-pulse barrier (lets NOVA be used offensively without instant suicide)
    if(this._pulseBarrierT > 0){
      this._pulseBarrierT = Math.max(0, this._pulseBarrierT - dt);
    }

    // preprocess input

    // preprocess input
    input.move = input.getMoveVector();
    input.mouseDown = input.mouse.down;

    // mouse world
    const mx = input.mouse.x;
    const my = input.mouse.y;
    input.mouseWorld = {
      x: mx + this.camera.x,
      y: my + this.camera.y,
    };

    // player update
    const dashRes = this.player.update(dtPlayer, input, this.world);

    const pCol = this._applyObstacleCollisions(this.player);
    if (pCol && this.player.dashTime > 0) {
      // stop dash if you slam into a pillar
      this.player.dashTime = 0;
      this.player._dashRemain = 0;
    }

    if (dashRes.didDash) {
      this.sfx.dash();
      this.particles.ring({ x: this.player.x, y: this.player.y }, 24, { speedMin: 420, speedMax: 980, lifeMin: 0.10, lifeMax: 0.32, glow: 24 });
      if (!reducedMotion) this._shake(7.0);
    }

    // --- stage effects (computed after movement to feel immediate)
    if (this.stage) {
      const fx = stagePointFx(this.stage, this.player.x, this.player.y);
      this.player.stageFxType = fx.type;
      this.player.stageFxA = fx.a;

      // defaults
      let envMove = 1;
      let envFric = 1;
      let envRegen = 1;
      let envCost = 1;

      if (fx.type === "lava") {
        // Lava: fast HP drain only.
        const dps = fx.data?.dps ?? 18;
        this.player.hp = Math.max(0, this.player.hp - dps * fx.a * dt);
      } else if (fx.type === "ice") {
        // Ice: very slippery (ice-skate level).
        envFric = lerp(1, fx.data?.frictionMul ?? 0.05, fx.a);
        envMove = lerp(1, fx.data?.speedMul ?? 1.18, fx.a);

        // If Player.update doesn't consume envFrictionMul yet, we still force
        // a very visible "glide" by counteracting damping on the resulting velocity.
        // This is cheap and makes the slide obvious.
        const anti = fx.data?.antiFriction ?? 9.0; // higher = more glide
        const s = Math.exp(anti * fx.a * dt);
        this.player.vx *= s;
        this.player.vy *= s;
        const maxIce = (fx.data?.maxSpeed ?? 640) * (this.player.mods.moveMul || 1) * envMove;
        const spIce = Math.hypot(this.player.vx, this.player.vy);
        if (spIce > maxIce) {
          const k = maxIce / (spIce || 1);
          this.player.vx *= k;
          this.player.vy *= k;
        }
      } else if (fx.type === "toxic") {
        // Toxic: slow HP drain + movement slow + FORCE drain.
        const dps = fx.data?.dps ?? 5;
        this.player.hp = Math.max(0, this.player.hp - dps * fx.a * dt);

        const slow = fx.data?.slow ?? 0.82;
        envMove = lerp(1, slow, fx.a);

        // Toxic should drain FOCUS (not FORCE). Also make Focus feel "sick":
        // harder to sustain and slowly bleeds away.
        envRegen = lerp(1, fx.data?.focusRegenMul ?? 0.35, fx.a);
        envCost = lerp(1, fx.data?.focusCostMul ?? 1.9, fx.a);
        const fd = fx.data?.focusDrain ?? 10;
        if (fd > 0) {
          this.player.focus = Math.max(0, this.player.focus - fd * fx.a * dt);
        }
      } else if (fx.type === "void") {
        // VOID: quicksand wells. Stronger near the core: pull inward + heavy drag.
        const nodes = this.stage.fields?.void || [];
        let ax = 0, ay = 0;
        let tMax = 0;

        for (const n of nodes) {
          const dx = n.x - this.player.x;
          const dy = n.y - this.player.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d <= n.r) {
            const t = 1 - d / n.r; // 0..1 (closer = stronger)
            tMax = Math.max(tMax, t);

            const pow = (n.pow !== undefined) ? n.pow : 2.15;
            const tp = Math.pow(t, pow);

            const pull = (n.pull ?? n.strength ?? 2400);
            const playerMul = (n.playerMul !== undefined) ? n.playerMul : 0.30;

            // very visible near the core, but clamped for playability
            const dv = clamp(pull * playerMul * tp * dtPlayer * 0.055, 0, 2.9);

            ax += (dx / d) * dv;
            ay += (dy / d) * dv;
          }
        }

        // Sticky slowdown: harder to accelerate and harder to keep speed.
        const sink = Math.pow(clamp(tMax, 0, 1), 1.35);
        const slowTo = 0.52; // lower = more stuck (quicksand)
        const fricTo = 2.55; // higher = heavier drag
        envMove = Math.min(envMove, lerp(1, slowTo, sink));
        envFric = Math.max(envFric, lerp(1, fricTo, sink));

        this.player.vx += ax;
        this.player.vy += ay;
      }



// --- enemy terrain effects (light, but meaningful)
// Stage hazards can also punish enemies; smarter AI will learn to avoid them.
const voidNodes = this.stage.fields?.void || [];
for(const e of this.enemies){
  // Lava/Toxic chip damage (so hazards matter for lures), kept modest for balance.
  const efx = stagePointFx(this.stage, e.x, e.y);
  e.stageFxType = efx.type;
  e.stageFxA = efx.a;

  if(efx.type === "lava"){
    const dps = efx.data?.dps ?? 18;
    const mul = (e.type === "warden") ? 0.22 : 0.32;
    e.hp = Math.max(0, e.hp - dps * mul * efx.a * dt);
  }else if(efx.type === "toxic"){
    const dps = efx.data?.dps ?? 5;
    const mul = (e.type === "warden") ? 0.26 : 0.38;
    e.hp = Math.max(0, e.hp - dps * mul * efx.a * dt);
  }

  // VOID pulls enemies too (independent of whether another hazard is stronger here).
  if(voidNodes.length){
    let ax = 0, ay = 0;
    for(const n of voidNodes){
      const dx = n.x - e.x;
      const dy = n.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if(d <= n.r){
        const t = 1 - d / n.r;
        const t2 = t * t;
        const pull = (n.pull ?? n.strength ?? 2000);
        const enemyMul = (n.enemyMul !== undefined) ? n.enemyMul : 0.55;

        const dv = clamp(pull * enemyMul * t2 * dtWorld * 0.045, 0, 2.6);
        ax += (dx / d) * dv;
        ay += (dy / d) * dv;
      }
    }
    e.vx += ax;
    e.vy += ay;
  }
}
      this.player.envMoveMul = envMove;
      this.player.envFrictionMul = envFric;
      this.player.envFocusRegenMul = envRegen;
      this.player.envFocusCostMul = envCost;
    } else {
      this.player.stageFxType = "none";
      this.player.stageFxA = 0;
      this.player.envMoveMul = 1;
      this.player.envFrictionMul = 1;
      this.player.envFocusRegenMul = 1;
      this.player.envFocusCostMul = 1;
    }

    // skill: Arc Nova (E)
    if ((input.consumePressed("KeyE")) && this.player.mods.nova > 0 && this.player.skill.novaCd <= 0) {
      this.player.skill.novaCd = this.player.skill.novaCdMax;
      const radius = 300;
      const dmg = 46 * this.player.mods.dmgMul;
      this.particles.ring({ x: this.player.x, y: this.player.y }, 36, { speedMin: 280, speedMax: 760, lifeMin: 0.12, lifeMax: 0.46, glow: 32 });
      if (!reducedMotion) this._shake(8.5);

      for (const e of this.enemies) {
        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (d < radius + e.r) {
          e.takeDamage(dmg);
          e.hitFlash = 0.16;
        }
      }
      this.sfx.hit();
    }

    // orbit blades positions
    this._updateBlades(dtWorld);

    // shooting
    const shots = this.player.tryShoot(dtPlayer, input, focusActive);
    if (shots) {
      const arr = Array.isArray(shots) ? shots : [shots];

      // cap bullets to prevent runaway slowdowns
      const cap = this._bulletCap || 900;
      let made = 0;

      for (const s of arr) {
        if (this.bullets.length >= cap) break;
        this.bullets.push(new Bullet(s.x, s.y, s.vx, s.vy, "player", s.meta));
        made++;
      }

      if (made > 0) {
        this.sfx.shoot();
        if (!reducedMotion) this._shake(1.4);
        // one burst per trigger (not per pellet) for performance
        const s0 = arr[0];
        this.particles.burst({ x: s0.x, y: s0.y }, 8, { speedMin: 110, speedMax: 360, lifeMin: 0.08, lifeMax: 0.22, glow: 14 });
      }
    }
// spawns
    if (!this.roomIsBoss) {
      const base = 0.92;
      const spawnRate = lerp(base, 0.30, clamp(this.room / 24, 0, 1));
      this.spawnTimer -= dtWorld;

      // only spawn until target is reachable
      const remaining = this.killsTarget - this.killsThisRoom;
      const cap = Math.max(10, Math.min(30, 12 + Math.floor(this.room * 0.9)));

      while (this.spawnTimer <= 0) {
        this.spawnTimer += spawnRate * rand(1.08, 0.85);
        if (remaining > 0 && this.enemies.length < cap) {
          this._spawnEnemy();
        } else {
          break;
        }
      }
    }

    // update enemies
    const aiLevel = this._aiLevel();
    for (const e of this.enemies) {
      e.update(dtWorld, this.player, this.bullets, this.world, this.obstacles, aiLevel, this.enemies, this.stage);

      // stage floor / fields
      if (this.stage) {
        const fx = stagePointFx(this.stage, e.x, e.y);
        if (fx.type === "lava") {
          const dps = fx.data?.dps ?? 12;
          e.hp = Math.max(0, e.hp - dps * 0.65 * fx.a * dtWorld);
          e.hitFlash = Math.max(e.hitFlash || 0, 0.06);
        } else if (fx.type === "toxic") {
          const dps = fx.data?.dps ?? 7;
          e.hp = Math.max(0, e.hp - dps * 0.55 * fx.a * dtWorld);
          e.hitFlash = Math.max(e.hitFlash || 0, 0.05);
        } else if (fx.type === "void") {
          // VOID: quicksand wells tug enemies inward and bog them down.
          const nodes = this.stage.fields?.void || [];
          let ax = 0, ay = 0;
          let tMax = 0;

          for (const n of nodes) {
            const dx = n.x - e.x;
            const dy = n.y - e.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d <= n.r) {
              const t = 1 - d / n.r;
              tMax = Math.max(tMax, t);

              const pow = (n.pow !== undefined) ? n.pow : 2.05;
              const tp = Math.pow(t, pow);

              const pull = (n.pull ?? n.strength ?? 2400);
              const enemyMul = (n.enemyMul !== undefined) ? n.enemyMul : 0.46;

              const dv = clamp(pull * enemyMul * tp * dtWorld * 0.055, 0, 2.7);

              ax += (dx / d) * dv;
              ay += (dy / d) * dv;
            }
          }

          e.vx += ax;
          e.vy += ay;

          // extra bog-down near core (sells quicksand and prevents stable orbits)
          const sink = Math.pow(clamp(tMax, 0, 1), 1.25);
          if (sink > 0) {
            const drag = lerp(0, 7.5, sink);
            const k = Math.exp(-drag * dtWorld);
            e.vx *= k;
            e.vy *= k;
          }
        }
      }

      const eCol = this._applyObstacleCollisions(e);
      if (eCol) {
        e._stuck = (e._stuck || 0) + dtWorld;
        // if something went weird, give them a polite shove so they don't softlock the room
        if (e._stuck > 1.15) {
          const a = rand(Math.PI * 2, 0);
          e.x = clamp(e.x + Math.cos(a) * 70, this.world.minX + e.r, this.world.maxX - e.r);
          e.y = clamp(e.y + Math.sin(a) * 70, this.world.minY + e.r, this.world.maxY - e.r);
          e._stuck = 0.35;
        }
      } else {
        e._stuck = 0;
      }
    }

    // prevent enemy overlap stacks (reduces stuck / stop-moving bugs)
    this._separateEnemies(dtWorld);

    // NOVA pulse barrier: brief keep-away window after each shockwave
    if(this._pulseBarrierT > 0){
      const rr = (this._pulseBarrierR || 220);
      const str = (this._pulseBarrierStr || 8200);
      const denyR = Math.max(0, rr * 0.70);

      for(const e of this.enemies){
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const d2 = dx*dx + dy*dy;
        if(d2 < rr*rr){
          const d = Math.sqrt(d2) || 1;
          const tt = 1 - d/rr;
          const nx = dx / d;
          const ny = dy / d;

          // shove outward (stronger close to player)
          const dv = (str * tt) * dtWorld * 0.001;
          e.vx += nx * dv;
          e.vy += ny * dv;

          // hard deny in the inner core so contact damage can't "hug" you during the pulse window
          if(d < denyR){
            e.x = this.player.x + nx * denyR;
            e.y = this.player.y + ny * denyR;
            e.vx += nx * 240;
            e.vy += ny * 240;
          }
        }
      }
    }

// FOCUS repel field (makes positioning feel "weighty")
    if(this._focusActive && this._focusMode && this._focusMode.repelEnemies){
      const rr = this._focusMode.repelEnemies.radius ?? 180;
      const str = this._focusMode.repelEnemies.strength ?? 4200;
      for(const e of this.enemies){
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const d2 = dx*dx + dy*dy;
        if(d2 < rr*rr){
          const d = Math.sqrt(d2) || 1;
          const t = 1 - d/rr;
          const dv = (str * t) * dtWorld * 0.001;
          e.vx += (dx/d) * dv;
          e.vy += (dy/d) * dv;
        }
      }
    }

    // REPULSOR: enemies cannot enter the core radius (true "keep-away" field)
    if(this._focusActive && this._focusMode && this._focusMode.denyRadius){
      const denyR = this._focusMode.denyRadius;
      for(const e of this.enemies){
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const d2 = dx*dx + dy*dy;
        if(d2 < denyR*denyR){
          const d = Math.sqrt(d2) || 1;
          const nx = dx / d;
          const ny = dy / d;
          // shove them out of the bubble
          e.x = this.player.x + nx * denyR;
          e.y = this.player.y + ny * denyR;
          // and kick their velocity outward so they don't immediately re-enter
          const kick = 320;
          e.vx += nx * kick;
          e.vy += ny * kick;
        }
      }
    }

    // REPULSOR: additional drag close to the player (makes approach feel "sticky")
    if(this._focusActive && this._focusMode && (this._focusMode.dragEnemies || this._focusMode.drag)){
      const rr = (this._focusMode.dragEnemies && this._focusMode.dragEnemies.radius !== undefined)
        ? this._focusMode.dragEnemies.radius
        : (this._focusMode.repelEnemies ? (this._focusMode.repelEnemies.radius ?? 300) : 300);
      const drag = (this._focusMode.dragEnemies && this._focusMode.dragEnemies.drag !== undefined)
        ? this._focusMode.dragEnemies.drag
        : (this._focusMode.drag ?? 6);
      for(const e of this.enemies){
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const d = Math.hypot(dx, dy) || 1;
        if(d < rr){
          const t = 1 - d/rr;
          const k = Math.exp(-(drag * t) * dtWorld);
          e.vx *= k;
          e.vy *= k;
        }
      }
    }


    // perf: trim overflow if enemies spawned a lot of bullets this frame
    const bcap = this._bulletCap || 900;
    if (this.bullets.length > bcap) {
      this.bullets.splice(0, this.bullets.length - bcap);
    }
    // update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      // per-bullet collision ignore window (helps piercing bullets pass through instead of multi-hitting one target)
      if(b._ignoreEnemyT){
        b._ignoreEnemyT -= dtWorld;
        if(b._ignoreEnemyT <= 0){
          b._ignoreEnemyT = 0;
          b._ignoreEnemy = null;
        }
      }



      // FOCUS bullet helpers
      if (this._focusActive && this._focusMode) {
        const fm = this._focusMode;

        // SEEKER: nudge player bullets toward nearest enemy (guided homing)
        if (b.team === "player" && fm.homing) {
          const hr = fm.homing.radius ?? 520;
          const turn = fm.homing.turn ?? 6.0; // rad/s
          const sp0 = Math.hypot(b.vx, b.vy);
          if (sp0 > 1e-4) {
            let best = null;
            let bestD2 = hr * hr;
            for (const e of this.enemies) {
              const dx = e.x - b.x;
              const dy = e.y - b.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < bestD2) {
                bestD2 = d2;
                best = e;
              }
            }
            if (best) {
              const cur = Math.atan2(b.vy, b.vx);
              const tgt = Math.atan2(best.y - b.y, best.x - b.x);
              let da = tgt - cur;
              // wrap to [-PI, PI]
              da = ((da + Math.PI) % (Math.PI * 2)) - Math.PI;
              const maxTurn = turn * dtWorld;
              da = clamp(da, -maxTurn, maxTurn);
              const na = cur + da;
              b.vx = Math.cos(na) * sp0;
              b.vy = Math.sin(na) * sp0;
            }
          }
        }

        // REPULSOR / AEGIS: deflect (and sometimes reflect) enemy bullets away from the player
        if (b.team === "enemy" && fm.repelBullets) {
          const rr = fm.repelBullets.radius ?? 210;
          const str = fm.repelBullets.strength ?? 5200; // bend strength
          const dx = b.x - this.player.x;
          const dy = b.y - this.player.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1;
            const t = 1 - d / rr; // 0..1
            const nx = dx / d;
            const ny = dy / d;

            // If this mode supports reflection, flip bullets in the inner core.
            if (fm.reflectBullets) {
              const inner = fm.reflectBullets.inner ?? (rr * 0.55);
              if (d < inner) {
                const sp = Math.hypot(b.vx, b.vy) || 1;
                const spMul = fm.reflectBullets.speedMul ?? 1.05;
                const dmgMul = fm.reflectBullets.damageMul ?? 0.75;

                b.team = "player";
                b.damage *= dmgMul;
                b.pierce = 0;

                // send it outward (clear, readable reflection)
                b.vx = nx * sp * spMul;
                b.vy = ny * sp * spMul;

                // nudge out so it doesn't immediately collide again
                b.x = this.player.x + nx * (inner + b.r + 6);
                b.y = this.player.y + ny * (inner + b.r + 6);

                const n = reducedMotion ? 5 : 10;
                this.particles.burst({ x: b.x, y: b.y }, n, { speedMin: 120, speedMax: 520, lifeMin: 0.06, lifeMax: 0.20, glow: 20 });
              }
            }

            // If it wasn't reflected, bend outward so it visibly "bounces away".
            if (b.team === "enemy") {
              const sp = Math.hypot(b.vx, b.vy) || 1;
              const vx = b.vx / sp;
              const vy = b.vy / sp;

              // str≈12000 => strong bend near the core.
              const blend = clamp(t * (str / 12000), 0, 0.92);

              let ndx = vx + (nx - vx) * blend;
              let ndy = vy + (ny - vy) * blend;
              const nn = Math.hypot(ndx, ndy) || 1;

              b.vx = (ndx / nn) * sp;
              b.vy = (ndy / nn) * sp;

              // If a bullet clips into the core, shove it outward so it can't "ghost hit" the player.
              const minD = this.player.r + b.r + 8;
              if (d < minD) {
                b.x = this.player.x + nx * minD;
                b.y = this.player.y + ny * minD;
              }
            }
          }
        }
      }

      // stage fields can influence bullet trajectories
      if (this.stage) {
        // MAGNET: magnetic coil. Curvature ramps up sharply near the core (magnet-like).
        const magNodes = this.stage.fields?.magnet || [];
        if (magNodes.length) {
          // Lorentz-ish: rotate velocity by an angular speed that increases as you get closer.
          // Field strength ~ (soft/(d+soft))^pow so it's subtle far away and violent near the core.
          let omegaSum = 0;
          for (const n of magNodes) {
            const dx = n.x - b.x;
            const dy = n.y - b.y;
            const d = Math.hypot(dx, dy);
            if (d <= n.r) {
              const soft = (n.soft !== undefined) ? n.soft : 160;
              const pow = (n.pow !== undefined) ? n.pow : 2.6;
              const fall = Math.pow(soft / (d + soft), pow); // 0..1, steep near 0
              const dir = (n.dir !== undefined) ? n.dir : 1;
              const omegaBase = (n.omega !== undefined) ? n.omega : 42; // rad/s near core
              omegaSum += dir * omegaBase * fall;
            }
          }

          if (omegaSum !== 0) {
            const sp = Math.hypot(b.vx, b.vy) || 1;
            let ang = omegaSum * dtWorld;

            // clamp per-frame rotation to keep things readable (but still obvious)
            ang = clamp(ang, -0.75, 0.75);

            if (Math.abs(ang) > 1e-6) {
              const c = Math.cos(ang);
              const s = Math.sin(ang);
              const nvx = b.vx * c - b.vy * s;
              const nvy = b.vx * s + b.vy * c;

              // preserve speed magnitude
              const sp2 = Math.hypot(nvx, nvy) || 1;
              const k = sp / sp2;
              b.vx = nvx * k;
              b.vy = nvy * k;
            }
          }
        }


      }

      const px = b.x;
      const py = b.y;
      b._px = px;
      b._py = py;
      b.update(dtWorld);

      // AEGIS: absorb enemy bullets with a close-range barrier (not just "repel")
      if(!b.dead && this._focusActive && this._focusMode && this._focusMode.shield && b.team === "enemy"){
        const sr = this._focusMode.shield.radius ?? 150;
        const dx = b.x - this.player.x;
        const dy = b.y - this.player.y;
        const rr = sr + b.r;
        if(dx*dx + dy*dy < rr*rr){
          b.age = b.life; // mark as dead (dead is a getter)

          const n = reducedMotion ? 6 : 14;
          this.particles.burst({ x: b.x, y: b.y }, n, { speedMin: 140, speedMax: 620, lifeMin: 0.06, lifeMax: 0.24, glow: 20 });
        }
      }

      if (b.dead) {
        if (b.explodeR > 0) {
          this._explodeAt(b.x, b.y, b.team, b.damage, b.explodeR, b.explodeFalloff, reducedMotion);
        }
        this.bullets.splice(i, 1);
        continue;
      }
      // obstacles can block bullets (rect + circle), if blocksBullets=true
      let blocked = false;
      let hx = b.x, hy = b.y;

      // Use CCD so fast bullets don't tunnel through walls.
      const x0 = (b._px !== undefined) ? b._px : b.x;
      const y0 = (b._py !== undefined) ? b._py : b.y;
      const x1 = b.x, y1 = b.y;

      for (const o of this.obstacles) {
        if (!o.blocksBullets) continue;

        if (o.shape === "rect") {
          const hw = o.w * 0.5;
          const hh = o.h * 0.5;
          const minX = o.x - hw - b.r;
          const maxX = o.x + hw + b.r;
          const minY = o.y - hh - b.r;
          const maxY = o.y + hh + b.r;

          const t = segAabbTOI(x0, y0, x1, y1, minX, minY, maxX, maxY);
          if (t !== null) {
            blocked = true;
            hx = x0 + (x1 - x0) * t;
            hy = y0 + (y1 - y0) * t;
            break;
          }
        } else if (o.shape === "circle") {
          const t = segCircleTOI(x0, y0, x1, y1, o.x, o.y, o.r + b.r);
          if (t !== null) {
            blocked = true;
            hx = x0 + (x1 - x0) * t;
            hy = y0 + (y1 - y0) * t;
            break;
          }
        }
      }


      if (blocked) {
        if (b.explodeR > 0) {
          this._explodeAt(hx, hy, b.team, b.damage, b.explodeR, b.explodeFalloff, reducedMotion);
        } else {
          this.particles.ring({ x: hx, y: hy }, 6, { speedMin: 160, speedMax: 420, lifeMin: 0.06, lifeMax: 0.18, glow: 16 });
        }
        this.bullets.splice(i, 1);
        continue;
      }

      // cleanup if it wanders out of bounds
      if (b.x < this.world.minX - 60 || b.x > this.world.maxX + 60 || b.y < this.world.minY - 60 || b.y > this.world.maxY + 60) {
        this.bullets.splice(i, 1);
      }
    }

    // pickups (with mild magnetism if upgraded)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];

      const dxp = this.player.x - p.x;
      const dyp = this.player.y - p.y;
      const d2p = dxp * dxp + dyp * dyp;
      if (this.player.mods.magnet > 0 && d2p < (520 * 520)) {
        const d0 = Math.sqrt(d2p) || 1;
        const pull = (this.player.mods.magnet * 220) * dtWorld;
        const nx = (this.player.x - p.x) / (d0 || 1);
        const ny = (this.player.y - p.y) / (d0 || 1);
        p.vx += nx * pull;
        p.vy += ny * pull;
        p.vx *= Math.exp(-6 * dtWorld);
        p.vy *= Math.exp(-6 * dtWorld);
      } else {
        p.vx *= Math.exp(-8 * dtWorld);
        p.vy *= Math.exp(-8 * dtWorld);
      }

      p.update(dtWorld);

      const dx2 = this.player.x - p.x;
      const dy2 = this.player.y - p.y;
      const rr = p.r + this.player.r;
      if (dx2 * dx2 + dy2 * dy2 < rr * rr) {
        if (p.kind === "hp") {
          if (this.player.hp >= this.player.hpMax - 0.01) {
            // overflow heal becomes FORCE (shop currency)
            this.player.force += Math.floor(2 * (this.player.mods.forceGainMul || 1));
          } else {
            this.player.hp = Math.min(this.player.hpMax, this.player.hp + 24);
          }
        } else {
          if (this.player.focus >= this.player.focusMax - 0.01) {
            // overflow focus becomes FORCE
            this.player.force += Math.floor(2 * (this.player.mods.forceGainMul || 1));
          } else {
            this.player.focus = Math.min(this.player.focusMax, this.player.focus + 32);
          }
        }
        this.sfx.pickup();
        this.particles.burst({ x: p.x, y: p.y }, 16, { speedMin: 140, speedMax: 520, lifeMin: 0.10, lifeMax: 0.40, glow: 18 });
        this.pickups.splice(i, 1);
      }
    }

    // collisions
    this._resolveCollisions(reducedMotion);

    // camera
    const lead = 0.10;
    const tx = this.player.x - this.w * 0.5 + (this.player.aimX - this.player.x) * lead;
    const ty = this.player.y - this.h * 0.5 + (this.player.aimY - this.player.y) * lead;
    this.camera.x = lerp(this.camera.x, tx, 1 - Math.exp(-7.5 * dt));
    this.camera.y = lerp(this.camera.y, ty, 1 - Math.exp(-7.5 * dt));

    // shake
    this.shake = Math.max(0, this.shake - dt * 14);
    if (!reducedMotion && this.shake > 0) {
      const s = this.shake;
      this.shakeX = rand(s, -s);
      this.shakeY = rand(s, -s);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // particles
    this.particles.update(dtWorld);

    // room completion check
    if (this.roomIsBoss) {
      if (this.enemies.length === 0) {
        this._completeRoom();
      }
    } else {
      const doneKills = this.killsThisRoom >= this.killsTarget;
      if (doneKills && this.enemies.length === 0) {
        this._completeRoom();
      }
    }

    // death
    if (this.player.hp <= 0) {
      this.sfx.death();
      this.gameOver();
    }

    return { timeScale: this.timeScale, roomIntro: this.roomIntro };
  }

  _updateBlades(dt) {
    const n = this.player.mods.blades | 0;
    if (n <= 0) {
      this.player._bladePos = [];
      return;
    }
    const rad = 54;
    const br = 10;
    const spd = 2.2;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const a = this.player.t * spd + (Math.PI * 2) * (i / n);
      arr.push({
        x: this.player.x + Math.cos(a) * rad,
        y: this.player.y + Math.sin(a) * rad,
        r: br,
      });
    }
    this.player._bladePos = arr;

    // blade damage to enemies, with per-enemy cooldown
    for (const e of this.enemies) {
      if (e.touchCd > 0) continue;
      for (const b of arr) {
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          e.takeDamage(14 * this.player.mods.dmgMul);
          e.touchCd = 0.18;
          this.particles.burst({ x: b.x, y: b.y }, 8, { speedMin: 140, speedMax: 460, lifeMin: 0.08, lifeMax: 0.22, glow: 18 });
          this.sfx.hit();
          break;
        }
      }
    }
  }

  _weaponLabel(id) {
    if (id === "scatter") return "Scatter";
    if (id === "burst") return "Burst";
    if (id === "rail") return "Rail";
    return "Pulse";
  }

  _scoreFor(enemy) {
    const t = enemy?.type || "shooter";
    let base = 32;

    if (t === "warden") base = 520;
    else if (t === "boss_lava" || t === "boss_ice" || t === "boss_magnet" || t === "boss_void") base = 580;
    else if (t === "pylon") base = 82;
    else if (t === "bomber") base = 74;
    else if (t === "sniper") base = 70;
    else if (t === "charger") base = 62;
    else if (t === "splitter") base = 66;
    else if (t === "stalker") base = 46;
    else if (t === "weaver") base = 44;
    else if (t === "shooter") base = 46;
    else if (t === "mote") base = 18;

    return base;
  }

  _circleRectHit(x, y, r, o) {
    const hw = o.w * 0.5;
    const hh = o.h * 0.5;
    const cx = clamp(x, o.x - hw, o.x + hw);
    const cy = clamp(y, o.y - hh, o.y + hh);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= r * r) {
      return { x: cx, y: cy };
    }
    return null;
  }

  _explodeAt(x, y, ownerTeam, baseDamage, radius, falloff = 0.75, reducedMotion = false) {
    const R = radius;

    // visuals first (feels snappy)
    this.particles.ring({ x, y }, Math.max(10, Math.min(44, R * 0.33)), { speedMin: 220, speedMax: 760, lifeMin: 0.10, lifeMax: 0.34, glow: 30 });
    this.particles.burst({ x, y }, 26, { speedMin: 160, speedMax: 840, lifeMin: 0.08, lifeMax: 0.48, glow: 34 });
    if (!reducedMotion) this._shake(Math.min(10.5, 3.5 + R * 0.02));

    // damage depends on owner team
    if (ownerTeam === "enemy") {
      const d0 = Math.max(0, Math.hypot(this.player.x - x, this.player.y - y) - this.player.r);
      if (d0 < R) {
        const k = 1 - clamp(d0 / R, 0, 1);
        const mul = lerp(falloff, 1, k);
        const took = this.player.takeDamage(baseDamage * mul);
        if (took) this.sfx.hit();
      }
    } else {
      // player-owned explosion
      for (const e of this.enemies) {
        const d0 = Math.max(0, Math.hypot(e.x - x, e.y - y) - e.r);
        if (d0 < R) {
          const k = 1 - clamp(d0 / R, 0, 1);
          const mul = lerp(falloff, 1, k);
          e.takeDamage(baseDamage * mul);
        }
      }
    }
  }

  _shouldShop(roomNumber) {
    // every 3 rooms, and always before a boss room
    if (this._isBossRoom(roomNumber)) return true;
    return (roomNumber % 3) === 0;
  }

  _enterShop() {
    // prevents re-enter loops
    if (this.lastShopRoom === this.room) return;
    this.lastShopRoom = this.room;

    this.state = "shop";
    this.bullets = [];
    this.pickups = [];
    this.enemies = [];

    this.shopVersion += 1;
    this.shopStock = this._rollShopStock();
  }

  _startCombat() {
    this.state = "playing";
    // boss room needs its boss spawned immediately or it "completes" instantly
    if (this.roomIsBoss && this.enemies.length === 0) {
      this._spawnBoss();
    }
  }

  _rollShopStock() {
    return rollShopStock(this);
  }

  buyShop(index) {
    if (this.state !== "shop") return false;
    const it = this.shopStock[index];
    if (!it || it.sold) return false;

    if (this.player.force < it.cost) return false;

    this.player.force -= it.cost;
    this.player.forceSpent += it.cost;

    it.sold = true;
    if (typeof it.apply === "function") it.apply(this);

    this.sfx.upgrade();
    return true;
  }

  getShopRerollCost() {
    return getShopRerollCost(this.room, this.shopRerolls);
  }

  rerollShop() {
    if (this.state !== "shop") return false;
    const cost = this.getShopRerollCost();
    if (this.player.force < cost) return false;
    this.player.force -= cost;
    this.player.forceSpent += cost;

    this.shopRerolls += 1;
    this.shopVersion += 1;
    this.shopStock = this._rollShopStock();

    this.sfx.upgrade();
    return true;
  }

  leaveShop() {
    if (this.state !== "shop") return;
    this._startCombat();
  }

_focusPulse(fm, reducedMotion){
    // NOVA: radial shockwave. Scales with your damage so it stays relevant.
    const p = this.player;
    if(!p) return;
    const pulse = fm && fm.pulse ? fm.pulse : null;
    if(!pulse) return;

    const r = pulse.radius ?? 170;
    const base = pulse.damage ?? 14;

    // Scale with player damage upgrades and the mode's damage multiplier.
    const dmgMul = (p.mods && p.mods.dmgMul !== undefined ? p.mods.dmgMul : 1) * (p.focusModeDmgMul ?? 1);
    const dmg = base * dmgMul;

    const x = p.x, y = p.y;

    // per-pulse cost (prevents "free" spam by tap or long-hold)
    const pcost = pulse.cost ?? 0;
    if(pcost > 0){
      if(p.focus <= pcost){
        p.focus = 0;
        this._focusExhausted = true;
        return;
      }
      p.focus = Math.max(0, p.focus - pcost);
      if(p.focus <= 0) this._focusExhausted = true;
    }

    // tiny i-frames after the blast so using it up-close isn't pure self-harm
    const ifr = pulse.iframes ?? 0;
    if(ifr > 0){
      p.invuln = Math.max(p.invuln || 0, ifr);
    }

    // brief post-pulse barrier (enemy keep-away)
    const bar = pulse.barrier || null;
    if(bar){
      const dur = bar.dur ?? 0.22;
      this._pulseBarrierT = Math.max(this._pulseBarrierT || 0, dur);
      const radius = bar.radius ?? (r * 0.70);
      this._pulseBarrierR = Math.max(this._pulseBarrierR || 0, radius);
      this._pulseBarrierStr = bar.strength ?? 8200;
    }

    // visuals
    this.particles.ring({ x, y }, r * 0.55, { speedMin: 260, speedMax: 860, lifeMin: 0.10, lifeMax: 0.32, glow: 30 });
    if(!reducedMotion) this._shake(4.2);

    // damage enemies
    const rr2 = (r * r);
    const mul = (pulse.mul !== undefined) ? pulse.mul : 1.0;
    const falloff = (pulse.falloff !== undefined) ? pulse.falloff : 1.0;
    const kb = (pulse.knock !== undefined) ? pulse.knock : 0;

    for(const e of this.enemies){
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx*dx + dy*dy;
      if(d2 <= rr2){
        const d = Math.sqrt(d2) || 1;
        const k = 1 - clamp(d / r, 0, 1);

        // optional falloff: edge damage = falloff, center damage = 1.0
        const dm = (falloff >= 0 && falloff < 1) ? lerp(falloff, 1, k) : 1;

        e.takeDamage(dmg * mul * dm);

        if(kb > 0){
          const push = kb * k;
          e.vx += (dx/d) * (push * 420);
          e.vy += (dy/d) * (push * 420);
        }
      }
    }

    // Clear nearby enemy bullets (reads as a true shockwave, not just damage)
    if(pulse.clearBullets){
      const mul = pulse.clearRadiusMul ?? 1.05;
      const br = r * mul;
      const br2 = br * br;

      let cleared = 0;
      for(let i = this.bullets.length - 1; i >= 0; i--){
        const b = this.bullets[i];
        if(!b || b.team !== "enemy") continue;
        const dx = b.x - x;
        const dy = b.y - y;
        if(dx*dx + dy*dy <= br2){
          this.bullets.splice(i, 1);
          cleared++;
        }
      }

      if(cleared > 0){
        const n = reducedMotion ? Math.min(6, cleared) : Math.min(18, 6 + Math.floor(cleared * 0.25));
        this.particles.burst({ x, y }, n, { speedMin: 140, speedMax: 720, lifeMin: 0.06, lifeMax: 0.22, glow: 22 });
      }
    }

  }



  _resolveCollisions(reducedMotion) {
    // player bullets vs enemies
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.team !== "player") continue;

      let remove = false;

      const x0 = (b._px !== undefined) ? b._px : b.x;
      const y0 = (b._py !== undefined) ? b._py : b.y;
      const x1 = b.x;
      const y1 = b.y;

      for (const e of this.enemies) {
        if(b._ignoreEnemyT && b._ignoreEnemy === e) continue;
        const rr = b.r + e.r;
        const toi = segCircleTOI(x0, y0, x1, y1, e.x, e.y, rr);
        if (toi !== null) {
          const hx = x0 + (x1 - x0) * toi;
          const hy = y0 + (y1 - y0) * toi;
          b.x = hx;
          b.y = hy;
          // Explosive player bullets deal damage via the explosion (avoids double-dipping).
          if (b.explodeR > 0) {
            this._explodeAt(b.x, b.y, "player", b.damage, b.explodeR, b.explodeFalloff, reducedMotion);
            remove = true;
            break;
          }

          e.takeDamage(b.damage);

          // FOCUS on-hit effects (e.g. SIPHON)
          if(this._focusActive && this._focusMode && this._focusMode.onHit){
            const oh = this._focusMode.onHit;
            const cap = this._focusMode.onHitCap || null;

            let addF = oh.focus || 0;
            let addH = oh.hp || 0;

            if(cap){
              const capF = cap.focusPerSec ?? 1e9;
              const capH = cap.hpPerSec ?? 1e9;

              if(addF > 0){
                const remainF = Math.max(0, capF - (this._onHitFocusGained || 0));
                addF = Math.min(addF, remainF);
              }
              if(addH > 0){
                const remainH = Math.max(0, capH - (this._onHitHpGained || 0));
                addH = Math.min(addH, remainH);
              }
            }

            if(addF > 0){
              this.player.focus = Math.min(this.player.focusMax, this.player.focus + addF);
              this._onHitFocusGained = (this._onHitFocusGained || 0) + addF;
            }
            if(addH > 0){
              this.player.hp = Math.min(this.player.hpMax, this.player.hp + addH);
              this._onHitHpGained = (this._onHitHpGained || 0) + addH;
            }
          }

          this.sfx.hit();
          if (!reducedMotion) this._shake(2.4);

          this.particles.burst({ x: b.x, y: b.y }, 12, { speedMin: 160, speedMax: 560, lifeMin: 0.08, lifeMax: 0.32, glow: 20 });

          // chain spark (jumps)
          if (this.player.mods.chain > 0 && this.player.mods.chainCount > 0) {
            const used = new Set();
            used.add(e);

            let from = e;
            for (let k = 0; k < this.player.mods.chainCount; k++) {
              const target = this._findChainTarget(from, used);
              if (!target) break;

              used.add(target);
              target.takeDamage(b.damage * this.player.mods.chainDamageMul);
              this.particles.ring({ x: target.x, y: target.y }, 10, { speedMin: 220, speedMax: 520, lifeMin: 0.08, lifeMax: 0.20, glow: 18 });
              from = target;
            }
          }

          if (b.pierce > 0) {
            b.pierce -= 1;
            const decay = (this._focusActive && this._focusMode && this._focusMode.pierceDamageMul !== undefined)
              ? this._focusMode.pierceDamageMul
              : 0.85;
            b.damage *= decay;
          // Avoid multi-hitting the same enemy across frames; push the bullet through the target.
          b._ignoreEnemy = e;
          b._ignoreEnemyT = 0.06;
          const sp = Math.hypot(b.vx, b.vy) || 1;
          b.x += (b.vx / sp) * (e.r + b.r + 2);
          b.y += (b.vy / sp) * (e.r + b.r + 2);
          } else {
            remove = true;
          }
          break;
        }
      }

      if (remove) {
        this.bullets.splice(i, 1);
      }
    }

    // enemy bullets vs player
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.team !== "enemy") continue;

      const x0 = (b._px !== undefined) ? b._px : b.x;
      const y0 = (b._py !== undefined) ? b._py : b.y;
      const x1 = b.x;
      const y1 = b.y;

      const rr = b.r + this.player.r;
      const toi = segCircleTOI(x0, y0, x1, y1, this.player.x, this.player.y, rr);
      if (toi !== null) {
        const hx = x0 + (x1 - x0) * toi;
        const hy = y0 + (y1 - y0) * toi;
        if (b.explodeR > 0) {
          this._explodeAt(hx, hy, "enemy", b.damage, b.explodeR, b.explodeFalloff, reducedMotion);
        } else {
          const took = this.player.takeDamage(b.damage);
          if (took) {
            this.sfx.hit();
            this.particles.burst({ x: this.player.x, y: this.player.y }, 22, { speedMin: 170, speedMax: 660, lifeMin: 0.10, lifeMax: 0.45, glow: 22 });
            if (!reducedMotion) this._shake(6.6);
          }
        }
        this.bullets.splice(i, 1);
      }
    }

    // touch damage
    for (const e of this.enemies) {
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      const rr = e.r + this.player.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0;
        const dmg = (e.type === "warden" ? 22 : 16) * e.damageMul;
        const took = this.player.takeDamage(dmg);
        if (took) {
          this.sfx.hit();
          if (!reducedMotion) this._shake(6.8);
        }
        const push = (e.r + this.player.r - d) + 0.5;
        const nx = (this.player.x - e.x) / (d || 1);
        const ny = (this.player.y - e.y) / (d || 1);
        this.player.x += nx * push;
        this.player.y += ny * push;
      }
    }

    // enemy deaths
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.dead) continue;

      this.enemies.splice(i, 1);

      const base = this._scoreFor(e);
      const eliteBonus = e.elite ? 1.35 : 1;
      this.player.addScore(base * eliteBonus);

      // FORCE gain (shop currency)
      this.player.force += Math.floor(this._forceGainFor(e) * (this.player.mods.forceGainMul || 1));

      if (this.player.mods.vamp > 0) {
        this.player.heal(this.player.mods.vamp);
      }

      // splitter spawns motes
      if (e.type === "splitter") {
        const n = e.elite ? 4 : 3;
        for (let k = 0; k < n; k++) {
          const a = rand(Math.PI * 2, 0);
          const ex = clamp(e.x + Math.cos(a) * 26, this.world.minX + 20, this.world.maxX - 20);
          const ey = clamp(e.y + Math.sin(a) * 26, this.world.minY + 20, this.world.maxY - 20);
          this.enemies.push(new Enemy(ex, ey, "mote", { elite: false }));
        }
      }

      this.particles.ring({ x: e.x, y: e.y }, e.type === "warden" ? 44 : 22, { speedMin: 260, speedMax: 720, lifeMin: 0.10, lifeMax: 0.58, glow: e.type === "warden" ? 34 : 26 });
      this.particles.burst({ x: e.x, y: e.y }, e.type === "warden" ? 52 : 24, { speedMin: 120, speedMax: 760, lifeMin: 0.12, lifeMax: 0.75, glow: e.type === "warden" ? 38 : 28 });

      if (e.type !== "warden") {
        this.killsThisRoom += 1;
      }

      // pickups
      const dropChance = e.elite ? 0.92 : 0.58;
      if (Math.random() < dropChance) {
        this.pickups.push(spawnPickup(e.x, e.y));
      }

      if (!reducedMotion) this._shake(e.type === "warden" ? 11.0 : 5.0);
    }
  }

  _findChainTarget(fromEnemy, used) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e === fromEnemy) continue;
      const dx = e.x - fromEnemy.x;
      const dy = e.y - fromEnemy.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < (240 * 240) && d2 < bestD) {
        bestD = d2;
        best = e;
      }
    }
    return best;
  }
}