/* ============================================================
   JEJAK — kapan setiap tulisan dibuat / diperbarui, dalam rentang tertentu
   ============================================================ */
(function(){
"use strict";
const SN = window.SN;
const esc = s => SN.escapeHtml(s);
const f = {from:'', to:'', noteId:'all', kind:'all', tab:'timeline', chip:'7'};
const fmtDay = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y,m-1,d); };
const keyOf = d => SN.dayKey(d);
const hhmm = iso => new Date(iso).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}).replace('.',':');
const dlong = k => fmtDay(k).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

function chipRange(c){
  const to = new Date(); const from = new Date();
  if(c==='all') return {from:'', to:''};
  from.setDate(from.getDate() - (c==='today' ? 0 : parseInt(c,10)-1));
  return {from:keyOf(from), to:keyOf(to)};
}
function icon(e){
  if(e.kind==='create') return '🌱';
  if(e.kind==='edit') return '✒';
  if(e.kind==='task' || /tugas/i.test(e.action||'')) return '✅';
  if(/trash/i.test(e.action||'')) return '🗑';
  if(/analysis/i.test(e.action||'')) return '✨';
  if(/link/i.test(e.action||'')) return '🔗';
  return '•';
}
function label(e){
  if(e.kind==='create') return 'Catatan dibuat';
  if(e.kind==='edit'){
    const d = (e.to||0)-(e.from||0);
    return d>0 ? `Menulis · +${d} kata` : d<0 ? `Menyunting · ${d} kata` : 'Menyunting';
  }
  return e.action || 'Aktivitas';
}
function kindOf(e){ return e.kind==='create' ? 'create' : e.kind==='edit' ? 'edit' : 'other'; }

function collect(){
  const out = [];
  SN.notes.forEach(n=>{
    (n.history||[]).forEach(h=>out.push(Object.assign({note:n}, h)));
  });
  return out;
}
function inRange(e){
  const k = SN.dayKey(e.at);
  if(f.from && k < f.from) return false;
  if(f.to && k > f.to) return false;
  if(f.noteId!=='all' && e.note.id!==f.noteId) return false;
  if(f.kind!=='all' && kindOf(e)!==f.kind) return false;
  return true;
}

SN.views.jejak = { render(root, params){
  if(params && (params.from || params.to || params.noteId)){
    f.from = params.from || ''; f.to = params.to || params.from || ''; f.noteId = params.noteId || 'all'; f.chip = '';
    f.tab = 'timeline';
    if(params.noteId && !params.from){ f.from=''; f.to=''; f.chip='all'; }
  } else if(!f.from && !f.to && f.chip==='7'){ Object.assign(f, chipRange('7')); }
  draw(root);
}};

