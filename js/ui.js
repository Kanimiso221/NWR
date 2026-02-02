import { clamp } from "./math.js";
import { listFocusModes, getFocusMode, defaultFocusModeId } from "./focus_modes.js";
import { DEFAULT_LOBBY_SERVER } from "./net.js";

export class UI {
  constructor() {
    this.overlay = document.getElementById("overlay");
    this.overlayDesc = document.getElementById("overlayDesc");
    this.startBtn = document.getElementById("startBtn");
    this.resumeBtn = document.getElementById("resumeBtn");
    this.restartBtn = document.getElementById("restartBtn");
    this.menuButtons = document.getElementById("menuButtons");


    // Back to title button (created dynamically for patch compatibility)
    this.titleBtn = document.getElementById("titleBtn");
    if (!this.titleBtn && this.menuButtons) {
      const b = document.createElement("button");
      b.id = "titleBtn";
      b.textContent = "TITLE";
      b.className = "hidden";
      // Put it between RESUME and RESTART if possible
      if (this.restartBtn && this.restartBtn.parentElement === this.menuButtons) {
        this.menuButtons.insertBefore(b, this.restartBtn);
      } else {
        this.menuButtons.appendChild(b);
      }
      this.titleBtn = b;
    }
    this._onBackToTitle = null;
    this.titleBtn?.addEventListener?.("click", () => {
      if (this._onBackToTitle) this._onBackToTitle();
    });


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
    this.hpText = document.getElementById("hpText");
    this.focusText = document.getElementById("focusText");
    this.scoreEl = document.getElementById("score");
    this.comboEl = document.getElementById("combo");
    this.bestEl = document.getElementById("best");
    this.roomEl = document.getElementById("room");
    this.mapNameEl = document.getElementById("mapName");
    this.mapGimmickEl = document.getElementById("mapGimmick");
    this.stageLineEl = document.getElementById("stageLine");
    this.forceEl = document.getElementById("force");
    this.buildEl = document.getElementById("build");

    // Settings panel toggle (audio + motion). UI-only; gameplay unaffected.
    this.settingsBtn = document.getElementById("settingsBtn");
    this.settingsPanel = document.getElementById("settingsPanel");
    this._settingsOpen = (this._safeGet("nw_settingsOpen") === "1");
    this._applySettingsOpen();

    // HUD debug toggle: hide noisy info (build/map/best) by default.
    // Press F1 to toggle (stored in localStorage).
    this._debugHud = (this._safeGet("nw_debugHud") === "1");
    this._applyDebugHudClass();

    window.addEventListener(
      "keydown",
      (e) => {
        if (e && e.code === "F1") {
          e.preventDefault();
          this._debugHud = !this._debugHud;
          this._safeSet("nw_debugHud", this._debugHud ? "1" : "0");
          this._applyDebugHudClass();
        }
      },
      { passive: false }
    );

    // Settings panel toggle
    if (this.settingsBtn && this.settingsPanel) {
      this.settingsBtn.addEventListener("click", (e) => {
        if (e) e.preventDefault();
        this.setSettingsOpen(!this._settingsOpen);
      });
    }

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

    // Multiplayer (lobby) hooks
    this._onMpHost = null;
    this._onMpJoin = null;
    this._onMpLeave = null;
    this._onMpReady = null;
    this._onMpStart = null;
    this._onMpServerChange = null;
    this._onMpNameChange = null;

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

    // Multiplayer UI (title/gameover)
    this._mpView = {
      server: DEFAULT_LOBBY_SERVER,
      name: this._safeGet("nw_playerName") || "",
      connecting: false,
      connected: false,
      roomCode: "",
      selfId: "",
      hostId: "",
      isHost: false,
      ready: false,
      members: [],
      error: "",
    };
    this._ensureMultiplayerUI();
    this._wireMultiplayerUI();
    this.setMultiplayerState(this._mpView);
    this._ensurePartyHUD();
    this._updatePartyHudVisibility();
    // Wire optional sliders if present (realtime while dragging)
    this._wireVolumeSlider(this.bgmVol, this.bgmPct, (v) => {
      this._bgmVal = v;
      if (this._onBgmVol) this._onBgmVol(v);
    });
    this._wireVolumeSlider(this.sfxVol, this.sfxPct, (v) => {
      this._sfxVal = v;
      if (this._onSfxVol) this._onSfxVol(v);
    });

    // shop buttons (safe even if hidden)
    this.shopRerollBtn?.addEventListener("click", () => {
      if (this._onRerollShop) this._onRerollShop();
    });
    this.shopLeaveBtn?.addEventListener("click", () => {
      if (this._onLeaveShop) this._onLeaveShop();
    });

    // keep initial % labels correct
    queueMicrotask(() => {
      if (this.bgmPct) this.bgmPct.textContent = `${Math.round(this.bgmVolume * 100)}%`;
      if (this.sfxPct) this.sfxPct.textContent = `${Math.round(this.sfxVolume * 100)}%`;
    });
  }

