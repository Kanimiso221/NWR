// Lightweight lobby client for Multiplayer (BETA)
// Cloudflare Workers + Durable Objects lobby
//
// Protocol (server side):
//   WebSocket: /ws?mode=host|join&room=CODE&name=NAME
//   Messages from server:
//     { t:"welcome", room, id, isHost, hostId, players:[{id,name,ready,isHost}] }
//     { t:"room", room, hostId, players:[{id,name,ready,isHost}] }
//     { t:"start" }
//     { t:"close", reason }
//     { t:"err", code, message }
//
// Client -> server messages:
//     { t:"ready", ready:true|false }
//     { t:"start" }  // host only

export const DEFAULT_LOBBY_SERVER = "https://nwr-lobby.kasuteranight.workers.dev";

function _safeJsonParse(s){
  try{ return JSON.parse(s); }catch(_){ return null; }
}

function _randStr(n){
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const r = new Uint8Array(n);
  crypto.getRandomValues(r);
  for(let i=0;i<n;i++) out += a[r[i] % a.length];
  return out;
}

function _encodeQS(params){
  const p = new URLSearchParams();
  Object.keys(params).forEach((k)=>{
    const v = params[k];
    if(v === undefined || v === null) return;
    const s = String(v);
    if(!s) return;
    p.set(k, s);
  });
  const qs = p.toString();
  return qs ? ("?" + qs) : "";
}

export class LobbyClient {
  constructor(){
    this.ws = null;
    this.server = DEFAULT_LOBBY_SERVER;
    this.roomCode = "";
    this.selfId = "";
    this.isHost = false;
    this.hostId = "";
    this.members = [];
    this.ready = false;
    this.connecting = false;
    this.connected = false;
    this._lastErr = "";

    this.onState = null;      // (view) => void
    this.onStart = null;      // () => void
    this.onClosed = null;     // (reason) => void
    this.onLog = null;        // (msg) => void
  }

  setServer(_url){
    // Server is fixed for this project.
    this.server = DEFAULT_LOBBY_SERVER;
    this._emit();
  }

  host(name){
    return this._connect({
      mode: "host",
      room: "", // server generates if empty
      name,
    });
  }

