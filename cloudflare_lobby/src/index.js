import { DurableObject } from "cloudflare:workers";

const ALLOWED_ORIGINS = new Set([
  "https://kanimiso221.github.io",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "http://127.0.0.1:5501",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:5501",
]);

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function _isWsUpgrade(request){
  const u = request.headers.get("Upgrade");
  return u && u.toLowerCase() === "websocket";
}

function _originOk(origin){
  if(!origin) return true;
  try{
    const o = new URL(origin).origin;
    return ALLOWED_ORIGINS.has(o);
  }catch(_e){
    return false;
  }
}

function _genRoomCode(n=5){
  const r = new Uint8Array(n);
  crypto.getRandomValues(r);
  let out = "";
  for(let i=0;i<n;i++) out += CODE_CHARS[r[i] % CODE_CHARS.length];
  return out;
}

function _genClientId(){
  const r = new Uint8Array(9);
  crypto.getRandomValues(r);
  let s = "";
  for(let i=0;i<r.length;i++) s += r[i].toString(16).padStart(2, "0");
  return s;
}

function _json(ws, obj){ try{ ws.send(JSON.stringify(obj)); }catch(_e){} }

function _safeParseJson(s){ try{ return JSON.parse(s); }catch(_e){ return null; } }

export default {
  async fetch(request, env){
    const url = new URL(request.url);

    const path = url.pathname.replace(/\/+$/, "") || "/";

    if(path === "/" || path === "/health") return new Response("nwr lobby ok", { headers: { "content-type": "text/plain; charset=utf-8" }, });

    if(path === "/ws"){
      if(!_isWsUpgrade(request)){
        return new Response("Expected WebSocket", { status: 400 });
      }

      const origin = request.headers.get("Origin");
      if(!_originOk(origin)){
        return new Response("Origin not allowed", { status: 403 });
      }

      const parts = url.pathname.split("/").filter(Boolean); // ["ws", <code?>]
      let code = "";
      if(parts.length <= 1){
        code = _genRoomCode(5);
      }else{
        code = String(parts[1] || "").trim().toUpperCase();
      }

      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);

      const headers = new Headers(request.headers);
      headers.set("X-Room-Code", code);
      // Forward the same URL; DO doesn't care about the host.
      const forward = new Request(request.url, {
        method: request.method,
        headers,
      });
      return stub.fetch(forward);
    }

    return new Response("Not found", { status: 404 });
  }
};

export class Room extends DurableObject {
  constructor(state, env){
    this.state = state;
    this.env = env;
    this.roomCode = "";

    this.clients = new Map(); // ws -> { id, name, ready }
    this.hostId = "";
  }

  async fetch(request){
    if(!_isWsUpgrade(request)){
      return new Response("Expected WebSocket", { status: 400 });
    }

    // Record room code from Worker
    const room = String(request.headers.get("X-Room-Code") || "").trim().toUpperCase();
    if(room) this.roomCode = room;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    // Hard cap: 4 players
    if(this.clients.size >= 4){
      _json(server, { t: "err", message: "Room is full (max 4)" });
      try{ server.close(1000, "room full"); }catch(_e){}
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = _genClientId();
    const rec = {
      id,
      name: `Player-${id.slice(0,4)}`,
      ready: false,
    };

    // First connection becomes host.
    if(!this.hostId) this.hostId = id;

    this.clients.set(server, rec);

    _json(server, { t: "welcome", id, room: this.roomCode, host: id === this.hostId });
    this._broadcastState();

    server.addEventListener("message", (ev) => {
      // ev.data: string | ArrayBuffer なので string に寄せる
      let text = "";
      if (typeof ev.data === "string") {
        text = ev.data;
      } else if (ev.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(ev.data);
      } else {
        // 念のため（ここに来ることはほぼない）
        try { text = String(ev.data); } catch { text = ""; }
      }
    
      if (!text) return;
    
      let data;
      try { data = JSON.parse(text); } catch { return; }
    
      const me = this.players.get(server);
      if (!me) return;
    
      if (data.t === "ready") {
        me.ready = !!data.ready;
        this.broadcast(this.snapshot(roomCode));
        return;
      }
    
      if (data.t === "start") {
        if (me.id !== this.hostId) return;
    
        const allReady = [...this.players.values()].every(pp => pp.isHost ? true : !!pp.ready);
        if (!allReady) {
          server.send(JSON.stringify({ t: "err", code: "not_ready" }));
          return;
        }
        this.broadcast({ t: "start" });
        return;
      }
    });  

    const onClose = () => {
      const me = this.clients.get(server);
      this.clients.delete(server);

      if(me && me.id === this.hostId){
        // Host-centric: if host leaves, room ends.
        this._broadcast({ t: "closed", reason: "host left" });
        for(const ws of this.clients.keys()){
          try{ ws.close(1000, "host left"); }catch(_e){}
        }
        this.clients.clear();
        this.hostId = "";
        return;
      }

      this._broadcastState();
    };

    server.addEventListener("close", onClose);
    server.addEventListener("error", onClose);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  _broadcast(obj){
    for(const ws of this.clients.keys()) _json(ws, obj);
  }

  _broadcastState(){
    const members = Array.from(this.clients.values()).map((c) => ({
      id: c.id,
      name: c.name,
      ready: c.ready,
    }));
    this._broadcast({ t: "state", room: this.roomCode, hostId: this.hostId, members });
  }
}