  // ------------------------------
  // HUD
  // ------------------------------
  setBest(v) {
    if (this.bestEl) this.bestEl.textContent = String(v | 0);
  }

  updateHUD({ hp, hpMax, focus, focusMax, score, combo, room, force, buildText, mapName, mapGimmick, roomTitle }) {
    const hpT = clamp(hp / hpMax, 0, 1);
    const fT = clamp(focus / focusMax, 0, 1);
    this.hpBar.style.transform = `scaleX(${hpT})`;
    this.focusBar.style.transform = `scaleX(${fT})`;

    // numeric meters (current / max)
    if (this.hpText) {
      const hi = Math.max(0, Math.min(Math.round(hp), Math.round(hpMax || 0)));
      const hm = Math.max(1, Math.round(hpMax || 0));
      this.hpText.textContent = `${hi}/${hm}`;
    }
    if (this.focusText) {
      const fi = Math.max(0, Math.min(Math.round(focus), Math.round(focusMax || 0)));
      const fm = Math.max(1, Math.round(focusMax || 0));
      this.focusText.textContent = `${fi}/${fm}`;
    }

    this.scoreEl.textContent = String(score | 0);
    const c = Number(combo);
    this.comboEl.textContent = (c > 1) ? `COMBO x${c.toFixed(1)}` : "";
    if (this.roomEl) this.roomEl.textContent = String(room | 0);

    if (this.mapNameEl) this.mapNameEl.textContent = mapName || "";
    if (this.mapGimmickEl) {
      const rt = (roomTitle && String(roomTitle).trim()) ? String(roomTitle).trim() : "";
      const gg = (mapGimmick && String(mapGimmick).trim()) ? String(mapGimmick).trim() : "";
      if (rt && gg) this.mapGimmickEl.textContent = `${rt}: ${gg}`;
      else this.mapGimmickEl.textContent = rt || gg || "";
    }
    if (this.stageLineEl) this.stageLineEl.style.display = (mapName || mapGimmick || roomTitle) ? "" : "none";
    if (this.forceEl) this.forceEl.textContent = String(force | 0);
    if (this.buildEl) this.buildEl.textContent = buildText || "Build: -";
  }

  // ------------------------------
  // Overlay visibility
  // ------------------------------
  show(mode) {
    const m = String(mode || "");
    this._mode = m;
    this.overlay.classList.add("show");

    // Enable scene-specific CSS (panel accent, background tint, etc.)
    try {
      this.overlay.dataset.mode = m;
      document.body.dataset.scene = m;
    } catch (e) { }

    const isTitle = m === "title";
    const isPause = m === "pause";
    const isOver = m === "gameover";
    const isReward = m === "reward";
    const isShop = m === "shop";

    // Force wide title layout even if data-mode attr is missing/mismatched
    const panel = this.overlay ? this.overlay.querySelector(".panel") : null;
    if (panel) panel.classList.toggle("panelWideTitle", isTitle);

    this.startBtn.classList.toggle("hidden", !(isTitle));
    this.resumeBtn.classList.toggle("hidden", !(isPause));
    this.restartBtn.classList.toggle("hidden", !(isOver || isPause));
    if (this.titleBtn) this.titleBtn.classList.toggle("hidden", !(isPause));

    // reward/shop should hide the main menu buttons
    this.menuButtons.classList.toggle("hidden", isReward || isShop);

    this.rewardArea.classList.toggle("hidden", !isReward);
    if (this.shopArea) this.shopArea.classList.toggle("hidden", !isShop);

    if (this.focusArea) {
      const showFocus = isTitle || isOver;
      this.focusArea.classList.toggle("hidden", !showFocus);
    }

    if (this.mpArea) {
      const showMp = isTitle || isOver;
      this.mpArea.classList.toggle("hidden", !showMp);
    }


    this._updatePartyHudVisibility();

    // Hide audio controls while choosing upgrades or in the shop.
    // Keep Reduced motion visible (user can still toggle perf).
    const hideAudio = isReward || isShop;
    this._setAudioVisible(!hideAudio);
  }

  hide() {
    this._mode = "hidden";
    this.overlay.classList.remove("show");

    // Back to gameplay styling
    try {
      this.overlay.dataset.mode = "";
      document.body.dataset.scene = "run";
    } catch (e) { }
    this.menuButtons.classList.remove("hidden");
    this.rewardArea.classList.add("hidden");
    if (this.shopArea) this.shopArea.classList.add("hidden");

    // In hidden/menu modes, show audio controls again.
    this._setAudioVisible(true);
    this._updatePartyHudVisibility();
  }

