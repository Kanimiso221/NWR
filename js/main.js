import { Input } from "./input.js";
import { Game } from "./game.js";
import { Player, Bullet } from "./entities.js";
import { getFocusMode } from "./focus_modes.js";
import { UI } from "./ui.js";
import { Sfx } from "./audio.js";
import { Bgm } from "./bgm.js";
import { ParticleSystem } from "./particles.js";
import { LobbyClient } from "./net.js";
import { loadBest, saveBest, loadAudioSettings, saveAudioSettings } from "./storage.js";
import { clear, drawBackground, drawRoomBounds, drawHazards, drawObstacle, drawPickup, drawBullet, drawEnemy, drawEnemyIndicators, drawPlayer, drawStagePost } from "./renderer.js";
let scenes = null;
let engineRef = null;

// Scene system (step 1): keep Game as-is, move title/pause/reward/shop/gameover handling into scenes.
import { SceneManager } from "./scenes/scene_manager.js";
import { TitleScene } from "./scenes/title_scene.js";
import { RunScene } from "./scenes/run_scene.js";
import { PauseScene } from "./scenes/pause_scene.js";
import { RewardScene } from "./scenes/reward_scene.js";
import { ShopScene } from "./scenes/shop_scene.js";
import { GameOverScene } from "./scenes/gameover_scene.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: true });

const ui = new UI();
const sfx = new Sfx();
const bgm = new Bgm();
const particles = new ParticleSystem();

// Multiplayer (BETA): room lobby + start signal only (no gameplay sync yet)
const lobby = new LobbyClient();


