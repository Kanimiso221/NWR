import { clamp, lerp } from "./math.js";

export function clear(ctx, w, h){
  ctx.clearRect(0,0,w,h);
}

export function drawBackground(ctx, w, h, camera, t, timeScale=1, stage=null){
  ctx.save();

  // stage tint
  const th = stage && stage.theme ? stage.theme : null;
  if(th && th.bg0 && th.bg1){
    const lg = ctx.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, `rgba(${th.bg0[0]},${th.bg0[1]},${th.bg0[2]},1)`);
    lg.addColorStop(1, `rgba(${th.bg1[0]},${th.bg1[1]},${th.bg1[2]},1)`);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = lg;
    ctx.fillRect(0,0,w,h);
    ctx.globalAlpha = 1;
  }

  // soft nebula
  const g = ctx.createRadialGradient(w*0.5, h*0.45, 0, w*0.5, h*0.55, Math.max(w,h)*0.72);
  g.addColorStop(0, "rgba(255,255,255,0.02)");
  g.addColorStop(0.5, "rgba(255,255,255,0.00)");
  g.addColorStop(1, "rgba(0,0,0,0.40)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // grid
  const grid = 80;
  const ox = -((camera.x) % grid);
  const oy = -((camera.y) % grid);
  const pulse = 0.35 + 0.15 * Math.sin(t * 1.7);

  ctx.globalAlpha = 0.10 * pulse;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  for(let x=ox; x<=w; x+=grid){
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for(let y=oy; y<=h; y+=grid){
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // focus-mode tint + scanlines
  if(timeScale < 0.95){
    const a = clamp((0.95 - timeScale) / 0.7, 0, 1);
    ctx.globalAlpha = 0.08 + a * 0.28;
    ctx.fillStyle = "rgba(190,220,255,0.12)";
    ctx.fillRect(0,0,w,h);

    // scanlines (subtle, but obvious enough)
    ctx.globalAlpha = 0.05 + a * 0.10;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for(let y=0; y<h; y+=6){
      ctx.fillRect(0, y, w, 1);
    }

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.20, w*0.5, h*0.5, Math.max(w,h)*0.72);
    vg.addColorStop(0, "rgba(0,0,0,0.00)");
    vg.addColorStop(1, `rgba(0,0,0,${0.10 + a*0.25})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
  }

  ctx.restore();
}

export function drawRoomBounds(ctx, world, camera, w, h, t, introT=0, introLines=null){
  const L = world.minX - camera.x;
  const T = world.minY - camera.y;
  const R = world.maxX - camera.x;
  const B = world.maxY - camera.y;

  // shade outside the room so the boundaries are instantly readable
  const clL = clamp(L, 0, w);
  const clT = clamp(T, 0, h);
  const clR = clamp(R, 0, w);
  const clB = clamp(B, 0, h);

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  if(clT > 0) ctx.fillRect(0,0,w,clT);
  if(clB < h) ctx.fillRect(0,clB,w,h-clB);
  if(clL > 0) ctx.fillRect(0,clT,clL,clB-clT);
  if(clR < w) ctx.fillRect(clR,clT,w-clR,clB-clT);

  // walls
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.58 + 0.22 * Math.sin(t * 2.0);
  ctx.shadowBlur = 28;
  ctx.shadowColor = "rgba(255,255,255,0.22)";
  ctx.globalAlpha = 0.16 + pulse * 0.10;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 10;
  ctx.strokeRect(L, T, R-L, B-T);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.strokeRect(L+16, T+16, (R-L)-32, (B-T)-32);

  // corner nodes
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  const nR = 6;
  ctx.beginPath(); ctx.arc(L, T, nR, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(R, T, nR, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(L, B, nR, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(R, B, nR, 0, Math.PI*2); ctx.fill();

  // quick room splash
  if(introT > 0){
    const a = clamp(introT / 1.2, 0, 1);
    ctx.globalAlpha = 0.10 + a * 0.22;
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.font = "800 40px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const l1 = introLines?.l1 || "ROOM";
    const l2 = introLines?.l2 || "";
    const l3 = introLines?.l3 || "";

    ctx.fillText(l1, w*0.5, h*0.24);

    if(l2){
      ctx.globalAlpha = 0.08 + a * 0.18;
      ctx.font = "700 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP";
      ctx.fillText(l2, w*0.5, h*0.24 + 44);
    }
    if(l3){
      ctx.globalAlpha = 0.06 + a * 0.16;
      ctx.font = "600 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP";
      ctx.fillText(l3, w*0.5, h*0.24 + 72);
    }
  }

  ctx.restore();
}



export function drawHazards(ctx, stage, camera, w, h, t, reducedMotion=false){
  if(!stage) return;

  const drawRect = (x,y,ww,hh, fill, alpha=0.18) => {
    const sx = x - camera.x;
    const sy = y - camera.y;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.fillRect(sx - ww*0.5, sy - hh*0.5, ww, hh);
  };

  const drawCircle = (x,y,r, fill, alpha=0.18) => {
    const sx = x - camera.x;
    const sy = y - camera.y;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI*2);
    ctx.fill();
  };

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // floor hazards
  for(const hz of (stage.hazards || [])){
    if(hz.type === "lava"){
      const a = 0.10 + 0.14 * (0.6 + 0.4 * Math.sin(t*2.0));
      const fill = "rgba(255, 120, 50, 1)";
      if(hz.shape === "rect") drawRect(hz.x, hz.y, hz.w, hz.h, fill, a);
      else drawCircle(hz.x, hz.y, hz.r, fill, a);
    }else if(hz.type === "ice"){
      const a = 0.08 + 0.10 * (0.6 + 0.4 * Math.sin(t*1.6));
      const fill = "rgba(120, 210, 255, 1)";
      if(hz.shape === "rect") drawRect(hz.x, hz.y, hz.w, hz.h, fill, a);
      else drawCircle(hz.x, hz.y, hz.r, fill, a);
    }else if(hz.type === "toxic"){
      const a = 0.08 + 0.12 * (0.6 + 0.4 * Math.sin(t*1.8));
      const fill = "rgba(80, 255, 160, 1)";
      if(hz.shape === "rect") drawRect(hz.x, hz.y, hz.w, hz.h, fill, a);
      else drawCircle(hz.x, hz.y, hz.r, fill, a);
    }
  }

  // fields
  for(const n of (stage.fields?.magnet || [])){
    const x = n.x - camera.x;
    const y = n.y - camera.y;
    const r = n.r;
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "rgba(120, 255, 240, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.stroke();

    ctx.globalAlpha = 0.05;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r*0.62, 0, Math.PI*2);
    ctx.stroke();
  }

  for(const n of (stage.fields?.void || [])){
    const x = n.x - camera.x;
    const y = n.y - camera.y;
    const r = n.r;
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "rgba(210, 170, 255, 0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.stroke();

    ctx.globalAlpha = 0.05;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r*0.55, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawStagePost(ctx, stage, player, w, h, reducedMotion=false){
  if(!stage || !player) return;

  const type = player.stageFxType || "none";
  const a = clamp(player.stageFxA || 0, 0, 1);
  if(type === "none" || a <= 0.02) return;

  let col = "rgba(255,255,255,0.0)";
  let alpha = 0.08 + 0.16 * a;

  if(type === "lava") col = "rgba(255, 110, 60, 1)";
  else if(type === "ice") col = "rgba(130, 220, 255, 1)";
  else if(type === "toxic") col = "rgba(90, 255, 170, 1)";
  else if(type === "magnet") { col = "rgba(120, 255, 240, 1)"; alpha = 0.06 + 0.12 * a; }
  else if(type === "void") { col = "rgba(215, 175, 255, 1)"; alpha = 0.07 + 0.14 * a; }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  ctx.fillRect(0,0,w,h);

  ctx.globalAlpha = alpha * 0.85;
  const g = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.15, w*0.5, h*0.5, Math.min(w,h)*0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);
  ctx.restore();
}

export function drawObstacle(ctx, o, camera){
  const x = o.x - camera.x;
  const y = o.y - camera.y;

  ctx.save();

  const mat = o.material || (o.blocksBullets ? "metal" : "glass");
  const isBlock = !!o.blocksBullets;

  const pal = {
    metal: { fill:"rgba(120, 255, 240, 0.10)", stroke:"rgba(140, 255, 245, 0.35)", shadow:"rgba(120, 255, 240, 0.22)" },
    glass: { fill:"rgba(120, 255, 210, 0.07)", stroke:"rgba(160, 255, 230, 0.22)", shadow:"rgba(120, 255, 220, 0.18)" },
    neon: { fill:"rgba(255, 120, 230, 0.06)", stroke:"rgba(255, 140, 240, 0.22)", shadow:"rgba(255, 120, 230, 0.16)" },
    lavaRock: { fill:"rgba(255, 120, 60, 0.07)", stroke:"rgba(255, 160, 110, 0.23)", shadow:"rgba(255, 120, 60, 0.16)" },
    ice: { fill:"rgba(120, 210, 255, 0.08)", stroke:"rgba(180, 235, 255, 0.30)", shadow:"rgba(120, 210, 255, 0.18)" },
    toxic: { fill:"rgba(80, 255, 160, 0.07)", stroke:"rgba(120, 255, 190, 0.24)", shadow:"rgba(80, 255, 160, 0.16)" },
    void: { fill:"rgba(215, 175, 255, 0.07)", stroke:"rgba(235, 205, 255, 0.24)", shadow:"rgba(215, 175, 255, 0.16)" },
  };
  const p = pal[mat] || (isBlock ? pal.metal : pal.glass);

  ctx.globalAlpha = 0.92;
  ctx.shadowBlur = isBlock ? 22 : 16;
  ctx.shadowColor = p.shadow;
  ctx.fillStyle = p.fill;
  ctx.strokeStyle = p.stroke;
  ctx.lineWidth = isBlock ? 2.6 : 2;

  const roundRectPath = (rx, ry, rw, rh, rr) => {
    const r2 = Math.min(rr, rw*0.5, rh*0.5);
    ctx.beginPath();
    ctx.moveTo(rx + r2, ry);
    ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r2);
    ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r2);
    ctx.arcTo(rx, ry + rh, rx, ry, r2);
    ctx.arcTo(rx, ry, rx + rw, ry, r2);
    ctx.closePath();
  };

  if(o.shape === "rect"){
    const rx = x - o.w*0.5;
    const ry = y - o.h*0.5;
    const rr = Math.min(18, Math.min(o.w,o.h)*0.14);
    roundRectPath(rx, ry, o.w, o.h, rr);
    ctx.fill();
    ctx.stroke();

    // inner highlight line (helps readability)
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = o.blocksBullets ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.5;
    roundRectPath(rx+6, ry+6, o.w-12, o.h-12, Math.max(6, rr-6));
    ctx.stroke();
  }else{
    ctx.beginPath();
    ctx.arc(x,y,o.r,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // tiny inner ring to make obstacles easier to read at a glance
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x,y,Math.max(8, o.r*0.55),0,Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}


export function drawPickup(ctx, p, camera){
  const x = p.x - camera.x;
  const y = p.y - camera.y;
  const bob = Math.sin(p.t * 5) * 2;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = 18;
  ctx.shadowColor = p.kind === "hp" ? "rgba(255,120,160,0.6)" : "rgba(160,210,255,0.6)";
  ctx.fillStyle = p.kind === "hp" ? "rgba(255,160,190,0.75)" : "rgba(200,235,255,0.75)";
  ctx.beginPath();
  ctx.arc(x, y + bob, p.r, 0, Math.PI*2);
  ctx.fill();

  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(x, y + bob, p.r + 3, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();
}

export function drawBullet(ctx, b, camera){
  const x = b.x - camera.x;
  const y = b.y - camera.y;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = 14;
  ctx.shadowColor = b.team === "player" ? "rgba(200,240,255,0.75)" : "rgba(255,170,120,0.75)";
  ctx.fillStyle = b.team === "player" ? (b.crit ? "rgba(255,255,255,0.95)" : "rgba(230,250,255,0.9)") : "rgba(255,200,160,0.85)";
  ctx.beginPath();
  ctx.arc(x,y,b.r,0,Math.PI*2);
  ctx.fill();

  if(b.team === "player" && b.pierce > 0){
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(x,y,b.r + 4, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawEnemy(ctx, e, camera){
  const x = e.x - camera.x;
  const y = e.y - camera.y;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const hurt = e.hitFlash > 0 ? (e.hitFlash / 0.12) : 0;

  // Enemy colors: make each type instantly recognizable.
  // We use: fill (body), glow (outer bloom), outline (high-contrast stroke), and a small "mark".
  const ET = String(e.type || "stalker");
  const STY = {
    stalker:     { base:[ 70,255,120], glow:"rgba(120,255,170,0.78)", outline:"rgba( 10,120, 55,0.95)", mark:"eye" },
    shooter:     { base:[255,150, 70], glow:"rgba(255,190,130,0.82)", outline:"rgba(150, 70,  0,0.95)", mark:"dot" },
    bomber:      { base:[255,230, 70], glow:"rgba(255,220,120,0.86)", outline:"rgba(160, 95,  0,0.95)", mark:"tri" },
    pylon:       { base:[ 60,245,255], glow:"rgba(140,255,255,0.88)", outline:"rgba(  0,120,140,0.95)", mark:"sq" },
    weaver:      { base:[180, 85,255], glow:"rgba(220,160,255,0.86)", outline:"rgba( 90, 20,160,0.95)", mark:"x" },
    sniper:      { base:[ 85,165,255], glow:"rgba(160,220,255,0.86)", outline:"rgba( 20, 85,160,0.95)", mark:"cross" },
    charger:     { base:[255, 75,210], glow:"rgba(255,170,235,0.84)", outline:"rgba(160,  0,120,0.95)", mark:"chev" },
    splitter:    { base:[255,245, 70], glow:"rgba(255,255,190,0.86)", outline:"rgba(150,130,  0,0.95)", mark:"split" },
    mote:        { base:[190,255, 95], glow:"rgba(230,255,170,0.80)", outline:"rgba( 80,140,  0,0.95)", mark:"tiny" },
    warden:      { base:[255, 90, 90], glow:"rgba(255,170,170,0.88)", outline:"rgba(140,  0,  0,0.95)", mark:"boss" },
    boss_lava:   { base:[255, 60, 15], glow:"rgba(255,170,110,0.92)", outline:"rgba(150, 50,  0,0.95)", mark:"boss" },
    boss_ice:    { base:[ 90,240,255], glow:"rgba(210,255,255,0.94)", outline:"rgba(  0,120,180,0.95)", mark:"boss" },
    boss_magnet: { base:[215, 80,255], glow:"rgba(255,190,255,0.92)", outline:"rgba(110,  0,170,0.95)", mark:"boss" },
    boss_void:   { base:[110,110,255], glow:"rgba(190,190,255,0.92)", outline:"rgba( 55,  0,120,0.95)", mark:"boss" },
  };
  const sty = STY[ET] || STY.stalker;
  const base = `rgba(${sty.base[0]},${sty.base[1]},${sty.base[2]},`;
  const glow = sty.glow;
  const outline = sty.outline;
  const mark = sty.mark;

  const isBoss = !!e.isBoss || e.type === "warden" || String(e.type).startsWith("boss_");

  const eliteBoost = e.elite ? 0.10 : 0;
  const a = lerp(0.62 + eliteBoost, 0.92, hurt);

  ctx.shadowBlur = isBoss ? 38 : 24;
  ctx.shadowColor = glow;
  ctx.fillStyle = `${base}${a})`;

  ctx.beginPath();
  ctx.arc(x,y,e.r,0,Math.PI*2);
  ctx.fill();

  // High-contrast outline for readability (especially on bright floors).
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.90;
  ctx.lineWidth = isBoss ? 5 : 3;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.arc(x,y,e.r+0.5,0,Math.PI*2);
  ctx.stroke();

  // Small identifying mark (minimal extra strokes, big readability gain).
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  const rr = Math.max(6, e.r * 0.46);
  if(mark === "sq"){
    ctx.beginPath();
    ctx.rect(x - rr*0.55, y - rr*0.55, rr*1.10, rr*1.10);
    ctx.stroke();
  }else if(mark === "tri"){
    ctx.beginPath();
    ctx.moveTo(x, y - rr*0.70);
    ctx.lineTo(x + rr*0.70, y + rr*0.55);
    ctx.lineTo(x - rr*0.70, y + rr*0.55);
    ctx.closePath();
    ctx.stroke();
  }else if(mark === "x"){
    ctx.beginPath();
    ctx.moveTo(x - rr*0.65, y - rr*0.65);
    ctx.lineTo(x + rr*0.65, y + rr*0.65);
    ctx.moveTo(x + rr*0.65, y - rr*0.65);
    ctx.lineTo(x - rr*0.65, y + rr*0.65);
    ctx.stroke();
  }else if(mark === "cross"){
    ctx.beginPath();
    ctx.moveTo(x - rr*0.75, y);
    ctx.lineTo(x + rr*0.75, y);
    ctx.moveTo(x, y - rr*0.75);
    ctx.lineTo(x, y + rr*0.75);
    ctx.stroke();
  }else if(mark === "chev"){
    ctx.beginPath();
    ctx.moveTo(x - rr*0.70, y - rr*0.10);
    ctx.lineTo(x, y + rr*0.70);
    ctx.lineTo(x + rr*0.70, y - rr*0.10);
    ctx.stroke();
  }else if(mark === "split"){
    ctx.beginPath();
    ctx.arc(x - rr*0.32, y, rr*0.30, 0, Math.PI*2);
    ctx.arc(x + rr*0.32, y, rr*0.30, 0, Math.PI*2);
    ctx.stroke();
  }else if(mark === "eye"){
    ctx.beginPath();
    ctx.ellipse(x, y, rr*0.85, rr*0.50, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, rr*0.18, 0, Math.PI*2);
    ctx.fill();
  }else if(mark === "boss"){
    ctx.globalAlpha = 0.40;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.50)";
    ctx.beginPath();
    ctx.arc(x,y,e.r - Math.max(8, e.r*0.18), 0, Math.PI*2);
    ctx.stroke();
  }else{
    // dot
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, rr*0.14, 0, Math.PI*2);
    ctx.fill();
  }

  // Note: pylon already gets a square mark above.

  // elite ring
  if(e.elite && e.type !== "warden"){
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(x,y,e.r + 10, 0, Math.PI*2);
    ctx.stroke();
  }

  // core
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.arc(x,y,Math.max(4, e.r*0.38),0,Math.PI*2);
  ctx.fill();

  // charger telegraph ring
  if(e.type === "charger" && e.telegraph > 0){
    const tt = e.telegraph;
    ctx.globalAlpha = 0.15 + (1-tt)*0.30;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(x,y,e.r + 10 + (1-tt)*16, 0, Math.PI*2);
    ctx.stroke();
  }

  // sniper telegraph line
  if(e.type === "sniper" && e.lineT > 0){
    const tt = clamp(e.lineT / 0.55, 0, 1);
    ctx.globalAlpha = 0.10 + (1-tt)*0.22;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.40)";
    const len = 1400;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(e.lineA) * len, y + Math.sin(e.lineA) * len);
    ctx.stroke();
  }

  // hp arc
  const hpT = e.hp / e.maxHp;
  ctx.globalAlpha = isBoss ? 0.55 : 0.35;
  ctx.lineWidth = isBoss ? 4 : 3;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(x,y,e.r + (e.type==="warden"?14:8), -Math.PI*0.5, -Math.PI*0.5 + Math.PI*2*hpT);
  ctx.stroke();

  ctx.restore();
}

export function drawEnemyIndicators(ctx, enemies, camera, w, h){
  const m = 22;
  const cx = w*0.5;
  const cy = h*0.5;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = 18;
  ctx.shadowColor = "rgba(255,255,255,0.20)";

  for(const e of enemies){
    const sx = e.x - camera.x;
    const sy = e.y - camera.y;
    if(sx > m && sx < w-m && sy > m && sy < h-m) continue;

    // direction from screen center
    const dx = sx - cx;
    const dy = sy - cy;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;

    const px = clamp(cx + nx * (Math.min(w,h)*0.46), m, w-m);
    const py = clamp(cy + ny * (Math.min(w,h)*0.46), m, h-m);

    const a = Math.atan2(ny, nx);
    const size = 9;

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(a) * (size+4), py + Math.sin(a) * (size+4));
    ctx.lineTo(px + Math.cos(a + 2.3) * size, py + Math.sin(a + 2.3) * size);
    ctx.lineTo(px + Math.cos(a - 2.3) * size, py + Math.sin(a - 2.3) * size);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export function drawPlayer(ctx, p, camera, reducedMotion=false){
  const x = p.x - camera.x;
  const y = p.y - camera.y;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const inv = p.invuln > 0 ? (p.invuln / 0.22) : 0;
  ctx.shadowBlur = 28;
  ctx.shadowColor = "rgba(190,230,255,0.7)";
  ctx.fillStyle = `rgba(210,245,255,${lerp(0.62, 0.95, inv)})`;
  ctx.beginPath();
  ctx.arc(x,y,p.r,0,Math.PI*2);
  ctx.fill();

  // stage effect ring
  const fx = p.stageFxType || "none";
  const fa = clamp(p.stageFxA || 0, 0, 1);
  if(fx !== "none" && fa > 0.05){
    ctx.globalAlpha = 0.18 + 0.28 * fa;
    let sc = "rgba(255,255,255,0.22)";
    if(fx === "lava") sc = "rgba(255, 110, 60, 0.55)";
    else if(fx === "ice") sc = "rgba(130, 220, 255, 0.55)";
    else if(fx === "toxic") sc = "rgba(90, 255, 170, 0.55)";
    else if(fx === "magnet") sc = "rgba(120, 255, 240, 0.50)";
    else if(fx === "void") sc = "rgba(215, 175, 255, 0.50)";

    ctx.shadowBlur = 28;
    ctx.shadowColor = sc;
    ctx.strokeStyle = sc;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x,y,p.r + 18,0,Math.PI*2);
    ctx.stroke();
  }

  // direction notch
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(p.face) * (p.r + 10), y + Math.sin(p.face) * (p.r + 10));
  ctx.stroke();

  // dash aura
  if(p.dashTime > 0 && !reducedMotion){
    ctx.globalAlpha = 0.35;
    ctx.shadowBlur = 38;
    ctx.shadowColor = "rgba(255,255,255,0.40)";
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(x,y,p.r + 14,0,Math.PI*2);
    ctx.fill();

    // little comet tail
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(p.face) * 42, y - Math.sin(p.face) * 42);
    ctx.stroke();
  }

  // orbit blades
  if(p.mods.blades > 0){
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(255,255,255,0.45)";
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    ctx.globalAlpha = 0.7;
    for(const b of p._bladePos || []){
      const bx = b.x - camera.x;
      const by = b.y - camera.y;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, Math.PI*2);
      ctx.fill();
    }
  }

  ctx.restore();
}
