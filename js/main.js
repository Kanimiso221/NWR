import { Input } from "./input.js";
import { Game } from "./game.js";
import { UI } from "./ui.js";
import { Sfx } from "./audio.js";
import { Bgm } from "./bgm.js";
import { ParticleSystem } from "./particles.js";
import { loadBest, saveBest, loadAudioSettings, saveAudioSettings } from "./storage.js";
import { clear, drawBackground, drawRoomBounds, drawHazards, drawObstacle, drawPickup, drawBullet, drawEnemy, drawEnemyIndicators, drawPlayer, drawStagePost } from "./renderer.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: true });

const ui = new UI();
const sfx = new Sfx();
const bgm = new Bgm();
const particles = new ParticleSystem();

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

// Reward/shop UI: re-creating DOM every frame breaks click and makes selection hard to see.
// We only re-render when the relevant data actually changes.
let lastRewardHash = "";
let lastShopHash = "";

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

ui.onStart(() => {
  unlockAudioOnce();
  ui.hide();
  game.start(ui.getFocusModeId ? ui.getFocusModeId() : "chrono");
});
ui.onResume(() => {
  ui.hide();
  game.resume();
});
ui.onRestart(() => {
  unlockAudioOnce();
  ui.hide();
  game.start(ui.getFocusModeId ? ui.getFocusModeId() : "chrono");
});
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
  // force a re-render next time
  lastRewardHash = "";
  lastShopHash = "";
});

ui.onBuyShop((idx) => {
  game.buyShop(idx);
  // shopVersion changes, but resetting makes it immediate
  lastShopHash = "";
});
ui.onRerollShop(() => {
  game.rerollShop();
  lastShopHash = "";
});
ui.onLeaveShop(() => {
  ui.hide();
  game.leaveShop();
  lastShopHash = "";
});

ui.show("title");

let last = performance.now();

function frame(now){
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.033, Math.max(0.001, rawDt));

  resize();
  syncSize();

  // global hotkeys
  if(input.consumePressed("Escape")){
    if(game.state === "playing"){
      game.pause();
      ui.show("pause");
    }else if(game.state === "paused"){
      ui.hide();
      game.resume();
    }else if(game.state === "shop"){
      ui.hide();
      game.leaveShop();
    }
  }
  if(input.consumePressed("KeyR")){
    if(game.state === "playing" || game.state === "paused" || game.state === "gameover" || game.state === "reward" || game.state === "shop"){
      unlockAudioOnce();
      ui.hide();
      game.start(ui.getFocusModeId ? ui.getFocusModeId() : "chrono");
    }
  }

  // Reward quick keys
  if(game.state === "reward"){
    if(input.consumePressed("Digit1") || input.consumePressed("Numpad1")){
      if(game.rewardChoices?.[0]){ ui.hide(); game.pickReward(game.rewardChoices[0]); }
    }
    if(input.consumePressed("Digit2") || input.consumePressed("Numpad2")){
      if(game.rewardChoices?.[1]){ ui.hide(); game.pickReward(game.rewardChoices[1]); }
    }
    if(input.consumePressed("Digit3") || input.consumePressed("Numpad3")){
      if(game.rewardChoices?.[2]){ ui.hide(); game.pickReward(game.rewardChoices[2]); }
    }
  }

  if(game.state === "playing"){
    // leaving reward/shop -> allow a fresh render next time
    lastRewardHash = "";
    lastShopHash = "";

    const { timeScale } = game.update(dt, input, ui.reducedMotion);
    renderScene(timeScale);
    refreshHUD();

  }else{
    // menu/shop background
    clear(ctx, W, H);
    drawBackground(ctx, W, H, game.camera, game.time, 1);
    game.time += dt * 0.6;

    // show proper overlay
    if(game.state === "title"){
      ui.show("title");
    }else if(game.state === "paused"){
      ui.show("pause");
    }else if(game.state === "gameover"){
      ui.show("gameover");
    }else if(game.state === "reward"){
      const choices = game.rewardChoices || [];
      const ids = choices.map(u => (u.id ?? u.name ?? "?")).join("|");
      const hash = `${game.room}|${game.roomIsBoss ? "B" : "N"}|${ids}`;
      if(hash !== lastRewardHash){
        ui.showReward(game.room, choices, game.roomIsBoss);
        lastRewardHash = hash;
      }else{
        ui.show("reward");
      }
    }else if(game.state === "shop"){
      const stock = game.shopStock || [];
      const ids = stock.map(it => `${it.id}:${it.sold?1:0}`).join("|");
      const hash = `${game.room}|${game.player.force||0}|${game.shopVersion||0}|${game.shopRerolls||0}|${ids}`;
      if(hash !== lastShopHash){
        ui.showShop(game.room, game.player.force||0, stock, game.getShopRerollCost(), game.roomIsBoss);
        lastShopHash = hash;
      }else{
        ui.show("shop");
      }
    }

    refreshHUD();
  }

  bgm.update(game);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Enter to start/resume
window.addEventListener("keydown", (e) => {
  if(e.code === "Enter"){
    if(game.state === "title" || game.state === "gameover"){
      unlockAudioOnce();
      ui.hide();
      game.start(ui.getFocusModeId ? ui.getFocusModeId() : "chrono");
    }else if(game.state === "paused"){
      ui.hide();
      game.resume();
    }
  }else{
    if(!ui.muted) sfx.ensure();
  }
}, {passive:true});