// Multiplayer runtime (No.4): host-authoritative movement.
// - Clients send INPUT (move/aim/dash/focus) to the host.
// - Host simulates movement for everyone and broadcasts a snapshot.
// - Clients use the snapshot to render others, and (for now) hard-correct their own position.
// NOTE: Player/enemy bullets are now host-broadcast. Enemy AI/damage/room flow are still local-sim until No.6+.
const mp = {
  runId: 0,
  sendSeq: 0,
  snapTick: 0,
  lastSnapTick: -1,
  lastSnapTime: -1,

  // host: latest input for each client
  lastClientInput: new Map(), // id -> netInput
  lastClientSeq: new Map(), // id -> latest input seq
  lastDashSeqUsed: new Map(), // id -> seq already consumed as dash edge
  // host: simulated players (movement only)
  simPlayers: new Map(), // id -> Player
  // render-only remote avatars on this machine (everyone)
  remotePlayers: new Map(), // id -> pseudo-player (for drawPlayer)

  // client: last authoritative state for myself
  selfAuth: null,

  // last start config we received (for resync / self-heal)
  lastStartCfg: null,
  lastStartCfgRunId: 0,

  _sendAcc: 0,
  _snapAcc: 0,

  // Some flows can momentarily clear LobbyClient.members (e.g., during scene transitions).
  // Keep a cache so we can still prune ghosts and simulate clients reliably.
  _membersCache: [],

  resetForRun(runId){
    this.runId = (runId|0) || 0;
    this.sendSeq = 0;
    this.snapTick = 0;
    this.lastSnapTick = -1;
    this.lastSnapTime = -1;
    this.lastClientInput.clear();
    this.lastClientSeq.clear();
    this.lastDashSeqUsed.clear();
    this.simPlayers.clear();
    this.remotePlayers.clear();
    this.selfAuth = null;
    this._sendAcc = 0;
    this._snapAcc = 0;
  },

  // Called from RunScene.update() BEFORE game.update
  preUpdate(dt, game, lobby, input){
    if(game) game.netBulletAuthority = !!(lobby && lobby.connected && !lobby.isHost);
    if(!lobby || !lobby.connected || !game || game.state !== "playing") return;

    // Client: apply authoritative correction before local sim so camera doesn't drift.
    if(!lobby.isHost && this.selfAuth){
      _applySelfAuth(game, this.selfAuth);
    }

    // Client: send input to host.
    if(!lobby.isHost){
      this._sendAcc += dt;
      if(this._sendAcc >= (1/30)){
        this._sendAcc = 0;
        lobby.sendInput(_packNetInput(game, input), this.sendSeq++);
      }
    }
  },

  // Called from RunScene.update() AFTER game.update
  postUpdate(dt, game, lobby){
    if(!lobby || !lobby.connected || !game || game.state !== "playing") return;
    if(!lobby.isHost) return;

    // Host: simulate remote players every frame (movement only).
    // Prefer selfId; fall back to hostId only for host snapshot identity.
    const me = String((lobby && lobby.selfId) || (lobby && lobby.hostId) || "");
    const members = (lobby && Array.isArray(lobby.members) && lobby.members.length)
      ? lobby.members
      : (this._membersCache || []);

    let idx = 0;
    for(const m of members){
      const id = m && m.id ? String(m.id) : "";
      if(!id || id === me) continue;

      let p = this.simPlayers.get(id);
      if(!p){
        // Spawn near host until we add proper spawn-slot distribution.
        const ox = 28 + (idx % 2) * 36;
        const oy = 28 + ((idx / 2) | 0) * 36;
        p = new Player(game.player.x + ox, game.player.y + oy);
        p.focusModeId = "chrono";
        p.focusActive = false;
        p.stageFxType = "none";
        p.stageFxA = 0;
        this.simPlayers.set(id, p);
        idx++;
      }

      const ni = this.lastClientInput.get(id) || null;
      // Approx: treat Space/FA as "focus active" for visuals.
      // Prefer the client's computed focus-active flag if present.
      const fa = (ni && (ni.fa === true || ni.fa === false)) ? ni.fa : !!(ni && ni.focus);
      const fm = (ni && ni.fm) ? ni.fm : (p.focusModeId || "chrono");
      _applyRemoteFocusMode(p, fm, fa);

      let dashEdge = false;
      if(ni && ni.dash){
        const seq = (ni.seq|0);
        const used = this.lastDashSeqUsed.get(id);
        if(used !== seq){
          dashEdge = true;
          this.lastDashSeqUsed.set(id, seq);
        }
      }

      const fakeInput = _makeFakeInput(ni, { dashEdge });
      p.update(dt, fakeInput, game.world);
      if(typeof game._applyObstacleCollisions === "function") game._applyObstacleCollisions(p);

      // Host-authoritative player bullets: generate remote players' shots on the host,
      // then include them in the next snapshot. Damage authority still moves to No.6.
      if(ni && ni.shoot && typeof p.tryShoot === "function"){
        const shots = p.tryShoot(dt, fakeInput, !!p.focusActive);
        if(shots){
          const arr = Array.isArray(shots) ? shots : [shots];
          const cap = (game._bulletCap || 900);
          for(const sh of arr){
            if(game.bullets.length >= cap) break;
            const meta = Object.assign({}, sh.meta || {}, { ownerId: id, focusModeId: p.focusModeId });
            game.bullets.push(new Bullet(sh.x, sh.y, sh.vx, sh.vy, "player", meta));
          }
        }
      }
    }

    // prune sims for leavers
    const memberIds = new Set(members.map(mm => String(mm && mm.id || "")).filter(Boolean));
    for(const [id] of this.simPlayers){
      if(!memberIds.has(id)) this.simPlayers.delete(id);
    }
    for(const [id] of this.lastClientInput){
      if(!memberIds.has(id)) this.lastClientInput.delete(id);
    }
    for(const [id] of this.lastClientSeq){
      if(!memberIds.has(id)) this.lastClientSeq.delete(id);
    }
    for(const [id] of this.lastDashSeqUsed){
      if(!memberIds.has(id)) this.lastDashSeqUsed.delete(id);
    }

    // Host: broadcast snapshot at a steady cadence.
    this._snapAcc += dt;
    if(this._snapAcc >= (1/15)){
      this._snapAcc = 0;
      const players = [];
      if(me){
        players.push(Object.assign({ id: me }, _packNetPlayer(game.player)));
      }

      for(const m of members){
        const id = m && m.id ? String(m.id) : "";
        if(!id || id === me) continue;
        const sp = this.simPlayers.get(id);
        if(sp) players.push(Object.assign({ id }, _packNetPlayer(sp)));
      }

      const snap = {
        runId: this.runId,
        seed: (game.seed >>> 0) || 1,
        time: game.time,
        room: game.room,
        players,
        bullets: _packNetBullets(game.bullets),
      };
      // Host should see client movement even if the relay doesn't echo snapshots back.
      _applyPartySnapshot(snap);
      lobby.sendSnapshot(snap, this.snapTick++);
    }
  }
};

