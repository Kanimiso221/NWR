import { clamp, rand } from "./math.js";

export class Sfx {
  constructor(){
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 1.0;
  }

  setMuted(v){
    this.muted = !!v;
    if(this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setVolume(v){
    this.volume = clamp(Number(v) || 0, 0, 1);
    if(this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  ensure(){
    if(this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
  }

  _blip({freq=440, dur=0.06, type="sine", gain=0.10, bend=0, noise=0} = {}){
    if(this.muted) return;
    this.ensure();
    const t0 = this.ctx.currentTime;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(clamp(gain, 0.0001, 1), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let src = null;

    if(noise > 0){
      const n = this.ctx.createBufferSource();
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for(let i=0;i<len;i++){
        data[i] = (Math.random()*2-1) * noise;
      }
      n.buffer = buf;
      src = n;
    }else{
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if(bend !== 0){
        o.frequency.exponentialRampToValueAtTime(Math.max(40, freq*(1+bend)), t0 + dur);
      }
      src = o;
    }

    src.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  shoot(){
    this._blip({freq: 700 + rand(80,-80), dur: 0.05, type:"square", gain:0.08, bend:-0.35});
    this._blip({freq: 1600 + rand(120,-120), dur: 0.02, type:"sine", gain:0.04});
  }

  hit(){
    this._blip({freq: 160 + rand(30,-30), dur: 0.08, type:"sawtooth", gain:0.10, bend:-0.4});
    this._blip({dur: 0.06, gain:0.06, noise: 0.7});
  }

  pickup(){
    this._blip({freq: 900, dur: 0.07, type:"triangle", gain:0.07, bend:0.25});
    this._blip({freq: 1400, dur: 0.05, type:"sine", gain:0.04, bend:0.15});
  }

  dash(){
    this._blip({freq: 280 + rand(20,-20), dur: 0.09, type:"sine", gain:0.10, bend:0.35});
    this._blip({dur: 0.06, gain:0.05, noise: 0.5});
  }

  death(){
    this._blip({freq: 120, dur: 0.25, type:"sawtooth", gain:0.16, bend:-0.65});
    this._blip({dur: 0.22, gain:0.08, noise: 0.9});
  }

  upgrade(){
    this._blip({freq: 480, dur: 0.08, type:"triangle", gain:0.09, bend:0.25});
    this._blip({freq: 760, dur: 0.06, type:"sine", gain:0.05, bend:0.15});
  }

  boss(){
    this._blip({freq: 84, dur: 0.35, type:"sawtooth", gain:0.18, bend:-0.2});
    this._blip({dur: 0.22, gain:0.10, noise: 0.8});
  }
}


export class Bgm {
  constructor(){
    this.el = null;
    this.muted = false;
    this.volume = 0.35;
    this.key = "";
    this._pendingKey = "";
    this._candidates = null;
    this._candIdx = 0;
    this._locked = true;
  }

  setMuted(v){
    this.muted = !!v;
    if(this.el){
      this.el.volume = this.muted ? 0 : this.volume;
    }
  }

  setVolume(v){
    this.volume = clamp(v, 0, 1);
    if(this.el){
      this.el.volume = this.muted ? 0 : this.volume;
    }
  }

  ensure(){
    if(this.el) return;
    this.el = new Audio();
    this.el.loop = true;
    this.el.preload = "auto";
    this.el.volume = this.muted ? 0 : this.volume;

    // fallback to next extension if a file doesn't exist / fails to decode
    this.el.addEventListener("error", () => {
      if(!this._candidates) return;
      this._candIdx += 1;
      if(this._candIdx >= this._candidates.length){
        // give up silently (no BGM file provided)
        this._candidates = null;
        return;
      }
      this.el.src = this._candidates[this._candIdx];
      // try again (might still be locked, that's fine)
      this.el.play().catch(() => {});
    });
  }

  unlock(){
    // Call this from any user gesture (click/key) to satisfy autoplay policies.
    this._locked = false;
    if(this._pendingKey){
      const k = this._pendingKey;
      this._pendingKey = "";
      this.setTrack(k);
    }else if(this.el && this.el.paused && this.key){
      this.el.play().catch(() => {});
    }
  }

  setTrack(key){
    if(!key) key = "run";
    if(key === this.key) return;

    this.ensure();

    this.key = key;

    // If we haven't received a user gesture yet, remember what we want.
    if(this._locked){
      this._pendingKey = key;
      return;
    }

    // We try multiple extensions so you can drop in whatever you found.
    // Put files here:
    //   /audio/bgm_title.(mp3|ogg|wav)
    //   /audio/bgm_run.(mp3|ogg|wav)
    //   /audio/bgm_shop.(mp3|ogg|wav)
    //   /audio/bgm_boss.(mp3|ogg|wav)
    //   /audio/bgm_reward.(mp3|ogg|wav)
    //   /audio/bgm_gameover.(mp3|ogg|wav)
    const base = `./audio/bgm_${key}`;
    this._candidates = [`${base}.ogg`, `${base}.mp3`, `${base}.wav`];
    this._candIdx = 0;
    this.el.src = this._candidates[0];

    const p = this.el.play();
    if(p && typeof p.catch === "function"){
      p.catch(() => {
        // if still blocked, mark locked and wait for unlock()
        this._locked = true;
        this._pendingKey = key;
      });
    }
  }

  stop(){
    if(!this.el) return;
    this.el.pause();
    this.el.currentTime = 0;
  }
}
