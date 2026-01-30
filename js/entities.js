import { clamp, rand, v2, v2dist, v2norm } from "./math.js";
import { stagePointFx } from "./maps/index.js";

export class Obstacle {
  // Circle: new Obstacle(x,y,r[, opts])
  // Rect : new Obstacle(x,y,w,h[, opts])  (axis-aligned, centered)
  constructor(x, y, a, b = null, opts = null){
    this.x = x; this.y = y;

    if(typeof b === "number"){
      this.shape = "rect";
      this.w = a;
      this.h = b;
      const o = opts || {};
      this.blocksBullets = (o.blocksBullets !== undefined) ? !!o.blocksBullets : true;
      this.solid = (o.solid !== undefined) ? !!o.solid : true;
    
      this.material = (o.material !== undefined) ? String(o.material) : "metal";
}else{
      // circle obstacle
      this.shape = "circle";
      this.r = a;
      const o = b || {};
      this.blocksBullets = (o.blocksBullets !== undefined) ? !!o.blocksBullets : false;
      this.solid = (o.solid !== undefined) ? !!o.solid : true;
      this.material = (o.material !== undefined) ? String(o.material) : "glass";
    }
  }
}

export class Bullet {
  constructor(x,y,vx,vy,team, meta = {}){
    this.x=x; this.y=y;
    this.vx=vx; this.vy=vy;
    this.team=team; // "player" | "enemy"
    this.r = meta.r ?? (team === "player" ? 3.2 : 4.2);
    this.life = meta.life ?? (team === "player" ? 0.95 : 1.25);
    this.age = 0;
    this.damage = meta.damage ?? (team === "player" ? 18 : 12);
    this.pierce = meta.pierce ?? 0;
    this.crit = !!meta.crit;
    this.explodeR = meta.explodeR ?? 0;
    this.explodeFalloff = meta.explodeFalloff ?? 0.75;
  }
  update(dt){
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  get dead(){ return this.age >= this.life; }
}

export class Pickup {
  constructor(x,y,kind){
    this.x=x; this.y=y;
    this.kind = kind; // "focus" | "hp"
    this.r = kind === "hp" ? 10 : 9;
    this.t = 0;
    this.vx = 0;
    this.vy = 0;
  }
  update(dt){
    this.t += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.exp(-7.5 * dt);
    this.vy *= Math.exp(-7.5 * dt);
  }
}

export class Player {
  constructor(x,y){
    this.x=x; this.y=y;
    this.vx=0; this.vy=0;

    this.r=16;
    this.hpMax=100;
    this.hp=100;

    this.focusMax=100;
    this.focus=100;


    this.focusActive = false;
    this.focusModeId = "chrono";
    this.focusMoveMul = 1;
    this.focusFireMul = 1;
    this.focusBulletSpeedMul = 1;
    this.focusBulletLifeMul = 1;
    this.focusModeDmgMul = 1;
    this.focusModeCritAdd = 0;
    this.focusModeSpreadMul = 1;
    this.focusModePierceAdd = 0;
    this.focusModeDmgTakenMul = 1;

    this.aimX = x;
    this.aimY = y;
    this.face = 0;

    this.fireCd = 0;
    this.baseFireRate = 0.11;

    this.invuln = 0;

    this.dashCd = 0;
    this.baseDashCd = 0.9;
    this.dashTime = 0;
    this._dashDir = {x:1,y:0};
    this._dashRemain = 0;
    this._dashSpeed = 0;

    this.score = 0;
    this.force = 0;
    this.forceSpent = 0;
    this.combo = 1;
    this.comboTimer = 0;

    this.room = 1;

    // Weapons: pulse (balanced), needle (high ROF/short range), burst (3-shot),
    // prism (triple), scatter (shotgun), launcher (AoE), rail (pierce/alpha)
    this.weaponId = "pulse";
    this._burst = { remain: 0, delay: 0, dir: {x:1,y:0} };

    this.upgrades = []; // {id, name, stack}
    this.mods = {
      dmgMul: 1,
      fireMul: 1,
      moveMul: 1,
      bulletSpeedMul: 1,
      focusCostMul: 1,
      focusRegenMul: 1,
      focusRegenAdd: 0,
      dashCdMul: 1,
      dashDistMul: 1,
      focusDmgMul: 1,
      focusCritAdd: 0,
      focusSpreadMul: 1,
      pierce: 0,
      chain: 0,
      chainCount: 0,
      chainRange: 260,
      chainDamageMul: 0.55,
      vamp: 0,
      blades: 0,
      nova: 0,
      explodeRadiusMul: 1,
      explodeDamageMul: 1,
      forceGainMul: 1,
      magnet: 0,
    };

    this.skill = {
      novaCd: 0,
      novaCdMax: 7.5,
    };


    // Stage effects (set by game.js)
    this.envMoveMul = 1;
    this.envFrictionMul = 1;
    this.envFocusRegenMul = 1;
    this.envFocusCostMul = 1;
    this.stageFxType = "none";
    this.stageFxA = 0;

    this.t = 0;
  }

  addUpgrade(u){
    const found = this.upgrades.find(x => x.id === u.id);
    if(found){
      found.stack += 1;
    }else{
      this.upgrades.push({id:u.id, name:u.name, stack:1});
    }
    u.apply(this);
  }

  takeDamage(dmg){
    if(this.invuln > 0) return false;
    dmg *= (this.focusModeDmgTakenMul || 1);
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.22;
    this.combo = 1;
    this.comboTimer = 0;
    return true;
  }

  heal(v){
    this.hp = Math.min(this.hpMax, this.hp + v);
  }

  addScore(base){
    this.score += base * this.combo;
    this.comboTimer = 2.0;
    this.combo = Math.min(12, this.combo + 1);
  }