  join(roomCode, name){
    const rc = String(roomCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return this._connect({
      mode: "join",
      room: rc,
      name,
    });
  }

  leave(reason="left"){
    try{ this.ws?.close(1000, reason); }catch(_){ }
    this.ws = null;
    this.connecting = false;
    this.connected = false;
    this.isHost = false;
    this.hostId = "";
    this.roomCode = "";
    this.selfId = "";
    this.members = [];
    this.ready = false;
    this._emit();
  }

  setReady(v){
    const r = !!v;
    this.ready = r;
    this._send({ t:"ready", ready: r });
    this._emit();
  }

  toggleReady(){
    this.setReady(!this.ready);
  }

  start(){
    this._send({ t:"start" });
  }

  // No.1: game channel helpers
  sendInput(input, seq=0){
    this._send({ t:"g", op:"input", seq: (seq|0), input: input || {} });
  }
  sendSnapshot(snap, tick=0){
    // host-only (server will ignore if not host)
    this._send({ t:"g", op:"snap", tick: (tick|0), snap: snap || {} });
  }

  // --------------------

  _connect({mode, room, name}){
    const server = DEFAULT_LOBBY_SERVER;
    // Close any previous session.
    this.leave("reconnect");

    let wsUrl = server;
    if(wsUrl.endsWith("/")) wsUrl = wsUrl.slice(0, -1);
    wsUrl = wsUrl.replace(/^http(s?):/i, (m, s) => (s ? "wss:" : "ws:"));

    const nm = String(name || "").trim().slice(0, 20) || `P-${_randStr(4)}`;
    const md = String(mode || "").toLowerCase();

    if(md !== "host" && md !== "join"){
      this._lastErr = "mode required (host|join)";
      this._emit();
      return false;
    }
    if(md === "join" && !room){
      this._lastErr = "room code required";
      this._emit();
      return false;
    }

    wsUrl += "/ws" + _encodeQS({ mode: md, room: room || "", name: nm });

    this.connecting = true;
    this.connected = false;
    this._lastErr = "";
    this._emit();

    let ws;
    try{
      ws = new WebSocket(wsUrl);
    }catch(e){
      this._lastErr = "WebSocket init failed";
      this.connecting = false;
      this.connected = false;
      this._emit();
      return false;
    }

    this.ws = ws;

    ws.addEventListener("open", () => {
      this.connecting = false;
      this.connected = true;
      this._emit();
    });

    ws.addEventListener("message", (ev) => {
      const msg = _safeJsonParse(ev.data);
      if(!msg || !msg.t) return;

      if(msg.t === "welcome"){
        this.selfId = msg.id || "";
        this.roomCode = msg.room || "";
        // Support both old/new server fields:
        // - isHost / host
        // - hostId
        // - players / members
        this.isHost = !!(msg.isHost || msg.host);
        this.hostId = msg.hostId || (this.isHost ? this.selfId : "");
        const list = msg.players || msg.members || [];
        this.members = Array.isArray(list) ? list.map(_normMember) : [];
        if(this.hostId && this.selfId) this.isHost = (this.hostId === this.selfId);
        this._syncReadyFromMembers();
        this._emit();
        return;
      }

      if(msg.t === "room" || msg.t === "state"){
        this.roomCode = msg.room || this.roomCode;
        this.hostId = msg.hostId || this.hostId || "";
        const list = msg.players || msg.members || [];
        this.members = Array.isArray(list) ? list.map(_normMember) : [];
        this.isHost = (this.hostId && this.selfId) ? (this.hostId === this.selfId) : this.isHost;
        this._syncReadyFromMembers();
        this._emit();
        return;
      }

      if(msg.t === "start"){
        if(this.onStart) this.onStart();
        return;
      }

      // Game channel (No.1): input -> host, snapshot -> everyone (relayed by lobby)
      if(msg.t === "g"){
        const op = String(msg.op || "");
        if(op === "input"){
          if(this.onGameInput) this.onGameInput(msg);
          return;
        }
        if(op === "snap"){
          if(this.onGameSnapshot) this.onGameSnapshot(msg);
          return;
        }
      }

      if(msg.t === "close" || msg.t === "closed"){
        const r = String(msg.reason || "room closed");
        this.leave(r);
        if(this.onClosed) this.onClosed(r);
        return;
      }

      if(msg.t === "err"){
        const code = String(msg.code || "");
        const message = String(msg.message || "");
        this._lastErr = message || _friendlyErr(code) || "error";
        this._emit();
        return;
      }
    });

    const onEnd = () => {
      const wasConnected = this.connected || this.connecting;
      this.ws = null;
      this.connecting = false;
      this.connected = false;
      this.isHost = false;
      this.hostId = "";
      this.members = [];
      this.roomCode = "";
      this.selfId = "";
      this.ready = false;
      this._emit();
      if(wasConnected && this.onClosed) this.onClosed("disconnected");
    };

    ws.addEventListener("close", onEnd);
    ws.addEventListener("error", () => {
      this._lastErr = "WebSocket error";
      this._emit();
    });

    return true;
  }

  _syncReadyFromMembers(){
    if(!this.selfId) return;
    const me = this.members.find(m => m && m.id === this.selfId);
    if(me && typeof me.ready === "boolean") this.ready = !!me.ready;
  }

  _send(obj){
    try{
      if(!this.ws) return;
      if(this.ws.readyState !== 1) return;
      this.ws.send(JSON.stringify(obj));
    }catch(_e){}
  }

  _emit(){
    if(!this.onState) return;
    const view = {
      server: this.server,
      connecting: this.connecting,
      connected: this.connected,
      roomCode: this.roomCode,
      selfId: this.selfId,
      isHost: this.isHost,
      hostId: this.hostId,
      ready: this.ready,
      members: this.members,
      error: this._lastErr,
    };
    this.onState(view);
  }
}

function _normMember(p){
  // UI expects {id,name,ready,host}
  const id = (p && p.id) ? String(p.id) : "";
  const name = (p && p.name) ? String(p.name) : "Player";
  const ready = !!(p && p.ready);
  const host = !!(p && (p.isHost || p.host));
  return { id, name, ready, host };
}

function _friendlyErr(code){
  if(code === "not_ready") return "Not everyone is READY yet.";
  if(code === "room_full") return "Room is full.";
  if(code === "host_left") return "Host left the room.";
  return "";
}
