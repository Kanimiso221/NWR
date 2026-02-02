import { Input } from "./input.js";
import { Game } from "./game.js";
import { Player } from "./entities.js";
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
// NOTE: Bullets/enemies are still local-sim; next steps (No.5+) will sync bullets + damage.
const mp = {
  runId: 0,
  sendSeq: 0,
  snapTick: 0,
  lastSnapTick: -1,

  // host: latest input for each client
  lastClientInput: new Map(), // id -> netInput
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

  resetForRun(runId){
    this.runId = (runId|0) || 0;
    this.sendSeq = 0;
    this.snapTick = 0;
    this.lastSnapTick = -1;
    this.lastClientInput.clear();
    this.simPlayers.clear();
    this.remotePlayers.clear();
    this.selfAuth = null;
    this._sendAcc = 0;
    this._snapAcc = 0;
  },

  // Called from RunScene.update() BEFORE game.update
  preUpdate(dt, game, lobby, input){
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
    const me = _resolveMyId(lobby);
    const members = Array.isArray(lobby.members) ? lobby.members : [];

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
      p.focusActive = !!fa;
      p.focusModeId = (ni && ni.fm) ? ni.fm : (p.focusModeId || "chrono");

      const fakeInput = _makeFakeInput(ni);
      p.update(dt, fakeInput, game.world);
      if(typeof game._applyObstacleCollisions === "function") game._applyObstacleCollisions(p);
    }

    // prune sims for leavers
    const memberIds = new Set(members.map(mm => String(mm && mm.id || "")).filter(Boolean));
    for(const [id] of this.simPlayers){
      if(!memberIds.has(id)) this.simPlayers.delete(id);
    }
    for(const [id] of this.lastClientInput){
      if(!memberIds.has(id)) this.lastClientInput.delete(id);
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

      lobby.sendSnapshot({ runId: this.runId, time: game.time, room: game.room, players }, this.snapTick++);
    }
  }
};

function _num(v, fallback=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function _resolveMyId(lobby){
  const sid = String((lobby && lobby.selfId) || "");
  if(sid) return sid;
  const hid = String((lobby && lobby.hostId) || "");
  if(lobby && lobby.isHost && hid) return hid;
  const members = (lobby && Array.isArray(lobby.members)) ? lobby.members : [];
  const hm = members.find(m => m && (m.host || m.isHost));
  return hm ? String(hm.id || "") : "";
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

function _makeFakeInput(ni){
  const s = ni || { mvx: 0, mvy: 0, aimX: 0, aimY: 0, dash: false, shoot: false };
  return {
    move: { x: _num(s.mvx, 0), y: _num(s.mvy, 0) },
    mouseWorld: { x: _num(s.aimX, 0), y: _num(s.aimY, 0) },
    mouseDown: !!s.shoot,
    _dashOnce: !!s.dash,
    consumePressed(code){
      if(code === "ShiftLeft" || code === "ShiftRight"){
        if(this._dashOnce){
          this._dashOnce = false;
          return true;
        }
      }
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
  if(runId !== (mp.runId|0)) mp.resetForRun(runId);

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
  const members = (lobby && Array.isArray(lobby.members)) ? lobby.members : [];
  const memberIds = new Set(members.map(m => String(m.id || "")).filter(Boolean));
  for(const [id] of mp.remotePlayers){
    if(!memberIds.has(id)) mp.remotePlayers.delete(id);
  }
}

// Wire lobby -> UI
lobby.onState = (view) => {
  if(ui && typeof ui.setMultiplayerState === "function") ui.setMultiplayerState(view);
};
lobby.onClosed = (reason) => {
  mp.resetForRun(0);
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
  mp.lastClientInput.set(from, ni);
};

lobby.onGameSnapshot = (msg) => {
  const snap = (msg && (msg.snap || msg.state)) || null;
  const runId = (snap && (snap.runId|0)) || 0;

  // IMPORTANT: host restarts reset tick to 0. We must detect run changes BEFORE
  // applying the monotonic tick gate, or clients can ignore every snapshot forever.
  if(runId && runId !== (mp.runId|0)){
    mp.resetForRun(runId);
  }

  const tick = (msg && msg.tick != null) ? (msg.tick|0) : -1;
  if(tick >= 0 && tick <= (mp.lastSnapTick|0)) return;
  mp.lastSnapTick = tick;

  _applyPartySnapshot(snap);

  // Self-heal: if a client missed the start message, snapshots can still pull them into the run.
  if(lobby && lobby.connected && !lobby.isHost && engineRef && game && game.state !== "playing" && runId){
    const cfg = (mp.lastStartCfg && ((mp.lastStartCfgRunId|0) === runId)) ? mp.lastStartCfg : { seed: _newSeed32(), focusModeId: _getSelectedFocusMode(), room: 1 };
    if(typeof engineRef.startRun === "function") engineRef.startRun(cfg);
    if(scenes && typeof scenes.set === "function") scenes.set("run", null, { instant: true });
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
  ui.onMpLeave(() => lobby.leave("leave"));
}
if(ui && typeof ui.onMpReady === "function"){
  ui.onMpReady(() => lobby.toggleReady());
}

if(ui && typeof ui.onMpStart === "function"){
  ui.onMpStart(() => {
    // START is host-only and triggers a room-wide start signal
    if(!(lobby && lobby.connected && lobby.isHost)) return;

    const seed = _newSeed32();
    const focusModeId = _getSelectedFocusMode();
    lobby.startWithConfig({ seed, focusModeId, room: 1 });
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
      const focusModeId = _getSelectedFocusMode();
      lobby.startWithConfig({ seed, focusModeId, room: 1 });
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
      const focusModeId = _getSelectedFocusMode();
      lobby.startWithConfig({ seed, focusModeId, room: 1 });
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
  if (cfg && cfg.focusModeId) focusModeId = String(cfg.focusModeId);
  // Keep UI selection in sync with host-chosen mode.
  try{
    if (ui && cfg && cfg.focusModeId && typeof ui.setSelectedFocusModeId === "function") {
      ui.setSelectedFocusModeId(String(cfg.focusModeId), false);
    }
  }catch(_e){}

  if (ui) ui.hide();
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
      const focusModeId = _getSelectedFocusMode();
      lobby.startWithConfig({ seed, focusModeId, room: 1 });
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