  // ------------------------------
  // Reward
  // ------------------------------
  showReward(room, choices, isBoss = false) {
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
      if (this._onPick) this._onPick(u);
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
        <div class="hint">CLICK • [${idx + 1}]</div>
      `;

      card.addEventListener("mouseenter", () => setSelected(idx));
      card.addEventListener("focus", () => setSelected(idx));
      card.addEventListener("click", () => pick(u));

      card.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setSelected(selected - 1);
          this.rewardCards.querySelectorAll(".card")[selected]?.focus();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setSelected(selected + 1);
          this.rewardCards.querySelectorAll(".card")[selected]?.focus();
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick(u);
        }
      });
      this.rewardCards.appendChild(card);
    });

    setSelected(0);
  }

  onPickReward(fn) { this._onPick = fn; }

  // ------------------------------
  // Shop
  // ------------------------------
  showShop(room, force, stock, rerollCost, nextIsBoss = false) {
    if (!this.shopArea) return;
    this._mode = "shop";
    this.show("shop");

    this.shopTitle.textContent = nextIsBoss ? "SHOP (BOSS NEXT)" : "SHOP";
    if (this.shopForce) this.shopForce.textContent = String(force | 0);
    if (this.shopRerollCost) this.shopRerollCost.textContent = String(rerollCost | 0);

    this.shopCards.innerHTML = "";

    const buy = (idx) => {
      if (this._onBuyShop) this._onBuyShop(idx);
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
      const canAfford = (force | 0) >= (it.cost | 0);
      const sold = !!it.sold;

      if (!canAfford) card.classList.add("disabled");
      if (sold) card.classList.add("sold");

      const hint = sold ? "SOLD" : (canAfford ? "CLICK TO BUY" : "NOT ENOUGH FORCE");

      card.innerHTML = `
        <div class="tag">${tag}</div>
        <div class="name">${it.name}</div>
        <div class="stats">${stats}</div>
        <div class="desc">${desc}</div>
        <div class="cost">COST: <span class="num">${it.cost | 0}</span></div>
        <div class="hint">${hint}</div>
      `;

      card.addEventListener("click", () => {
        if (sold) return;
        if (!canAfford) return;
        buy(idx);
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (sold || !canAfford) return;
          buy(idx);
        }
      });

      this.shopCards.appendChild(card);
    });
  }

  onBuyShop(fn) { this._onBuyShop = fn; }
  onRerollShop(fn) { this._onRerollShop = fn; }
  onLeaveShop(fn) { this._onLeaveShop = fn; }

  // ------------------------------
  // Audio hooks (main.js expects these names)
  // ------------------------------
  onBgmVolumeChange(fn) { this._onBgmVol = fn; }

  // main.js uses onSfxVolumeChange; older patches used onSeVolumeChange.
  // Provide both so either main.js works.
  onSfxVolumeChange(fn) { this._onSfxVol = fn; }
  onSeVolumeChange(fn) { this._onSfxVol = fn; }

  // Some builds call this to push UI state from storage.
  // Accepts { muted, reducedMotion, bgm, sfx } (current) or { bgmVolume, sfxVolume/seVolume } (older).
  setAudioUI(state = {}) {
    if (!state || typeof state !== "object") return;

    if (this.muteChk && state.muted !== undefined) this.muteChk.checked = !!state.muted;
    if (this.motionChk && state.reducedMotion !== undefined) this.motionChk.checked = !!state.reducedMotion;

    const bgm = (state.bgmVolume !== undefined) ? state.bgmVolume : state.bgm;
    const sfx =
      (state.sfxVolume !== undefined) ? state.sfxVolume :
        (state.sfx !== undefined) ? state.sfx :
          (state.seVolume !== undefined) ? state.seVolume :
            state.se;

    if (this.bgmVol && bgm !== undefined) {
      this._setSlider01(this.bgmVol, this.bgmPct, bgm);
      this._bgmVal = clamp(Number(bgm) || 0, 0, 1);
    }
    if (this.sfxVol && sfx !== undefined) {
      this._setSlider01(this.sfxVol, this.sfxPct, sfx);
      this._sfxVal = clamp(Number(sfx) || 0, 0, 1);
    }
  }

  // ------------------------------
  // Menu hooks (main.js expects these)
  // ------------------------------
  onStart(fn) { this.startBtn.addEventListener("click", fn); }
  onResume(fn) { this.resumeBtn.addEventListener("click", fn); }
  onRestart(fn) { this.restartBtn.addEventListener("click", fn); }
  onBackToTitle(fn) { this._onBackToTitle = fn; }
  onMuteChange(fn) { this.muteChk.addEventListener("change", fn); }
  onMotionChange(fn) { this.motionChk.addEventListener("change", fn); }

  get reducedMotion() { return !!this.motionChk?.checked; }
  get muted() { return !!this.muteChk?.checked; }

  // main.js reads these directly.
  get bgmVolume() {
    if (this.bgmVol) return this._readSlider01(this.bgmVol);
    return clamp(Number(this._bgmVal) || 0, 0, 1);
  }
  get sfxVolume() {
    if (this.sfxVol) return this._readSlider01(this.sfxVol);
    return clamp(Number(this._sfxVal) || 0, 0, 1);
  }


  // ------------------------------
  // FOCUS mode select
  // ------------------------------
  getSelectedFocusModeId() {
    return this._focusModeId || defaultFocusModeId();
  }

  // Back-compat: main.js expects this method name.
  getFocusModeId() {
    return this.getSelectedFocusModeId();
  }

  setSelectedFocusModeId(id, silent = false) {
    const m = getFocusMode(id);
    this._focusModeId = m.id;
    if (!silent) this._safeSet("nw_focusModeId", m.id);

    if (this.focusDescEl) {
      const t = String(m.details || m.desc || m.tagline || "").trim();
      this.focusDescEl.textContent = t;
    }

    if (this.focusCardsEl) {
      const cards = Array.from(this.focusCardsEl.querySelectorAll(".focusCard"));
      cards.forEach((c) => c.classList.toggle("selected", (c.dataset.focusId === m.id)));
    }
  }

  _ensureFocusUI() {
    const panel = this.overlay?.querySelector?.(".panel") || this.overlay;
    const before = document.getElementById("menuButtons") || null;

    if (!this.focusArea) {
      const area = document.createElement("div");
      area.id = "focusArea";
      area.className = "focusArea";
      area.innerHTML = `
        <h2 class="focusTitle">FOCUS MODE</h2>
        <div id="focusCards" class="cards focusCards"></div>
        <div id="focusDesc" class="focusDesc"></div>
        <p class="tiny focusHint">クリックで選択。1〜8でも選択。Spaceで発動。</p>
      `;
      if (before && before.parentElement === panel) {
        panel.insertBefore(area, before);
      } else {
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

    if (!this.focusCardsEl) return;

    this._focusModes = listFocusModes();
    this.focusCardsEl.innerHTML = "";

    this._focusModes.forEach((m, idx) => {
      const card = document.createElement("div");
      card.className = "card focusCard";
      card.tabIndex = 0;
      card.dataset.focusId = m.id;
      const tag = `MODE ${idx + 1}`;
      const stats = String(m.tagline || m.desc || "").trim();

      card.innerHTML = `
        <div class="tag">${tag}</div>
        <div class="name">${m.name}</div>
        <div class="desc">${stats}</div>
        <div class="hint">CLICK • [${idx + 1}]</div>
      `; const pick = () => this.setSelectedFocusModeId(m.id);

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
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      });

      this.focusCardsEl.appendChild(card);
    });

    if (!this._focusKeyBound) {
      this._focusKeyBound = true;
      window.addEventListener("keydown", (e) => {
        if (!this.overlay?.classList?.contains("show")) return;
        if (!this.focusArea || this.focusArea.classList.contains("hidden")) return;

        const code = e.code || "";
        let n = -1;
        if (code.startsWith("Digit")) n = Number(code.slice(5));
        else if (code.startsWith("Numpad")) n = Number(code.slice(6));

        if (n >= 1 && n <= 8) {
          e.preventDefault();
          const mode = this._focusModes?.[n - 1];
          if (mode) this.setSelectedFocusModeId(mode.id);
        }
      }, { passive: false });
    }
  }

  // ------------------------------
  // Multiplayer (Lobby)
  // ------------------------------
  onMpHost(fn) { this._onMpHost = fn; }
  onMpJoin(fn) { this._onMpJoin = fn; }
  onMpLeave(fn) { this._onMpLeave = fn; }
  onMpReady(fn) { this._onMpReady = fn; }
  onMpStart(fn) { this._onMpStart = fn; }
  onMpServerChange(fn) { this._onMpServerChange = fn; }
  onMpNameChange(fn) { this._onMpNameChange = fn; }

  getMpServer() {
    return DEFAULT_LOBBY_SERVER;
  }
  getMpRoomCode() {
    return String(this.mpRoomEl?.value || "").trim().toUpperCase();
  }
  getMpName() {
    return String(this.mpNameEl?.value || this._mpView.name || "").trim();
  }

  setMultiplayerState(view = {}) {
    // Merge
    this._mpView = Object.assign({}, this._mpView || {}, view || {});
    this._mpView.server = DEFAULT_LOBBY_SERVER;

    if (this.mpServerEl) {
      const sv = DEFAULT_LOBBY_SERVER;
      if (this.mpServerEl.value !== sv) this.mpServerEl.value = sv;
    }
    if (this.mpNameEl) {
      const nv = String(this._mpView.name || "");
      if (this.mpNameEl.value !== nv) this.mpNameEl.value = nv;
    }

    const connecting = !!this._mpView.connecting;
    const connected = !!this._mpView.connected;
    const isHost = !!this._mpView.isHost;
    const room = String(this._mpView.roomCode || "").trim().toUpperCase();
    const selfId = String(this._mpView.selfId || "");
    const hostId = String(this._mpView.hostId || "");
    const members = Array.isArray(this._mpView.members) ? this._mpView.members : [];
    const ready = !!this._mpView.ready;
    const err = String(this._mpView.error || "");

    // Pill
    if (this.mpPillEl) {
      let label = "OFFLINE";
      let cls = "state-off";
      if (connecting) { label = "CONNECTING"; cls = "state-connecting"; }
      else if (connected) { label = isHost ? "HOST" : "CLIENT"; cls = isHost ? "state-host" : "state-client"; }
      this.mpPillEl.textContent = label;
      this.mpPillEl.classList.remove("state-off", "state-connecting", "state-host", "state-client");
      this.mpPillEl.classList.add(cls);
    }

    // Buttons enabled
    const serverOk = !!this.getMpServer();
    if (this.mpHostBtn) { this.mpHostBtn.disabled = connecting || connected || !serverOk; }
    if (this.mpJoinBtn) { this.mpJoinBtn.disabled = connecting || connected || !serverOk || !this.getMpRoomCode(); }
    if (this.mpRoomEl) { this.mpRoomEl.disabled = connecting || connected || !serverOk; }
    if (this.mpLeaveBtn) { this.mpLeaveBtn.disabled = !connecting && !connected; }
    if (this.mpReadyBtn) { this.mpReadyBtn.disabled = !connected; }
    if (this.mpStartBtn) { this.mpStartBtn.disabled = true; }

    // Room row
    if (this.mpRoomRowEl) {
      const show = connecting || connected;
      this.mpRoomRowEl.classList.toggle("hidden", !show);
    }
    if (this.mpRoomLabelEl) {
      this.mpRoomLabelEl.textContent = room || "-----";
    }
    if (this.mpCopyBtn) {
      this.mpCopyBtn.disabled = !room;
    }

    // Ready button label
    if (this.mpReadyBtn) {
      this.mpReadyBtn.textContent = ready ? "READY ✓" : "READY";
      this.mpReadyBtn.classList.toggle("on", ready);
    }

    // Start button (inside MP panel)
    if (this.mpStartBtn) {
      if (!connected) {
        this.mpStartBtn.textContent = "START";
        this.mpStartBtn.disabled = true;
      } else if (isHost) {
        const allReady = members.length ? members.every(m => !!m.ready) : true;
        this.mpStartBtn.textContent = "START";
        this.mpStartBtn.disabled = !allReady;
      } else {
        this.mpStartBtn.textContent = "WAIT";
        this.mpStartBtn.disabled = true;
      }
    }

    // Players list
    if (this.mpPlayersEl) {
      if (!connected) {
        this.mpPlayersEl.innerHTML = "";
      } else {
        const lines = members.map((m) => {
          const nm = String(m.name || "Player");
          const r = !!m.ready;
          const isH = (hostId && m.id) ? (m.id === hostId) : !!m.host;
          const you = (selfId && m.id) ? (m.id === selfId) : false;
          const tag = isH ? "HOST" : (you ? "YOU" : "");
          const rr = r ? "✓" : "·";
          return `<div class="mpPl ${you ? "me" : ""}">
            <span class="mpDot ${r ? "ok" : "no"}">${rr}</span>
            <span class="mpName">${this._escapeHtml(nm)}</span>
            ${tag ? `<span class="mpTag">${tag}</span>` : ""}
          </div>`;
        }).join("");
        this.mpPlayersEl.innerHTML = lines;
      }
    }

    // Status line
    if (this.mpStatusEl) {
      if (err) {
        this.mpStatusEl.textContent = err;
      } else if (connecting) {
        this.mpStatusEl.textContent = "Connecting...";
      } else if (connected) {
        if (isHost) {
          const allReady = members.length ? members.every(m => !!m.ready) : true;
          this.mpStatusEl.textContent = allReady ? "All ready. Press START." : "Waiting for READY...";
        } else {
          this.mpStatusEl.textContent = "Waiting for host...";
        }
      } else {
        this.mpStatusEl.textContent = "";
      }
    }

    // Party HUD (in-run quick view)
    this._updatePartyHud(members, { connected, room, hostId, selfId });

    // Start button behavior
    if (this.startBtn) {
      if (connected) {
        if (isHost) {
          const allReady = members.length ? members.every(m => !!m.ready) : true;
          this.startBtn.textContent = "START (HOST)";
          this.startBtn.disabled = !allReady;
        } else {
          this.startBtn.textContent = "WAITING HOST";
          this.startBtn.disabled = true;
        }
      } else {
        this.startBtn.textContent = "START";
        this.startBtn.disabled = false;
      }
    }
  }

  // ------------------------------
  // Party HUD (shows current members during gameplay/pause)
  // ------------------------------
  _ensurePartyHUD() {
    if (this._partyHudReady) return;
    this._partyHudReady = true;
    this._ensurePartyHUDStyle();

    const hud = document.getElementById("hud");
    if (!hud) return;

    let box = document.getElementById("partyHud");
    if (!box) {
      box = document.createElement("div");
      box.id = "partyHud";
      box.className = "partyHud hidden";
      box.innerHTML = `
        <div class="partyHdr">
          <span class="partyTitle">PARTY</span>
          <span id="partyRoom" class="partyRoom"></span>
        </div>
        <div id="partyList" class="partyList"></div>
      `;
      hud.appendChild(box);
    }
    this.partyHud = box;
    this.partyRoomEl = box.querySelector("#partyRoom");
    this.partyListEl = box.querySelector("#partyList");
  }

  _ensurePartyHUDStyle() {
    if (document.getElementById("partyHudStyle")) return;
    const st = document.createElement("style");
    st.id = "partyHudStyle";
    st.textContent = `
      .partyHud{
        position: fixed;
        right: 14px;
        top: 14px;
        z-index: 30;
        width: min(320px, calc(100vw - 28px));
        background: rgba(10, 12, 28, 0.60);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 14px;
        padding: 10px 10px 8px;
        color: rgba(255,255,255,0.92);
        font-family: ui-sans-serif, system-ui, -apple-system, "Noto Sans JP", sans-serif;
        backdrop-filter: blur(8px);
      }
      body[data-scene="run"] .partyHud{ backdrop-filter: none; } /* perf: no blur in run */
      .partyHud.hidden{ display:none; }
      .partyHdr{
        display:flex;
        align-items:baseline;
        justify-content:space-between;
        gap:10px;
        margin-bottom: 6px;
      }
      .partyTitle{
        letter-spacing: .06em;
        font-weight: 700;
        font-size: 12px;
        opacity: .9;
      }
      .partyRoom{
        font-size: 11px;
        opacity: .7;
      }
      .partyList{
        display:flex;
        flex-direction:column;
        gap: 4px;
      }
      .partyRow{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
        padding: 6px 8px;
        border-radius: 10px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .partyRow.me{ border-color: rgba(255,255,255,0.18); }
      .partyLeft{
        display:flex;
        align-items:center;
        gap: 8px;
        min-width: 0;
      }
      .partyDot{
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.35);
        flex: 0 0 auto;
      }
      .partyDot.ok{ background: rgba(120, 255, 200, 0.85); }
      .partyDot.no{ background: rgba(255, 120, 180, 0.75); }
      .partyName{
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
      }
      .partyTags{
        display:flex;
        align-items:center;
        gap: 6px;
        flex: 0 0 auto;
        font-size: 10px;
        opacity: .85;
      }
      .partyTag{
        padding: 2px 6px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.06);
      }
    `;
    document.head.appendChild(st);
  }

  _updatePartyHud(members, { connected, room, hostId, selfId } = {}) {
    if (!this.partyHud || !this.partyListEl) {
      this._ensurePartyHUD();
    }
    if (!this.partyHud || !this.partyListEl) return;

    if (!connected || !Array.isArray(members) || !members.length) {
      this.partyListEl.innerHTML = "";
      if (this.partyRoomEl) this.partyRoomEl.textContent = "";
      this._updatePartyHudVisibility();
      return;
    }

    if (this.partyRoomEl) {
      const rc = String(room || "").trim().toUpperCase();
      this.partyRoomEl.textContent = rc ? (`ROOM ${rc}`) : "";
    }

    const html = members.map((m) => {
      const nm = String(m.name || "Player");
      const r = !!m.ready;
      const isH = (hostId && m.id) ? (m.id === hostId) : !!m.host;
      const you = (selfId && m.id) ? (m.id === selfId) : false;
      const tags = [];
      if (isH) tags.push("HOST");
      if (you && !isH) tags.push("YOU");
      return `
        <div class="partyRow ${you ? "me" : ""}">
          <div class="partyLeft">
            <span class="partyDot ${r ? "ok" : "no"}"></span>
            <span class="partyName">${this._escapeHtml(nm)}</span>
          </div>
          <div class="partyTags">
            ${tags.map(t => `<span class="partyTag">${t}</span>`).join("")}
          </div>
        </div>
      `;
    }).join("");

    this.partyListEl.innerHTML = html;
    this._updatePartyHudVisibility();
  }

  _updatePartyHudVisibility() {
    if (!this.partyHud) return;
    const connected = !!(this._mpView && this._mpView.connected);
    const hasMembers = connected && Array.isArray(this._mpView.members) && this._mpView.members.length > 0;
    const mode = String(this._mode || "");
    const show = hasMembers && (mode === "hidden" || mode === "pause");
    this.partyHud.classList.toggle("hidden", !show);
  }

  _ensureMultiplayerUI() {
    const panel = this.overlay?.querySelector?.(".panel") || this.overlay;
    const before = document.getElementById("menuButtons") || null;

    this.mpArea = document.getElementById("mpArea") || null;
    if (!this.mpArea) {
      const area = document.createElement("div");
      area.id = "mpArea";
      area.className = "mpArea";
      area.innerHTML = `
        <div class="mpHeader">
          <div class="mpTitle">MULTIPLAYER <span class="mini">(BETA)</span></div>
          <div id="mpPill" class="mpPill state-off">OFFLINE</div>
        </div>