function draw(root){
  const all = collect().filter(e=>f.noteId==='all' || e.note.id===f.noteId);
  const ev = collect().filter(inRange).sort((a,b)=>new Date(b.at)-new Date(a.at));
  const edits = ev.filter(e=>e.kind==='edit');
  const words = edits.reduce((s,e)=>s+Math.max(0,(e.to||0)-(e.from||0)),0);
  const days = new Set(ev.map(e=>SN.dayKey(e.at))).size;
  const touched = new Set(ev.map(e=>e.note.id)).size;
  const chips = [['today','Hari ini'],['7','7 hari'],['30','30 hari'],['90','90 hari'],['all','Semua']];
  const noteOpts = SN.notes.filter(n=>!n.trashed).slice().sort((a,b)=>(a.title||'').localeCompare(b.title||'','id'))
    .map(n=>`<option value="${n.id}" ${f.noteId===n.id?'selected':''}>${esc((n.title||'Tanpa judul').slice(0,40))}</option>`).join('');

  root.innerHTML = `
    <div class="section-head"><h2 style="font-size:20px;">Jejak Tulisan</h2>
      <span class="hint">Setiap sesi menulis, pembuatan, dan pembaruan tercatat otomatis.</span></div>

    <div class="panel pad jj-filters">
      <div class="chip-row">${chips.map(([k,t])=>`<button class="chipb ${f.chip===k?'on':''}" data-chip="${k}">${t}</button>`).join('')}</div>
      <div class="jj-range">
        <label>Dari <input type="date" id="jj-from" value="${f.from}" /></label>
        <label>Sampai <input type="date" id="jj-to" value="${f.to}" /></label>
        <select class="meta-select" id="jj-note"><option value="all">Semua catatan</option>${noteOpts}</select>
        <select class="meta-select" id="jj-kind">
          <option value="all" ${f.kind==='all'?'selected':''}>Semua jenis</option>
          <option value="create" ${f.kind==='create'?'selected':''}>Dibuat</option>
          <option value="edit" ${f.kind==='edit'?'selected':''}>Ditulis / disunting</option>
          <option value="other" ${f.kind==='other'?'selected':''}>Lainnya</option>
        </select>
        <button class="chipb" id="jj-csv" title="Unduh jejak sebagai CSV">⬇ CSV</button>
      </div>
    </div>

    <div class="stat-grid jj-stats">
      <div class="stat-card"><div class="num">${touched}</div><div class="label">Catatan tersentuh</div></div>
      <div class="stat-card"><div class="num">${edits.length}</div><div class="label">Sesi menulis</div></div>
      <div class="stat-card"><div class="num">${words.toLocaleString('id-ID')}</div><div class="label">Kata ditambahkan</div></div>
      <div class="stat-card"><div class="num">${days}</div><div class="label">Hari aktif</div></div>
    </div>

    <div class="panel pad" style="margin-top:14px">${SN.heatmapHtml(26, {from:f.from, to:f.to})}
      <div class="hint" style="margin-top:6px">Klik sebuah kotak untuk melihat jejak hari itu. Atur rentang bebas lewat kolom tanggal di atas.</div></div>

    <div class="jj-tabs">
      <button class="${f.tab==='timeline'?'on':''}" data-tab="timeline">Linimasa</button>
      <button class="${f.tab==='span'?'on':''}" data-tab="span">Rentang hidup catatan</button>
    </div>
    <div id="jj-body">${f.tab==='timeline' ? timeline(ev) : span(ev)}</div>
  `;
  bind(root, ev);
}

function timeline(ev){
  if(!ev.length) return `<div class="empty-state">Belum ada jejak pada rentang ini. Coba perlebar tanggal atau mulai menulis ✒</div>`;
  const groups = []; let cur = null;
  ev.forEach(e=>{
    const k = SN.dayKey(e.at);
    if(!cur || cur.k!==k){ cur = {k, items:[]}; groups.push(cur); }
    cur.items.push(e);
  });
  const today = keyOf(new Date()), yest = (()=>{ const d=new Date(); d.setDate(d.getDate()-1); return keyOf(d); })();
  let n = 0;
  return `<div class="tl">` + groups.map(g=>{
    const title = g.k===today ? 'Hari ini' : g.k===yest ? 'Kemarin' : '';
    const w = g.items.filter(e=>e.kind==='edit').reduce((s,e)=>s+Math.max(0,(e.to||0)-(e.from||0)),0);
    return `<div class="tl-day"><div class="tl-dh"><b>${title ? title+' · ' : ''}${dlong(g.k)}</b><span>${g.items.length} aktivitas${w?` · +${w} kata`:''}</span></div>` +
      g.items.map(e=>{
        const range = e.kind==='edit' && e.until && hhmm(e.until)!==hhmm(e.at) ? `${hhmm(e.at)} – ${hhmm(e.until)}` : hhmm(e.at);
        return `<div class="tl-item" style="--i:${Math.min(n++,18)}"><i class="tl-dot k-${kindOf(e)}">${icon(e)}</i>
          <div class="tl-card"><div class="tl-time">${range}</div>
          <a class="tl-title" data-open="${e.note.id}">${esc(e.note.title||'Tanpa judul')}</a>
          <div class="tl-act">${esc(label(e))}${e.note.trashed?' <em>(di Trash)</em>':''}</div></div></div>`;
      }).join('') + `</div>`;
  }).join('') + `</div>`;
}

