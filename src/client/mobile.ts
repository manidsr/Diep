/** Browser-safe native boundary. The Android build installs this bridge before client.js. */
type Cue='shot'|'hurt'|'pickup'|'death';
interface NativeDevice{vibrate:(cue:Cue)=>Promise<void>}
export function nativeDevice():NativeDevice|undefined{return (globalThis as typeof globalThis&{TankNative?:NativeDevice}).TankNative;}
/** Only an HTTP(S) origin, no arbitrary paths, credentials, queries or script URLs. */
export function normalizeServer(value:string):string|null{
  let v=value.trim();if(!v||/\s/.test(v))return null;
  if(!v.includes('://')){v='http://'+v;if(!/]:\d+$|:[0-9]+$/.test(v)&&!v.endsWith('/'))v+=':3000';}
  if(!/^https?:\/\//i.test(v))return null;
  try{const u=new URL(v);if(!u.hostname||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return null;return u.origin;}catch{return null;}
}
export function serverSocket(origin:string):string{
  const url=new URL(origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';return url.href;
}
let enabled=true;try{enabled=localStorage.getItem('tank-haptics')!=='off';}catch{}
export const hapticsEnabled=()=>enabled;
export function setHaptics(value:boolean){enabled=value;try{localStorage.setItem('tank-haptics',value?'on':'off');}catch{}}
let last=0;
export function haptic(cue:Cue){const device=nativeDevice();if(!enabled||!device||typeof document==='undefined'||document.hidden)return;
  const now=performance.now();if(cue==='shot'&&now-last<180||cue==='hurt'&&now-last<120)return;
  last=now;void device.vibrate(cue).catch(()=>{/* optional haptic hardware */});
}