function _num(v, fallback=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function _resolveMyId(lobby){
  // Only return the *local* id. Do not guess (guessing can hide other players).
  const sid = String((lobby && lobby.selfId) || "");
  return sid;
}

function _packNetPlayer(p){
  // Keep this minimal: only what renderer needs + a few meters.
  return {
    x: _num(p.x, 0),
    y: _num(p.y, 0),
    r: _num(p.r, 16),
    face: _num(p.face, 0),
    focusActive: !!p.focusActive,
    focusModeId: String(p.focusModeId || "chrono").slice(0, 32),
    hp: _num(p.hp, 100),
    hpMax: _num(p.hpMax, 100),
    focus: _num(p.focus, 100),
    focusMax: _num(p.focusMax, 100),
    dashTime: _num(p.dashTime, 0),
    invuln: _num(p.invuln, 0),
    stageFxType: String(p.stageFxType || "none").slice(0, 16),
    stageFxA: _num(p.stageFxA, 0),
  };
}

function _packNetBullet(b){
  if(!b) return null;
  return {
    x: _num(b.x, 0),
    y: _num(b.y, 0),
    vx: _num(b.vx, 0),
    vy: _num(b.vy, 0),
    team: String(b.team || "enemy").slice(0, 12),
    r: _num(b.r, 3.2),
    life: _num(b.life, 1),
    age: _num(b.age, 0),
    damage: _num(b.damage, 0),
    pierce: _num(b.pierce, 0),
    crit: !!b.crit,
    explodeR: _num(b.explodeR, 0),
    explodeFalloff: _num(b.explodeFalloff, 0.75),
  };
}

function _packNetBullets(list, max=380){
  if(!Array.isArray(list) || !list.length) return [];
  const start = Math.max(0, list.length - max);
  const out = [];
  for(let i=start; i<list.length; i++){
    const b = _packNetBullet(list[i]);
    if(b) out.push(b);
  }
  return out;
}

function _coerceNetBullet(s){
  if(!s || typeof s !== "object") return null;
  const team = String(s.team || "enemy").slice(0, 12);
  if(team !== "player" && team !== "enemy") return null;
  return {
    x: _num(s.x, 0),
    y: _num(s.y, 0),
    vx: _num(s.vx, 0),
    vy: _num(s.vy, 0),
    team,
    r: Math.max(1, Math.min(24, _num(s.r, team === "player" ? 3.2 : 4.2))),
    life: Math.max(0.05, Math.min(8, _num(s.life, team === "player" ? 0.95 : 1.25))),
    age: Math.max(0, Math.min(8, _num(s.age, 0))),
    damage: _num(s.damage, team === "player" ? 18 : 12),
    pierce: _num(s.pierce, 0),
    crit: !!s.crit,
    explodeR: Math.max(0, Math.min(480, _num(s.explodeR, 0))),
    explodeFalloff: Math.max(0, Math.min(1, _num(s.explodeFalloff, 0.75))),
  };
}

function _makeBulletFromState(st){
  const b = new Bullet(st.x, st.y, st.vx, st.vy, st.team, {
    r: st.r,
    life: st.life,
    damage: st.damage,
    pierce: st.pierce,
    crit: st.crit,
    explodeR: st.explodeR,
    explodeFalloff: st.explodeFalloff,
  });
  b.age = st.age;
  return b;
}

function _applyBulletSnapshot(game, bullets){
  if(!game || !Array.isArray(bullets)) return;
  const out = [];
  const max = 420;
  for(let i=0; i<bullets.length && out.length<max; i++){
    const st = _coerceNetBullet(bullets[i]);
    if(st) out.push(_makeBulletFromState(st));
  }
  game.bullets = out;
}

function _applyRemoteFocusMode(p, focusModeId, focusActive){
  if(!p) return;
  const fm = getFocusMode(focusModeId || p.focusModeId || "chrono");
  const active = !!focusActive;
  p.focusModeId = fm.id || String(focusModeId || "chrono");
  p.focusActive = active;
  p.focusMoveMul = active ? (fm.moveMul ?? 1) : 1;
  p.focusFireMul = active ? (fm.fireMul ?? 1) : 1;
  p.focusBulletSpeedMul = active ? (fm.bulletSpeedMul ?? 1) : 1;
  p.focusBulletLifeMul = active ? (fm.bulletLifeMul ?? 1) : 1;
  p.focusModeDmgMul = active ? (fm.dmgMul ?? 1) : 1;
  p.focusModeCritAdd = active ? (fm.critAdd ?? 0) : 0;
  p.focusModeSpreadMul = active ? (fm.spreadMul ?? 1) : 1;
  p.focusModePierceAdd = active ? (fm.pierceAdd ?? 0) : 0;
  p.focusModeDmgTakenMul = active ? (fm.dmgTakenMul ?? 1) : 1;
}

function _packNetInput(game, input){
  const mv = (input && typeof input.getMoveVector === "function") ? input.getMoveVector() : { x: 0, y: 0 };
  const mvx = Math.max(-1, Math.min(1, _num(mv.x, 0)));
  const mvy = Math.max(-1, Math.min(1, _num(mv.y, 0)));

  const dash = !!(input && typeof input.peekPressed === "function" && (input.peekPressed("ShiftLeft") || input.peekPressed("ShiftRight")));
  const focus = !!(input && typeof input.isDown === "function" && (input.isDown("Space") || input.isDown("Spacebar")));

  const fa = !!(game && game.player && game.player.focusActive);
  const shoot = !!(input && input.mouse && input.mouse.down);

  const cam = (game && game.camera) ? game.camera : { x: 0, y: 0 };
  const mx = _num(input && input.mouse ? input.mouse.x : 0, 0);
  const my = _num(input && input.mouse ? input.mouse.y : 0, 0);
  const aimX = mx + _num(cam.x, 0);
  const aimY = my + _num(cam.y, 0);

  const fm = String((game && game.focusModeId) || (game && game.player && game.player.focusModeId) || "chrono").slice(0, 32);
  return { mvx, mvy, aimX, aimY, dash: dash ? 1 : 0, focus: focus ? 1 : 0, fa: fa ? 1 : 0, shoot: shoot ? 1 : 0, fm };
}

function _coerceNetInput(s){
  if(!s || typeof s !== "object") return null;
  return {
    mvx: Math.max(-1, Math.min(1, _num(s.mvx, 0))),
    mvy: Math.max(-1, Math.min(1, _num(s.mvy, 0))),
    aimX: _num(s.aimX, 0),
    aimY: _num(s.aimY, 0),
    dash: !!s.dash,
    focus: !!s.focus,
    fa: !!s.fa,
    shoot: !!s.shoot,
    fm: String(s.fm || s.focusModeId || "chrono").slice(0, 32),
  };
}

function _makeFakeInput(ni, opts={}){
  // Player.update expects an Input-like object:
  // - getMoveVector()
  // - input.move
  // - input.mouseWorld
  // - isDown()
  // - consumePressed()
  // - mouse {x,y,down,pressed}
  const s = ni || { mvx: 0, mvy: 0, aimX: 0, aimY: 0, dash: false, focus: false, shoot: false };
  const move = {
    x: Math.max(-1, Math.min(1, _num(s.mvx, 0))),
    y: Math.max(-1, Math.min(1, _num(s.mvy, 0))),
  };
  const mouseWorld = {
    x: _num(s.aimX, 0),
    y: _num(s.aimY, 0),
  };

  // dash is an edge, not a held state. Without this gate the host can replay the
  // same received input packet across several frames and make a remote player dash repeatedly.
  let dashOnce = !!(opts && opts.dashEdge);

  const shootHeld = !!s.shoot;

  return {
    locked: false,
    move,
    mouseWorld,
    mouseDown: shootHeld,

    getMoveVector(){
      return move;
    },

    isDown(code){
      // Only what we need for remote sim right now
      if(code === "Space" || code === "Spacebar" || code === " ") return !!s.focus;
      return false;
    },

    consumePressed(code){
      // dash is a one-shot press (Shift)
      if(code === "ShiftLeft" || code === "ShiftRight"){
        if(dashOnce){
          dashOnce = false;
          return true;
        }
      }
      return false;
    },

    // Keep a mouse object so aim/fire code can run on the host for remote players.
    mouse: {
      x: 0,
      y: 0,
      down: shootHeld,
      pressed: shootHeld,
    },

    // Optional helpers some code paths might reference
    peekPressed(code){
      if(code === "ShiftLeft" || code === "ShiftRight") return dashOnce;
      return false;
    }
  };
}

function _coerceNetState(s){
  if(!s || typeof s !== "object") return null;
  return {
    x: _num(s.x, 0),
    y: _num(s.y, 0),
    r: _num(s.r, 16),
    face: _num(s.face, 0),
    focusActive: !!s.focusActive,
    focusModeId: String(s.focusModeId || "chrono").slice(0, 32),
    hp: _num(s.hp, 100),
    hpMax: _num(s.hpMax, 100),
    focus: _num(s.focus, 100),
    focusMax: _num(s.focusMax, 100),
    dashTime: _num(s.dashTime, 0),
    invuln: _num(s.invuln, 0),
    stageFxType: String(s.stageFxType || "none").slice(0, 16),
    stageFxA: _num(s.stageFxA, 0),
  };
}

function _applySelfAuth(game, st){
  if(!game || !game.player || !st) return;
  const p = game.player;
  p.x = _num(st.x, p.x);
  p.y = _num(st.y, p.y);
  p.face = _num(st.face, p.face);
  p.invuln = _num(st.invuln, p.invuln);
  p.dashTime = _num(st.dashTime, p.dashTime);
  p.stageFxType = String(st.stageFxType || p.stageFxType || "none").slice(0, 16);
  p.stageFxA = _num(st.stageFxA, p.stageFxA);

  // prevent local velocity from fighting the authoritative position
  if("vx" in p) p.vx = 0;
  if("vy" in p) p.vy = 0;
}

function _applyPartySnapshot(snap){
  if(!snap || typeof snap !== "object") return;
  const runId = (snap.runId|0) || 0;
  // If host restarted, wipe remote cache so old ghosts don't linger.
  if(runId && runId !== (mp.runId|0)) mp.resetForRun(runId);

  const players = Array.isArray(snap.players) ? snap.players : [];
  const selfId = _resolveMyId(lobby);
  const seen = new Set();

  for(const e of players){
    const id = e && e.id ? String(e.id) : "";
    if(!id) continue;
    if(selfId && id === selfId){
      // In No.4 we *do* use self snapshot for authoritative correction (client only).
      mp.selfAuth = _coerceNetState(e);
      continue;
    }
    const st = _coerceNetState(e);
    if(!st) continue;

    let rp = mp.remotePlayers.get(id);
    if(!rp){
      // Pseudo player shaped like Player for renderer.js drawPlayer()
      rp = {
        x: st.x, y: st.y, r: st.r,
        face: st.face,
        invuln: st.invuln,
        dashTime: st.dashTime,
        focusActive: st.focusActive,
        focusModeId: st.focusModeId,
        hp: st.hp, hpMax: st.hpMax,
        focus: st.focus, focusMax: st.focusMax,
        stageFxType: st.stageFxType,
        stageFxA: st.stageFxA,
        mods: { blades: 0 },
        _bladePos: [],
        t: 0,
      };
      mp.remotePlayers.set(id, rp);
    }else{
      rp.x = st.x; rp.y = st.y; rp.r = st.r;
      rp.face = st.face;
      rp.invuln = st.invuln;
      rp.dashTime = st.dashTime;
      rp.focusActive = st.focusActive;
      rp.focusModeId = st.focusModeId;
      rp.hp = st.hp; rp.hpMax = st.hpMax;
      rp.focus = st.focus; rp.focusMax = st.focusMax;
      rp.stageFxType = st.stageFxType;
      rp.stageFxA = st.stageFxA;
    }
    seen.add(id);
  }

  // Remove stale ghosts (left room)
  // Prefer live LobbyClient.members, but fall back to cached members when a transition clears it.
  const members = (lobby && Array.isArray(lobby.members) && lobby.members.length)
    ? lobby.members
    : (mp._membersCache || []);

  const memberIds = new Set(members.map(m => String((m && m.id) || "")).filter(Boolean));

  if(memberIds.size){
    for(const [id] of mp.remotePlayers){
      if(!memberIds.has(id)) mp.remotePlayers.delete(id);
    }
  }else if(seen.size){
    // If we couldn't read member state, at least prune by what's in the latest snapshot.
    for(const [id] of mp.remotePlayers){
      if(!seen.has(id)) mp.remotePlayers.delete(id);
    }
  }
}

// Wire lobby -> UI
lobby.onState = (view) => {
  if(view && Array.isArray(view.members)) mp._membersCache = view.members;
  if(ui && typeof ui.setMultiplayerState === "function") ui.setMultiplayerState(view);
};
lobby.onClosed = (reason) => {
  mp.resetForRun(0);
  if(game) game.netBulletAuthority = false;
  if(ui && typeof ui.setMultiplayerState === "function") ui.setMultiplayerState({ error: String(reason || "") });
};
lobby.onStart = (cfg, runId=0) => {
  // Start is driven by the host; everyone starts with the same config.
  mp.resetForRun(runId|0);
  mp.lastStartCfg = (cfg && typeof cfg === "object") ? cfg : null;
  mp.lastStartCfgRunId = (runId|0) || 0;
  if(engineRef && typeof engineRef.startRun === "function") engineRef.startRun(cfg || null);
  // After a full wipe (everyone died), some browsers can leave us visually stranded.
  // Force the run scene immediately.
  if(scenes && typeof scenes.set === "function") scenes.set("run", null, { instant: true });
};



// No.4: input/snapshot channel
lobby.onGameInput = (msg) => {
  // Host collects latest client INPUT.
  if(!(lobby && lobby.connected && lobby.isHost)) return;
  const from = String(msg && msg.from || "");
  if(!from) return;
  const ni = _coerceNetInput(msg && msg.input);
  if(!ni) return;
  const seq = (msg && msg.seq != null) ? (msg.seq|0) : ((mp.lastClientSeq.get(from) || 0) + 1);
  ni.seq = seq;
  mp.lastClientSeq.set(from, seq);
  mp.lastClientInput.set(from, ni);
};

lobby.onGameSnapshot = (msg) => {
  const snap = (msg && (msg.snap || msg.state)) || null;
  const runId = (snap && (snap.runId|0)) || 0;
  const tick = (msg && msg.tick != null) ? (msg.tick|0) : -1;
  const stime = (snap && snap.time != null) ? Number(snap.time) : null;

  // Detect run changes even if a client missed the start message.
  // Preferred signal: runId changed.
  if(runId && runId !== (mp.runId|0)){
    mp.resetForRun(runId);
  }else{
    // Fallback: detect tick/time going backwards (restart).
    let epochReset = false;
    const prevTick = (mp.lastSnapTick|0);
    if(tick >= 0 && prevTick >= 0 && tick < prevTick){
      if(tick === 0 || (prevTick - tick) > 5) epochReset = true;
    }
    const prevTime = (typeof mp.lastSnapTime === "number") ? mp.lastSnapTime : -1;
    if(!epochReset && stime != null && Number.isFinite(stime) && prevTime >= 0 && stime < (prevTime - 0.25)){
      epochReset = true;
    }
    if(epochReset){
      // Partial reset: keep runId, but clear monotonic gates and ghosts.
      mp.lastSnapTick = -1;
      mp.lastSnapTime = -1;
      mp.selfAuth = null;
      mp.remotePlayers.clear();
    }
  }

  // Monotonic tick gate (only if relay provides tick).
  if(tick >= 0){
    const last = (mp.lastSnapTick|0);
    if(last >= 0 && tick <= last) return;
    mp.lastSnapTick = tick;
  }
  if(stime != null && Number.isFinite(stime)){
    mp.lastSnapTime = stime;
  }

  _applyPartySnapshot(snap);
  if(lobby && lobby.connected && !lobby.isHost && game && snap && Array.isArray(snap.bullets)){
    _applyBulletSnapshot(game, snap.bullets);
  }

  // Self-heal: if a client missed the start message, snapshots can still pull them into the run.
  if(lobby && lobby.connected && !lobby.isHost && engineRef && game && game.state !== "playing"){
    const hasPlayers = !!(snap && Array.isArray(snap.players) && snap.players.length);
    if(hasPlayers){
      const snapSeed = (snap && typeof snap.seed === "number") ? (snap.seed >>> 0) : 0;
      const cfg = (mp.lastStartCfg && ((mp.lastStartCfgRunId|0) === (runId|0))) ? mp.lastStartCfg : { seed: snapSeed || _newSeed32(), room: 1 };
      if(typeof engineRef.startRun === "function") engineRef.startRun(cfg);
      if(scenes && typeof scenes.set === "function") scenes.set("run", null, { instant: true });
    }
  }
};

// Wire UI -> lobby
if(ui && typeof ui.onMpServerChange === "function"){
  ui.onMpServerChange((url) => lobby.setServer(url));
}
if(ui && typeof ui.onMpHost === "function"){
  ui.onMpHost(() => {
    lobby.setServer(ui.getMpServer ? ui.getMpServer() : "");
    const name = ui.getMpName ? ui.getMpName() : "";
    lobby.host(name);
  });
}
if(ui && typeof ui.onMpJoin === "function"){
  ui.onMpJoin((code) => {
    lobby.setServer(ui.getMpServer ? ui.getMpServer() : "");
    const name = ui.getMpName ? ui.getMpName() : "";
    lobby.join(code, name);
  });
}
if(ui && typeof ui.onMpLeave === "function"){
  ui.onMpLeave(() => {
    if(game) game.netBulletAuthority = false;
    lobby.leave("leave");
  });
}
if(ui && typeof ui.onMpReady === "function"){
  ui.onMpReady(() => lobby.toggleReady());
}

if(ui && typeof ui.onMpStart === "function"){
  ui.onMpStart(() => {
    // START is host-only and triggers a room-wide start signal
    if(!(lobby && lobby.connected && lobby.isHost)) return;

    const seed = _newSeed32();
    lobby.startWithConfig({ seed, room: 1 });
  });
}

// Initial server value (from UI/localStorage)
if(ui && typeof ui.getMpServer === "function") lobby.setServer(ui.getMpServer());

const audioSettings = loadAudioSettings();
ui.setAudioUI(audioSettings);
sfx.setMuted(audioSettings.muted);
sfx.setVolume(audioSettings.sfx);
bgm.setMuted(audioSettings.muted);
bgm.setVolume(audioSettings.bgm);

let _lastMuted = audioSettings.muted;
let _lastBgm = audioSettings.bgm;
let _lastSfx = audioSettings.sfx;

function _applyAudioFromUI(){
  const m = ui.muted;
  const bv = ui.bgmVolume;
  const sv = ui.sfxVolume;

  if(m !== _lastMuted){
    _lastMuted = m;
    sfx.setMuted(m);
    bgm.setMuted(m);
    persistAudio();
  }
  if(Math.abs(bv - _lastBgm) > 0.0001){
    _lastBgm = bv;
    bgm.setVolume(bv);
    persistAudio();
  }
  if(Math.abs(sv - _lastSfx) > 0.0001){
    _lastSfx = sv;
    sfx.setVolume(sv);
    persistAudio();
  }
}

function persistAudio(){
  saveAudioSettings({ muted: ui.muted, bgm: ui.bgmVolume, sfx: ui.sfxVolume });
}

let _audioUnlocked = false;
function unlockAudioOnce(){
  if(_audioUnlocked) return;
  _audioUnlocked = true;
  // WebAudio + HTMLAudio must be started from a user gesture
  sfx.ensure();
  bgm.unlock();
  // re-apply current UI settings
  sfx.setMuted(ui.muted);
  sfx.setVolume(ui.sfxVolume);
  bgm.setMuted(ui.muted);
  bgm.setVolume(ui.bgmVolume);
}
let W = 0, H = 0, DPR = 1;

function unlockAudio(){
  // Sfx uses AudioContext; BGM uses <audio>. Both need a user gesture on most browsers.
  sfx.ensure();
  try{
    if(sfx.ctx && sfx.ctx.state === "suspended") sfx.ctx.resume();
  }catch(_){}
  bgm.unlock();
}

// first interaction unlocks audio
window.addEventListener("pointerdown", unlockAudio, { passive:true, once:true });
window.addEventListener("keydown", unlockAudio, { passive:true, once:true });


function resize(){
  const rect = canvas.getBoundingClientRect();
  W = Math.max(1, Math.floor(rect.width));
  H = Math.max(1, Math.floor(rect.height));
  DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const input = new Input(canvas);
const game = new Game({w: W, h: H, sfx, particles});

let best = loadBest();
ui.setBest(best);

function syncSize(){
  if(game.w !== W || game.h !== H){
    game.w = W;
    game.h = H;
  }
}

function renderScene(timeScale){
  ctx.save();
  ctx.translate(game.shakeX, game.shakeY);

  clear(ctx, W, H);
  drawBackground(ctx, W, H, game.camera, game.time, timeScale, game.stage);

  drawRoomBounds(ctx, game.world, game.camera, W, H, game.time, game.roomIntro, game.getIntroLines ? game.getIntroLines() : null);

  // stage floor gimmicks (lava/ice/toxic etc.)
  drawHazards(ctx, game.stage, game.camera, W, H, game.time, ui.reducedMotion);

  for(const o of game.obstacles) drawObstacle(ctx, o, game.camera);
  for(const p of game.pickups) drawPickup(ctx, p, game.camera);
  for(const b of game.bullets) drawBullet(ctx, b, game.camera);
  for(const e of game.enemies) drawEnemy(ctx, e, game.camera);

  drawEnemyIndicators(ctx, game.enemies, game.camera, W, H);

  particles.render(ctx, game.camera, ui.reducedMotion);
drawPlayer(ctx, game.player, game.camera, ui.reducedMotion);

// No.3: render other players (ghost avatars) from lobby snapshots
if (lobby && lobby.connected && mp && mp.remotePlayers && mp.remotePlayers.size) {
  for (const rp of mp.remotePlayers.values()) {
    rp.t = game.time;
    drawPlayer(ctx, rp, game.camera, ui.reducedMotion);
  }
}
drawStagePost(ctx, game.stage, game.player, W, H, ui.reducedMotion);

  ctx.restore();
}

function refreshHUD(){
  _applyAudioFromUI();

  const sh = game.getStageHUD ? game.getStageHUD() : { mapName:"", mapGimmick:"", roomTitle:"" };

  ui.updateHUD({
    hp: game.player.hp,
    hpMax: game.player.hpMax,
    focus: game.player.focus,
    focusMax: game.player.focusMax,
    score: game.player.score,
    combo: game.player.combo,
    room: game.room,
    force: game.player.force || 0,
    buildText: game._buildText(),
    mapName: sh.mapName,
    mapGimmick: sh.mapGimmick,
    roomTitle: sh.roomTitle,
  });

  if (game.player.score > best) {
    best = game.player.score | 0;
    saveBest(best);
    ui.setBest(best);
  }
}

function renderMenuBackground(dt){
  clear(ctx, W, H);
  drawBackground(ctx, W, H, game.camera, game.time, 1, game.stage);
  game.time += dt * 0.6;
}

ui.onStart(() => {
  // If connected to a lobby: host starts (broadcast), clients wait.
  if(lobby && lobby.connected){
    if(lobby.isHost){
      const seed = _newSeed32();
      lobby.startWithConfig({ seed, room: 1 });
    }
    return;
  }
  engine.startRun();
});
ui.onResume(() => { engine.resumeRun(); });
ui.onRestart(() => {
  // Multiplayer: restart is a room-wide action (host starts, clients READY).
  if(lobby && lobby.connected){
    lobby.setReady(true);
    if(lobby.isHost){
      const seed = _newSeed32();
      lobby.startWithConfig({ seed, room: 1 });
    }
    return;
  }
  engine.restartRun();
});
ui.onBackToTitle(() => { if(engine && typeof engine.backToTitle==="function") engine.backToTitle(); });
ui.onMuteChange(() => {
  unlockAudioOnce();
  sfx.setMuted(ui.muted);
  bgm.setMuted(ui.muted);
  persistAudio();
});
ui.onMotionChange(() => {});
ui.onBgmVolumeChange(() => {
  unlockAudioOnce();
  bgm.setVolume(ui.bgmVolume);
  persistAudio();
});
ui.onSfxVolumeChange(() => {
  unlockAudioOnce();
  sfx.setVolume(ui.sfxVolume);
  persistAudio();
});


ui.onPickReward((u) => {
  ui.hide();
  game.pickReward(u);
  // After picking, Game may enter shop or return to combat.
  scenes.syncToGameState();
});

ui.onBuyShop((idx) => {
  game.buyShop(idx);
  scenes.syncToGameState();
});
ui.onRerollShop(() => {
  game.rerollShop();
  scenes.syncToGameState();
});
ui.onLeaveShop(() => {
  ui.hide();
  game.leaveShop();
  scenes.syncToGameState();
});

// --- Scene bootstrap
const engine = {
  canvas, ctx,
  W: () => W,
  H: () => H,
  ui, input, game,
  lobby, mp,
  sfx, bgm, particles,
  unlockAudioOnce,
  renderScene,
  refreshHUD,
  renderMenuBackground,
  resize,
  syncSize,
};

engineRef = engine;

scenes = new SceneManager(engine);
scenes.register("title", new TitleScene(engine));
scenes.register("run", new RunScene(engine));
scenes.register("pause", new PauseScene(engine));
scenes.register("reward", new RewardScene(engine));
scenes.register("shop", new ShopScene(engine));
scenes.register("gameover", new GameOverScene(engine));

// Expose scene-safe helpers so scenes can drive flow without main.js glue.
engine.unlockAudioOnce = unlockAudioOnce;

function _newSeed32(){
  try{
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    // avoid 0 seed
    return (r[0] >>> 0) || 1;
  }catch(_e){
    return (((Math.random() * 0xFFFFFFFF) >>> 0) || 1);
  }
}

function _getSelectedFocusMode(){
  if (ui && typeof ui.getFocusModeId === "function") return ui.getFocusModeId();
  try{
    if (typeof localStorage !== "undefined") return localStorage.getItem("nw_focusModeId") || localStorage.getItem("nw_focus_mode") || "chrono";
  }catch(e){}
  return "chrono";
}

engine.startRun = (startCfg=null) => {
  unlockAudioOnce();
  let cfg = (startCfg && typeof startCfg === "object") ? startCfg : null;
  let focusModeId = _getSelectedFocusMode();

  // Multiplayer start configs are room-wide. They must share seed/room only;
  // each player keeps their own title-screen FOCUS selection.
  const mpRoomStart = !!(lobby && lobby.connected);
  if (cfg && cfg.selfFocusModeId) focusModeId = String(cfg.selfFocusModeId);
  else if (cfg && cfg.focusModeId && !mpRoomStart) focusModeId = String(cfg.focusModeId);

  // Keep UI selection in sync only when a config is truly meant for this local player.
  try{
    const syncFocus = (cfg && cfg.selfFocusModeId) ? cfg.selfFocusModeId : ((cfg && cfg.focusModeId && !mpRoomStart) ? cfg.focusModeId : null);
    if (ui && syncFocus && typeof ui.setSelectedFocusModeId === "function") {
      ui.setSelectedFocusModeId(String(syncFocus), false);
    }
  }catch(_e){}

  if (ui) ui.hide();
  if(game) game.netBulletAuthority = !!(lobby && lobby.connected && !lobby.isHost);
  // Game.start accepts either focusModeId (string) or a start config object.
  if (cfg) {
    cfg = Object.assign({}, cfg, { focusModeId });
    game.start(cfg);
  } else {
    game.start(focusModeId);
  }
  scenes.set("run"); // fades nicely from title
};

engine.resumeRun = () => {
  unlockAudioOnce();
  if (ui) ui.hide();
  game.resume();
  scenes.set("run", null, { instant: true });
};

engine.restartRun = () => {
  unlockAudioOnce();

  // Multiplayer: restart is a room-wide action (host starts, clients READY).
  if(lobby && lobby.connected){
    lobby.setReady(true);
    if(lobby.isHost){
      const seed = _newSeed32();
      lobby.startWithConfig({ seed, room: 1 });
    }
    return;
  }

  if (ui) ui.hide();
  game.start(_getSelectedFocusMode());
  scenes.set("run", null, { instant: true });
};

// initial
scenes.set("title");

let last = performance.now();

function frame(now){
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.033, Math.max(0.001, rawDt));

  resize();
  syncSize();

  scenes.update(dt);
  scenes.render(dt);

  bgm.update(game);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

