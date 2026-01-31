export class PauseScene {
  constructor(engine) {
    this.engine = engine;
  }

  enter() {
    const { ui } = this.engine;
    if (ui) ui.show("pause");
  }

  update(dt) {
    const { input, ui } = this.engine;
    if (ui) ui.show("pause");

    // Enter also resumes (Escape is handled globally by SceneManager).
    if (input && input.consumePressed("Enter")) {
      if (typeof this.engine.resumeRun === "function") this.engine.resumeRun();
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