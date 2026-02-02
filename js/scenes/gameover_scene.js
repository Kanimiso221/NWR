export class GameOverScene {
  constructor(engine) {
    this.engine = engine;
  }

  enter() {
    const { ui } = this.engine;
    if (ui) ui.show("gameover");
  }

  update(dt) {
    const { input } = this.engine;

    // If typing in an input, don't treat Enter as "Restart".
    const ae = (typeof document !== "undefined") ? document.activeElement : null;
    const isTyping = !!(ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable));
    if (isTyping) return;

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
