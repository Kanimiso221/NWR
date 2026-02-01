export class ShopScene {
  constructor(engine) {
    this.engine = engine;
    this._lastKey = "";
  }

  enter() {
    this._lastKey = "";
  }

  update(dt) {
    const { game, ui } = this.engine;
    if (!game || game.state !== "shop") return;
    if (!ui || typeof ui.showShop !== "function") return;

    const stock = game.shopStock || [];
    const soldSig = stock.map(s => (s && s.sold) ? "1" : "0").join("");
    const room = game.room | 0;
    const force = (game.player && typeof game.player.force === "number") ? game.player.force : 0;
    const rerollCost = (typeof game.getShopRerollCost === "function") ? game.getShopRerollCost() : 0;

    // nextIsBoss: whether the NEXT room is a boss room (for "leave shop" expectations)
    const nextIsBoss = (typeof game._isBossRoom === "function") ? game._isBossRoom(room + 1) : (((room + 1) % 5) === 0);

    const key = String(game.shopVersion) + ":" + String(room) + ":" + soldSig + ":" + String(force) + ":" + String(rerollCost);

    // Only rebuild shop UI when something visible changed.
    if (key !== this._lastKey) {
      this._lastKey = key;
      ui.showShop(room, force, stock, rerollCost, !!nextIsBoss);
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
