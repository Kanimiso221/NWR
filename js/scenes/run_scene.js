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
    const { game, input, ui } = this.engine;
    if (!game || game.state !== "playing") return;

    const res = game.update(dt, input, ui && ui.reducedMotion);
    this._timeScale = (res && res.timeScale != null) ? res.timeScale : 1;
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
