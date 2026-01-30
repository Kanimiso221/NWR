import { v2 } from "./math.js";

export class Input {
  constructor(canvas){
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();

    this.mouse = {
      x: 0, y: 0,
      down: false,
      pressed: false,
    };

    this._bind();
  }

  _bind(){
    window.addEventListener("keydown", (e) => {
      const code = e.code;
      if(!this.keysDown.has(code) && !e.repeat){
        this.keysPressed.add(code);
      }
      this.keysDown.add(code);

      if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(code)){
        e.preventDefault();
      }
    }, {passive:false});

    window.addEventListener("keyup", (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener("blur", () => {
      this.keysDown.clear();
      this.keysPressed.clear();
      this.mouse.down = false;
      this.mouse.pressed = false;
    });

    const onMove = (clientX, clientY) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = clientX - r.left;
      this.mouse.y = clientY - r.top;
    };

    this.canvas.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    this.canvas.addEventListener("mousedown", (e) => {
      if(e.button !== 0) return;
      onMove(e.clientX, e.clientY);
      this.mouse.down = true;
      this.mouse.pressed = true;
    });
    window.addEventListener("mouseup", (e) => {
      if(e.button !== 0) return;
      this.mouse.down = false;
    });

    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      if(!t) return;
      onMove(t.clientX, t.clientY);
      this.mouse.down = true;
      this.mouse.pressed = true;
      e.preventDefault();
    }, {passive:false});
    this.canvas.addEventListener("touchmove", (e) => {
      const t = e.changedTouches[0];
      if(!t) return;
      onMove(t.clientX, t.clientY);
      e.preventDefault();
    }, {passive:false});
    window.addEventListener("touchend", () => { this.mouse.down = false; });
  }

  isDown(code){ return this.keysDown.has(code); }

  consumePressed(code){
    if(this.keysPressed.has(code)){
      this.keysPressed.delete(code);
      return true;
    }
    return false;
  }

  consumeMousePressed(){
    const p = this.mouse.pressed;
    this.mouse.pressed = false;
    return p;
  }

  getMoveVector(){
    const left = this.isDown("KeyA");
    const right = this.isDown("KeyD");
    const up = this.isDown("KeyW");
    const down = this.isDown("KeyS");

    const x = (right ? 1 : 0) + (left ? -1 : 0);
    const y = (down ? 1 : 0) + (up ? -1 : 0);

    return v2(x, y);
  }
}
