import { clamp } from "./math.js";
import { listFocusModes, getFocusMode, defaultFocusModeId } from "./focus_modes.js";

export class UI {
  constructor(){
    this.overlay = document.getElementById("overlay");
    this.overlayDesc = document.getElementById("overlayDesc");
    this.startBtn = document.getElementById("startBtn");
    this.resumeBtn = document.getElementById("resumeBtn");
    this.restartBtn = document.getElementById("restartBtn");
    this.menuButtons = document.getElementById("menuButtons");

    this.rewardArea = document.getElementById("rewardArea");
    this.rewardTitle = document.getElementById("rewardTitle");
    this.rewardCards = document.getElementById("rewardCards");

    this.shopArea = document.getElementById("shopArea");
    this.shopTitle = document.getElementById("shopTitle");
    this.shopForce = document.getElementById("shopForce");
    this.shopCards = document.getElementById("shopCards");
    this.shopRerollBtn = document.getElementById("shopRerollBtn");
    this.shopRerollCost = document.getElementById("shopRerollCost");
    this.shopLeaveBtn = document.getElementById("shopLeaveBtn");

    this.hpBar = document.getElementById("hpBar");
    this.focusBar = document.getElementById("focusBar");
    this.scoreEl = document.getElementById("score");
    this.comboEl = document.getElementById("combo");
    this.bestEl = document.getElementById("best");
    this.roomEl = document.getElementById("room");
    this.mapNameEl = document.getElementById("mapName");
    this.mapGimmickEl = document.getElementById("mapGimmick");
    this.stageLineEl = document.getElementById("stageLine");
    this.forceEl = document.getElementById("force");
    this.buildEl = document.getElementById("build");

    this.muteChk = document.getElementById("muteChk");
    this.motionChk = document.getElementById("motionChk");

    // Optional audio sliders (some builds include these)
    this.bgmVol = document.getElementById("bgmVol")
      || document.getElementById("bgmSlider")
      || document.getElementById("bgmVolume")
      || document.getElementById("bgmRange");
    // NOTE: main.js expects "Sfx", but older UI used "Se". We support both.
    this.sfxVol = document.getElementById("sfxVol")
      || document.getElementById("seVol")
      || document.getElementById("seSlider")
      || document.getElementById("seVolume")
      || document.getElementById("seRange");

    this.bgmPct = document.getElementById("bgmPct")
      || document.getElementById("bgmPercent")
      || document.getElementById("bgmValue")
      || document.getElementById("bgmVolVal");
    this.sfxPct = document.getElementById("sfxPct")
      || document.getElementById("sfxPercent")
      || document.getElementById("sfxValue")
      || document.getElementById("sePct")
      || document.getElementById("sePercent")
      || document.getElementById("seValue")
      || document.getElementById("sfxVolVal");

    // Keep references to wrappers so we can hide audio UI on reward/shop screens
    this._muteLabel = this.muteChk?.closest?.("label") || null;
    this._motionLabel = this.motionChk?.closest?.("label") || null;
    this._bgmBlock = this._findAudioBlock(this.bgmVol, this.bgmPct);
    this._sfxBlock = this._findAudioBlock(this.sfxVol, this.sfxPct);

    this._mode = "title"; // title | pause | gameover | reward | shop | hidden
    this._onPick = null;

    this._onBuyShop = null;
    this._onRerollShop = null;
    this._onLeaveShop = null;

    this._onBgmVol = null;
    this._onSfxVol = null;

    // Internal cached values (avoid NaN -> silence if sliders are missing)
    this._bgmVal = this.bgmVol ? this._readSlider01(this.bgmVol) : 0.35;
    this._sfxVal = this.sfxVol ? this._readSlider01(this.sfxVol) : 1.0;


    // FOCUS mode select UI (title screen)
    this.focusArea = document.getElementById("focusArea")
      || document.getElementById("focusSelectArea")
      || null;
    this.focusCardsEl = document.getElementById("focusCards") || null;
    this.focusDescEl = document.getElementById("focusDesc")
      || document.getElementById("focusDetail")
      || null;

    this._focusModes = listFocusModes();
    this._focusModeId = this._safeGet("nw_focusModeId")
      || this._safeGet("nw_focus_mode")
      || defaultFocusModeId();
    this._ensureFocusUI();
    this.setSelectedFocusModeId(this._focusModeId, true);
    // Wire optional sliders if present (realtime while dragging)
    this._wireVolumeSlider(this.bgmVol, this.bgmPct, (v) => {
      this._bgmVal = v;
      if(this._onBgmVol) this._onBgmVol(v);
    });
    this._wireVolumeSlider(this.sfxVol, this.sfxPct, (v) => {
      this._sfxVal = v;
      if(this._onSfxVol) this._onSfxVol(v);
    });

    // shop buttons (safe even if hidden)
    this.shopRerollBtn?.addEventListener("click", () => {
      if(this._onRerollShop) this._onRerollShop();
    });
    this.shopLeaveBtn?.addEventListener("click", () => {
      if(this._onLeaveShop) this._onLeaveShop();
    });

    // keep initial % labels correct
    queueMicrotask(() => {
      if(this.bgmPct) this.bgmPct.textContent = `${Math.round(this.bgmVolume * 100)}%`;
      if(this.sfxPct) this.sfxPct.textContent = `${Math.round(this.sfxVolume * 100)}%`;
    });
  }

