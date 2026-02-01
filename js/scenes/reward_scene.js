export class RewardScene {
  constructor(engine) {
    this.engine = engine;
    this._lastKey = "";
  }

  enter() {
    this._lastKey = "";
  }

  update(dt) {
    const { game, input, ui } = this.engine;
    if (!game || game.state !== "reward") return;

    // Quick pick with 1..3 (top row + numpad)
    if (input && typeof input.consumePressed === "function") {
      if (input.consumePressed("Digit1") || input.consumePressed("Numpad1")) {
        if (game.rewardChoices && game.rewardChoices[0]) game.pickReward(game.rewardChoices[0]);
      } else if (input.consumePressed("Digit2") || input.consumePressed("Numpad2")) {
        if (game.rewardChoices && game.rewardChoices[1]) game.pickReward(game.rewardChoices[1]);
      } else if (input.consumePressed("Digit3") || input.consumePressed("Numpad3")) {
        if (game.rewardChoices && game.rewardChoices[2]) game.pickReward(game.rewardChoices[2]);
      }
    }

    if (!ui || typeof ui.showReward !== "function") return;

    const choices = game.rewardChoices || [];
    const sig = choices.map(c => (c && (c.id || c.name)) ? String(c.id || c.name) : "").join("|");
    const key = String(game.room) + ":" + (game.roomIsBoss ? "B" : "N") + ":" + sig;

    // Only rebuild the reward UI when the set of choices changes.
    if (key !== this._lastKey) {
      this._lastKey = key;
      ui.showReward(game.room, choices, !!game.roomIsBoss);
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
