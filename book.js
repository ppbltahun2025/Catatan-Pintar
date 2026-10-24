/* ============================================================
   BUKU BESAR — semua catatan digabung jadi satu buku yang bisa dibalik
   ============================================================ */
(function(){
"use strict";
const SN = window.SN;
const esc = s => SN.escapeHtml(s);
const SORT_KEY = 'sn_booksort';
let sortMode = 'kronologis';
try{ sortMode = localStorage.getItem(SORT_KEY) || 'kronologis'; }catch(e){}
let ui = null, buildId = 0;

SN.views.book = { render(root){ start(root); } };

/* ---------- util ---------- */
const fdate = iso => new Date(iso).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
function hue(s){ let h=0; for(const c of (s||'Umum')) h=(h*31+c.charCodeAt(0))%360; return h; }
function sortedNotes(){
  const a = SN.activeNotes().slice();
  const t = x => new Date(x).getTime();
  if(sortMode==='terbaru') a.sort((x,y)=>t(y.updatedAt)-t(x.updatedAt));
  else if(sortMode==='judul') a.sort((x,y)=>(x.title||'').localeCompare(y.title||'','id'));
  else if(sortMode==='kategori') a.sort((x,y)=>(x.category||'').localeCompare(y.category||'','id')||t(x.createdAt)-t(y.createdAt));
  else a.sort((x,y)=>t(x.createdAt)-t(y.createdAt));
  return a;
}
function metrics(stageW){
  const double = stageW >= 760;
  let pw = double ? Math.min(380, Math.floor((stageW-40)/2)) : Math.min(420, stageW-24);
  pw = Math.max(250, pw);
  let k = Math.round((pw*1.4-78)/26);
  k = Math.max(11, Math.min(k, Math.floor((innerHeight-300-78)/26)));
  return {double, pw, k, ph: 78+26*k};
}

/* ---------- pemecah catatan menjadi blok per baris ---------- */
function blocksOf(content){
  const out = []; let inCode = false;
  String(content||'').replace(/\r/g,'').split('\n').forEach(line=>{
    if(line.trim().startsWith('```')){ inCode = !inCode; return; }
    if(inCode){ out.push({t:'code', raw:line, render:r=>`<pre class="cl">${esc(r)||'&nbsp;'}</pre>`}); return; }
    if(!line.trim()){ if(out.length && out[out.length-1].t!=='blank') out.push({t:'blank', render:()=>'<div class="bl"></div>'}); return; }
    const ol = line.match(/^\s*(\d+)\.\s/);
    const plain = !/^(\s*[-*]\s|\s*\d+\.\s|#{1,3}\s|>\s|-{3,}$|\*{3,}$)/.test(line.trim());
    out.push({t: plain ? 'p' : 'x', raw: line, render: r=>{
      let h = SN.mdToHtml(r, null).replace(/<input type="checkbox"/g,'<input type="checkbox" disabled');
      if(ol) h = h.replace('<ol>', `<ol start="${ol[1]}">`);
      return h;
    }});
  });
  return out;
}

/* ---------- penyusun halaman ---------- */
function paginate(note, inner){
  const pages = [];
  const first = `<div class="nh"><div class="nh-title">${esc(note.title||'Tanpa judul')}</div>`+
    `<div class="nh-meta">${esc(note.category||'Umum')} · ditulis ${fdate(note.createdAt)}`+
    (note.updatedAt!==note.createdAt ? ` · diperbarui ${fdate(note.updatedAt)}` : '')+`</div>`+
    ((note.tags||[]).length ? `<div class="nh-tags">${note.tags.slice(0,5).map(t=>'#'+esc(t)).join('  ')}</div>` : '')+
    `<button class="nh-open" data-open="${note.id}" title="Buka & edit catatan ini">✎ buka</button></div>`;
  const cont = `<div class="nh cont"><div class="nh-meta">${esc((note.title||'Tanpa judul').slice(0,40))} — lanjutan</div></div>`;
  const fits = () => inner.scrollHeight <= inner.clientHeight + 1;
  const blks = () => inner.querySelectorAll('.blk').length;
  const flush = () => { pages.push(inner.innerHTML); inner.innerHTML = cont; };
  inner.innerHTML = first;
  const list = blocksOf(note.content);
  if(!list.length) list.push({t:'x', raw:'', render:()=>'<p class="empty-line">(catatan kosong)</p>'});
  list.forEach(b=>{
    if(b.t==='blank' && blks()===0) return;
    let el = document.createElement('div'); el.className = 'blk';
    el.innerHTML = b.render(b.raw); inner.appendChild(el);
    if(fits()) return;
    if(b.t !== 'p'){
      inner.removeChild(el);
      if(b.t==='blank'){ return; }
      if(blks()>0) flush();
      inner.appendChild(el); return;
    }
    // paragraf panjang: pecah per kata supaya halaman terisi penuh
    let rest = b.raw, guard = 0;
    while(guard++ < 400){
      el.innerHTML = b.render(rest);
      if(fits()) break;
      const words = rest.split(' ');
      let lo = 0, hi = words.length-1;
      while(lo < hi){
        const mid = Math.ceil((lo+hi)/2);
        el.innerHTML = b.render(words.slice(0,mid).join(' '));
        if(fits()) lo = mid; else hi = mid-1;
      }
      if(lo === 0){
        if(blks()===1){ el.innerHTML = b.render(rest); break; }   // halaman kosong pun tak muat: paksa
        inner.removeChild(el); flush(); inner.appendChild(el); continue;
      }
      el.innerHTML = b.render(words.slice(0,lo).join(' '));
      flush();
      rest = words.slice(lo).join(' ');
      el = document.createElement('div'); el.className = 'blk'; inner.appendChild(el);
    }
  });
  pages.push(inner.innerHTML);
  return pages;
}

function buildPages(m, stage){
  const notes = sortedNotes();
  const meas = document.createElement('div');
  meas.className = 'book-measure';
  meas.style.cssText = `--pw:${m.pw}px;--ph:${m.ph}px`;
  meas.innerHTML = '<div class="page-inner"></div>';
  stage.appendChild(meas);
  const inner = meas.firstChild;
  const per = notes.map(n=>paginate(n, inner));
  meas.remove();

  const epp = Math.max(4, m.k - 3);
  const T = Math.max(1, Math.ceil(notes.length/epp));
  const pages = [];     // {html, cls, noteId}
  const user = SN.userName || 'Pemilik';
  const totalWords = notes.reduce((s,n)=>s+(n.wc||0),0);

  pages.push({cls:'cover', html:
    `<div class="cv-frame"><div class="cv-top">BUKU BESAR</div><div class="cv-orn">✦ ✦ ✦</div>`+
    `<div class="cv-title">Catatan<br>Pintar</div><div class="cv-orn">— ❖ —</div>`+
    `<div class="cv-sub">milik</div><div class="cv-name">${esc(user)}</div>`+
    `<div class="cv-meta">${notes.length} catatan · ${totalWords.toLocaleString('id-ID')} kata</div><div class="cv-vol">Jilid I</div></div>`});
  pages.push({cls:'plain', html:
    `<div class="page-inner exl"><div class="exl-box"><div class="exl-top">Ex libris</div>`+
    `<div class="exl-quill">${SN.quillSvg ? SN.quillSvg() : '✒'}</div>`+
    `<div class="exl-name">${esc(user)}</div><div class="exl-line">Buku ini berisi catatan yang ditulis dengan sepenuh hati.</div>`+
    `<div class="exl-date">Dijilid ${fdate(new Date().toISOString())}</div></div></div>`});

  // daftar halaman
  let start = T + 1;                       // nomor halaman cetak catatan pertama
  const firstPage = notes.map((n,i)=>{ const p = start; start += per[i].length; return p; });
  for(let t=0; t<T; t++){
    const slice = notes.slice(t*epp, (t+1)*epp);
    const rows = slice.map((n,j)=>{
      const gi = t*epp + j;
      return `<div class="toc-row" data-goto="${firstPage[gi]}" title="Terakhir diperbarui ${fdate(n.updatedAt)}">`+
        `<span class="dotc" style="background:hsl(${hue(n.category)} 55% 50%)"></span><span class="t">${esc(n.title||'Tanpa judul')}</span>`+
        `<span class="lead"></span><span class="n">${firstPage[gi]}</span></div>`;
    }).join('');
    pages.push({cls:'plain toc', html:
      `<div class="page-inner"><div class="toc-title">Daftar Halaman${T>1?` <small>(${t+1}/${T})</small>`:''}</div>`+
      `<div class="toc-sp"></div>${rows || '<p class="empty-line">Belum ada catatan. Tulis yang pertama!</p>'}</div>`});
  }
  notes.forEach((n,i)=>per[i].forEach(h=>pages.push({cls:'plain', foot:n.title||'Tanpa judul', noteId:n.id, html:`<div class="page-inner">${h}</div>`})));

  if(m.double){ while((pages.length+1)%2) pages.push({cls:'plain', html:'<div class="page-inner"></div>'}); }
  const dates = notes.map(n=>new Date(n.createdAt).getTime());
  pages.push({cls:'plain', html:
    `<div class="page-inner end"><div class="end-box"><div class="exl-top">Akhir jilid</div><div class="end-orn">❖</div>`+
    `<p>${notes.length} catatan · ${(pages.length-1).toLocaleString('id-ID')} halaman · ${totalWords.toLocaleString('id-ID')} kata</p>`+
    (dates.length ? `<p>Ditulis sejak ${fdate(Math.min(...dates))} sampai ${fdate(Math.max(...notes.map(n=>new Date(n.updatedAt).getTime())))}</p>` : '')+
    `<p class="end-sub">Halaman berikutnya masih kosong — tuliskan saja.</p></div></div>`});
  return {pages, firstPage, notes, T};
}

/* ---------- tampilan ---------- */
function start(root){
  const id = ++buildId;
  root.innerHTML = `<div class="section-head"><h2 style="font-size:20px;">Buku Besar</h2><span class="hint" id="book-hint">Menjilid catatanmu…</span></div><div class="book-loading">✒ Menata halaman…</div>`;
  const fonts = document.fonts && document.fonts.load
    ? Promise.race([Promise.all([document.fonts.load('15px Kalam'), document.fonts.load('34px Caveat'), document.fonts.load('15px Lora')]).catch(()=>0), new Promise(r=>setTimeout(r,1500))])
    : Promise.resolve();
  fonts.then(()=>{ if(id===buildId && document.body.dataset.view==='book') build(root, null); });
}

function build(root, keepIdx){
  const stageW = root.clientWidth || 800;
  const m = metrics(stageW);
  root.innerHTML = `
    <div class="section-head"><h2 style="font-size:20px;">Buku Besar</h2><span class="hint" id="book-hint"></span></div>
    <div class="book-bar">
      <button class="bb" id="bk-prev" title="Halaman sebelumnya (←)">◀</button>
      <span class="bk-ind" id="bk-ind">Sampul</span>
      <button class="bb" id="bk-next" title="Halaman berikutnya (→)">▶</button>
      <button class="bb txt" id="bk-toc">☰ Daftar halaman</button>
      <button class="bb txt" id="bk-resume" hidden>↻ Lanjut membaca</button>
      <form class="bk-jump" id="bk-jump"><input type="number" min="1" id="bk-jump-n" placeholder="hal." aria-label="Lompat ke halaman" /><button class="bb txt" type="submit">Pergi</button></form>
      <select class="meta-select" id="bk-sort" title="Urutan catatan dalam buku">
        <option value="kronologis">Urut: tanggal tulis</option><option value="terbaru">Urut: terbaru</option>
        <option value="judul">Urut: judul A–Z</option><option value="kategori">Urut: kategori</option>
      </select>
      <button class="bb txt" id="bk-open" hidden>✎ Buka catatan ini</button>
    </div>
    <div class="book-stage" id="book-stage" style="--pw:${m.pw}px;--ph:${m.ph}px"></div>
    <div class="hint book-tip" id="book-tip"></div>`;
  const stage = document.getElementById('book-stage');
  const built = buildPages(m, stage);
  const pages = built.pages, P = pages.length;
  const L = m.double ? P/2 : P;

  // ----- leaf
  let html = '<div class="book-wrap" id="book-wrap">';
  const face = (p, idx, side) => `<div class="face ${side} ${p.cls||''}">${p.html}`+
    (idx>=2 && p.cls!=='cover' ? `<div class="pg-num">${idx-1}</div>` : '')+
    (p.foot ? `<div class="pg-foot">${esc(p.foot.slice(0,34))}</div>` : '')+`</div>`;
  for(let i=0; i<L; i++){
    const a = m.double ? 2*i : i;
    html += `<div class="leaf" data-i="${i}" style="--zc:${L-i};--zo:${i+1}">`+
      face(pages[a], a, 'front') + (m.double ? face(pages[a+1], a+1, 'back') : '') + `</div>`;
  }
  html += '</div>';
  stage.insertAdjacentHTML('afterbegin', html);
  const wrap = document.getElementById('book-wrap');
  wrap.style.width = m.pw+'px'; wrap.style.height = m.ph+'px';
  stage.style.minHeight = (m.ph+50)+'px';
  const leaves = Array.from(wrap.querySelectorAll('.leaf'));

  let f = 0;
  const idxOf = f => f===0 ? 0 : (m.double ? Math.min(2*f, P-1) : Math.min(f, P-1));
  const fOf = idx => Math.max(0, Math.min(L, m.double ? Math.ceil(idx/2) : idx));
  const shiftOf = f => !m.double ? 0 : f===0 ? 0 : f>=L ? m.pw : m.pw/2;
  const tip = document.getElementById('book-tip');
  const saveKey = SN.K.book(SN.user.username);

  function noteOnView(){
    const cands = m.double ? [2*f, 2*f-1] : [f];
    for(const i of cands){ if(pages[i] && pages[i].noteId) return pages[i].noteId; }
    return null;
  }
  function indicator(){
    const el = document.getElementById('bk-ind');
    const idxs = f===0 ? [] : m.double ? [2*f-1, 2*f] : [f];
    const nums = idxs.filter(i=>i>=2 && i<P).map(i=>i-1);
    const totalNum = P-2;
    el.textContent = f===0 ? 'Sampul' : nums.length ? 'Hal. '+(nums.length>1 ? nums[0]+'–'+nums[1] : nums[0])+' / '+totalNum : 'Sampul dalam';
    document.getElementById('bk-prev').disabled = f<=0;
    document.getElementById('bk-next').disabled = f>=L || (!m.double && f>=P-1);
    const nid = noteOnView(), ob = document.getElementById('bk-open');
    ob.hidden = !nid; ob.dataset.id = nid || '';
    try{ localStorage.setItem(saveKey, String(idxOf(f))); }catch(e){}
  }
  function setFlipped(target, instant){
    target = Math.max(0, Math.min(m.double ? L : P-1, target));
    if(target === f && !instant) return;
    const from = f; f = target;
    wrap.style.transition = instant ? 'none' : '';
    const lo = Math.min(from,f), hi = Math.max(from,f);
    const n = hi-lo, step = instant ? 0 : Math.min(110, 760/Math.max(1,n));
    for(let i=lo; i<hi; i++){
      const k = f>from ? i-lo : hi-1-i;
      const lf = leaves[i];
      lf.style.transition = instant ? 'none' : '';
      lf.style.transitionDelay = instant ? '0s' : `${k*step}ms, ${k*step+480}ms`;
      lf.classList.toggle('flipped', f>from);
      if(!instant){ lf.classList.add('turning'); setTimeout(()=>lf.classList.remove('turning'), 1100+k*step); }
    }
    wrap.style.transform = `translateX(${shiftOf(f)}px)`;
    if(!instant && n){ const c = Math.min(n,3); for(let j=0;j<c;j++) setTimeout(SN.fx.flip, j*140); }
    stage.classList.toggle('is-open', f>0);
    indicator();
    if(instant) requestAnimationFrame(()=>{ wrap.style.transition=''; leaves.forEach(l=>{l.style.transition='';}); });
  }
  const next = ()=>setFlipped(f+1), prev = ()=>setFlipped(f-1);
  const gotoDisp = d => setFlipped(fOf(Math.max(1, Math.min(P-1, d+1))));
  const gotoIdx = i => setFlipped(fOf(i));

  // ----- toolbar
  document.getElementById('bk-next').onclick = next;
  document.getElementById('bk-prev').onclick = prev;
  document.getElementById('bk-toc').onclick = ()=>gotoDisp(1);
  document.getElementById('bk-open').onclick = e=>{ if(e.currentTarget.dataset.id) SN.openNote(e.currentTarget.dataset.id); };
  const jump = document.getElementById('bk-jump');
  jump.onsubmit = e=>{ e.preventDefault(); const v = parseInt(document.getElementById('bk-jump-n').value,10); if(v>0) gotoDisp(v); };
  const sel = document.getElementById('bk-sort'); sel.value = sortMode;
  sel.onchange = ()=>{ sortMode = sel.value; try{ localStorage.setItem(SORT_KEY, sortMode); }catch(e){} start(root); };

  let saved = 0; try{ saved = parseInt(localStorage.getItem(saveKey)||'0',10) || 0; }catch(e){}
  const rb = document.getElementById('bk-resume');
  if(saved > 1 && saved < P-1){ rb.hidden = false; rb.textContent = '↻ Lanjut hal. '+(saved-1); rb.onclick = ()=>gotoIdx(saved); }

  // ----- klik / sentuh / papan ketik
  stage.addEventListener('click', e=>{
    const g = e.target.closest('[data-goto]'); if(g){ gotoDisp(parseInt(g.dataset.goto,10)); return; }
    const o = e.target.closest('[data-open]'); if(o){ SN.openNote(o.dataset.open); return; }
    if(e.target.closest('a,button,input,select')) return;
    const r = wrap.getBoundingClientRect();
    if(m.double) (e.clientX < r.left ? prev : next)();
    else ((e.clientX - r.left) < r.width*0.3 ? prev : next)();
  });
  let tx = null;
  stage.addEventListener('touchstart', e=>{ tx = e.touches[0].clientX; }, {passive:true});
  stage.addEventListener('touchend', e=>{
    if(tx==null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
    if(Math.abs(dx) > 45){ (dx<0 ? next : prev)(); e.preventDefault(); }
  });
  ui = {next, prev, resize: ()=>build(root, idxOf(f))};

  document.getElementById('book-hint').textContent =
    `${built.notes.length} catatan · ${P} lembar halaman · klik tepi halaman atau tekan ← → untuk membalik`;
  tip.textContent = m.double ? '' : 'Tampilan ponsel: ketuk bagian kanan halaman untuk maju, bagian kiri untuk mundur, atau geser.';

  // posisi awal
  const target = keepIdx != null ? keepIdx : saved;
  if(keepIdx != null) setFlipped(fOf(keepIdx), true);
  else { indicator(); if(saved > 0){ setTimeout(()=>{ if(document.getElementById('book-wrap')===wrap) gotoIdx(saved); }, 450); } }
  void target;
}

let rz = null;
addEventListener('resize', ()=>{
  clearTimeout(rz);
  rz = setTimeout(()=>{ if(document.body.dataset.view==='book' && ui && document.getElementById('book-stage')) ui.resize(); }, 250);
});
document.addEventListener('keydown', e=>{
  if(document.body.dataset.view !== 'book' || !ui) return;
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if(e.key==='ArrowRight' || e.key==='PageDown') { e.preventDefault(); ui.next(); }
  if(e.key==='ArrowLeft'  || e.key==='PageUp')   { e.preventDefault(); ui.prev(); }
});
})();
