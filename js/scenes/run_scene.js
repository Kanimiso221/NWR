export class RunScene {
  constructor(engine) {
    this.engine = engine;
    this._timeScale = 1;
  }

  enter() {
    const { ui } = this.engine;
    if (ui) ui.hide();
  }

  update(dt) {
    const { game, input, ui, lobby, mp } = this.engine;
    if (!game || game.state !== "playing") return;

    // Multiplayer: some net code needs to observe raw input BEFORE the local simulation
    // consumes one-frame presses (dash, etc.).
    if (mp && typeof mp.preUpdate === "function") mp.preUpdate(dt, game, lobby, input);

    const res = game.update(dt, input, ui && ui.reducedMotion);
    this._timeScale = (res && res.timeScale != null) ? res.timeScale : 1;

    // Multiplayer tick (No.3/No.4): snapshot / presence channel
    if (mp && typeof mp.postUpdate === "function") mp.postUpdate(dt, game, lobby, input);
    else if (mp && typeof mp.update === "function") mp.update(dt, game, lobby);
  }

  render() {
    if (typeof this.engine.renderScene === "function") {
      this.engine.renderScene(this._timeScale);
    }
    if (typeof this.engine.refreshHUD === "function") {
      this.engine.refreshHUD();
    }
  }
}