  // ------------------------------
  // HUD
  // ------------------------------
  setBest(v){
    this.bestEl.textContent = String(v|0);
  }

  updateHUD({hp, hpMax, focus, focusMax, score, combo, room, force, buildText, mapName, mapGimmick, roomTitle}){
    const hpT = clamp(hp / hpMax, 0, 1);
    const fT = clamp(focus / focusMax, 0, 1);
    this.hpBar.style.transform = `scaleX(${hpT})`;
    this.focusBar.style.transform = `scaleX(${fT})`;

    this.scoreEl.textContent = String(score|0);
    this.comboEl.textContent = combo > 1 ? ` x${combo}` : "";
    this.roomEl.textContent = String(room|0);

    if(this.mapNameEl) this.mapNameEl.textContent = mapName || "";
    if(this.mapGimmickEl) {
      const rt = (roomTitle && String(roomTitle).trim()) ? String(roomTitle).trim() : "";
      const gg = (mapGimmick && String(mapGimmick).trim()) ? String(mapGimmick).trim() : "";
      if(rt && gg) this.mapGimmickEl.textContent = `${rt}: ${gg}`;
      else this.mapGimmickEl.textContent = rt || gg || "";
    }
    if(this.stageLineEl) this.stageLineEl.style.display = (mapName || mapGimmick || roomTitle) ? "" : "none";
    if(this.forceEl) this.forceEl.textContent = String(force|0);
    this.buildEl.textContent = buildText || "Build: -";
  }

  // ------------------------------
  // Overlay visibility
  // ------------------------------
  show(mode){
    this._mode = mode;
    this.overlay.classList.add("show");

    const isTitle = mode === "title";
    const isPause = mode === "pause";
    const isOver = mode === "gameover";
    const isReward = mode === "reward";
    const isShop = mode === "shop";

    this.startBtn.classList.toggle("hidden", !(isTitle));
    this.resumeBtn.classList.toggle("hidden", !(isPause));
    this.restartBtn.classList.toggle("hidden", !(isOver || isPause));

    // reward/shop should hide the main menu buttons
    this.menuButtons.classList.toggle("hidden", isReward || isShop);

    this.rewardArea.classList.toggle("hidden", !isReward);
    if(this.shopArea) this.shopArea.classList.toggle("hidden", !isShop);

    if(this.focusArea){
      const showFocus = isTitle || isOver;
      this.focusArea.classList.toggle("hidden", !showFocus);
    }


    // Hide audio controls while choosing upgrades or in the shop.
    // Keep Reduced motion visible (user can still toggle perf).
    const hideAudio = isReward || isShop;
    this._setAudioVisible(!hideAudio);
  }

  hide(){
    this._mode = "hidden";
    this.overlay.classList.remove("show");
    this.menuButtons.classList.remove("hidden");
    this.rewardArea.classList.add("hidden");
    if(this.shopArea) this.shopArea.classList.add("hidden");

    // In hidden/menu modes, show audio controls again.
    this._setAudioVisible(true);
  }

