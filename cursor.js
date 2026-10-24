/* ============================================================
   EFEK: kursor bulu penulis, jejak tinta, percikan, konfeti, suara
   ============================================================ */
(function(){
"use strict";
const SN = window.SN = window.SN || {};
const fx = SN.fx = {};
const fine = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const lsGet = (k,d)=>{ try{ const v=localStorage.getItem(k); return v===null?d:v; }catch(e){ return d; } };
const lsSet = (k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };

/* ---------- Kursor bulu (SVG data-URI, ujung pena = hotspot) ---------- */
function quillSvg(tilt){
  return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 48 48'>
<defs><linearGradient id='g' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#fbf5e6'/><stop offset='.55' stop-color='#e6d6b4'/><stop offset='1' stop-color='#b48a4a'/></linearGradient></defs>
<g transform='${tilt||""}'>
<path d='M6 43C9 28 19 12 44 3C42 14 38 25 31 31C24 37 15 40 6 43Z' fill='url(#g)' stroke='#5a4020' stroke-width='1.2' stroke-linejoin='round'/>
<path d='M4 45C14 30 26 16 43 4' fill='none' stroke='#4a3418' stroke-width='1.5' stroke-linecap='round'/>
<path d='M13 33l4 2M17 27l5 3M22 21l5 3M28 16l5 2M33 11l4 1' stroke='#7a5a2c' stroke-width='.8' stroke-linecap='round' opacity='.7'/>
<path d='M4 45L1.5 47.2L7 44.6Z' fill='#1b1b22'/>
</g></svg>`;
}
function cursorUrl(tilt){ return 'url("data:image/svg+xml;utf8,'+encodeURIComponent(quillSvg(tilt))+'")'; }
SN.quillSvg = quillSvg;
if(fine){
  const normal = cursorUrl(), hot = cursorUrl('rotate(-8 24 24) scale(1.05)');
  const st = document.createElement('style');
  st.textContent = `html,body,*{cursor:${normal} 2 30,auto !important;}
  a,button,select,summary,label,input[type=checkbox],[data-action],[data-view],[data-goto],[data-open],.nav-item,.note-card,.leaf{cursor:${hot} 2 30,pointer !important;}`;
  document.head.appendChild(st);
}

/* ---------- Kanvas jejak tinta ---------- */
let inkOn = lsGet('sn_ink','1')==='1' && fine && !reduced;
fx.inkEnabled = ()=>inkOn;
fx.setInk = v=>{ inkOn=!!v && fine && !reduced; lsSet('sn_ink', v?'1':'0'); };
const cv = document.getElementById('ink-canvas');
const ctx = cv && cv.getContext('2d');
let W=0,H=0,dpr=1, running=false, last=null, down=false, blobs=[];
function resize(){
  if(!cv) return;
  dpr = Math.min(2, window.devicePixelRatio||1);
  W = innerWidth; H = innerHeight;
  cv.width = W*dpr; cv.height = H*dpr; cv.style.width=W+'px'; cv.style.height=H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
function inkColor(a){
  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  return dark ? `rgba(160,190,240,${a})` : `rgba(32,48,100,${a})`;
}
function loop(){
  if(!ctx){ running=false; return; }
  // pudarkan perlahan (menulis tahan lebih lama)
  ctx.globalCompositeOperation='destination-out';
  ctx.fillStyle = `rgba(0,0,0,${down?0.012:0.07})`;
  ctx.fillRect(0,0,W,H);
  ctx.globalCompositeOperation='source-over';
  blobs = blobs.filter(b=>b.life>0);
  blobs.forEach(b=>{
    b.x+=b.vx; b.y+=b.vy; b.vx*=.9; b.vy*=.9; b.life-=1;
    ctx.beginPath(); ctx.fillStyle=inkColor(Math.min(.8,b.life/30)); ctx.arc(b.x,b.y,b.r*(b.life/50+.3),0,7); ctx.fill();
  });
  if(blobs.length || down || (performance.now()-lastMove<1400)) requestAnimationFrame(loop);
  else { ctx.clearRect(0,0,W,H); running=false; }
}
let lastMove=0;
function kick(){ if(!running){ running=true; requestAnimationFrame(loop); } }
if(cv && fine){
  resize(); addEventListener('resize', resize);
  addEventListener('pointermove', e=>{
    if(!inkOn || e.pointerType==='touch') return;
    const now=performance.now(); lastMove=now;
    if(last){
      const dx=e.clientX-last.x, dy=e.clientY-last.y, d=Math.hypot(dx,dy);
      if(d>1){
        const speed=Math.min(1,d/40);
        const w = down ? 3.2-speed*1.8 : 1.8-speed*1.1;
        ctx.beginPath(); ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.strokeStyle = inkColor(down?.9:.45); ctx.lineWidth=Math.max(.7,w);
        ctx.moveTo(last.x,last.y); ctx.lineTo(e.clientX,e.clientY); ctx.stroke();
        if(down && Math.random()<.06) blobs.push({x:e.clientX,y:e.clientY,vx:0,vy:.3,r:1.4+Math.random()*1.5,life:40});
      }
    }
    last={x:e.clientX,y:e.clientY}; kick();
  },{passive:true});
  addEventListener('pointerdown', e=>{
    if(!inkOn || e.pointerType==='touch') return;
    down=true; last={x:e.clientX,y:e.clientY};
    for(let i=0;i<9;i++){ const a=Math.random()*6.28, s=1+Math.random()*3.2;
      blobs.push({x:e.clientX,y:e.clientY,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:1+Math.random()*2.6,life:30+Math.random()*30}); }
    blobs.push({x:e.clientX,y:e.clientY,vx:0,vy:0,r:5,life:60});
    kick();
  });
  addEventListener('pointerup', ()=>{ down=false; kick(); });
  document.addEventListener('mouseleave', ()=>{ last=null; });
}

/* ---------- Konfeti kertas ---------- */
fx.confetti = function(x,y){
  if(reduced) return;
  const c = document.createElement('canvas');
  c.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9000';
  const d = Math.min(2,devicePixelRatio||1); c.width=innerWidth*d; c.height=innerHeight*d;
  document.body.appendChild(c);
  const g=c.getContext('2d'); g.scale(d,d);
  const cols=['#c0392b','#d9974c','#2f4b7c','#3f7d6b','#b48a4a','#8e5ea2'];
  const ox = x ?? innerWidth/2, oy = y ?? innerHeight*0.35;
  const ps = Array.from({length:110},()=>({x:ox,y:oy,vx:(Math.random()-.5)*14,vy:-Math.random()*13-3,
    w:5+Math.random()*7,h:3+Math.random()*5,r:Math.random()*6,vr:(Math.random()-.5)*.5,c:cols[Math.random()*cols.length|0]}));
  let t=0;
  (function f(){
    g.clearRect(0,0,innerWidth,innerHeight); t++;
    ps.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=.35; p.vx*=.985; p.r+=p.vr;
      g.save(); g.translate(p.x,p.y); g.rotate(p.r); g.globalAlpha=Math.max(0,1-t/130); g.fillStyle=p.c; g.fillRect(-p.w/2,-p.h/2,p.w,p.h); g.restore(); });
    if(t<130) requestAnimationFrame(f); else c.remove();
  })();
};

/* ---------- Suara (WebAudio, tanpa file) ---------- */
let soundOn = lsGet('sn_sound','0')==='1', ac=null;
fx.soundEnabled = ()=>soundOn;
fx.setSound = v=>{ soundOn=!!v; lsSet('sn_sound', v?'1':'0'); };
function audio(){ if(!ac){ try{ ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(ac && ac.state==='suspended') ac.resume(); return ac; }
function noise(dur, freq, q, vol){
  const a=audio(); if(!a) return;
  const n=Math.floor(a.sampleRate*dur), buf=a.createBuffer(1,n,a.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2);
  const s=a.createBufferSource(); s.buffer=buf;
  const f=a.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=q;
  const gn=a.createGain(); gn.gain.value=vol;
  s.connect(f); f.connect(gn); gn.connect(a.destination); s.start();
}
fx.flip = ()=>{ if(soundOn) noise(.32, 1800+Math.random()*500, .7, .22); };
let lastTick=0;
fx.tick = ()=>{ if(!soundOn) return; const t=performance.now(); if(t-lastTick<70) return; lastTick=t; noise(.05, 3200+Math.random()*900, 2.5, .07); };
fx.ding = ()=>{ if(!soundOn) return; const a=audio(); if(!a) return; const o=a.createOscillator(), g=a.createGain();
  o.type='sine'; o.frequency.value=880; g.gain.setValueAtTime(.12,a.currentTime); g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.6);
  o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+.6); };
})();
