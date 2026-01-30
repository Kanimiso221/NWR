const KEY = "neon_wards_best_v2";

export function loadBest(){
  try{
    const v = localStorage.getItem(KEY);
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) ? n : 0;
  }catch{
    return 0;
  }
}

export function saveBest(score){
  try{
    localStorage.setItem(KEY, String(Math.max(0, (score|0))));
  }catch{
    // ignore
  }
}


// ------------------------------
// Audio settings
// ------------------------------
const AUDIO_KEY = "neon_wards_audio_v1";

export function loadAudioSettings(){
  try{
    const raw = localStorage.getItem(AUDIO_KEY);
    if(!raw) return { muted:false, bgm:0.35, sfx:1.0 };
    const obj = JSON.parse(raw);
    const muted = !!obj.muted;
    const bgm = Number(obj.bgm);
    const sfx = Number(obj.sfx);
    return {
      muted,
      bgm: Number.isFinite(bgm) ? Math.max(0, Math.min(1, bgm)) : 0.35,
      sfx: Number.isFinite(sfx) ? Math.max(0, Math.min(1, sfx)) : 1.0,
    };
  }catch{
    return { muted:false, bgm:0.35, sfx:1.0 };
  }
}

export function saveAudioSettings({ muted, bgm, sfx }){
  try{
    const obj = {
      muted: !!muted,
      bgm: Math.max(0, Math.min(1, Number(bgm))),
      sfx: Math.max(0, Math.min(1, Number(sfx))),
    };
    localStorage.setItem(AUDIO_KEY, JSON.stringify(obj));
  }catch{
    // ignore
  }
}


// ------------------------------
// FOCUS mode selection
// ------------------------------
const FOCUS_KEY = "neon_wards_focus_v1";

export function loadFocusModeId(){
  try{
    const v = localStorage.getItem(FOCUS_KEY);
    const s = (v ? String(v) : "").trim();
    return s || "chrono";
  }catch{
    return "chrono";
  }
}

export function saveFocusModeId(id){
  try{
    const s = (id ? String(id) : "chrono").trim() || "chrono";
    localStorage.setItem(FOCUS_KEY, s);
  }catch{
    // ignore
  }
}
