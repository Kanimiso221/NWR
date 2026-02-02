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

    // If typing in an input, don't treat Enter as "Start".
    const ae = (typeof document !== "undefined") ? document.activeElement : null;
    const isTyping = !!(ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable));
    if (isTyping) return;

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
