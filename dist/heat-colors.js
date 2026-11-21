// Equal steps in OKLab on each side of neutral. Values outside ±50% are capped.
const LOW = [0.55, 0.10, 0.105], MID = [0.96, 0, 0], HIGH = [0.55, -0.035, -0.13];
export function heatColor(delta) {
  if (delta === null || !Number.isFinite(delta)) return '#ffffff';
  const t = Math.min(1, Math.abs(delta) / 50), end = delta < 0 ? LOW : HIGH;
  const [L,a,b] = MID.map((v,i)=>v+(end[i]-v)*t);
  const l=(L+0.3963377774*a+0.2158037573*b)**3;
  const m=(L-0.1055613458*a-0.0638541728*b)**3;
  const s=(L-0.0894841775*a-1.291485548*b)**3;
  const rgb=[4.0767416621*l-3.3077115913*m+0.2309699292*s,
    -1.2684380046*l+2.6097574011*m-0.3413193965*s,
    -0.0041960863*l-0.7034186147*m+1.707614701*s];
  return '#'+rgb.map(v=>Math.round(255*Math.max(0,Math.min(1,v<=0.0031308?12.92*v:1.055*v**(1/2.4)-0.055))).toString(16).padStart(2,'0')).join('');
}
export function luminance(hex) {
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
export function heatTextColor(delta) {return luminance(heatColor(delta)) > 0.179 ? '#000000' : '#ffffff';}
export function heatSymbol(delta) {return delta===null || !Number.isFinite(delta)?'×':delta<0?'−':delta>0?'+':'=';}
