export function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t){ return a + (b - a) * t; }
export function smoothstep(t){ return t * t * (3 - 2 * t); }
export function rand(a=1, b=0){ return b + Math.random() * (a - b); }
export function randInt(a, b){
  const lo = Math.min(a,b), hi = Math.max(a,b);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}
export function choice(arr){ return arr[(Math.random() * arr.length) | 0]; }

export function v2(x=0,y=0){ return {x,y}; }
export function v2copy(a){ return {x:a.x, y:a.y}; }
export function v2add(a,b){ return {x:a.x+b.x, y:a.y+b.y}; }
export function v2sub(a,b){ return {x:a.x-b.x, y:a.y-b.y}; }
export function v2mul(a,s){ return {x:a.x*s, y:a.y*s}; }
export function v2len(a){ return Math.hypot(a.x, a.y); }
export function v2dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
export function v2norm(a){
  const l = Math.hypot(a.x, a.y) || 1;
  return {x:a.x/l, y:a.y/l};
}
export function v2dot(a,b){ return a.x*b.x + a.y*b.y; }
export function v2fromAngle(rad){ return {x:Math.cos(rad), y:Math.sin(rad)}; }
export function v2angle(a){ return Math.atan2(a.y, a.x); }

export function wrapAngle(rad){
  while(rad <= -Math.PI) rad += Math.PI*2;
  while(rad > Math.PI) rad -= Math.PI*2;
  return rad;
}