  update(dt, input, world){
    this.t += dt;

    this.fireCd = Math.max(0, this.fireCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.skill.novaCd = Math.max(0, this.skill.novaCd - dt);

    if(this.comboTimer > 0){
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if(this.comboTimer === 0) this.combo = 1;
    }

    // aim
    this.aimX = input.mouseWorld.x;
    this.aimY = input.mouseWorld.y;
    const ax = this.aimX - this.x;
    const ay = this.aimY - this.y;
    this.face = Math.atan2(ay, ax);

    // dash in progress: fixed-distance burst, not "speed buff"
    if(this.dashTime > 0){
      const step = Math.min(this._dashRemain, this._dashSpeed * dt);
      this.x += this._dashDir.x * step;
      this.y += this._dashDir.y * step;
      this._dashRemain -= step;
      this.dashTime = Math.max(0, this.dashTime - dt);

      // no drift after dash
      this.vx *= Math.exp(-18 * dt);
      this.vy *= Math.exp(-18 * dt);

      // bounds
      this.x = clamp(this.x, world.minX + this.r, world.maxX - this.r);
      this.y = clamp(this.y, world.minY + this.r, world.maxY - this.r);

      // keep a sliver of i-frames after the burst ends
      if(this.dashTime === 0 || this._dashRemain <= 0){
        this.dashTime = 0;
        this._dashRemain = 0;
        this.invuln = Math.max(this.invuln, 0.06);
      }

      return {didDash:false, dashDir:this._dashDir};
    }

    // move input (also used for dash direction)
    const mv = input.move;
    let mx = mv.x, my = mv.y;
    const ml = Math.hypot(mx,my);
    if(ml > 1e-5){ mx /= ml; my /= ml; }

    // dash start
    if(input.consumePressed("ShiftLeft") || input.consumePressed("ShiftRight")){
      const dashCdNow = this.baseDashCd * this.mods.dashCdMul;
      if(this.dashCd <= 0){
        this.dashCd = dashCdNow;

        // choose dash direction: prefer movement, fallback to aim
        let dir;
        if(ml > 0.18){
          dir = v2norm(v2(mx, my));
        }else{
          dir = v2norm(v2(ax, ay));
        }

        const dist = 280 * this.mods.dashDistMul;
        const dur = 0.09;
        this.dashTime = dur;
        this._dashRemain = dist;
        this._dashDir = dir;
        this._dashSpeed = dist / dur;

        this.vx = 0;
        this.vy = 0;
        this.invuln = Math.max(this.invuln, dur + 0.06);

        return {didDash:true, dashDir:dir};
      }
    }

    // normal movement
    const envMove = (this.envMoveMul !== undefined) ? this.envMoveMul : 1;
    const envFric = (this.envFrictionMul !== undefined) ? this.envFrictionMul : 1;
    const fMove = (this.focusMoveMul !== undefined) ? this.focusMoveMul : 1;
    const accel = 2200 * this.mods.moveMul * envMove * fMove;
    const maxSpd = 360 * this.mods.moveMul * envMove * fMove;
    const friction = 11 * envFric;

    this.vx += mx * accel * dt;
    this.vy += my * accel * dt;

    const sp = Math.hypot(this.vx, this.vy);
    if(sp > maxSpd){
      const k = maxSpd / sp;
      this.vx *= k; this.vy *= k;
    }

    const fk = Math.exp(-friction * dt);
    this.vx *= fk;
    this.vy *= fk;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // bounds
    this.x = clamp(this.x, world.minX + this.r, world.maxX - this.r);
    this.y = clamp(this.y, world.minY + this.r, world.maxY - this.r);

    return {didDash:false, dashDir:null};
  }

  setWeapon(id){
    this.weaponId = id;
    this._burst.remain = 0;
    this._burst.delay = 0;
  }

  tryShoot(dt, input, focusActive=false){
    // burst follow-up shots
    if(this._burst.remain > 0){
      this._burst.delay = Math.max(0, this._burst.delay - dt);
      if(this._burst.delay <= 0 && this.fireCd <= 0){
        this._burst.remain -= 1;
        this._burst.delay = 0.055;
        return this._makeShot(this._burst.dir, focusActive, "burst");
      }
    }

    if(!(input.mouseDown || (input.mouse && input.mouse.down))) return null;
    if(this.fireCd > 0) return null;

    const dir = v2norm(v2(this.aimX - this.x, this.aimY - this.y));

    // weapon profiles (tuned so each has a clear strength *and* a clear weakness)
    // NOTE: All cooldowns are divided by fireMul.

    if(this.weaponId === "needle"){
      // Laser-ish tracking: very fast ROF, short range, low per-shot damage.
      const cd = (this.baseFireRate * 0.62) / this.mods.fireMul;
      this.fireCd = cd;
      return this._makeShot(dir, focusActive, "needle");
    }

    if(this.weaponId === "scatter"){
      // Shotgun: huge close-range burst, poor range/precision.
      const cd = (this.baseFireRate * 2.10) / this.mods.fireMul;
      this.fireCd = cd;
      const n = 6;
      const out = [];
      for(let i=0;i<n;i++) out.push(this._makeShot(dir, focusActive, "scatter", i, n));
      return out;
    }

    if(this.weaponId === "burst"){
      // 3-shot burst: consistent mid-range, slightly slower cycle.
      const cd = (this.baseFireRate * 1.70) / this.mods.fireMul;
      this.fireCd = cd;
      this._burst.remain = 2;
      this._burst.delay = 0.055;
      this._burst.dir = dir;
      return this._makeShot(dir, focusActive, "burst");
    }

    if(this.weaponId === "prism"){
      // 3-way split: good coverage, weaker single-target unless close/aligned.
      const cd = (this.baseFireRate * 2.00) / this.mods.fireMul;
      this.fireCd = cd;
      return [
        this._makeShot(dir, focusActive, "prism", 0, 3),
        this._makeShot(dir, focusActive, "prism", 1, 3),
        this._makeShot(dir, focusActive, "prism", 2, 3),
      ];
    }

    if(this.weaponId === "launcher"){
      // AoE control: slow projectile, explodes (also explodes on hit), weak single target.
      const cd = 0.62 / this.mods.fireMul;
      this.fireCd = cd;
      return this._makeShot(dir, focusActive, "launcher");
    }

    if(this.weaponId === "rail"){
      // Alpha + pierce: very fast, very narrow, slow cycle.
      const cd = 0.58 / this.mods.fireMul;
      this.fireCd = cd;
      return this._makeShot(dir, focusActive, "rail");
    }

    // default: pulse (balanced)
    const fireMul = this.mods.fireMul * (this.focusFireMul || 1);
    const cd = this.baseFireRate / fireMul;
    this.fireCd = cd;
    return this._makeShot(dir, focusActive, "pulse");
  }

  _makeShot(dir, focusActive, weapon, pelletIndex=0, pelletCount=1){
    // Base profiles (before mods). Tune these instead of multiplying upgrades to infinity.
    const speedBase =
      weapon === "rail" ? 1900 :
      weapon === "needle" ? 1450 :
      weapon === "scatter" ? 900 :
      weapon === "launcher" ? 760 :
      1050;
    const speed = speedBase * this.mods.bulletSpeedMul * (this.focusBulletSpeedMul || 1);

    // spread
    // spread
    const spreadBase = focusActive ? 0.018 : 0.060;
    let spread = rand(spreadBase, -spreadBase) * this.mods.focusSpreadMul * (this.focusModeSpreadMul || 1);

    if(weapon === "needle"){
      // Needle wants to be precise. (Its weakness is range + per-shot damage.)
      spread *= focusActive ? 0.55 : 0.40;
    }else if(weapon === "scatter"){
      const wide = focusActive ? 0.055 : 0.12;
      const center = (pelletIndex - (pelletCount-1)/2) * (wide * 0.65);
      spread += center + rand(wide, -wide) * 0.25;
    }else if(weapon === "burst"){
      spread *= 0.55;
    }else if(weapon === "prism"){
      // fixed split angles with a hint of randomness
      const ang = [-0.085, 0.0, 0.085][pelletIndex] || 0;
      spread += ang + rand(0.010, -0.010) * (focusActive ? 0.55 : 1.0);
    }else if(weapon === "rail"){
      spread *= 0.25;
    }else if(weapon === "launcher"){
      spread *= 0.75;
    }

    const cs = Math.cos(spread), sn = Math.sin(spread);
    const dx = dir.x * cs - dir.y * sn;
    const dy = dir.x * sn + dir.y * cs;

    const critChanceBase = focusActive ? 0.10 : 0.07;
    const critBonus =
      weapon === "rail" ? 0.06 :
      weapon === "needle" ? -0.01 :
      weapon === "burst" ? 0.02 :
      0;
    const critChance = critChanceBase + this.mods.focusCritAdd + (this.focusModeCritAdd || 0) + critBonus;
    const crit = Math.random() < critChance;

    const focusMul = focusActive ? (this.mods.focusDmgMul * (this.focusModeDmgMul || 1)) : 1;

    const baseDmg =
      weapon === "rail" ? 84 :
      weapon === "launcher" ? 46 :
      weapon === "scatter" ? 7.2 :
      weapon === "prism" ? 12.0 :
      weapon === "needle" ? 7.4 :
      weapon === "burst" ? 15.0 :
      18.0;

    const dmg = baseDmg * this.mods.dmgMul * focusMul * (crit ? 1.6 : 1);

    const meta = {
      damage: dmg,
      pierce: this.mods.pierce + (weapon === "rail" ? 2 : 0) + (focusActive ? (this.focusModePierceAdd || 0) : 0),
      crit,
    };

    // Lifetimes are a *soft range limiter* for balance.
    if(weapon === "needle"){
      meta.r = 2.4;
      meta.life = 0.58;
    }else if(weapon === "scatter"){
      meta.r = 3.0;
      meta.life = 0.58;
    }else if(weapon === "prism"){
      meta.r = 3.2;
      meta.life = 0.90;
    }else if(weapon === "launcher"){
      meta.r = 5.2;
      meta.life = 0.56;
      meta.explodeR = 120 * this.mods.explodeRadiusMul;
      meta.explodeFalloff = 0.65;
      // Launcher is explosion-focused; reduce direct pierce interactions.
      meta.pierce = 0;
    }else if(weapon === "rail"){
      meta.r = 4.4;
      meta.life = 1.10;
    }

    // FOCUS can also extend bullet lifetime (range) to make certain modes feel distinct.
    if(focusActive){
      meta.life *= (this.focusBulletLifeMul || 1);
    }

    return {
      x: this.x + dx * (this.r + 6),
      y: this.y + dy * (this.r + 6),
      vx: dx * speed,
      vy: dy * speed,
      meta
    };
  }
}


function _dot(ax, ay, bx, by){ return ax*bx + ay*by; }

function _rectHalf(o){
  return { hw: o.w * 0.5, hh: o.h * 0.5 };
}
function closestPointOnRect(px, py, o){
  const {hw, hh} = _rectHalf(o);
  const cx = clamp(px, o.x - hw, o.x + hw);
  const cy = clamp(py, o.y - hh, o.y + hh);
  return {x: cx, y: cy};
}
function pointRectDist(px, py, o){
  const c = closestPointOnRect(px, py, o);
  return Math.hypot(px - c.x, py - c.y);
}

function computeAvoid(x, y, r, obstacles, world){
  let ax = 0, ay = 0;

// obstacles
for(const o of obstacles){
  if(o.shape === "rect"){
    const c = closestPointOnRect(x, y, o);
    const dx = x - c.x;
    const dy = y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const margin = Math.max(o.w, o.h) * 0.5 + r + 86;
    if(d < margin){
      const t = (margin - d) / margin;
      const w = t * t;
      ax += (dx / d) * w;
      ay += (dy / d) * w;
    }
  }else{
    const dx = x - o.x;
    const dy = y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    const margin = o.r + r + 86;
    if(d < margin){
      const t = (margin - d) / margin;
      const w = t * t;
      ax += (dx / d) * w;
      ay += (dy / d) * w;
    }
  }
}


  // walls
  const m = 90;
  if(x < world.minX + m) ax += (world.minX + m - x) / m;
  if(x > world.maxX - m) ax -= (x - (world.maxX - m)) / m;
  if(y < world.minY + m) ay += (world.minY + m - y) / m;
  if(y > world.maxY - m) ay -= (y - (world.maxY - m)) / m;

  const l = Math.hypot(ax, ay);
  if(l > 1e-5){
    ax /= l; ay /= l;
  }
  return {x: ax, y: ay};
}



function _hazardCost(fx){
  // cost 0.. ~1.0
  if(!fx) return 0;
  if(fx.type === "lava") return fx.a * 1.0;
  if(fx.type === "toxic") return fx.a * 0.9;
  return 0;
}

function computeHazardAvoid(x, y, r, stage){
  // cheap steering away from damaging floors (lava/toxic)
  const samples = 8;
  const rad = r + 46;
  let ax = 0, ay = 0;

  for(let i=0;i<samples;i++){
    const a = (Math.PI*2) * (i / samples);
    const sx = x + Math.cos(a) * rad;
    const sy = y + Math.sin(a) * rad;
    const fx = stagePointFx(stage, sx, sy);
    const c = _hazardCost(fx);
    if(c > 0){
      ax -= Math.cos(a) * c;
      ay -= Math.sin(a) * c;
    }
  }

  const l = Math.hypot(ax, ay);
  if(l > 1e-5){
    ax /= l; ay /= l;
  }
  return { x: ax, y: ay };
}

function isMeleeType(t){
  return (t === "stalker" || t === "mote" || t === "charger" || t === "splitter" || t === "warden");
}
function isRangedType(t){
  return (t === "shooter" || t === "bomber" || t === "sniper" || t === "pylon" || t === "weaver");
}

function computeScreenSteer(self, player, others){
  // For ranged units: try to sit behind a melee ally relative to the player.
  if(!others || others.length <= 1) return {x:0,y:0};

  const toP = v2(player.x - self.x, player.y - self.y);
  const distP = Math.hypot(toP.x, toP.y) || 1;
  const dirP = { x: toP.x / distP, y: toP.y / distP };

  let best = null;
  let bestScore = -1e9;

  for(const e of others){
    if(e === self) continue;
    if(!isMeleeType(e.type)) continue;

    const dp = Math.hypot(player.x - e.x, player.y - e.y);
    if(dp > distP * 0.98) continue; // must be closer to player than us

    const vx = e.x - self.x;
    const vy = e.y - self.y;
    const d = Math.hypot(vx, vy) || 1;

    // prefer allies "in front" of us (towards player)
    const dot = (vx / d) * dirP.x + (vy / d) * dirP.y;
    if(dot < 0.55) continue;

    const score = dot * 2.0 - (d / 900) - (dp / 1100);
    if(score > bestScore){
      bestScore = score;
      best = e;
    }
  }

  if(!best) return {x:0,y:0};

  const follow = 74;
  const tx = best.x - dirP.x * follow;
  const ty = best.y - dirP.y * follow;

  const dx = tx - self.x;
  const dy = ty - self.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

function computeGuardSteer(self, player, others){
  // For melee units: drift towards the space between the player and nearest ranged ally.
  if(!others || others.length <= 1) return {x:0,y:0};

  let best = null;
  let bestD = 1e9;

  for(const e of others){
    if(e === self) continue;
    if(!isRangedType(e.type)) continue;
    const d = Math.hypot(e.x - self.x, e.y - self.y);
    if(d < bestD){
      bestD = d;
      best = e;
    }
  }

  if(!best) return {x:0,y:0};

  const vx = best.x - player.x;
  const vy = best.y - player.y;
  const tx = player.x + vx * 0.42;
  const ty = player.y + vy * 0.42;

  const dx = tx - self.x;
  const dy = ty - self.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

export class Enemy {
  constructor(x,y,type, opts = {}){
    this.x=x; this.y=y;
    this.vx=0; this.vy=0;
    this.type=type; // "stalker" | "shooter" | "bomber" | "pylon" | "charger" | "sniper" | "weaver" | "splitter" | "mote" | "warden"
    this.isBoss = (type === "warden" || String(type).startsWith("boss_"));
    this.elite = !!opts.elite;

    if(type === "warden") this.r = 46;
    else if(type === "boss_lava") this.r = 48;
    else if(type === "boss_ice") this.r = 44;
    else if(type === "boss_magnet") this.r = 44;
    else if(type === "boss_void") this.r = 50;
    else this.r = (type === "charger" ? 18 : (type === "splitter" ? 20 : (type === "mote" ? 10 : 15)));

    const baseHp = (
      type === "boss_void" ? 700 :
      type === "boss_lava" ? 680 :
      type === "boss_magnet" ? 660 :
      type === "boss_ice" ? 640 :
      type === "warden" ? 520 :
      type === "pylon" ? 96 :
      type === "splitter" ? 78 :
      type === "charger" ? 58 :
      type === "bomber" ? 56 :
      type === "sniper" ? 52 :
      type === "weaver" ? 46 :
      type === "shooter" ? 44 :
      type === "mote" ? 18 :
      38
    );

    const eliteMul = this.elite ? 1.85 : 1;
    this.hp = Math.floor(baseHp * eliteMul);
    this.maxHp = this.hp;

    this.damageMul = this.elite ? 1.25 : 1;

    this.t = 0;
    this.hitFlash = 0;

    this.shootCd = rand(1.2, 0.5);
    this.state = "roam";
    this.windup = 0;

    this.touchCd = 0;

    // sniper telegraph
    this.lineT = 0;
    this.lineA = 0;

    // boss extras
    this.phase = 1;
    this._bossRingCd = rand(1.15, 0.75);
    this._bossBurstCd = rand(2.6, 1.2);
    this._bossStepCd = rand(0.95, 0.35);

    // Arsenal Warden weapon mimic (also reused by other bosses as internal timers)
    this._bossWeaponId = "pulse";
    this._bossWeaponSwapCd = rand(1.35, 0.75);
    this._bossFireCd = rand(0.85, 0.45);
    this._bossBurstRemain = 0;
    this._bossBurstGap = 0;

    // Magnet/Void extras
    this._bossSpin = rand(1, -1) >= 0 ? 1 : -1;
    this._voidPulseCd = rand(3.6, 2.2);

    this._lastX = x;
    this._lastY = y;
    this._stuck = 0;
  }

  takeDamage(d){
    this.hp = Math.max(0, this.hp - d);
    this.hitFlash = 0.12;
  }

  update(dt, player, bullets, world, obstacles, aiLevel=0, others=null, stage=null){
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.touchCd = Math.max(0, this.touchCd - dt);
    this.lineT = Math.max(0, this.lineT - dt);

    const toP = v2(player.x - this.x, player.y - this.y);
    const dist = Math.hypot(toP.x, toP.y) || 1;
    const dir = {x: toP.x / dist, y: toP.y / dist};
    const perp = {x: -dir.y, y: dir.x};

    const avoid = computeAvoid(this.x, this.y, this.r, obstacles, world);
    const smart = clamp(aiLevel / 4, 0, 1);
    const hazardAvoid = stage ? computeHazardAvoid(this.x, this.y, this.r, stage) : {x:0,y:0};

    // simple stuck detector (helps if something still goes wrong)
    const moved = Math.hypot(this.x - this._lastX, this.y - this._lastY);
    if(moved < 0.35) this._stuck += dt; else this._stuck = Math.max(0, this._stuck - dt*2.5);
    this._lastX = this.x; this._lastY = this.y;

    const nudge = (this._stuck > 0.7) ? (0.55 + 0.35 * Math.sin(this.t * 7.1)) : 0;

    if(this.type === "stalker" || this.type === "mote"){
      const accel = (this.type === "mote" ? 1700 : 1200) * (1 + aiLevel * 0.04);
      const maxSpd = (this.type === "mote" ? 330 : 240) * (1 + aiLevel * 0.02);
      const friction = 8;

      // flanking bias so it's not pure "bee-line"
      const flank = Math.sin(this.t * 1.35 + (this.x*0.01)) * 0.55;
      const guard = (smart > 0.55) ? computeGuardSteer(this, player, others) : {x:0,y:0};
      const hzW = 0.20 + 1.15 * smart;
      const gdW = 0.00 + 0.85 * clamp((smart - 0.55) / 0.45, 0, 1);

      let sx = dir.x + perp.x * flank + avoid.x * 1.35 + hazardAvoid.x * hzW + guard.x * gdW + perp.x * nudge;
      let sy = dir.y + perp.y * flank + avoid.y * 1.35 + hazardAvoid.y * hzW + guard.y * gdW + perp.y * nudge;
      const sl = Math.hypot(sx, sy) || 1;
      sx /= sl; sy /= sl;

      this.vx += sx * accel * dt;
      this.vy += sy * accel * dt;

      const sp = Math.hypot(this.vx, this.vy);
      if(sp > maxSpd){
        const k = maxSpd/sp;
        this.vx *= k; this.vy *= k;
      }
      const fk = Math.exp(-friction * dt);
      this.vx *= fk; this.vy *= fk;

      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    if(this.type === "splitter"){
      const accel = 980 * (1 + aiLevel * 0.03);
      const maxSpd = 205 * (1 + aiLevel * 0.02);
      const friction = 8;

      const guard = (smart > 0.55) ? computeGuardSteer(this, player, others) : {x:0,y:0};
      const hzW = 0.22 + 1.20 * smart;
      const gdW = 0.00 + 0.90 * clamp((smart - 0.55) / 0.45, 0, 1);

      let sx = dir.x + avoid.x * 1.6 + hazardAvoid.x * hzW + guard.x * gdW + perp.x * (0.25 * Math.sin(this.t*1.1)) + perp.x * nudge;
      let sy = dir.y + avoid.y * 1.6 + hazardAvoid.y * hzW + guard.y * gdW + perp.y * (0.25 * Math.sin(this.t*1.1)) + perp.y * nudge;
      const sl = Math.hypot(sx, sy) || 1;
      sx /= sl; sy /= sl;

      this.vx += sx * accel * dt;
      this.vy += sy * accel * dt;
      const sp = Math.hypot(this.vx, this.vy);
      if(sp > maxSpd){
        const k = maxSpd/sp;
        this.vx *= k; this.vy *= k;
      }
      const fk = Math.exp(-friction * dt);
      this.vx *= fk; this.vy *= fk;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    if(this.type === "shooter"){
      const want = 460 + 120 * smart;
      const accel = 920 * (1 + aiLevel * 0.03);
      const maxSpd = 230 * (1 + aiLevel * 0.02);
      const friction = 10;

      const sgn = dist > want ? 1 : -1;
      const wobble = Math.sin(this.t * 2.2) * 0.55;

      const screen = (smart > 0.35) ? computeScreenSteer(this, player, others) : {x:0,y:0};
      const hzW = 0.10 + 0.95 * smart;
      const scW = 0.00 + 1.05 * clamp((smart - 0.35) / 0.65, 0, 1);

      let steerX = dir.x * sgn + perp.x * wobble;
      let steerY = dir.y * sgn + perp.y * wobble;

      steerX += avoid.x * 1.35 + hazardAvoid.x * hzW + screen.x * scW + perp.x * nudge;
      steerY += avoid.y * 1.35 + hazardAvoid.y * hzW + screen.y * scW + perp.y * nudge;

      const sl = Math.hypot(steerX, steerY) || 1;
      steerX /= sl; steerY /= sl;

      this.vx += steerX * accel * dt;
      this.vy += steerY * accel * dt;

      const sp = Math.hypot(this.vx, this.vy);
      if(sp > maxSpd){
        const k = maxSpd/sp;
        this.vx *= k; this.vy *= k;
      }
      const fk = Math.exp(-friction * dt);
      this.vx *= fk; this.vy *= fk;

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if(this.shootCd <= 0 && dist < 820){
        this.shootCd = rand(1.10, 0.70) / (1 + aiLevel * 0.02);
        const bspd = 540;

        // lead aim at higher AI levels
        let aimX = player.x;
        let aimY = player.y;
        if(aiLevel >= 2){
          const tHit = dist / bspd;
          aimX = player.x + player.vx * tHit;
          aimY = player.y + player.vy * tHit;
        }
        const ddx = aimX - this.x;
        const ddy = aimY - this.y;
        const d2 = Math.hypot(ddx, ddy) || 1;
        const ndx = ddx / d2;
        const ndy = ddy / d2;

        bullets.push(new Bullet(
          this.x + ndx * (this.r+6),
          this.y + ndy * (this.r+6),
          ndx * bspd,
          ndy * bspd,
          "enemy",
          { damage: 14 * this.damageMul }
        ));
      }
    }
if(this.type === "bomber"){
  const want = 520 + 130 * smart;
  const accel = 860 * (1 + aiLevel * 0.03);
  const maxSpd = 220 * (1 + aiLevel * 0.02);
  const friction = 10;

  const sgn = dist > want ? 1 : -1;
  const wobble = Math.sin(this.t * 1.8) * 0.70;

  const screen = (smart > 0.35) ? computeScreenSteer(this, player, others) : {x:0,y:0};
  const hzW = 0.10 + 0.90 * smart;
  const scW = 0.00 + 1.00 * clamp((smart - 0.35) / 0.65, 0, 1);

  let steerX = dir.x * sgn + perp.x * wobble;
  let steerY = dir.y * sgn + perp.y * wobble;

  steerX += avoid.x * 1.25 + hazardAvoid.x * hzW + screen.x * scW + perp.x * nudge;
  steerY += avoid.y * 1.25 + hazardAvoid.y * hzW + screen.y * scW + perp.y * nudge;

  const sl = Math.hypot(steerX, steerY) || 1;
  steerX /= sl; steerY /= sl;

  this.vx += steerX * accel * dt;
  this.vy += steerY * accel * dt;

  const sp = Math.hypot(this.vx, this.vy);
  if(sp > maxSpd){
    const k = maxSpd/sp;
    this.vx *= k; this.vy *= k;
  }
  const fk = Math.exp(-friction * dt);
  this.vx *= fk; this.vy *= fk;

  this.x += this.vx * dt;
  this.y += this.vy * dt;

  if(this.shootCd <= 0 && dist < 980){
    this.shootCd = rand(1.65, 1.20) / (1 + aiLevel * 0.02);
    const bspd = 460;

    let aimX = player.x;
    let aimY = player.y;
    if(aiLevel >= 2){
      const tHit = dist / bspd;
      aimX = player.x + player.vx * tHit * 0.95;
      aimY = player.y + player.vy * tHit * 0.95;
    }
    const ddx = aimX - this.x;
    const ddy = aimY - this.y;
    const d2 = Math.hypot(ddx, ddy) || 1;
    const ndx = ddx / d2;
    const ndy = ddy / d2;

    bullets.push(new Bullet(
      this.x + ndx * (this.r+8),
      this.y + ndy * (this.r+8),
      ndx * bspd,
      ndy * bspd,
      "enemy",
      { damage: 18 * this.damageMul, r: 5.2, life: 1.55, explodeR: 130, explodeFalloff: 0.72 }
    ));
  }
}

if(this.type === "pylon"){
  // turret: no pathing, but still respects walls via bounds clamp
  this.vx *= Math.exp(-12 * dt);
  this.vy *= Math.exp(-12 * dt);
  this.x += this.vx * dt;
  this.y += this.vy * dt;

  if(this.shootCd <= 0 && dist < 1100){
    this.shootCd = rand(1.35, 1.05) / (1 + aiLevel * 0.02);

    const n = aiLevel >= 4 ? 12 : 8;
    const base = Math.atan2(dir.y, dir.x) + (Math.random()*0.6 - 0.3);
    const bspd = 520;

    for(let i=0;i<n;i++){
      const a = base + (Math.PI*2) * (i / n);
      bullets.push(new Bullet(
        this.x + Math.cos(a) * (this.r+6),
        this.y + Math.sin(a) * (this.r+6),
        Math.cos(a) * bspd,
        Math.sin(a) * bspd,
        "enemy",
        { damage: 10.5 * this.damageMul, life: 1.45 }
      ));
    }
  }
}


    if(this.type === "weaver"){
      const want = 520 + 140 * smart;
      const accel = 980 * (1 + aiLevel * 0.03);
      const maxSpd = 245 * (1 + aiLevel * 0.02);
      const friction = 10;

      const sgn = dist > want ? 1 : -1;
      const orbit = 0.95 + 0.25 * Math.sin(this.t * 1.9);

      const screen = (smart > 0.35) ? computeScreenSteer(this, player, others) : {x:0,y:0};
      const hzW = 0.10 + 0.85 * smart;
      const scW = 0.00 + 0.95 * clamp((smart - 0.35) / 0.65, 0, 1);

      let steerX = dir.x * sgn + perp.x * orbit;
      let steerY = dir.y * sgn + perp.y * orbit;

      steerX += avoid.x * 1.25 + hazardAvoid.x * hzW + screen.x * scW + perp.x * nudge;
      steerY += avoid.y * 1.25 + hazardAvoid.y * hzW + screen.y * scW + perp.y * nudge;

      const sl = Math.hypot(steerX, steerY) || 1;
      steerX /= sl; steerY /= sl;

      this.vx += steerX * accel * dt;
      this.vy += steerY * accel * dt;

      const sp = Math.hypot(this.vx, this.vy);
      if(sp > maxSpd){
        const k = maxSpd/sp;
        this.vx *= k; this.vy *= k;
      }
      const fk = Math.exp(-friction * dt);
      this.vx *= fk; this.vy *= fk;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if(this.shootCd <= 0 && dist < 900){
        this.shootCd = rand(1.05, 0.75) / (1 + aiLevel * 0.02);
        const bspd = 520;
        const base = Math.atan2(dir.y, dir.x);
        const n = aiLevel >= 4 ? 5 : 3;
        for(let i=0;i<n;i++){
          const spread = (i - (n-1)/2) * 0.14;
          const a = base + spread;
          bullets.push(new Bullet(
            this.x + Math.cos(a) * (this.r+6),
            this.y + Math.sin(a) * (this.r+6),
            Math.cos(a) * bspd,
            Math.sin(a) * bspd,
            "enemy",
            { damage: 11.5 * this.damageMul }
          ));
        }
      }
    }

    if(this.type === "sniper"){
      const want = 820 + 160 * smart;
      const accel = 840 * (1 + aiLevel * 0.03);
      const maxSpd = 210 * (1 + aiLevel * 0.02);
      const friction = 10;

      if(this.state === "aim"){
        this.windup -= dt;
        this.vx *= Math.exp(-14 * dt);
        this.vy *= Math.exp(-14 * dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // keep line alive
        this.lineT = Math.max(this.lineT, 0.20);

        if(this.windup <= 0){
          this.state = "roam";
          this.shootCd = rand(1.95, 1.25) / (1 + aiLevel * 0.03);

          const bspd = 900;
          // predictive aim for sniper sooner
          let aimX = player.x;
          let aimY = player.y;
          if(aiLevel >= 1){
            const tHit = dist / bspd;
            aimX = player.x + player.vx * tHit;
            aimY = player.y + player.vy * tHit;
          }
          const dx = aimX - this.x;
          const dy = aimY - this.y;
          const d2 = Math.hypot(dx, dy) || 1;
          const ndx = dx / d2;
          const ndy = dy / d2;

          bullets.push(new Bullet(
            this.x + ndx * (this.r+8),
            this.y + ndy * (this.r+8),
            ndx * bspd,
            ndy * bspd,
            "enemy",
            { damage: 20 * this.damageMul, r: 4.6, life: 1.35 }
          ));
        }
      }else{
        const sgn = dist > want ? 1 : -1;
        const wobble = Math.sin(this.t * 1.25) * 0.22;

        const screen = (smart > 0.35) ? computeScreenSteer(this, player, others) : {x:0,y:0};
        const hzW = 0.10 + 0.80 * smart;
        const scW = 0.00 + 0.95 * clamp((smart - 0.35) / 0.65, 0, 1);

        let steerX = dir.x * sgn + perp.x * wobble;
        let steerY = dir.y * sgn + perp.y * wobble;

        steerX += avoid.x * 1.55 + hazardAvoid.x * hzW + screen.x * scW + perp.x * nudge;
        steerY += avoid.y * 1.55 + hazardAvoid.y * hzW + screen.y * scW + perp.y * nudge;

        const sl = Math.hypot(steerX, steerY) || 1;
        steerX /= sl; steerY /= sl;

        this.vx += steerX * accel * dt;
        this.vy += steerY * accel * dt;

        const sp = Math.hypot(this.vx, this.vy);
        if(sp > maxSpd){
          const k = maxSpd/sp;
          this.vx *= k; this.vy *= k;
        }
        const fk = Math.exp(-friction * dt);
        this.vx *= fk; this.vy *= fk;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if(this.shootCd <= 0 && dist < 1200){
          this.state = "aim";
          this.windup = 0.55;

          // telegraph
          const la = Math.atan2(dir.y, dir.x);
          this.lineA = la;
          this.lineT = 0.55;
        }
      }
    }

    if(this.type === "charger"){
      const accel = 1020 * (1 + aiLevel * 0.03);
      const maxSpd = 220 * (1 + aiLevel * 0.02);
      const friction = 10;

      if(this.state === "roam"){
        const guard = (smart > 0.55) ? computeGuardSteer(this, player, others) : {x:0,y:0};
        const hzW = 0.22 + 1.10 * smart;
        const gdW = 0.00 + 0.95 * clamp((smart - 0.55) / 0.45, 0, 1);

        let sx = dir.x + avoid.x * 1.25 + hazardAvoid.x * hzW + guard.x * gdW + perp.x * (0.25 * Math.sin(this.t*1.8)) + perp.x * nudge;
        let sy = dir.y + avoid.y * 1.25 + hazardAvoid.y * hzW + guard.y * gdW + perp.y * (0.25 * Math.sin(this.t*1.8)) + perp.y * nudge;
        const sl = Math.hypot(sx, sy) || 1;
        sx /= sl; sy /= sl;

        this.vx += sx * accel * dt;
        this.vy += sy * accel * dt;

        const sp = Math.hypot(this.vx, this.vy);
        if(sp > maxSpd){
          const k = maxSpd/sp;
          this.vx *= k; this.vy *= k;
        }
        const fk = Math.exp(-friction * dt);
        this.vx *= fk; this.vy *= fk;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if(dist < 560 && this.shootCd <= 0){
          this.state = "windup";
          this.windup = 0.55;
          this.shootCd = rand(1.7, 1.2) / (1 + aiLevel * 0.02);

          // small prediction so it feels smarter
          let tx = player.x;
          let ty = player.y;
          if(aiLevel >= 2){
            tx = player.x + player.vx * 0.18;
            ty = player.y + player.vy * 0.18;
          }
          const cdx = tx - this.x;
          const cdy = ty - this.y;
          const cd = Math.hypot(cdx, cdy) || 1;
          this._chargeDir = {x: cdx / cd, y: cdy / cd};
        }
      }else if(this.state === "windup"){
        this.windup -= dt;
        this.vx *= Math.exp(-14 * dt);
        this.vy *= Math.exp(-14 * dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if(this.windup <= 0){
          this.state = "dash";
          const bspd = 900;
          this.vx = this._chargeDir.x * bspd;
          this.vy = this._chargeDir.y * bspd;
          this._dashTime = 0.22;
        }
      }else if(this.state === "dash"){
        this._dashTime -= dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= Math.exp(-2.5 * dt);
        this.vy *= Math.exp(-2.5 * dt);

        if(this._dashTime <= 0){
          this.state = "roam";
        }
      }
    }

    
    if(this.type === "warden" || (String(this.type).startsWith("boss_"))){
      // --- Boss suite (5 total): Arsenal Warden + Lava/Ice/Magnet/Void ---
      const baseAng = Math.atan2(dir.y, dir.x);

      const shoot = (a, spd, dmg, extra = null) => {
        const meta = extra ? Object.assign({ damage: dmg * this.damageMul }, extra) : { damage: dmg * this.damageMul };
        bullets.push(new Bullet(
          this.x + Math.cos(a) * (this.r + 8),
          this.y + Math.sin(a) * (this.r + 8),
          Math.cos(a) * spd,
          Math.sin(a) * spd,
          "enemy",
          meta
        ));
      };

      const shootFan = (count, spread, spd, dmg, extra=null) => {
        const mid = (count - 1) / 2;
        for(let i=0;i<count;i++){
          const a = baseAng + (i - mid) * spread;
          shoot(a, spd, dmg, extra);
        }
      };

      const ring = (n, spd, dmg, extra=null, rot=0) => {
        for(let i=0;i<n;i++){
          const a = rot + (Math.PI*2) * (i / n);
          shoot(a, spd, dmg, extra);
        }
      };

      // Common movement (slightly different per boss)
      const moveBoss = (wantDist, accel, maxSpd, friction, wobbleMul) => {
        const sgn = dist > wantDist ? 1 : -1;
        const wobble = Math.sin(this.t * 1.35) * (wobbleMul ?? 0.85);

        let steerX = dir.x * sgn + perp.x * wobble;
        let steerY = dir.y * sgn + perp.y * wobble;
        steerX += avoid.x * 1.05 + hazardAvoid.x * (0.20 + 0.85 * smart);
        steerY += avoid.y * 1.05 + hazardAvoid.y * (0.20 + 0.85 * smart);

        const sl = Math.hypot(steerX, steerY) || 1;
        steerX /= sl; steerY /= sl;

        this.vx += steerX * accel * dt;
        this.vy += steerY * accel * dt;

        const sp = Math.hypot(this.vx, this.vy);
        if(sp > maxSpd){
          const k = maxSpd/sp;
          this.vx *= k; this.vy *= k;
        }

        const fk = Math.exp(-friction * dt);
        this.vx *= fk; this.vy *= fk;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
      };

      // Update boss phase + timers
      this.phase = this.hp < this.maxHp * 0.45 ? 2 : 1;
      this._bossRingCd = Math.max(0, this._bossRingCd - dt);
      this._bossBurstCd = Math.max(0, this._bossBurstCd - dt);
      this._bossStepCd = Math.max(0, this._bossStepCd - dt);
      this._bossFireCd = Math.max(0, (this._bossFireCd ?? 0) - dt);
      this._bossWeaponSwapCd = Math.max(0, (this._bossWeaponSwapCd ?? 0) - dt);
      this._voidPulseCd = Math.max(0, (this._voidPulseCd ?? 0) - dt);

      if(this.type === "warden"){
        // Arsenal Warden: rotates through the same weapon set the player can use.
        moveBoss(this.hp < this.maxHp * 0.55 ? 360 : 430, 720 * (1 + aiLevel * 0.02), (this.hp < this.maxHp * 0.55 ? 260 : 220) * (1 + aiLevel * 0.01), 7, 0.85);

        // sidestep
        if(this._bossStepCd <= 0 && dist < 520){
          this._bossStepCd = this.phase === 2 ? 0.75 : 0.95;
          const step = this.phase === 2 ? 180 : 150;
          this.x += perp.x * step;
          this.y += perp.y * step;
        }

        // weapon swap
        const weapons = ["pulse","needle","burst","prism","scatter","launcher","rail"];
        if(this._bossWeaponSwapCd <= 0){
          this._bossWeaponSwapCd = this.phase === 2 ? rand(1.05, 0.65) : rand(1.35, 0.85);
          const nxt = weapons[Math.floor(Math.random() * weapons.length)];
          this._bossWeaponId = nxt;
          this.hitFlash = Math.max(this.hitFlash, 0.08); // tiny cue
        }

        // occasional ring to keep pressure even if weapon is single-shot
        if(this._bossRingCd <= 0){
          this._bossRingCd = this.phase === 2 ? 2.1 : 2.6;
          const n = this.phase === 2 ? 14 : 10;
          const spd = this.phase === 2 ? 560 : 520;
          ring(n, spd, 12 + (this.phase===2?2:0), { r: 4.2 }, baseAng + (Math.random()*0.4 - 0.2));
        }

        const fireWeapon = (wid) => {
          if(wid === "pulse"){
            this._bossFireCd = this.phase === 2 ? 0.52 : 0.65;
            shoot(baseAng, 760, 14 + (this.phase===2?2:0), { r: 4.6, life: 1.15 });
            return;
          }
          if(wid === "needle"){
            this._bossFireCd = this.phase === 2 ? 0.09 : 0.11;
            shoot(baseAng + (Math.random()*0.06 - 0.03), 980, 7 + (this.phase===2?1:0), { r: 3.9, life: 1.0 });
            return;
          }
          if(wid === "burst"){
            this._bossFireCd = this.phase === 2 ? 0.88 : 1.02;
            shootFan(this.phase===2?5:4, this.phase===2?0.10:0.12, this.phase===2?760:700, 11 + (this.phase===2?1:0), { r: 4.2, life: 1.2 });
            return;
          }
          if(wid === "prism"){
            this._bossFireCd = this.phase === 2 ? 0.78 : 0.92;
            shootFan(3, 0.18, 860, 10 + (this.phase===2?1:0), { r: 4.1, life: 1.25 });
            return;
          }
          if(wid === "scatter"){
            this._bossFireCd = this.phase === 2 ? 0.90 : 1.08;
            shootFan(this.phase===2?9:7, 0.11, 780, 6 + (this.phase===2?1:0), { r: 3.8, life: 0.95 });
            return;
          }
          if(wid === "launcher"){
            this._bossFireCd = this.phase === 2 ? 0.92 : 1.12;
            shoot(baseAng + (Math.random()*0.10 - 0.05), 560, 18 + (this.phase===2?2:0), { r: 6.0, life: 1.55, explodeR: this.phase===2 ? 160 : 140, explodeFalloff: 0.78 });
            return;
          }
          // rail
          this._bossFireCd = this.phase === 2 ? 1.18 : 1.45;
          shoot(baseAng, 1500, 24 + (this.phase===2?3:0), { r: 5.2, life: 0.85, pierce: this.phase===2 ? 1 : 0 });
        };

        if(this._bossFireCd <= 0 && dist < 1020){
          fireWeapon(this._bossWeaponId || "pulse");
        }
      } else if(this.type === "boss_lava"){
        // Lava Titan: explosive pressure + heavy volleys
        moveBoss(420, 680 * (1 + aiLevel * 0.02), 205 * (1 + aiLevel * 0.01), 6.8, 0.55);

        // firebombs
        if(this._bossFireCd <= 0 && dist < 1050){
          this._bossFireCd = this.phase === 2 ? 0.58 : 0.76;
          const spd = this.phase === 2 ? 640 : 600;
          const dmg = this.phase === 2 ? 18 : 16;
          const ex = this.phase === 2 ? 175 : 155;
          shoot(baseAng + (Math.random()*0.14 - 0.07), spd, dmg, { r: 6.3, life: 1.5, explodeR: ex, explodeFalloff: 0.78 });
          if(this.phase === 2){
            shoot(baseAng + (Math.random()*0.18 - 0.09), spd, dmg, { r: 6.3, life: 1.5, explodeR: ex, explodeFalloff: 0.78 });
          }
        }

        // eruption ring
        if(this._bossBurstCd <= 0){
          this._bossBurstCd = this.phase === 2 ? 3.1 : 3.8;
          const n = this.phase === 2 ? 12 : 10;
          ring(n, this.phase === 2 ? 520 : 480, 12 + (this.phase===2?2:0), { r: 5.2, life: 1.25 });
        }
      } else if(this.type === "boss_ice"){
        // Cryo Empress: shard fans + occasional rail sweep
        moveBoss(520, 760 * (1 + aiLevel * 0.02), 260 * (1 + aiLevel * 0.01), 8.2, 0.95);

        if(this._bossFireCd <= 0 && dist < 1150){
          this._bossFireCd = this.phase === 2 ? 0.55 : 0.72;
          const fanN = this.phase === 2 ? 9 : 7;
          shootFan(fanN, 0.085, this.phase === 2 ? 880 : 840, 9 + (this.phase===2?2:0), { r: 4.0, life: 1.05 });
        }

        if(this._bossBurstCd <= 0 && dist < 1320){
          this._bossBurstCd = this.phase === 2 ? 2.45 : 2.95;
          // triple rail-ish shots (narrow but scary)
          const n = this.phase === 2 ? 3 : 2;
          for(let i=0;i<n;i++){
            const a = baseAng + (i - (n-1)/2) * 0.06;
            shoot(a, 1600, 22 + (this.phase===2?3:0), { r: 5.0, life: 0.75, pierce: 1 });
          }
        }
      } else if(this.type === "boss_magnet"){
        // Coil Tyrant: sits near magnet cores and spews slow bullets that bend dramatically.
        // Try to orbit the nearest magnet core if present.
        let ax = 0, ay = 0;
        let hasCore = false;
        if(stage && stage.fields && stage.fields.magnet && stage.fields.magnet.length){
          let best = null;
          let bestD = 1e9;
          for(const n of stage.fields.magnet){
            const d = Math.hypot(this.x - n.x, this.y - n.y);
            if(d < bestD){ bestD = d; best = n; }
          }
          if(best){ ax = best.x; ay = best.y; hasCore = true; }
        }

        if(hasCore){
          const dx = this.x - ax;
          const dy = this.y - ay;
          const d = Math.hypot(dx, dy) || 1;
          const want = 240;
          const tx = (-dy / d) * this._bossSpin;
          const ty = (dx / d) * this._bossSpin;
          // radial correction + tangential orbit
          const rx = (want - d) * (dx / d);
          const ry = (want - d) * (dy / d);
          const steerX = tx * 1.05 + rx * 0.015 + avoid.x * 1.1 + hazardAvoid.x * (0.20 + 0.85 * smart);
          const steerY = ty * 1.05 + ry * 0.015 + avoid.y * 1.1 + hazardAvoid.y * (0.20 + 0.85 * smart);

          const sl = Math.hypot(steerX, steerY) || 1;
          this.vx += (steerX / sl) * (760 * dt);
          this.vy += (steerY / sl) * (760 * dt);

          const maxSpd = 220;
          const sp = Math.hypot(this.vx, this.vy);
          if(sp > maxSpd){ const k = maxSpd/sp; this.vx *= k; this.vy *= k; }
          const fk = Math.exp(-7.6 * dt);
          this.vx *= fk; this.vy *= fk;
          this.x += this.vx * dt;
          this.y += this.vy * dt;
        } else {
          moveBoss(470, 700 * (1 + aiLevel * 0.02), 230 * (1 + aiLevel * 0.01), 7.6, 0.75);
        }

        // continuous slow spiral (the stage magnet field will bend it hard)
        if(this._bossFireCd <= 0 && dist < 1280){
          this._bossFireCd = this.phase === 2 ? 0.18 : 0.22;
          const a1 = baseAng + Math.sin(this.t * 2.1) * 0.25;
          const a2 = baseAng - Math.sin(this.t * 2.1) * 0.25;
          shoot(a1, this.phase===2?640:610, 9 + (this.phase===2?1:0), { r: 4.2, life: 1.55 });
          shoot(a2, this.phase===2?640:610, 9 + (this.phase===2?1:0), { r: 4.2, life: 1.55 });
        }

        // pulse ring
        if(this._bossBurstCd <= 0){
          this._bossBurstCd = this.phase === 2 ? 2.35 : 2.85;
          ring(this.phase===2?16:12, this.phase===2?560:520, 12 + (this.phase===2?1:0), { r: 4.2, life: 1.35 }, baseAng*0.25);
        }
      } else if(this.type === "boss_void"){
        // Sink Warden: quicksand pull + dart bursts
        moveBoss(450, 720 * (1 + aiLevel * 0.02), 235 * (1 + aiLevel * 0.01), 7.1, 0.75);

        // pull pulse (doesn't hard-lock movement)
        if(this._voidPulseCd <= 0){
          this._voidPulseCd = this.phase === 2 ? 3.2 : 3.8;
          const dx = this.x - player.x;
          const dy = this.y - player.y;
          const d = Math.hypot(dx, dy) || 1;
          const fall = clamp(1 - (d / 880), 0, 1);
          const str = (this.phase === 2 ? 520 : 420) * fall;
          // apply as velocity impulse (player can still fight it)
          player.vx += (dx / d) * str;
          player.vy += (dy / d) * str;
          // tiny cue
          this.hitFlash = Math.max(this.hitFlash, 0.10);
        }

        if(this._bossFireCd <= 0 && dist < 1150){
          this._bossFireCd = this.phase === 2 ? 0.46 : 0.62;
          const n = this.phase === 2 ? 5 : 4;
          const spd = this.phase === 2 ? 900 : 860;
          for(let i=0;i<n;i++){
            const a = baseAng + (i - (n-1)/2) * 0.09;
            shoot(a, spd, 12 + (this.phase===2?2:0), { r: 4.1, life: 1.1 });
          }
        }

        if(this._bossBurstCd <= 0){
          this._bossBurstCd = this.phase === 2 ? 3.0 : 3.6;
          ring(this.phase===2?18:14, this.phase===2?520:480, 9 + (this.phase===2?1:0), { r: 3.9, life: 1.55 }, this.t * 0.6);
        }
      }
    }


    // bounds
    this.x = clamp(this.x, world.minX + this.r, world.maxX - this.r);
    this.y = clamp(this.y, world.minY + this.r, world.maxY - this.r);
  }

  get dead(){ return this.hp <= 0; }

  get telegraph(){
    if(this.type === "charger" && this.state === "windup") return (this.windup / 0.55);
    if(this.type === "sniper" && this.state === "aim") return clamp(this.windup / 0.55, 0, 1);
    return 0;
  }
}

export function circlePushOut(ax, ay, ar, bx, by, br){
  const dx = ax - bx;
  const dy = ay - by;
  const d = Math.hypot(dx, dy) || 0.0001;
  const min = ar + br;
  if(d >= min) return null;
  const push = (min - d);
  return { nx: dx / d, ny: dy / d, push };
}

export function circleRectPushOut(cx, cy, cr, o){
  const {hw, hh} = _rectHalf(o);
  const left = o.x - hw;
  const right = o.x + hw;
  const top = o.y - hh;
  const bottom = o.y + hh;

  const px = clamp(cx, left, right);
  const py = clamp(cy, top, bottom);

  const dx = cx - px;
  const dy = cy - py;
  const d2 = dx*dx + dy*dy;

  if(d2 > cr*cr) return null;

  if(d2 > 1e-6){
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, push: (cr - d) };
  }

  // inside: push out via nearest side
  const dl = cx - left;
  const dr = right - cx;
  const dt = cy - top;
  const db = bottom - cy;

  let push = dl + cr;
  let nx = -1, ny = 0;

  if(dr < dl){ push = dr + cr; nx = 1; ny = 0; }
  if(dt < Math.min(dl, dr)){ push = dt + cr; nx = 0; ny = -1; }
  if(db < Math.min(dl, dr, dt)){ push = db + cr; nx = 0; ny = 1; }

  return { nx, ny, push };
}

export function spawnPickup(x,y){
  return Math.random() < 0.16 ? new Pickup(x,y,"hp") : new Pickup(x,y,"focus");
}

export function insideSafeSpawn(x,y,obstacles,avoidX,avoidY,avoidR){
  if(v2dist({x,y},{x:avoidX,y:avoidY}) < avoidR) return false;
  for(const o of obstacles){
    if(o.shape === "rect"){
      if(pointRectDist(x, y, o) < 55) return false;
    }else{
      const d = v2dist({x,y}, o);
      if(d < o.r + 55) return false;
    }
  }
  return true;
}
