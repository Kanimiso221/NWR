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

    // If the user is typing in an input (e.g., multiplayer name/room),
    // ignore the Enter-to-start shortcut so we don't accidentally begin a solo run.
    const ae = (typeof document !== "undefined") ? document.activeElement : null;
    const isTyping = !!(ae && (
      ae.tagName === "INPUT" ||
      ae.tagName === "TEXTAREA" ||
      ae.tagName === "SELECT" ||
      ae.isContentEditable
    ));
    if (isTyping) {
      if (input) input.consumePressed("Enter");
      return;
    }

    // Enter starts (same as clicking START).
    if (input && input.consumePressed("Enter")) {
      const ui = this.engine && this.engine.ui;
      if (ui && ui.startBtn && typeof ui.startBtn.click === "function") {
        if (ui.startBtn.disabled) return;
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
