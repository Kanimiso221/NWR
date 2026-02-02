import { Input } from "./input.js";
import { Game } from "./game.js";
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

// Wire lobby -> UI
lobby.onState = (view) => {
  if(ui && typeof ui.setMultiplayerState === "function") ui.setMultiplayerState(view);
};
lobby.onClosed = (reason) => {
  if(ui && typeof ui.setMultiplayerState === "function") ui.setMultiplayerState({ error: String(reason || "") });
};
lobby.onStart = () => {
  // Start is driven by the host, but everyone (including host) starts on this signal.
  if(engineRef && typeof engineRef.startRun === "function") engineRef.startRun();
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
    if(lobby && lobby.connected && lobby.isHost) lobby.start();
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
      lobby.start();
    }
    return;
  }
  engine.startRun();
});
ui.onResume(() => { engine.resumeRun(); });
ui.onRestart(() => { engine.restartRun(); });
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

function _getSelectedFocusMode(){
  if (ui && typeof ui.getFocusModeId === "function") return ui.getFocusModeId();
  try{
    if (typeof localStorage !== "undefined") return localStorage.getItem("nw_focusModeId") || localStorage.getItem("nw_focus_mode") || "chrono";
  }catch(e){}
  return "chrono";
}

engine.startRun = () => {
  unlockAudioOnce();
  if (ui) ui.hide();
  game.start(_getSelectedFocusMode());
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