  // ------------------------------
  // Reward
  // ------------------------------
  showReward(room, choices, isBoss=false){
    this.rewardTitle.textContent = isBoss ? "BOSS CLEARED: CHOOSE 1 RELIC" : "CHOOSE 1 UPGRADE";
    this.rewardCards.innerHTML = "";
    this._mode = "reward";
    this.show("reward");

    let selected = 0;
    const setSelected = (i) => {
      selected = clamp(i, 0, Math.max(0, choices.length - 1)) | 0;
      const nodes = this.rewardCards.querySelectorAll(".card");
      nodes.forEach((n, k) => n.classList.toggle("selected", k === selected));
    };

    const pick = (u) => {
      if(this._onPick) this._onPick(u);
    };

    choices.forEach((u, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;
      const rarity = String(u.rarity || "common").toLowerCase();
      card.classList.add(`rarity-${rarity}`);
      const tag = rarity.toUpperCase();
      const stats = (u.stats || u.hint || "").trim();
      const desc = (u.desc || "").trim();

      card.innerHTML = `
        <div class="tag">${tag}</div>
        <div class="name">${u.name}</div>
        <div class="stats">${stats}</div>
        <div class="desc">${desc}</div>
        <div class="hint">CLICK • [${idx+1}]</div>
      `;

      card.addEventListener("mouseenter", () => setSelected(idx));
      card.addEventListener("focus", () => setSelected(idx));
      card.addEventListener("click", () => pick(u));

      card.addEventListener("keydown", (e) => {
        if(e.key === "ArrowLeft"){
          e.preventDefault();
          setSelected(selected - 1);
          this.rewardCards.querySelectorAll(".card")[selected]?.focus();
        }else if(e.key === "ArrowRight"){
          e.preventDefault();
          setSelected(selected + 1);
          this.rewardCards.querySelectorAll(".card")[selected]?.focus();
        }else if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          pick(u);
        }
      });
      this.rewardCards.appendChild(card);
    });

