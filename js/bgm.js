export class Bgm {
  constructor(){
    this.current = "";
    this.audio = null;
    this.unlocked = false;

    this.muted = false;

    this.volume = 0.35;
    this.exts = ["mp3","ogg","wav"];
    this._missing = Object.create(null);
    this._resolved = Object.create(null); // key -> url string
    this._resolving = Object.create(null); // key -> Promise

  }

  unlock(){
    this.unlocked = true;
    if(this.audio){
      this.audio.play().catch(()=>{});
    }
  }

  setVolume(v){
    this.volume = Math.max(0, Math.min(1, v));
    if(this.audio) this.audio.volume = this.volume;
  }

  setMuted(flag){
    this.muted = !!flag;
    if(this.audio) this.audio.muted = this.muted;
  }

  _ensureAudio(){
    if(this.audio) return;
    const a = new Audio();
    a.loop = true;
    a.preload = "auto";
    a.volume = this.volume;
    a.muted = this.muted;
    this.audio = a;
  }

  _tryLoad(key){
    if(!key) return;
    if(this._missing[key]) return;

    this._ensureAudio();
    const a = this.audio;

    // If we already resolved a working URL, use it without touching missing extensions.
    if(this._resolved[key]){
      if(a.src !== this._resolved[key]) a.src = this._resolved[key];
      if(this.unlocked) a.play().catch(()=>{});
      return;
    }

    // Resolve once per key with fetch() to avoid noisy 404 logs in console.
    if(this._resolving[key]) return;

    const base = `audio/${key}`;
    const exts = this.exts.slice();

    const resolve = async () => {
      for(const ext of exts){
        const url = `${base}.${ext}`;
        try{
          const res = await fetch(url, { method: "HEAD", cache: "no-cache" });
          if(res && res.ok){
            this._resolved[key] = url;
            return url;
          }
        }catch(_e){
          // If HEAD is blocked (some file:// or strict servers), fall back to GET.
          try{
            const res2 = await fetch(url, { method: "GET", cache: "no-cache" });
            if(res2 && res2.ok){
              this._resolved[key] = url;
              return url;
            }
          }catch(__e){}
        }
      }
      this._missing[key] = true;
      return "";
    };

    this._resolving[key] = resolve().then((url) => {
      delete this._resolving[key];
      if(!url){
        a.pause();
        return;
      }
      // Assign src only once (no 404 chain).
      if(a.src !== url) a.src = url;

      a.muted = this.muted;

      // Apply volume immediately; muted is handled via main.js calling setMuted().
      if(this.unlocked){
        a.play().catch(()=>{});
      }
    });
  }

  setTrack(key){
    if(key === this.current) return;
    this.current = key || "";

    this._ensureAudio();
    const a = this.audio;

    if(!key){
      a.pause();
      return;
    }

    this._tryLoad(key);
  }

  update(game){
    let key = "";

    if(game.state === "title"){
      key = "bgm_title";
    } else if(game.state === "gameover"){
      key = "bgm_gameover";
    } else if(game.state === "shop"){
      key = "bgm_shop";
    } else if(game.state === "reward"){
      // User request: Reward uses the same track as Run
      key = "bgm_run";
    } else if(game.state === "playing" || game.state === "paused"){
      key = game.roomIsBoss ? "bgm_boss" : "bgm_run";
    }

    this.setTrack(key);
  }
}