        <div class="mpGrid">
          <label class="mpLine">
            <span class="mpLabel">Server</span>
            <input id="mpServer" class="mpInput" placeholder="https://nwr-lobby.kasuteranight.workers.dev" readonly disabled />
          </label>
          <label class="mpLine">
            <span class="mpLabel">Name</span>
            <input id="mpName" class="mpInput" placeholder="Player" />
          </label>

          <div class="mpRow">
            <button id="mpHostBtn" class="mpBtn" type="button">HOST</button>
            <input id="mpRoom" class="mpInput mpRoom" placeholder="ROOM CODE" />
            <button id="mpJoinBtn" class="mpBtn" type="button">JOIN</button>
          </div>

          <div id="mpRoomRow" class="mpRoomRow hidden">
            <div class="mpRoomLabel">ROOM: <span id="mpRoomLabel">-----</span></div>
            <div class="mpRoomBtns">
              <button id="mpCopyBtn" class="mpBtn" type="button">COPY</button>
              <button id="mpLeaveBtn" class="mpBtn" type="button">LEAVE</button>
            </div>
          </div>

          <div id="mpPlayers" class="mpPlayers"></div>

          <div class="mpBottom">
            <button id="mpReadyBtn" class="mpBtn" type="button">READY</button>
            <button id="mpStartBtn" class="mpBtn" type="button">START</button>
            <div id="mpStatus" class="mpStatus"></div>
          </div>
        </div>
        <p class="tiny mpHint">サーバURLを入れて HOST で部屋作成。JOIN はコード入力。準備できたら READY。ホストが START。
        </p>
      `;

      if (before && before.parentElement === panel) {
        panel.insertBefore(area, before);
      } else {
        panel.appendChild(area);
      }
      this.mpArea = area;
    }

    // Bind elements
    this.mpServerEl = document.getElementById("mpServer") || null;
    this.mpNameEl = document.getElementById("mpName") || null;
    this.mpHostBtn = document.getElementById("mpHostBtn") || null;
    this.mpJoinBtn = document.getElementById("mpJoinBtn") || null;
    this.mpRoomEl = document.getElementById("mpRoom") || document.getElementById("mpRoom") || null;
    // We used id="mpRoom" above
    if (!this.mpRoomEl) this.mpRoomEl = document.getElementById("mpRoom");
    this.mpPillEl = document.getElementById("mpPill") || null;
    this.mpRoomRowEl = document.getElementById("mpRoomRow") || null;
    this.mpRoomLabelEl = document.getElementById("mpRoomLabel") || null;
    this.mpCopyBtn = document.getElementById("mpCopyBtn") || null;
    this.mpLeaveBtn = document.getElementById("mpLeaveBtn") || null;
    this.mpPlayersEl = document.getElementById("mpPlayers") || null;
    this.mpReadyBtn = document.getElementById("mpReadyBtn") || null;
    this.mpStartBtn = document.getElementById("mpStartBtn") || null;
    this.mpStatusEl = document.getElementById("mpStatus") || null;

    // Initial values
    if (this.mpServerEl) {
      this.mpServerEl.value = DEFAULT_LOBBY_SERVER;
      this.mpServerEl.readOnly = true;
      this.mpServerEl.disabled = true;
      const line = this.mpServerEl.closest?.(".mpLine");
      if (line) line.style.display = "none";
    }
    if (this.mpNameEl) this.mpNameEl.value = String(this._mpView.name || "");
  }

  _wireMultiplayerUI() {
    if (this.mpServerEl) {
      this.mpServerEl.addEventListener("input", () => {
        // light refresh without spamming callbacks
        this._mpView.server = String(this.mpServerEl.value || "").trim();
        this.setMultiplayerState(this._mpView);
      });
    }

    if (this.mpNameEl) {
      this.mpNameEl.addEventListener("change", () => {
        const v = String(this.mpNameEl.value || "").trim();
        this._mpView.name = v || "Player";
        this._mpPersist?.();
        this._mpRender?.();
      });
    }

    if (this.mpRoomEl) {
      this.mpRoomEl.addEventListener("input", () => {
        this.setMultiplayerState(this._mpView);
      });
      this.mpRoomEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (this._onMpJoin) this._onMpJoin(this.getMpRoomCode());
        }
      });
    }

    this.mpHostBtn?.addEventListener("click", () => {
      if (this._onMpHost) this._onMpHost();
    });
    this.mpJoinBtn?.addEventListener("click", () => {
      if (this._onMpJoin) this._onMpJoin(this.getMpRoomCode());
    });
    this.mpLeaveBtn?.addEventListener("click", () => {
      if (this._onMpLeave) this._onMpLeave();
    });
    this.mpReadyBtn?.addEventListener("click", () => {
      if (this._onMpReady) this._onMpReady();
    });
    this.mpStartBtn?.addEventListener("click", () => {
      // Host-only start (enabled only when everyone is READY)
      if (this._onMpStart) { this._onMpStart(); return; }
      // Fallback: reuse the main START button wiring
      try { this.startBtn?.click(); } catch (_e) { }
    });
    this.mpCopyBtn?.addEventListener("click", async () => {
      const code = String(this._mpView.roomCode || "").trim();
      if (!code) return;
      const text = code;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // fallback
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        if (this.mpStatusEl) this.mpStatusEl.textContent = "Copied.";
        setTimeout(() => {
          if (this.mpStatusEl && this.mpStatusEl.textContent === "Copied.") this.mpStatusEl.textContent = "";
        }, 900);
      } catch (_) {
        if (this.mpStatusEl) this.mpStatusEl.textContent = "Copy failed.";
      }
    });
  }

  _escapeHtml(s) {
    return String(s || "").replace(/[&<>\"']/g, (c) => {
      if (c === "&") return "&amp;";
      if (c === "<") return "&lt;";
      if (c === ">") return "&gt;";
      if (c === "\"") return "&quot;";
      if (c === "'") return "&#39;";
      return c;
    });
  }

  _safeGet(key) {
    try { return localStorage.getItem(key); } catch (_e) { return null; }
  }

  _safeSet(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (_e) { }
  }

  _applyDebugHudClass() {
    try {
      document.body.classList.toggle("debugHud", !!this._debugHud);
    } catch (_e) { }
  }
  // ------------------------------
  // Internal helpers
  // ------------------------------
  _findAudioBlock(sliderEl, pctEl) {
    const el = sliderEl || pctEl;
    if (!el) return null;
    return el.closest?.(".audioRow")
      || el.closest?.(".audio-ui")
      || el.closest?.(".audio")
      || el.parentElement
      || null;
  }

  setSettingsOpen(open, persist = true) {
    this._settingsOpen = !!open;
    if (persist) this._safeSet("nw_settingsOpen", this._settingsOpen ? "1" : "0");
    this._applySettingsOpen();
  }

  _applySettingsOpen() {
    if (this.settingsPanel) this.settingsPanel.classList.toggle("open", !!this._settingsOpen);
    if (this.settingsBtn) this.settingsBtn.classList.toggle("active", !!this._settingsOpen);
  }

  _setAudioVisible(visible) {
    // Hide mute + BGM/SFX slider blocks; keep Reduced motion visible.
    if (this._muteLabel) this._muteLabel.classList.toggle("hidden", !visible);
    if (this._bgmBlock) this._bgmBlock.classList.toggle("hidden", !visible);
    if (this._sfxBlock) this._sfxBlock.classList.toggle("hidden", !visible);
    if (this.settingsBtn) this.settingsBtn.classList.toggle("hidden", !visible);
    if (this.settingsPanel) this.settingsPanel.classList.toggle("hidden", !visible);
    if (!visible) this.setSettingsOpen(false, false);
  }

  _wireVolumeSlider(sliderEl, pctEl, emit) {
    if (!sliderEl) return;
    const update = () => {
      const v01 = this._readSlider01(sliderEl);
      if (pctEl) pctEl.textContent = `${Math.round(v01 * 100)}%`;
      emit(v01);
    };
    // input = realtime while dragging, change = final
    sliderEl.addEventListener("input", update);
    sliderEl.addEventListener("change", update);
  }

  _readSlider01(sliderEl) {
    const raw = Number(sliderEl.value);
    const max = Number(sliderEl.max || 1);
    const min = Number(sliderEl.min || 0);
    if (!isFinite(raw) || !isFinite(max) || !isFinite(min) || max === min) return 0;
    if (max > 1.5) {
      // treat as 0..100 (or similar)
      return clamp((raw - min) / (max - min), 0, 1);
    }
    return clamp(raw, 0, 1);
  }

  _setSlider01(sliderEl, pctEl, v01) {
    if (!sliderEl) return;
    const v = clamp(Number(v01) || 0, 0, 1);
    const max = Number(sliderEl.max || 1);
    const min = Number(sliderEl.min || 0);
    if (max > 1.5) {
      sliderEl.value = String(Math.round(min + v * (max - min)));
    } else {
      sliderEl.value = String(v);
    }
    if (pctEl) pctEl.textContent = `${Math.round(v * 100)}%`;
  }
}