function span(ev){
  const ids = [...new Set(ev.map(e=>e.note.id))];
  if(!ids.length) return `<div class="empty-state">Tidak ada catatan yang tersentuh pada rentang ini.</div>`;
  const rows = ids.map(id=>{
    const n = SN.getNote(id), mine = ev.filter(e=>e.note.id===id);
    const w = mine.filter(e=>e.kind==='edit').reduce((s,e)=>s+Math.max(0,(e.to||0)-(e.from||0)),0);
    return {n, sessions: mine.filter(e=>e.kind==='edit').length, w, c:new Date(n.createdAt).getTime(), u:new Date(n.updatedAt).getTime()};
  }).sort((a,b)=>b.u-a.u);
  const min = Math.min(...rows.map(r=>r.c)), max = Math.max(Date.now(), ...rows.map(r=>r.u)), tot = Math.max(1, max-min);
  const d = t => new Date(t).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
  return `<div class="span-list">` + rows.map((r,i)=>{
    const left = (r.c-min)/tot*100, wd = Math.max(1.5,(r.u-r.c)/tot*100);
    return `<div class="span-row" style="--i:${Math.min(i,14)}">
      <div class="sp-top"><a data-open="${r.n.id}">${esc(r.n.title||'Tanpa judul')}</a><span>${esc(r.n.category||'Umum')}</span></div>
      <div class="sp-bar"><i style="left:${left.toFixed(1)}%;width:${wd.toFixed(1)}%"></i></div>
      <div class="sp-meta">Ditulis <b>${d(r.c)}</b> → terakhir diperbarui <b>${d(r.u)}</b> · ${r.sessions} sesi · +${r.w} kata</div></div>`;
  }).join('') + `</div>`;
}

function bind(root, ev){
  root.querySelectorAll('[data-chip]').forEach(b=>b.onclick = ()=>{
    f.chip = b.dataset.chip; Object.assign(f, chipRange(f.chip)); draw(root);
  });
  const fr = root.querySelector('#jj-from'), to = root.querySelector('#jj-to');
  const onDate = ()=>{ f.from = fr.value; f.to = to.value; f.chip=''; if(f.from && f.to && f.from>f.to){ [f.from,f.to]=[f.to,f.from]; } draw(root); };
  fr.onchange = onDate; to.onchange = onDate;
  root.querySelector('#jj-note').onchange = e=>{ f.noteId = e.target.value; draw(root); };
  root.querySelector('#jj-kind').onchange = e=>{ f.kind = e.target.value; draw(root); };
  root.querySelectorAll('.jj-tabs button').forEach(b=>b.onclick = ()=>{ f.tab = b.dataset.tab; draw(root); });
  root.querySelectorAll('.hm[data-day]').forEach(c=>c.onclick = ()=>{ f.from = f.to = c.dataset.day; f.chip=''; draw(root); });
  root.querySelectorAll('[data-open]').forEach(a=>a.onclick = ()=>SN.openNote(a.dataset.open));
  root.querySelector('#jj-csv').onclick = ()=>{
    const q = s => '"' + String(s==null?'':s).replace(/"/g,'""') + '"';
    const rows = [['waktu','selesai','catatan','jenis','keterangan','kata_awal','kata_akhir']];
    ev.forEach(e=>rows.push([e.at, e.until||'', e.note.title||'', kindOf(e), label(e), e.from==null?'':e.from, e.to==null?'':e.to]));
    const blob = new Blob(['\ufeff'+rows.map(r=>r.map(q).join(',')).join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'jejak-catatan-'+keyOf(new Date())+'.csv'; document.body.appendChild(a); a.click(); a.remove();
    SN.toast('Jejak diunduh sebagai CSV');
  };
}
})();
