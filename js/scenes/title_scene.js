export class TitleScene {
  constructor(engine) {
    this.engine = engine;
  }

  enter() {
    const { ui } = this.engine;
    if (ui) ui.show("title");
  }

  update(dt) {
    const { input } = this.engine;

    // Enter starts (same as clicking START).
    if (input && input.consumePressed("Enter")) {
      const ui = this.engine && this.engine.ui;
      if (ui && ui.startBtn && typeof ui.startBtn.click === "function") {
        ui.startBtn.click();
      } else if (typeof this.engine.startRun === "function") {
        this.engine.startRun();
      }
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
