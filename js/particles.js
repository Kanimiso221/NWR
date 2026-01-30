import { clamp, rand, v2, v2norm } from "./math.js";

export class ParticleSystem {
  constructor(){
    this.ps = [];
    this.maxParticles = 1800;

    // Tiny sprite cache for fast rendering (avoids per-particle shadow/arc work).
    // Keyed by `${kind}|${s}|${g}` where s = rounded size px, g = rounded glow.
    this._spriteCache = new Map();
  }

  burst(pos, count, opts = {}){
    const {
      speedMin=120, speedMax=520,
      lifeMin=0.18, lifeMax=0.85,
      sizeMin=1, sizeMax=3,
      drag=2.2,
      glow=10,
      kind="spark",
    } = opts;

    const room = this.maxParticles - this.ps.length;
    if (room <= 0) return;
    const n = Math.min(count, room);

    for(let i=0;i<n;i++){
      const dir = v2norm(v2(rand(1,-1), rand(1,-1)));
      const spd = rand(speedMax, speedMin);
      this.ps.push({
        x: pos.x, y: pos.y,
        vx: dir.x * spd,
        vy: dir.y * spd,
        life: rand(lifeMax, lifeMin),
        age: 0,
        size: rand(sizeMax, sizeMin),
        drag,
        glow,
        kind,
        a: 1,
      });
    }
  }

  ring(pos, count, opts = {}){
    const {
      speedMin=180, speedMax=420,
      lifeMin=0.18, lifeMax=0.55,
      sizeMin=1, sizeMax=2.4,
      drag=1.7,
      glow=10,
      kind="spark",
    } = opts;

    const room = this.maxParticles - this.ps.length;
    if (room <= 0) return;
    const n = Math.min(count, room);

    for(let i=0;i<n;i++){
      const ang = (Math.PI * 2) * (i / count) + rand(0.1, -0.1);
      const spd = rand(speedMax, speedMin);
      this.ps.push({
        x: pos.x, y: pos.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: rand(lifeMax, lifeMin),
        age: 0,
        size: rand(sizeMax, sizeMin),
        drag,
        glow,
        kind,
        a: 1,
      });
    }
  }

  update(dt){
    // In-place compaction (avoids splice-per-dead-particle).
    let w = 0;
    const ps = this.ps;

    for(let i=0;i<ps.length;i++){
      const p = ps[i];
      p.age += dt;
      const t = p.age / p.life;
      if(t >= 1) continue;

      // Cheaper-than-exp damping (stable, good enough visually).
      // k = 1/(1 + drag*dt) approximates exp(-drag*dt) for small dt.
      const k = 1 / (1 + p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a = clamp(1 - t, 0, 1);

      ps[w++] = p;
    }

    ps.length = w;

    // Hard cap, just in case (keeps things stable on bullet-hell moments).
    if(ps.length > this.maxParticles){
      ps.length = this.maxParticles;
    }
  }

  _getSprite(kind, sizePx, glow){
    const s = Math.max(1, Math.min(10, (sizePx + 0.5) | 0));
    const g = Math.max(0, Math.min(24, (glow + 0.5) | 0));
    const key = kind + "|" + s + "|" + g;
    const cached = this._spriteCache.get(key);
    if(cached) return cached;

    // Build a small pre-rendered glow dot.
    const r = s + g;
    const d = Math.max(8, Math.min(96, r * 2 + 2));
    const c = document.createElement("canvas");
    c.width = d;
    c.height = d;
    const cx = d * 0.5;
    const cy = d * 0.5;
    const ctx = c.getContext("2d");

    if(kind === "spark"){
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }else{
      // Blocky particle: soft square.
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(255,255,255,0.85)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    const out = { canvas: c, r };
    this._spriteCache.set(key, out);

    // Keep the cache from growing without bound.
    if(this._spriteCache.size > 96){
      // delete oldest
      const firstKey = this._spriteCache.keys().next().value;
      this._spriteCache.delete(firstKey);
    }

    return out;
  }

  render(ctx, camera, reducedMotion=false){
    if(reducedMotion) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const pad = 80; // cull padding

    for(const p of this.ps){
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;

      // Cull offscreen particles early.
      if(sx < -pad || sy < -pad || sx > cw + pad || sy > ch + pad) continue;

      ctx.globalAlpha = p.a * 0.85;

      // Fast path: blit a cached glow sprite.
      const spr = this._getSprite(p.kind, p.size, p.glow);
      ctx.drawImage(spr.canvas, sx - spr.r, sy - spr.r);
    }

    ctx.restore();
  }
}
