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

function _isWsUpgrade(request) {
  const u = request.headers.get("Upgrade");
  return u && u.toLowerCase() === "websocket";
}

function _originOk(origin) {
  if (!origin) return true;
  try {
    const o = new URL(origin).origin;
    return ALLOWED_ORIGINS.has(o);
  } catch (_e) {
    return false;
  }
}

function _genRoomCode(n = 5) {
  const r = new Uint8Array(n);
  crypto.getRandomValues(r);
  let out = "";
  for (let i = 0; i < n; i++) out += CODE_CHARS[r[i] % CODE_CHARS.length];
  return out;
}

function _genClientId() {
  const r = new Uint8Array(9);
  crypto.getRandomValues(r);
  let s = "";
  for (let i = 0; i < r.length; i++) s += r[i].toString(16).padStart(2, "0");
  return s;
}

function _json(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_e) { } }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/" || path === "/health") return new Response("nwr lobby ok", { headers: { "content-type": "text/plain; charset=utf-8" }, });

    if (path === "/ws") {
      if (!_isWsUpgrade(request)) return new Response("Expected WebSocket", { status: 400 });

      const origin = request.headers.get("Origin");
      if (!_originOk(origin)) return new Response("Origin not allowed", { status: 403 });

      const mode = (url.searchParams.get("mode") || "").toLowerCase(); // host | join
      const name = (url.searchParams.get("name") || "player").slice(0, 20);
      let room = (url.searchParams.get("room") || "")
        .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

      if (mode === "host") {
        if (!room) room = _genRoomCode(5);
      } else if (mode === "join") {
        if (!room) return new Response("room required", { status: 400 });
      } else {
        return new Response("mode required (host|join)", { status: 400 });
      }

      const id = env.ROOMS.idFromName(`room:${room}`);
      const stub = env.ROOMS.get(id);

      const fwdUrl = new URL(request.url);
      fwdUrl.searchParams.set("room", room);
      fwdUrl.searchParams.set("name", name);
      fwdUrl.searchParams.set("mode", mode);

      const headers = new Headers(request.headers);
      headers.set("X-Room-Code", room);

      return stub.fetch(new Request(fwdUrl.toString(), { method: request.method, headers }));
    }

    return new Response("Not found", { status: 404 });
  }
};

export class Room extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
    this.roomCode = "";

    this.clients = new Map();
    this.hostId = "";
  }

  async fetch(request) {
    if (!_isWsUpgrade(request)) {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").slice(0, 20).trim();

    // Record room code from Worker
    const room = String(request.headers.get("X-Room-Code") || "").trim().toUpperCase();
    if (room) this.roomCode = room;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    // Hard cap: 4 players
    if (this.clients.size >= 4) {
      _json(server, { t: "err", message: "Room is full (max 4)" });
      try { server.close(1000, "room full"); } catch (_e) { }
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = _genClientId();
    const rec = {
      id,
      name: name || `Player-${id.slice(0, 4)}`,
      ready: false,
    };

    // First connection becomes host.
    if (!this.hostId) this.hostId = id;

    this.clients.set(server, rec);

    _json(server, { t: "welcome", id, room: this.roomCode, host: id === this.hostId, isHost: id === this.hostId, hostId: this.hostId, members: this._players(), players: this._players() });
    this._broadcastState();

    server.addEventListener("message", (ev) => {
      let text = "";
      if (typeof ev.data === "string") text = ev.data;
      else if (ev.data instanceof ArrayBuffer) text = new TextDecoder().decode(ev.data);
      else { try { text = String(ev.data); } catch { text = ""; } }
      if (!text) return;

      let data;
      try { data = JSON.parse(text); } catch { return; }

      const me = this.clients.get(server);
      if (!me) return;

      // ready toggle
      if (data.t === "ready") {
        me.ready = !!data.ready;
        this._broadcastState();
        return;
      }

      // start (host only)
      if (data.t === "start") {
        if (me.id !== this.hostId) return;

        const allReady = [...this.clients.values()].every(p => !!p.ready);
        if (!allReady) {
          _json(server, { t: "err", code: "not_ready" });
          return;
        }
        this._broadcast({ t: "start" });
        return;
      }

      // No.1: game channel relay
      // - input: clients -> host only
      // - snap: host -> everyone
      if (data.t === "g") {
        const op = String(data.op || "");
        if (op === "input") {
          // forward to host
          const payload = { t: "g", op: "input", from: me.id, seq: (data.seq|0), input: data.input || {} };
          for (const [ws, rec] of this.clients.entries()) {
            if (rec && rec.id === this.hostId) _json(ws, payload);
          }
          return;
        }
        if (op === "snap") {
          if (me.id !== this.hostId) return;
          const payload = { t: "g", op: "snap", from: me.id, tick: (data.tick|0), snap: data.snap || data.state || {} };
          this._broadcast(payload);
          return;
        }
      }

      // optional: name change
      if (data.t === "name") {
        const nm = String(data.name || "").slice(0, 20).trim();
        if (nm) me.name = nm;
        this._broadcastState();
        return;
      }
    });

    const onClose = () => {
      const me = this.clients.get(server);
      this.clients.delete(server);

      if (me && me.id === this.hostId) {
        // Host-centric: if host leaves, room ends.
        this._broadcast({ t: "closed", reason: "host left" });
        for (const ws of this.clients.keys()) {
          try { ws.close(1000, "host left"); } catch (_e) { }
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

  _players(){
    return Array.from(this.clients.values()).map((c) => ({
      id: c.id,
      name: c.name,
      ready: !!c.ready,
      host: c.id === this.hostId,
      isHost: c.id === this.hostId,
    }));
  }

  _broadcast(obj) {
    for (const ws of this.clients.keys()) _json(ws, obj);
  }

  _broadcastState() {
    const players = this._players();
    // New message name for client (net.js): "room"
    this._broadcast({ t: "room", room: this.roomCode, hostId: this.hostId, players, members: players });
    // Back-compat alias
    this._broadcast({ t: "state", room: this.roomCode, hostId: this.hostId, players, members: players });
  }
}
