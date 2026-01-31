export class SceneManager {
  constructor(engine, scenes = null, initialId = "title") {
    this.engine = engine;
    this.scenes = scenes || {};
    this.currentId = "";
    this.current = null;

    // Back-reference so scenes can request transitions.
    for (const k of Object.keys(this.scenes)) {
      const s = this.scenes[k];
      if (s) s.manager = this;
    }

    // Transition (fade) state
    this._fade = {
      active: false,
      phase: "out", // out -> in
      t: 0,
      dur: 0.16,
      toId: "",
      data: null,
      fromId: "",
    };
    this._targetId = initialId;

    // main.js typically calls register(...) after construction.
    this.currentId = initialId;
    this.current = this.scenes[initialId] || null;
  }

  register(id, scene) {
    if (!id || !scene) return;
    this.scenes[id] = scene;
    scene.manager = this;

    // If we were waiting for this scene, activate it now (instant).
    if (id === this.currentId && !this.current) {
      this.current = scene;
      if (typeof scene.enter === "function") {
        try {
          scene.enter(null, null);
        } catch (e) {
          console.warn("scene enter failed", id, e);
        }
      }
    }
  }

  _sceneForGameState(state) {
    // Keep this mapping simple: Game owns the authoritative state (for now).
    // IMPORTANT: scene IDs are "run"/"pause" (not "playing"/"paused").
    if (state === "playing") return "run";
    if (state === "paused") return "pause";
    if (state === "reward") return "reward";
    if (state === "shop") return "shop";
    if (state === "gameover") return "gameover";
    return "title";
  }

  syncToGameState() {
    const g = this.engine?.game;
    if (!g) return;
    const want = this._sceneForGameState(g.state);
    // During a fade transition, compare against the target, not the currentId,
    // so we don't keep restarting the fade every frame.
    const cur = (this._fade.active && this._targetId) ? this._targetId : this.currentId;
    if (want && want !== cur) this.set(want);
  }

  // backward-compatible alias
  syncFromGameState() {
    this.syncToGameState();
  }

  set(id, data, opts = null) {
    if (!id) return;

    const instant = !!(opts && opts.instant);

    // If we already target this scene, do nothing.
    if (!instant && id === this._targetId) return;
    if (instant && id === this.currentId) return;

    // If we have no current scene yet, just jump.
    if (!this.current) {
      this.currentId = id;
      this._targetId = id;
      this.current = this.scenes[id] || null;
      if (this.current && typeof this.current.enter === "function") {
        try {
          this.current.enter(null, data);
        } catch (e) {
          console.warn("scene enter failed", id, e);
        }
      }
      return;
    }

    if (instant) {
      this._applySwap(id, data);
      return;
    }

    // Start (or retarget) a fade transition.
    this._targetId = id;
    this._fade.active = true;
    this._fade.phase = "out";
    this._fade.t = 0;
    this._fade.toId = id;
    this._fade.data = data;
    this._fade.fromId = this.currentId;

    // Prevent accidental input bleed during scene transitions.
    if(this.engine && this.engine.input && typeof this.engine.input.setLocked === "function"){
      this.engine.input.setLocked(true);
    }
  }

  _applySwap(id, data) {
    const prev = this.current;
    const prevId = this.currentId;

    if (prev && typeof prev.exit === "function") {
      try {
        prev.exit(id);
      } catch (e) {
        console.warn("scene exit failed", prevId, e);
      }
    }

    this.currentId = id;
    this.current = this.scenes[id] || null;

    if (this.current && typeof this.current.enter === "function") {
      try {
        this.current.enter(prevId, data);
      } catch (e) {
        console.warn("scene enter failed", id, e);
      }
    }
  }

  _tickFade(dt) {
    if (!this._fade.active) return;

    this._fade.t += dt;
    const dur = Math.max(0.001, this._fade.dur || 0.16);

    if (this._fade.phase === "out") {
      if (this._fade.t >= dur) {
        // swap scene at peak fade
        this._applySwap(this._fade.toId, this._fade.data);
        this._fade.phase = "in";
        this._fade.t = 0;
      }
      return;
    }

    // phase === "in"
    if (this._fade.t >= dur) {
      this._fade.active = false;
      this._fade.t = 0;
      this._fade.data = null;
      this._fade.fromId = "";
    }
  }

  _fadeAlpha() {
    if (!this._fade.active) return 0;
    const dur = Math.max(0.001, this._fade.dur || 0.16);
    const t = Math.max(0, Math.min(1, (this._fade.t || 0) / dur));
    if (this._fade.phase === "out") return t;      // 0 -> 1
    return 1 - t;                                  // 1 -> 0
  }

  handleGlobalHotkeys() {
    const { input, game, ui } = this.engine;
    if (!input || !game || !ui) return;

    // Escape: pause/resume/leave shop.
    if (input.consumePressed("Escape")) {
      if (game.state === "playing") {
        game.pause();
        ui.show("pause");
        this.set("pause", null, { instant: true });
      } else if (game.state === "paused") {
        ui.hide();
        game.resume();
        this.set("run", null, { instant: true });
      } else if (game.state === "shop") {
        ui.hide();
        game.leaveShop();
        this.set("run", null, { instant: true });
      }
    }

    // R: quick restart from anywhere meaningful.
    if (input.consumePressed("KeyR")) {
      if (
        game.state === "playing" ||
        game.state === "paused" ||
        game.state === "gameover" ||
        game.state === "reward" ||
        game.state === "shop"
      ) {
        if (typeof this.engine.restartRun === "function") {
          this.engine.restartRun();
        } else {
          if (typeof this.engine.unlockAudioOnce === "function") this.engine.unlockAudioOnce();
          ui.hide();
          const fm = (typeof ui.getFocusModeId === "function") ? ui.getFocusModeId() : "chrono";
          game.start(fm);
          this.set("run", null, { instant: true });
        }
      }
    }
  }

  update(dt) {
    // Lock input while the screen is fading to avoid accidental actions.
    if(this.engine && this.engine.input && typeof this.engine.input.setLocked === "function"){
      this.engine.input.setLocked(!!(this._fade && this._fade.active));
    }

    this.syncToGameState();
    this.handleGlobalHotkeys();

    this._tickFade(dt);

    if (this.current && typeof this.current.update === "function") {
      try {
        this.current.update(dt);
      } catch (e) {
        console.warn("scene update failed", this.currentId, e);
      }
    }
  }

  render(dt) {
    if (this.current && typeof this.current.render === "function") {
      try {
        this.current.render(dt);
      } catch (e) {
        console.warn("scene render failed", this.currentId, e);
      }
    }

    // Fade overlay
    const a = this._fadeAlpha();
    if (a > 0.0001) {
      const ctx = this.engine?.ctx;
      if (ctx) {
        const W = (typeof this.engine.W === "function") ? this.engine.W() : (this.engine.canvas ? this.engine.canvas.width : 0);
        const H = (typeof this.engine.H === "function") ? this.engine.H() : (this.engine.canvas ? this.engine.canvas.height : 0);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
  }
}
