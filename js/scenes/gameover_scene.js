export class GameOverScene {
  constructor(engine) {
    this.engine = engine;
  }

  enter() {
    const { ui } = this.engine;
    if (ui) ui.show("gameover");
  }

  update(dt) {
    const { input, ui } = this.engine;
    if (ui) ui.show("gameover");

    // Enter restarts
    if (input && input.consumePressed("Enter")) {
      if (typeof this.engine.restartRun === "function") this.engine.restartRun();
    }
  }

  render(dt) {
    if (typeof this.engine.renderMenuBackground === "function") {
      this.engine.renderMenuBackground(dt);
    }
    if (typeof this.engine.refreshHUD === "function") {
      this.engine.refreshHUD();
    }
  }
}