    setSelected(0);
  }

  onPickReward(fn){ this._onPick = fn; }

  // ------------------------------
  // Shop
  // ------------------------------
  showShop(room, force, stock, rerollCost, nextIsBoss=false){
    if(!this.shopArea) return;
    this._mode = "shop";
    this.show("shop");

    this.shopTitle.textContent = nextIsBoss ? "SHOP (BOSS NEXT)" : "SHOP";
    if(this.shopForce) this.shopForce.textContent = String(force|0);
    if(this.shopRerollCost) this.shopRerollCost.textContent = String(rerollCost|0);

    this.shopCards.innerHTML = "";

    const buy = (idx) => {
      if(this._onBuyShop) this._onBuyShop(idx);
    };

    stock.forEach((it, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;
      const rarity = String(it.rarity || "common").toLowerCase();
      card.classList.add(`rarity-${rarity}`);
      const tag = rarity.toUpperCase();
      const stats = (it.stats || "").trim();
      const desc = (it.desc || "").trim();
      const canAfford = (force|0) >= (it.cost|0);
      const sold = !!it.sold;

      if(!canAfford) card.classList.add("disabled");
      if(sold) card.classList.add("sold");

      const hint = sold ? "SOLD" : (canAfford ? "CLICK TO BUY" : "NOT ENOUGH FORCE");

      card.innerHTML = `
        <div class="tag">${tag}</div>
        <div class="name">${it.name}</div>
        <div class="stats">${stats}</div>
        <div class="desc">${desc}</div>
        <div class="cost">COST: <span class="num">${it.cost|0}</span></div>
        <div class="hint">${hint}</div>
      `;

      card.addEventListener("click", () => {
        if(sold) return;
        if(!canAfford) return;
        buy(idx);
      });

      card.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          if(sold || !canAfford) return;
          buy(idx);
        }
      });

      this.shopCards.appendChild(card);
    });
  }

  onBuyShop(fn){ this._onBuyShop = fn; }
  onRerollShop(fn){ this._onRerollShop = fn; }
  onLeaveShop(fn){ this._onLeaveShop = fn; }

  // ------------------------------
  // Audio hooks (main.js expects these names)
  // ------------------------------
  onBgmVolumeChange(fn){ this._onBgmVol = fn; }

  // main.js uses onSfxVolumeChange; older patches used onSeVolumeChange.
  // Provide both so either main.js works.
  onSfxVolumeChange(fn){ this._onSfxVol = fn; }
  onSeVolumeChange(fn){ this._onSfxVol = fn; }

  // Some builds call this to push UI state from storage.
  // Accepts { muted, reducedMotion, bgm, sfx } (current) or { bgmVolume, sfxVolume/seVolume } (older).
  setAudioUI(state={}){
    if(!state || typeof state !== "object") return;

    if(this.muteChk && state.muted !== undefined) this.muteChk.checked = !!state.muted;
    if(this.motionChk && state.reducedMotion !== undefined) this.motionChk.checked = !!state.reducedMotion;

    const bgm = (state.bgmVolume !== undefined) ? state.bgmVolume : state.bgm;
    const sfx =
      (state.sfxVolume !== undefined) ? state.sfxVolume :
      (state.sfx !== undefined) ? state.sfx :
      (state.seVolume !== undefined) ? state.seVolume :
      state.se;

    if(this.bgmVol && bgm !== undefined){
      this._setSlider01(this.bgmVol, this.bgmPct, bgm);
      this._bgmVal = clamp(Number(bgm) || 0, 0, 1);
    }
    if(this.sfxVol && sfx !== undefined){
      this._setSlider01(this.sfxVol, this.sfxPct, sfx);
      this._sfxVal = clamp(Number(sfx) || 0, 0, 1);
    }
  }

  // ------------------------------
  // Menu hooks (main.js expects these)
  // ------------------------------
  onStart(fn){ this.startBtn.addEventListener("click", fn); }
  onResume(fn){ this.resumeBtn.addEventListener("click", fn); }
  onRestart(fn){ this.restartBtn.addEventListener("click", fn); }
  onMuteChange(fn){ this.muteChk.addEventListener("change", fn); }
  onMotionChange(fn){ this.motionChk.addEventListener("change", fn); }

  get reducedMotion(){ return !!this.motionChk?.checked; }
  get muted(){ return !!this.muteChk?.checked; }

  // main.js reads these directly.
  get bgmVolume(){
    if(this.bgmVol) return this._readSlider01(this.bgmVol);
    return clamp(Number(this._bgmVal) || 0, 0, 1);
  }
  get sfxVolume(){
    if(this.sfxVol) return this._readSlider01(this.sfxVol);
    return clamp(Number(this._sfxVal) || 0, 0, 1);
  }


  // ------------------------------
  // FOCUS mode select
  // ------------------------------
  getSelectedFocusModeId(){
    return this._focusModeId || defaultFocusModeId();
  }

  // Back-compat: main.js expects this method name.
  getFocusModeId(){
    return this.getSelectedFocusModeId();
  }

  setSelectedFocusModeId(id, silent=false){
    const m = getFocusMode(id);
    this._focusModeId = m.id;
    if(!silent) this._safeSet("nw_focusModeId", m.id);

    if(this.focusDescEl){
      const t = String(m.details || m.desc || m.tagline || "").trim();
      this.focusDescEl.textContent = t;
    }

    if(this.focusCardsEl){
      const cards = Array.from(this.focusCardsEl.querySelectorAll(".focusCard"));
      cards.forEach((c) => c.classList.toggle("selected", (c.dataset.focusId === m.id)));
    }
  }

  _ensureFocusUI(){
    const panel = this.overlay?.querySelector?.(".panel") || this.overlay;
    const before = document.getElementById("menuButtons") || null;

    if(!this.focusArea){
      const area = document.createElement("div");
      area.id = "focusArea";
      area.className = "focusArea";
      area.innerHTML = `
        <h2 class="focusTitle">FOCUS MODE</h2>
        <div id="focusCards" class="cards focusCards"></div>
        <div id="focusDesc" class="focusDesc"></div>
        <p class="tiny focusHint">クリックで選択。1〜8でも選択。Spaceで発動。</p>
      `;
      if(before && before.parentElement === panel){
        panel.insertBefore(area, before);
      }else{
        panel.appendChild(area);
      }
      this.focusArea = area;
    }

    this.focusCardsEl = this.focusCardsEl
      || document.getElementById("focusCards")
      || this.focusArea?.querySelector?.("#focusCards")
      || null;
    this.focusDescEl = this.focusDescEl
      || document.getElementById("focusDesc")
      || document.getElementById("focusDetail")
      || this.focusArea?.querySelector?.("#focusDesc")
      || null;

    if(!this.focusCardsEl) return;

    this._focusModes = listFocusModes();
    this.focusCardsEl.innerHTML = "";

    this._focusModes.forEach((m, idx) => {
      const card = document.createElement("div");
      card.className = "card focusCard";
      card.tabIndex = 0;
      card.dataset.focusId = m.id;
      const tag = `MODE ${idx+1}`;
      const stats = String(m.tagline || m.desc || "").trim();

      card.innerHTML = `
        <div class="tag">${tag}</div>
        <div class="name">${m.name}</div>
        <div class="desc">${stats}</div>
        <div class="hint">CLICK • [${idx+1}]</div>
      `;      const pick = () => this.setSelectedFocusModeId(m.id);

      // Click commits selection. Hover/focus only previews the description (doesn't change selection).
      const preview = () => {
        const lines = [];
        if (m.tagline) lines.push(m.tagline);
        if (m.details) lines.push(m.details);
        if (m.desc && !m.details) lines.push(m.desc);
        this.focusDescEl.textContent = lines.join("\\n");
      };
      const restore = () => {
        const cur = getFocusMode(this.getSelectedFocusModeId());
        if (!cur) return;
        const lines = [];
        if (cur.tagline) lines.push(cur.tagline);
        if (cur.details) lines.push(cur.details);
        if (cur.desc && !cur.details) lines.push(cur.desc);
        this.focusDescEl.textContent = lines.join("\\n");
      };

      card.addEventListener("click", pick);
      card.addEventListener("mouseenter", preview);
      card.addEventListener("focus", preview);
      card.addEventListener("mouseleave", restore);
      card.addEventListener("blur", restore);
      card.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          pick();
        }
      });

      this.focusCardsEl.appendChild(card);
    });

    if(!this._focusKeyBound){
      this._focusKeyBound = true;
      window.addEventListener("keydown", (e) => {
        if(!this.overlay?.classList?.contains("show")) return;
        if(!this.focusArea || this.focusArea.classList.contains("hidden")) return;

        const code = e.code || "";
        let n = -1;
        if(code.startsWith("Digit")) n = Number(code.slice(5));
        else if(code.startsWith("Numpad")) n = Number(code.slice(6));

        if(n >= 1 && n <= 8){
          e.preventDefault();
          const mode = this._focusModes?.[n-1];
          if(mode) this.setSelectedFocusModeId(mode.id);
        }
      }, {passive:false});
    }
  }

  _safeGet(key){
    try{ return localStorage.getItem(key); }catch(_e){ return null; }
  }

  _safeSet(key, val){
    try{ localStorage.setItem(key, String(val)); }catch(_e){}
  }
  // ------------------------------
  // Internal helpers
  // ------------------------------
  _findAudioBlock(sliderEl, pctEl){
    const el = sliderEl || pctEl;
    if(!el) return null;
    return el.closest?.(".audioRow")
      || el.closest?.(".audio-ui")
      || el.closest?.(".audio")
      || el.parentElement
      || null;
  }

  _setAudioVisible(visible){
    // Hide mute + BGM/SFX slider blocks; keep Reduced motion visible.
    if(this._muteLabel) this._muteLabel.classList.toggle("hidden", !visible);
    if(this._bgmBlock) this._bgmBlock.classList.toggle("hidden", !visible);
    if(this._sfxBlock) this._sfxBlock.classList.toggle("hidden", !visible);
  }

  _wireVolumeSlider(sliderEl, pctEl, emit){
    if(!sliderEl) return;
    const update = () => {
      const v01 = this._readSlider01(sliderEl);
      if(pctEl) pctEl.textContent = `${Math.round(v01 * 100)}%`;
      emit(v01);
    };
    // input = realtime while dragging, change = final
    sliderEl.addEventListener("input", update);
    sliderEl.addEventListener("change", update);
  }

  _readSlider01(sliderEl){
    const raw = Number(sliderEl.value);
    const max = Number(sliderEl.max || 1);
    const min = Number(sliderEl.min || 0);
    if(!isFinite(raw) || !isFinite(max) || !isFinite(min) || max === min) return 0;
    if(max > 1.5){
      // treat as 0..100 (or similar)
      return clamp((raw - min) / (max - min), 0, 1);
    }
    return clamp(raw, 0, 1);
  }

  _setSlider01(sliderEl, pctEl, v01){
    if(!sliderEl) return;
    const v = clamp(Number(v01) || 0, 0, 1);
    const max = Number(sliderEl.max || 1);
    const min = Number(sliderEl.min || 0);
    if(max > 1.5){
      sliderEl.value = String(Math.round(min + v * (max - min)));
    }else{
      sliderEl.value = String(v);
    }
    if(pctEl) pctEl.textContent = `${Math.round(v * 100)}%`;
  }
}
