(function(){
"use strict";

/* ============================================================
   STORAGE, SESI PENGGUNA & SINKRONISASI KE GOOGLE SHEET
   ============================================================ */
const SN = window.SN = window.SN || {};
SN.views = SN.views || {};
const THEME_KEY = "smartnote_theme";
const LEGACY_KEY = "smartnote_notes_v1";
const K = {
  notes: u=>'sn_notes_'+u, pdel: u=>'sn_pdel_'+u, goal: u=>'sn_goal_'+u,
  seeded: u=>'sn_seeded_'+u, goalhit: u=>'sn_goalhit_'+u, book: u=>'sn_book_'+u
};
SN.K = K;

let USER = null;
let notes = [];
let snap = {};            // id -> JSON terakhir yang dikonfirmasi tersimpan di server
let pendingDel = [];      // id yang dihapus permanen tapi belum terkonfirmasi server
let syncTimer = null, syncing = false;
let state = {
  view: "dashboard",      // dashboard | all | favorites | trash | graph | tag | editor | book | jejak
  search: "", activeTag: null, currentNoteId: null, editorMode: "write",
  params: {}, prev: null
};

const STOPWORDS = new Set(("yang dan di ke dari ini itu dengan untuk pada adalah akan tidak atau juga sudah belum "+
  "saya kita kami mereka dia ada dapat bisa harus perlu dalam oleh sebagai karena jika maka agar serta antara atas "+
  "bawah satu dua tersebut secara lebih sangat masih hanya saat tahun bulan hari para bagi tetapi namun kemudian "+
  "seperti sehingga akan telah begitu terhadap the a an is are of to in on for and or was were be by").split(" "));

function uid(){ return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function nowISO(){ return new Date().toISOString(); }
function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) + ' ' +
         d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
}
function fmtRelative(iso){
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if(m < 1) return "baru saja";
  if(m < 60) return m + " menit lalu";
  const h = Math.floor(m/60);
  if(h < 24) return h + " jam lalu";
  const d = Math.floor(h/24);
  if(d < 7) return d + " hari lalu";
  return fmtDate(iso);
}
function dayKey(d){
  d = d instanceof Date ? d : new Date(d);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg){
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .2s'; el.style.opacity='0'; setTimeout(()=>el.remove(),200); }, 2600);
}

/* ---------- status sinkronisasi ---------- */
const STATUS = {
  local:   '💾 Mode lokal',
  saved:   '☁ Tersimpan di Sheet',
  pending: '✎ Menunggu disimpan…',
  syncing: '⟳ Menyimpan…',
  offline: '⚠ Offline — dicoba lagi'
};
function setStatus(s){
  const p = document.getElementById('sync-pill'); if(!p) return;
  p.dataset.s = s; p.textContent = STATUS[s] || s;
}
SN.setStatus = setStatus;

function persistLocal(){
  if(!USER) return;
  try{
    localStorage.setItem(K.notes(USER.username), JSON.stringify(notes));
    localStorage.setItem(K.pdel(USER.username), JSON.stringify(pendingDel));
  }catch(e){ toast("Penyimpanan lokal browser penuh."); }
}
function save(){
  persistLocal(); renderSidebarMeta(); scheduleSync();
}
function scheduleSync(delay){
  if(!USER) return;
  if(!SN.backend || !SN.backend.remote){ setStatus('local'); return; }
  setStatus('pending');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(doSync, delay == null ? 1600 : delay);
}
async function doSync(){
  if(!USER || !SN.backend.remote) return;
  if(syncing){ scheduleSync(900); return; }
  const sent = [];
  notes.forEach(n=>{ const s = JSON.stringify(n); if(snap[n.id] !== s) sent.push([n, s]); });
  const removed = pendingDel.slice();
  if(!sent.length && !removed.length){ setStatus('saved'); return; }
  syncing = true; setStatus('syncing');
  try{
    const res = await SN.backend.sync({upsert: sent.map(x=>x[0]), remove: removed});
    sent.forEach(([n,s])=>{ snap[n.id] = s; });
    (res.rejected||[]).forEach(id=>{ const n = getNote(id); if(n) snap[id] = JSON.stringify(n); toast("Satu catatan terlalu besar untuk disimpan ke Sheet."); });
    pendingDel = pendingDel.filter(id=>!removed.includes(id));
    (res.newer||[]).forEach(sn=>{
      const i = notes.findIndex(n=>n.id===sn.id); if(i>=0) notes[i] = sn; snap[sn.id] = JSON.stringify(sn);
    });
    persistLocal(); renderSidebarMeta();
    if(res.newer && res.newer.length && state.view !== 'editor') render();
    const dirty = notes.some(n=>snap[n.id] !== JSON.stringify(n)) || pendingDel.length;
    if(dirty) scheduleSync(700); else setStatus('saved');
  }catch(e){
    if(e.code === 'AUTH'){ SN.auth.forceLogout(e.message); }
    else { setStatus('offline'); clearTimeout(syncTimer); syncTimer = setTimeout(doSync, 15000); }
  }finally{ syncing = false; }
}
SN.pendingCount = ()=> notes.filter(n=>snap[n.id] !== JSON.stringify(n)).length + pendingDel.length;

/* gabungkan cache lokal dengan data server: versi terbaru (updatedAt) menang */
function mergeNotes(local, server){
  const srv = (server && server.notes) || [];
  const gone = new Set((server && server.deletedIds) || []);
  if(server){ snap = {}; srv.forEach(n=>{ snap[n.id] = JSON.stringify(n); }); }
  const map = new Map();
  srv.forEach(n=>map.set(n.id, n));
  local.forEach(n=>{
    if(!n || !n.id || pendingDel.includes(n.id) || gone.has(n.id)) return;
    const s = map.get(n.id);
    if(!s || new Date(n.updatedAt) > new Date(s.updatedAt)) map.set(n.id, n);
  });
  return Array.from(map.values());
}
SN.applyServer = function(server){
  if(!server) return;
  notes = mergeNotes(notes, server);
  notes.forEach(n=>{ if(n.wc==null) n.wc = countWords(n.content); if(!n.history) n.history = []; });
  persistLocal();
  if(state.view === 'editor') renderSidebar(); else render();
  scheduleSync(500);
};

/* ============================================================
   CATATAN CONTOH (hanya untuk akun baru)
   ============================================================ */
function seedData(){
  const t = nowISO();
  function mk(o){
    return Object.assign({
      id: uid(), category:"Umum", priority:"Sedang", status:"Baru",
      favorite:false, pinned:false, archived:false, trashed:false,
      createdAt:t, updatedAt:t, analysis:null, links:[],
      history:[{at:t, kind:'create', action:"Catatan dibuat"}]
    }, o, {wc:0});
  }
  const list = [
    mk({
      title:"Selamat datang di Catatan Pintar ✒",
      category:"Umum", priority:"Sedang", tags:["panduan"], favorite:true,
      content:"# Selamat datang!\n\nCatatanmu sekarang tersimpan di akunmu dan ikut ke perangkat mana pun.\n\n"+
        "## Yang bisa kamu lakukan\n- Tulis bebas dengan **tebal**, *miring*, daftar, dan checklist\n"+
        "- Buka **Buku Besar** untuk membaca semua catatan seperti halaman buku, lengkap dengan daftar halaman\n"+
        "- Buka **Jejak** untuk melihat kapan setiap tulisan dibuat atau diperbarui, dalam rentang waktu pilihanmu\n"+
        "- Tekan **Analyze with AI** di dalam catatan untuk ringkasan otomatis\n\n"+
        "## Mulai dari sini\n- [ ] Tulis catatan pertamamu\n- [ ] Coba buka Buku Besar\n- [ ] Lihat Jejak tulisanmu hari ini\n\n"+
        "> Tahan klik dan seret mouse untuk mencoret-coret dengan tinta. Percayalah, menyenangkan."
    }),
    mk({
      title:"Contoh: Rencana Mingguan",
      category:"Pekerjaan", priority:"Tinggi", tags:["rencana","contoh"],
      content:"# Rencana Minggu Ini\n\nTarget utama minggu ini adalah menyelesaikan laporan dan merapikan arsip.\n\n"+
        "## Perlu Diperhatikan\nDeadline laporan jatuh pada hari Jumat, jadi data harus lengkap sebelum Kamis.\n\n"+
        "- [ ] Susun draf laporan\n- [ ] Kumpulkan data pendukung\n- [x] Buat daftar prioritas"
    })
  ];
  list.forEach(n=>{ n.wc = countWords(n.content); });
  return list;
}

/* ============================================================
   MARKDOWN (very small, dependency-free)
   ============================================================ */
function mdToHtml(src, noteId){
  const lines = (src||"").replace(/\r/g,'').split('\n');
  let html = '', inList = null, inCode = false, codeBuf = [];
  function closeList(){ if(inList){ html += '</'+inList+'>'; inList=null; } }
  function inline(t){
    t = escapeHtml(t);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }
  lines.forEach((line, idx) => {
    if(line.trim().startsWith('```')){
      if(!inCode){ inCode = true; codeBuf = []; }
      else { inCode = false; html += '<pre><code>'+escapeHtml(codeBuf.join('\n'))+'</code></pre>'; }
      return;
    }
    if(inCode){ codeBuf.push(line); return; }

    const cbx = line.match(/^(\s*)[-*]\s\[( |x|X)\]\s(.*)$/);
    if(cbx){
      closeList();
      const done = cbx[2].toLowerCase()==='x';
      html += '<div class="cbx-line'+(done?' done':'')+'"><input type="checkbox" '+(done?'checked':'')+
        ' data-action="toggle-checkline" data-line="'+idx+'" data-note="'+noteId+'"/><span>'+inline(cbx[3])+'</span></div>';
      return;
    }
    if(/^#{1,3}\s/.test(line)){
      closeList();
      const level = line.match(/^#+/)[0].length;
      html += '<h'+(level+1)+'>'+inline(line.replace(/^#{1,3}\s/,''))+'</h'+(level+1)+'>';
      return;
    }
    if(/^>\s/.test(line)){
      closeList();
      html += '<blockquote>'+inline(line.replace(/^>\s/,''))+'</blockquote>';
      return;
    }
    if(/^(-{3,}|\*{3,})$/.test(line.trim())){
      closeList(); html += '<hr/>'; return;
    }
    if(/^\s*[-*]\s/.test(line)){
      if(inList !== 'ul'){ closeList(); html += '<ul>'; inList='ul'; }
      html += '<li>'+inline(line.replace(/^\s*[-*]\s/,''))+'</li>';
      return;
    }
    if(/^\s*\d+\.\s/.test(line)){
      if(inList !== 'ol'){ closeList(); html += '<ol>'; inList='ol'; }
      html += '<li>'+inline(line.replace(/^\s*\d+\.\s/,''))+'</li>';
      return;
    }
    if(line.trim()===''){ closeList(); return; }
    closeList();
    html += '<p>'+inline(line)+'</p>';
  });
  closeList();
  return html;
}

/* ============================================================
   HEURISTIC "AI" ANALYSIS  (rule-based, runs entirely offline —
   no external AI service is called)
   ============================================================ */
function plainText(md){
  return (md||"").replace(/```[\s\S]*?```/g,' ').replace(/[#>*`_\[\]()-]/g,' ').replace(/\s+/g,' ').trim();
}
function splitSentences(text){
  return text.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.length>8);
}
function wordFreq(text){
  const freq = {};
  text.toLowerCase().replace(/[^a-z0-9à-ÿ\s#]/gi,' ').split(/\s+/).forEach(w=>{
    if(w.length < 4 || STOPWORDS.has(w)) return;
    freq[w] = (freq[w]||0)+1;
  });
  return freq;
}
function extractKeywords(text, n){
  const freq = wordFreq(text);
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,n).map(e=>e[0]);
}
function extractiveSummary(text, n){
  const sentences = splitSentences(text);
  if(sentences.length <= n) return sentences.join(' ');
  const freq = wordFreq(text);
  const scored = sentences.map((s,i)=>{
    const words = s.toLowerCase().split(/\s+/);
    let score = 0;
    words.forEach(w=>{ if(freq[w]) score += freq[w]; });
    return {s, i, score: score / Math.sqrt(words.length+1)};
  });
  const top = scored.sort((a,b)=>b.score-a.score).slice(0,n).sort((a,b)=>a.i-b.i);
  return top.map(t=>t.s).join(' ');
}
const IMPORTANT_TRIGGERS = [
  {re:/deadline|batas waktu|sebelum tanggal|jatuh tempo/i, level:'critical'},
  {re:/risiko|berpotensi|terlambat|masalah|kendala/i, level:'important'},
  {re:/belum (lengkap|selesai|jelas|pasti)|perlu verifikasi|perlu diperiksa/i, level:'attention'},
  {re:/penting|perhatikan|catatan:|wajib/i, level:'info'},
];
function extractImportantPoints(text){
  const sentences = splitSentences(text);
  const points = [];
  sentences.forEach(s=>{
    for(const trig of IMPORTANT_TRIGGERS){
      if(trig.re.test(s)){ points.push({text:s, level:trig.level}); break; }
    }
  });
  return points.slice(0,6);
}
function extractActionItemsFromContent(content){
  const lines = (content||"").split('\n');
  const items = [];
  lines.forEach((line,idx)=>{
    const m = line.match(/^\s*[-*]\s\[( |x|X)\]\s(.*)$/);
    if(m){ items.push({line:idx, done:m[1].toLowerCase()==='x', text:m[2]}); }
  });
  return items;
}
function detectUrls(text){
  const re = /(https?:\/\/[^\s)]+)([)\s]|$)/g;
  const urls = new Set();
  let m;
  while((m = re.exec(text))){ urls.add(m[1]); }
  return Array.from(urls);
}
function buildOutline(text){
  const sentences = splitSentences(text);
  const kw = extractKeywords(text, 5);
  // simple two-level outline based on top keyword clustering
  const outline = [{text:"Topik Utama", children: kw.slice(0,5).map(k=>({text:capitalize(k)}))}];
  return outline;
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

function analyzeNote(note){
  const text = plainText(note.content);
  if(text.length < 15){
    return { empty:true };
  }
  const summary = extractiveSummary(text, 3);
  const importantPoints = extractImportantPoints(text);
  const keywords = extractKeywords(text, 6);
  const outline = buildOutline(text);
  const urls = detectUrls(note.content);
  return {
    empty:false,
    summary: summary || "Perlu verifikasi — isi catatan terlalu singkat untuk diringkas.",
    importantPoints,
    keywords,
    outline,
    detectedUrls: urls,
    generatedAt: nowISO()
  };
}

function relatedNotes(note){
  const others = notes.filter(n=>n.id!==note.id && !n.trashed);
  const myTags = new Set((note.tags||[]).map(t=>t.toLowerCase()));
  const myKw = new Set((note.analysis && note.analysis.keywords) || extractKeywords(plainText(note.content),8));
  const scored = others.map(o=>{
    const oTags = new Set((o.tags||[]).map(t=>t.toLowerCase()));
    let shared = 0;
    oTags.forEach(t=>{ if(myTags.has(t)) shared++; });
    const oKw = new Set((o.analysis && o.analysis.keywords) || extractKeywords(plainText(o.content),8));
    let sharedKw = 0;
    oKw.forEach(k=>{ if(myKw.has(k)) sharedKw++; });
    const score = shared*3 + sharedKw;
    return {note:o, score, shared, sharedKw};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  return scored.slice(0,5).map(x=>({
    note:x.note,
    label: x.score>=5 ? "Highly Related" : x.score>=2 ? "Related" : "Possibly Related"
  }));
}

/* ============================================================
   DERIVED GETTERS
   ============================================================ */
function activeNotes(){ return notes.filter(n=>!n.trashed); }
function allTags(){
  const set = new Set();
  activeNotes().forEach(n=>(n.tags||[]).forEach(t=>set.add(t)));
  return Array.from(set).sort();
}
function getNote(id){ return notes.find(n=>n.id===id); }

/* ============================================================
   RENDER: SIDEBAR
   ============================================================ */
function renderSidebar(){
  document.querySelectorAll('.nav-item[data-view]').forEach(el=>{
    el.classList.toggle('active', el.dataset.view === state.view && !state.activeTag);
  });
  document.getElementById('count-all').textContent = activeNotes().length;
  document.getElementById('count-fav').textContent = activeNotes().filter(n=>n.favorite).length;
  document.getElementById('count-trash').textContent = notes.filter(n=>n.trashed).length;

  const tagNav = document.getElementById('tag-nav');
  const tags = allTags();
  tagNav.innerHTML = tags.length ? tags.map(t=>{
    const cnt = activeNotes().filter(n=>(n.tags||[]).includes(t)).length;
    const active = state.activeTag === t ? 'active' : '';
    return `<button class="nav-item ${active}" data-action="open-tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}<span class="count">${cnt}</span></button>`;
  }).join('') : '<div class="hint" style="padding:4px 10px;">Belum ada tag</div>';

  renderSidebarMeta();
}
function renderSidebarMeta(){
  document.getElementById('foot-count').textContent = activeNotes().length;
  let bytes = 0;
  try{ bytes = new Blob([JSON.stringify(notes)]).size; }catch(e){ bytes = JSON.stringify(notes).length; }
  document.getElementById('foot-size').textContent = (bytes/1024).toFixed(1) + ' KB';
}

/* ============================================================
   AKTIVITAS / JEJAK (dihitung dari riwayat setiap catatan)
   ============================================================ */
function countWords(text){ return plainText(text).split(/\s+/).filter(Boolean).length; }
function activityMap(){
  const m = {};
  notes.forEach(n=>(n.history||[]).forEach(h=>{
    const k = dayKey(h.at);
    const o = m[k] || (m[k] = {words:0, events:0});
    o.events++;
    if(h.kind === 'edit') o.words += Math.max(0, (h.to||0) - (h.from||0));
  }));
  return m;
}
function streakDays(m){
  const d = new Date();
  if(!(m[dayKey(d)] && m[dayKey(d)].events)) d.setDate(d.getDate()-1);
  let s = 0;
  while(m[dayKey(d)] && m[dayKey(d)].events){ s++; d.setDate(d.getDate()-1); }
  return s;
}
function getGoal(){
  const v = parseInt((USER && localStorage.getItem(K.goal(USER.username))) || '200', 10);
  return v > 0 ? v : 200;
}
function heatmapHtml(weeks, sel){
  const m = activityMap();
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = (today.getDay()+6)%7;
  const start = new Date(today); start.setDate(start.getDate() - dow - (weeks-1)*7);
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  let cells = '', labels = '', lastMonth = -1;
  for(let w=0; w<weeks; w++){
    const wd = new Date(start); wd.setDate(start.getDate()+w*7);
    if(wd.getMonth() !== lastMonth){ labels += `<span style="grid-column:${w+1}">${months[wd.getMonth()]}</span>`; lastMonth = wd.getMonth(); }
    for(let d=0; d<7; d++){
      const dt = new Date(start); dt.setDate(start.getDate()+w*7+d);
      if(dt > today){ cells += '<i class="hm off"></i>'; continue; }
      const k = dayKey(dt), a = m[k];
      const lv = !a ? 0 : a.words>=400 ? 4 : a.words>=150 ? 3 : a.words>=40 ? 2 : 1;
      const inSel = sel && sel.from && k>=sel.from && k<=sel.to;
      const tip = dt.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) + ': ' +
        (a ? a.words+' kata ditulis, '+a.events+' aktivitas' : 'tidak ada aktivitas');
      cells += `<i class="hm l${lv}${inSel?' sel':''}" data-day="${k}" style="--d:${(w*7+d)*2}ms" title="${tip}"></i>`;
    }
  }
  return `<div class="hm-wrap"><div class="hm-months" style="grid-template-columns:repeat(${weeks},13px)">${labels}</div>`+
         `<div class="hm-grid" style="grid-template-columns:repeat(${weeks},13px)">${cells}</div></div>`;
}

let lastGoalCheck = 0;
function checkGoal(){
  const t = Date.now(); if(t - lastGoalCheck < 1500) return; lastGoalCheck = t;
  const m = activityMap(), k = dayKey(new Date());
  const w = m[k] ? m[k].words : 0, goal = getGoal();
  if(w >= goal){
    let hit = null; try{ hit = localStorage.getItem(K.goalhit(USER.username)); }catch(e){}
    if(hit !== k){
      try{ localStorage.setItem(K.goalhit(USER.username), k); }catch(e){}
      SN.fx.confetti(); SN.fx.ding(); toast("Target menulis hari ini tercapai! 🎉 ("+goal+" kata)");
    }
  }
}

function openTasks(){
  const out = [];
  activeNotes().forEach(n=>{
    (n.content||'').split('\n').forEach((l,i)=>{
      const m = l.match(/^\s*[-*]\s\[ \]\s(.*)$/);
      if(m && m[1].trim()) out.push({note:n, line:i, text:m[1].trim()});
    });
  });
  return out;
}

const QUOTES = [
  "Pikiran yang tidak ditulis mudah menguap; tinta menahannya tetap di tempat.",
  "Satu kalimat hari ini lebih berharga daripada bab sempurna yang tak pernah dimulai.",
  "Catatan kecil yang rajin lebih kuat daripada ingatan besar yang lupa.",
  "Menulislah untuk mengerti, bukan hanya untuk mengingat.",
  "Halaman kosong bukan musuh; ia hanya menunggu giliran.",
  "Jejak yang konsisten lebih jauh jangkauannya daripada loncatan sesekali.",
  "Tulis apa yang kamu tahu, lalu temukan apa yang belum kamu tahu.",
  "Ide yang dicatat hari ini adalah bahan bakar proyek bulan depan.",
  "Rapikan pikiran di atas kertas, maka kepala punya ruang untuk hal baru.",
  "Setiap catatan adalah surat untuk dirimu di masa depan.",
  "Tidak ada tulisan jelek di draf pertama, hanya tulisan yang belum selesai.",
  "Kebiasaan menulis dibangun satu paragraf demi satu paragraf."
];

/* ============================================================
   RENDER: ROOT VIEW SWITCH
   ============================================================ */
let lastViewKey = null;
function render(){
  renderSidebar();
  const root = document.getElementById('view-root');
  const key = state.view + '|' + (state.activeTag||'') + '|' + (state.currentNoteId||'');
  const entering = key !== lastViewKey; lastViewKey = key;
  document.body.dataset.view = state.view;
  if(state.view !== 'editor'){ document.body.classList.remove('focus'); }

  if(state.view === 'editor' && state.currentNoteId){
    root.innerHTML = renderEditorView(getNote(state.currentNoteId));
    bindEditorEvents();
  } else if(SN.views[state.view]){
    root.innerHTML = '';
    SN.views[state.view].render(root, state.params || {});
  } else if(state.view === 'graph'){
    root.innerHTML = renderGraphView(); bindGraphEvents();
  } else if(state.view === 'trash'){
    root.innerHTML = renderListView(notes.filter(n=>n.trashed), "Trash", "Catatan yang dihapus akan tersimpan di sini sampai dihapus permanen.");
    bindListEvents();
  } else if(state.activeTag){
    const list = activeNotes().filter(n=>(n.tags||[]).includes(state.activeTag));
    root.innerHTML = renderListView(list, "#"+state.activeTag, "Tidak ada catatan dengan tag ini.");
    bindListEvents();
  } else if(state.view === 'favorites'){
    root.innerHTML = renderListView(activeNotes().filter(n=>n.favorite), "Favorit", "Belum ada catatan favorit. Tandai bintang pada sebuah catatan untuk menyimpannya di sini.");
    bindListEvents();
  } else if(state.view === 'all'){
    root.innerHTML = renderListView(activeNotes(), "Semua Catatan", "Belum ada catatan.");
    bindListEvents();
  } else {
    root.innerHTML = renderDashboard();
    bindListEvents(); bindDashboardEvents(); bindDashboardExtras(root);
  }
  if(entering){
    root.classList.remove('view-enter'); void root.offsetWidth; root.classList.add('view-enter');
    document.getElementById('content').scrollTop = 0;
  }
  bindTilt(root);
}

/* ---------- Dashboard ---------- */
function renderDashboard(){
  const list = searchFilter(activeNotes());
  const recent = [...list].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,6);
  const m = activityMap(), tk = dayKey(new Date());
  const wToday = m[tk] ? m[tk].words : 0, goal = getGoal();
  const pct = Math.min(1, wToday/goal);
  const totalWords = activeNotes().reduce((s,n)=>s+(n.wc||0),0);
  const tasks = openTasks();
  const streak = streakDays(m);
  const hr = new Date().getHours();
  const greet = hr<11 ? 'Selamat pagi' : hr<15 ? 'Selamat siang' : hr<19 ? 'Selamat sore' : 'Selamat malam';
  const q = QUOTES[Math.floor(Date.now()/86400000) % QUOTES.length];
  const C = 226.2;

  return `
    <div class="hero">
      <div class="hero-text">
        <h1 class="hand-title"><span class="reveal-ink">${greet}, ${escapeHtml(USER.name)}</span></h1>
        <p class="quote">“${escapeHtml(q)}”</p>
        <div class="quick-capture">
          <input id="quick-input" placeholder="Tulis cepat lalu tekan Enter untuk membuat catatan..." />
          <button data-action="quick-create">＋ Tulis</button>
        </div>
      </div>
      <div class="goal-card" data-action="edit-goal" title="Klik untuk mengubah target harian">
        <svg viewBox="0 0 84 84" width="104" height="104">
          <circle cx="42" cy="42" r="36" class="ring-bg"/>
          <circle cx="42" cy="42" r="36" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-to="${(C*(1-pct)).toFixed(1)}" transform="rotate(-90 42 42)"/>
          <text x="42" y="40" text-anchor="middle" class="ring-num">${wToday}</text>
          <text x="42" y="54" text-anchor="middle" class="ring-sub">/ ${goal} kata</text>
        </svg>
        <div class="goal-label">Target hari ini ${pct>=1?'✓':''}</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="num" data-count="${activeNotes().length}">0</div><div class="label">Total catatan</div></div>
      <div class="stat-card"><div class="num" data-count="${totalWords}">0</div><div class="label">Kata tertulis</div></div>
      <div class="stat-card"><div class="num"><span data-count="${streak}">0</span><small> hari</small></div><div class="label">Beruntun menulis 🔥</div></div>
      <div class="stat-card"><div class="num" data-count="${tasks.length}">0</div><div class="label">Tugas terbuka</div></div>
    </div>

    <div class="dash-cols">
      <div class="dash-main">
        <div class="section-head"><h2>Jejak 26 minggu terakhir</h2><button class="link" data-action="goto-jejak">Buka Jejak →</button></div>
        <div class="panel pad">${heatmapHtml(26)}
          <div class="hm-legend">Sedikit <i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i> Banyak · klik kotak untuk melihat hari itu</div>
        </div>

        <div class="section-head"><h2>Catatan Terbaru</h2>${list.length>6 ? '<button class="link" data-action="goto-all">Lihat semua →</button>':''}</div>
        ${recent.length ? `<div class="note-grid">${recent.map(noteCardHtml).join('')}</div>` :
          `<div class="empty-state">Belum ada catatan yang cocok.<br><button class="new-note-btn" style="display:inline-flex; margin-top:12px;" data-action="new-note">＋ Buat catatan pertama</button></div>`}
      </div>

      <div class="dash-side">
        <div class="section-head"><h2>Tugas Terbuka</h2></div>
        <div class="panel pad tasks">
          ${tasks.length ? tasks.slice(0,8).map(t=>`
            <label class="task-row">
              <input type="checkbox" data-action="dash-task" data-id="${t.note.id}" data-line="${t.line}" />
              <span class="t-text">${escapeHtml(t.text)}</span>
              <a class="from" data-action="open-note" data-id="${t.note.id}">${escapeHtml((t.note.title||'Tanpa judul').slice(0,22))}</a>
            </label>`).join('') + (tasks.length>8 ? `<div class="hint">+${tasks.length-8} tugas lainnya</div>`:'')
            : '<div class="verify-note">Semua beres. Tambahkan baris “- [ ] tugas” di catatan mana pun.</div>'}
        </div>
      </div>
    </div>
  `;
}

function bindDashboardExtras(root){
  // cincin target
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    root.querySelectorAll('.ring-fg').forEach(c=>{ c.style.strokeDashoffset = c.dataset.to; });
  }));
  // hitung naik
  root.querySelectorAll('[data-count]').forEach(el=>{
    const to = parseInt(el.dataset.count,10) || 0; const t0 = performance.now(); const dur = 900;
    (function step(t){
      const p = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-p,3);
      el.textContent = Math.round(to*e).toLocaleString('id-ID');
      if(p<1) requestAnimationFrame(step);
    })(t0);
  });
  root.querySelectorAll('.hm[data-day]').forEach(c=>c.onclick = ()=>SN.go('jejak',{from:c.dataset.day,to:c.dataset.day}));
  const gj = root.querySelector('[data-action="goto-jejak"]'); if(gj) gj.onclick = ()=>SN.go('jejak',{});
  const eg = root.querySelector('[data-action="edit-goal"]');
  if(eg) eg.onclick = ()=>promptModal("Target menulis harian","Berapa kata yang ingin kamu tulis setiap hari?",String(getGoal()),v=>{
    const n = parseInt(v,10); if(!(n>0)) return toast("Masukkan angka lebih dari 0.");
    try{ localStorage.setItem(K.goal(USER.username), String(Math.min(n,20000))); }catch(e){}
    render();
  });
  root.querySelectorAll('[data-action="dash-task"]').forEach(cb=>{
    cb.onchange = ()=>{
      const row = cb.closest('.task-row'); row.classList.add('done');
      toggleTaskLine(cb.dataset.id, parseInt(cb.dataset.line,10), cb.checked);
      setTimeout(render, 550);
    };
  });
}

/* efek miring kartu mengikuti kursor */
function bindTilt(root){
  if(!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  root.querySelectorAll('.note-card').forEach(c=>{
    c.addEventListener('mousemove', e=>{
      const r = c.getBoundingClientRect();
      const x = (e.clientX-r.left)/r.width-.5, y = (e.clientY-r.top)/r.height-.5;
      c.style.transform = `perspective(700px) rotateX(${(-y*5).toFixed(2)}deg) rotateY(${(x*6).toFixed(2)}deg) translateY(-2px)`;
    });
    c.addEventListener('mouseleave', ()=>{ c.style.transform=''; });
  });
}

/* ---------- Generic list view ---------- */
function searchFilter(list){
  const q = state.search.trim().toLowerCase();
  if(!q) return list;
  return list.filter(n=>{
    const hay = [n.title, plainText(n.content), (n.tags||[]).join(' '), n.category,
      n.analysis ? n.analysis.summary : '', (n.links||[]).map(l=>l.title+' '+l.url).join(' ')
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
function renderListView(list, title, emptyMsg){
  const filtered = searchFilter(list);
  const pinned = filtered.filter(n=>n.pinned);
  const rest = filtered.filter(n=>!n.pinned).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  const ordered = [...pinned, ...rest];
  return `
    <div class="section-head"><h2 style="font-size:20px;">${escapeHtml(title)}</h2><span class="hint">${filtered.length} catatan</span></div>
    ${ordered.length ? `<div class="note-grid">${ordered.map(noteCardHtml).join('')}</div>` : `<div class="empty-state">${emptyMsg}</div>`}
  `;
}

function noteCardHtml(n,i){
  const preview = plainText(n.content).slice(0,140) || 'Catatan kosong.';
  const tags = (n.tags||[]).slice(0,3).map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
  return `
    <div class="note-card rise" style="--i:${Math.min(i||0,12)}" data-action="open-note" data-id="${n.id}">
      <div class="top-row">
        <h3>${escapeHtml(n.title || 'Tanpa judul')}</h3>
        <div class="pin-fav">
          <button class="${n.favorite?'on':''}" data-action="toggle-fav" data-id="${n.id}" title="Favorit">${n.favorite?'★':'☆'}</button>
        </div>
      </div>
      <p class="preview">${escapeHtml(preview)}</p>
      <div class="tags">${tags}</div>
      <div class="meta-row">
        <span class="status-dot ${n.analysis?'status-analyzed':'status-unanalyzed'}" title="${n.analysis?'Sudah dianalisis':'Belum dianalisis'}"></span>
        <span>${escapeHtml(n.category||'Umum')}</span>
        <span>·</span>
        <span>${fmtRelative(n.updatedAt)}</span>
      </div>
    </div>
  `;
}

function bindDashboardEvents(){
  const qi = document.getElementById('quick-input');
  if(qi){
    qi.addEventListener('keydown', e=>{
      if(e.key === 'Enter' && qi.value.trim()){
        const note = createNote(qi.value.trim());
        openNote(note.id);
      }
    });
  }
}

function bindListEvents(){
  document.querySelectorAll('[data-action="new-note"]').forEach(b=>b.onclick = ()=>{
    const n = createNote("");
    openNote(n.id);
  });
  document.querySelectorAll('[data-action="quick-create"]').forEach(b=>b.onclick = ()=>{
    const input = document.getElementById('quick-input');
    if(input && input.value.trim()){ const n = createNote(input.value.trim()); openNote(n.id); }
  });
  document.querySelectorAll('[data-action="goto-all"]').forEach(b=>b.onclick = ()=>{ state.view='all'; state.activeTag=null; render(); });
  document.querySelectorAll('[data-action="open-note"]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      if(e.target.closest('[data-action="toggle-fav"]')) return;
      openNote(el.dataset.id);
    });
  });
  document.querySelectorAll('[data-action="toggle-fav"]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      const n = getNote(el.dataset.id);
      n.favorite = !n.favorite; n.updatedAt = nowISO();
      save(); render();
    });
  });
}

/* ============================================================
   NOTE CRUD
   ============================================================ */
function createNote(initialText){
  const title = initialText ? initialText.split('\n')[0].slice(0,80) : "";
  const note = {
    id: uid(), title, content: initialText || "",
    category:"Umum", priority:"Sedang", status:"Baru",
    tags:[], favorite:false, pinned:false, archived:false, trashed:false,
    createdAt: nowISO(), updatedAt: nowISO(), analysis:null, links:[],
    wc: countWords(initialText||""),
    history:[{at:nowISO(), kind:"create", action:"Catatan dibuat"}]
  };
  notes.unshift(note);
  save();
  return note;
}
function openNote(id){
  if(state.view !== 'editor') state.prev = {view:state.view, tag:state.activeTag, params:state.params};
  state.view = 'editor'; state.currentNoteId = id; state.editorMode='write'; state.activeTag=null;
  render();
}
function touchNote(n, action){
  n.updatedAt = nowISO();
  if(action){ n.history = n.history || []; n.history.push({at:n.updatedAt, action}); }
}

/* ============================================================
   RENDER: EDITOR
   ============================================================ */
function renderEditorView(note){
  if(!note) return `<div class="empty-state">Catatan tidak ditemukan.</div>`;
  const ai = note.analysis;
  const actionItems = extractActionItemsFromContent(note.content);
  const related = ai ? relatedNotes(note) : [];

  return `
    <div class="editor-header">
      <button class="back-btn" data-action="back">←</button>
      <div style="flex:1;">
        <input class="title-input" id="title-input" placeholder="Judul catatan..." value="${escapeHtml(note.title)}" />
        <div class="editor-meta">
          <select class="meta-select" id="meta-category">
            ${['Umum','Rapat','Pekerjaan','Ide','Penelitian','Belajar','Proyek','Pribadi','Referensi'].map(c=>
              `<option ${note.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <select class="meta-select" id="meta-priority">
            ${['Rendah','Sedang','Tinggi'].map(p=>`<option ${note.priority===p?'selected':''}>${p}</option>`).join('')}
          </select>
          <select class="meta-select" id="meta-status">
            ${['Baru','Berjalan','Selesai','Diarsipkan'].map(s=>`<option ${note.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <div class="tag-editor" id="tag-editor">
            ${(note.tags||[]).map(t=>`<span class="tag-chip">#${escapeHtml(t)}<button data-action="remove-tag" data-tag="${escapeHtml(t)}">✕</button></span>`).join('')}
            <input id="tag-input" placeholder="+ tag" />
          </div>
          <span class="meta-field updated">Diperbarui ${fmtRelative(note.updatedAt)}</span>
          <button class="icon-btn pill-btn" data-action="focus-mode">⛶ Mode fokus</button>
          <button class="icon-btn" style="width:auto; padding:0 10px; height:28px; border-radius:20px; font-size:12px;" data-action="toggle-fav-editor">${note.favorite?'★ Favorit':'☆ Favorit'}</button>
          <button class="icon-btn" style="width:auto; padding:0 10px; height:28px; border-radius:20px; font-size:12px;" data-action="toggle-pin-editor">${note.pinned?'📌 Pinned':'📌 Pin'}</button>
          <button class="icon-btn" style="width:auto; padding:0 10px; height:28px; border-radius:20px; font-size:12px; color:var(--red);" data-action="delete-note">🗑 ${note.trashed?'Hapus permanen':'Hapus'}</button>
        </div>
      </div>
    </div>

    <div class="editor-columns" id="editor-columns">
      <div class="panel">
        <div class="toolbar">
          <button data-md="**" title="Bold"><b>B</b></button>
          <button data-md="*" title="Italic"><i>I</i></button>
          <button data-md-line="- " title="Bullet list">•≡</button>
          <button data-md-line="1. " title="Numbered list">1.≡</button>
          <button data-md-line="- [ ] " title="Checklist">☑</button>
          <button data-md-line="> " title="Quote">”</button>
          <button data-md-line="## " title="Heading">H</button>
          <button data-md-wrap="\`" title="Code">&lt;/&gt;</button>
          <button data-md-block="---" title="Divider">―</button>
          <div class="sep"></div>
          <div class="grow"></div>
          <button class="mode-btn ${state.editorMode==='write'?'active':''}" data-mode="write">Tulis</button>
          <button class="mode-btn ${state.editorMode==='preview'?'active':''}" data-mode="preview">Pratinjau</button>
        </div>
        ${state.editorMode==='write'
          ? `<textarea id="content-textarea" placeholder="Tulis bebas di sini... gunakan **tebal**, *miring*, - untuk daftar, - [ ] untuk checklist, > untuk kutipan.">${escapeHtml(note.content)}</textarea>`
          : `<div id="content-preview">${mdToHtml(note.content, note.id)}</div>`}
        <div class="editor-foot"><span id="wc"></span><span class="sep">·</span><span id="chars"></span><span class="grow"></span><span class="goal-mini"><i id="goal-fill"></i></span><span id="goal-txt"></span></div>
      </div>

      <div class="insights">
        ${!ai ? `<button class="analyze-btn" data-action="analyze">✨ Analyze with AI</button>
                 <p class="hint">Analisis dijalankan sepenuhnya di browser Anda (rule-based / heuristik), tanpa mengirim data ke server mana pun.</p>`
              : `<button class="analyze-btn" data-action="analyze">↻ Analisis ulang</button>`}

        ${ai && !ai.empty ? insightCard('summary','✨ Executive Summary', `<p>${escapeHtml(ai.summary)}</p>`) : ''}
        ${ai && !ai.empty ? insightCard('outline','🧠 Gambaran Besar', renderOutline(ai.outline)) : ''}
        ${ai && !ai.empty ? insightCard('important','⚠️ Perlu Diperhatikan', renderImportantPoints(ai.importantPoints)) : ''}
        ${insightCard('actions', '✅ Action Items', renderActionItems(actionItems, note))}
        ${insightCard('links', '🔗 Related Links', renderLinks(note, ai))}
        ${ai && !ai.empty ? insightCard('related', '📚 Related Notes', renderRelated(related)) : ''}
        ${insightCard('history', '🕘 Riwayat', renderHistory(note))}
      </div>
    </div>
  `;
}

function insightCard(key, title, bodyHtml){
  return `
    <div class="insight-card">
      <div class="insight-head" data-toggle="${key}">${title}<span class="chev">▾</span></div>
      <div class="insight-body" id="insight-body-${key}">${bodyHtml}</div>
    </div>
  `;
}
function renderOutline(outline){
  if(!outline || !outline.length) return `<span class="verify-note">Perlu verifikasi</span>`;
  return outline.map(node=>`
    <div style="margin-bottom:6px; font-weight:600; color:var(--ink);">${escapeHtml(node.text)}</div>
    <div style="padding-left:12px; margin-bottom:6px;">
      ${(node.children||[]).map(c=>`<div style="padding:3px 0; border-left:2px solid var(--border); padding-left:8px; margin-bottom:3px;">${escapeHtml(c.text)}</div>`).join('') || '<span class="verify-note">Belum ada sub-topik terdeteksi</span>'}
    </div>
  `).join('');
}
function renderImportantPoints(points){
  if(!points.length) return `<span class="verify-note">Tidak ada hal mencolok terdeteksi. Perlu verifikasi manual.</span>`;
  const dot = {critical:'pri-critical', important:'pri-important', attention:'pri-attention', info:'pri-info'};
  const label = {critical:'Critical', important:'Important', attention:'Attention', info:'Informational'};
  return points.map(p=>`
    <div class="point-row"><span class="dot ${dot[p.level]}"></span><div><strong style="font-size:11px;">${label[p.level]}</strong> — ${escapeHtml(p.text)}</div></div>
  `).join('');
}
function renderActionItems(items, note){
  const rows = items.map(it=>`
    <div class="action-row ${it.done?'done':''}">
      <input type="checkbox" ${it.done?'checked':''} data-action="toggle-action" data-line="${it.line}" data-id="${note.id}" />
      <span>${escapeHtml(it.text)}</span>
    </div>
  `).join('');
  return `
    ${rows || '<span class="verify-note">Belum ada action item. Tambahkan baris "- [ ] tugas" di catatan, atau tambahkan cepat di bawah.</span>'}
    <div class="add-action-row">
      <input id="new-action-input" placeholder="Tambah action item..." />
      <button data-action="add-action">＋</button>
    </div>
  `;
}
function renderLinks(note, ai){
  const manual = (note.links||[]).map(l=>`
    <div class="link-card">
      <div class="lc-title">🔗 ${escapeHtml(l.title||l.url)} <span class="relevance-badge rel-high">Ditambahkan manual</span></div>
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.url)}</a>
    </div>
  `).join('');
  const detected = (ai && ai.detectedUrls || []).filter(u => !(note.links||[]).some(l=>l.url===u)).map(u=>`
    <div class="link-card">
      <div class="lc-title">🔗 ${escapeHtml(u.replace(/^https?:\/\//,'').split('/')[0])} <span class="relevance-badge rel-med">Terdeteksi di teks</span></div>
      <a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>
      <div class="why">Relevan karena URL ini disebutkan langsung di dalam catatan.</div>
    </div>
  `).join('');
  return `
    ${manual}${detected}
    ${(!manual && !detected) ? '<span class="verify-note">Belum ada tautan. Tempelkan URL di catatan, aplikasi akan mendeteksinya otomatis, atau tambahkan manual di bawah.</span>' : ''}
    <div class="add-link-row">
      <input id="new-link-title" placeholder="Judul (opsional)" style="max-width:110px;" />
      <input id="new-link-url" placeholder="https://..." />
      <button data-action="add-link">＋</button>
    </div>
  `;
}
function renderRelated(related){
  if(!related.length) return `<span class="verify-note">Belum ditemukan catatan lain yang berkaitan (berdasarkan kesamaan tag/kata kunci).</span>`;
  return related.map(r=>`
    <div class="related-row" data-action="open-note" data-id="${r.note.id}">
      <span>${escapeHtml(r.note.title||'Tanpa judul')}</span>
      <span class="badge">${r.label}</span>
    </div>
  `).join('');
}
/* ---------- Editor event binding ---------- */
function bindEditorEvents(){
  const note = getNote(state.currentNoteId);
  if(!note) return;

  document.querySelector('[data-action="back"]').onclick = goBack;
  document.querySelector('[data-action="focus-mode"]').onclick = ()=>{ document.body.classList.toggle('focus'); };
  updateEditorFoot(note);

  const titleInput = document.getElementById('title-input');
  titleInput.addEventListener('input', ()=>{ note.title = titleInput.value; touchNote(note); save(); renderSidebar(); });

  const contentArea = document.getElementById('content-textarea');
  if(contentArea){
    contentArea.addEventListener('input', ()=>{
      note.content = contentArea.value;
      onContentChanged(note);
    });
    contentArea.addEventListener('keydown', ()=>SN.fx.tick());
  }

  document.getElementById('meta-category').onchange = e=>{ note.category=e.target.value; touchNote(note); save(); };
  document.getElementById('meta-priority').onchange = e=>{ note.priority=e.target.value; touchNote(note); save(); };
  document.getElementById('meta-status').onchange = e=>{ note.status=e.target.value; touchNote(note); save(); };

  const tagInput = document.getElementById('tag-input');
  tagInput.addEventListener('keydown', e=>{
    if(e.key==='Enter' && tagInput.value.trim()){
      const t = tagInput.value.trim().replace(/^#/,'').toLowerCase();
      note.tags = note.tags || [];
      if(!note.tags.includes(t)) note.tags.push(t);
      tagInput.value='';
      touchNote(note); save(); render();
    }
  });
  document.querySelectorAll('[data-action="remove-tag"]').forEach(b=>{
    b.onclick = ()=>{ note.tags = note.tags.filter(t=>t!==b.dataset.tag); touchNote(note); save(); render(); };
  });

  document.querySelector('[data-action="toggle-fav-editor"]').onclick = ()=>{ note.favorite=!note.favorite; save(); render(); };
  document.querySelector('[data-action="toggle-pin-editor"]').onclick = ()=>{ note.pinned=!note.pinned; save(); render(); };
  document.querySelector('[data-action="delete-note"]').onclick = ()=>{
    if(note.trashed){
      confirmModal("Hapus permanen?", "Catatan ini akan dihapus selamanya dan tidak dapat dikembalikan.", ()=>{
        notes = notes.filter(n=>n.id!==note.id);
        delete snap[note.id]; pendingDel.push(note.id);
        save(); state.view='trash'; state.currentNoteId=null; render();
      });
    } else {
      note.trashed = true; touchNote(note,"Dipindahkan ke Trash"); save();
      state.view='all'; state.currentNoteId=null; render();
      toast("Catatan dipindahkan ke Trash");
    }
  };

  // toolbar formatting
  document.querySelectorAll('.toolbar [data-md]').forEach(b=>b.onclick = ()=>wrapSelection(b.dataset.md, b.dataset.md));
  document.querySelectorAll('.toolbar [data-md-wrap]').forEach(b=>b.onclick = ()=>wrapSelection(b.dataset.mdWrap, b.dataset.mdWrap));
  document.querySelectorAll('.toolbar [data-md-line]').forEach(b=>b.onclick = ()=>prefixLine(b.dataset.mdLine));
  document.querySelectorAll('.toolbar [data-md-block]').forEach(b=>b.onclick = ()=>insertBlock('\n'+b.dataset.mdBlock+'\n'));
  document.querySelectorAll('.mode-btn').forEach(b=>b.onclick = ()=>{ state.editorMode = b.dataset.mode; render(); });

  function wrapSelection(pre, post){
    if(!contentArea) return;
    const s = contentArea.selectionStart, e = contentArea.selectionEnd;
    const val = contentArea.value;
    contentArea.value = val.slice(0,s) + pre + val.slice(s,e) + post + val.slice(e);
    note.content = contentArea.value; onContentChanged(note);
    contentArea.focus(); contentArea.selectionStart = s+pre.length; contentArea.selectionEnd = e+pre.length;
  }
  function prefixLine(prefix){
    if(!contentArea) return;
    const s = contentArea.selectionStart;
    const val = contentArea.value;
    const lineStart = val.lastIndexOf('\n', s-1)+1;
    contentArea.value = val.slice(0,lineStart) + prefix + val.slice(lineStart);
    note.content = contentArea.value; onContentChanged(note);
    contentArea.focus(); contentArea.selectionStart = contentArea.selectionEnd = s+prefix.length;
  }
  function insertBlock(text){
    if(!contentArea) return;
    const s = contentArea.selectionStart;
    const val = contentArea.value;
    contentArea.value = val.slice(0,s) + text + val.slice(s);
    note.content = contentArea.value; onContentChanged(note);
    contentArea.focus();
  }

  // analyze
  const analyzeBtn = document.querySelector('[data-action="analyze"]');
  if(analyzeBtn){
    analyzeBtn.onclick = ()=>{
      analyzeBtn.disabled = true; analyzeBtn.textContent = 'Menganalisis...';
      setTimeout(()=>{
        note.analysis = analyzeNote(note);
        touchNote(note, "AI analysis dijalankan");
        save(); render();
        toast("Analisis selesai");
      }, 350); // small delay so it doesn't feel instantaneous/fake
    };
  }

  // insight collapse
  document.querySelectorAll('.insight-head').forEach(h=>{
    h.onclick = ()=>{
      const key = h.dataset.toggle;
      const body = document.getElementById('insight-body-'+key);
      h.classList.toggle('collapsed');
      body.classList.toggle('hidden');
    };
  });

  // action items
  document.querySelectorAll('[data-action="toggle-action"]').forEach(cb=>{
    cb.onchange = ()=>{
      toggleTaskLine(cb.dataset.id, parseInt(cb.dataset.line,10), cb.checked);
      const ta = document.getElementById('content-textarea'); if(ta) ta.value = getNote(cb.dataset.id).content;
    };
  });
  const addActionBtn = document.querySelector('[data-action="add-action"]');
  if(addActionBtn){
    addActionBtn.onclick = ()=>{
      const input = document.getElementById('new-action-input');
      if(!input.value.trim()) return;
      note.content += (note.content.endsWith('\n') || !note.content ? '' : '\n') + '- [ ] ' + input.value.trim();
      onContentChanged(note); render();
    };
  }

  // links
  document.querySelectorAll('[data-action="toggle-checkline"]').forEach(cb=>{
    cb.onchange = ()=>{
      toggleTaskLine(cb.dataset.note, parseInt(cb.dataset.line,10), cb.checked); render();
    };
  });
  const addLinkBtn = document.querySelector('[data-action="add-link"]');
  if(addLinkBtn){
    addLinkBtn.onclick = ()=>{
      const url = document.getElementById('new-link-url').value.trim();
      const title = document.getElementById('new-link-title').value.trim();
      if(!url) return;
      note.links = note.links || [];
      note.links.push({title: title || url, url});
      touchNote(note,"Menambahkan related link"); save(); render();
    };
  }

  // related note nav
  document.querySelectorAll('.related-row[data-action="open-note"]').forEach(el=>{
    el.onclick = ()=> openNote(el.dataset.id);
  });
}

/* ============================================================
   RENDER: KNOWLEDGE GRAPH  (simple circular layout, no server)
   ============================================================ */
function renderGraphView(){
  const list = activeNotes();
  if(list.length < 2){
    return `<div class="section-head"><h2 style="font-size:20px;">Knowledge Graph</h2></div>
      <div class="empty-state">Tambahkan minimal 2 catatan dengan tag yang sama agar graph dapat menampilkan hubungan.</div>`;
  }
  const W = 760, H = 460, cx = W/2, cy = H/2, R = Math.min(W,H)/2 - 60;
  const nodes = list.map((n,i)=>{
    const angle = (i / list.length) * Math.PI*2 - Math.PI/2;
    return { note:n, x: cx + R*Math.cos(angle), y: cy + R*Math.sin(angle) };
  });
  const edges = [];
  nodes.forEach((a,i)=>{
    nodes.forEach((b,j)=>{
      if(j<=i) return;
      const shared = (a.note.tags||[]).filter(t=>(b.note.tags||[]).includes(t));
      if(shared.length>0) edges.push({a,b,weight:shared.length});
    });
  });
  const edgeSvg = edges.map(e=>`<line class="graph-edge" x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}" stroke-width="${1+e.weight}"/>`).join('');
  const nodeSvg = nodes.map(n=>`
    <g class="graph-node" data-id="${n.note.id}" transform="translate(${n.x},${n.y})">
      <circle r="${14 + Math.min(4,(n.note.tags||[]).length)}"></circle>
      <text text-anchor="middle" dy="-18">${escapeHtml((n.note.title||'Tanpa judul').slice(0,20))}</text>
    </g>
  `).join('');
  return `
    <div class="section-head"><h2 style="font-size:20px;">Knowledge Graph</h2><span class="hint">Garis menghubungkan catatan yang berbagi tag. Klik node untuk membuka catatan.</span></div>
    <div class="graph-wrap">
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:520px;">
        ${edgeSvg}
        ${nodeSvg}
      </svg>
    </div>
  `;
}
function bindGraphEvents(){
  document.querySelectorAll('.graph-node').forEach(g=>{
    g.addEventListener('click', ()=> openNote(g.dataset.id));
  });
}

/* ============================================================
   EXPORT / IMPORT (this replaces a real database: notes only
   truly persist when the person downloads them)
   ============================================================ */
function exportAll(){
  const payload = { app:"Catatan Pintar", exportedAt: nowISO(), notes };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'catatan-pintar-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("Semua catatan diunduh sebagai file .json");
}
function importFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data) ? data : data.notes;
      if(!Array.isArray(incoming)) throw new Error('format tidak sesuai');
      let added = 0;
      incoming.forEach(n=>{
        if(!n.id || !notes.some(x=>x.id===n.id)){ notes.push(n); added++; }
      });
      save(); render();
      toast(added + " catatan berhasil diimpor");
    }catch(e){
      toast("Gagal membaca file: format tidak dikenali.");
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   EDITOR HELPERS: pencatatan jejak tulisan, tugas, navigasi
   ============================================================ */
function onContentChanged(n){
  const w = countWords(n.content);
  const prev = n.wc == null ? w : n.wc;
  const iso = nowISO();
  n.history = n.history || [];
  const last = n.history[n.history.length-1];
  if(last && last.kind === 'edit' && Date.now() - new Date(last.until || last.at).getTime() < 10*60000){
    last.until = iso; last.to = w;           // masih satu sesi menulis
  } else {
    n.history.push({at:iso, until:iso, kind:'edit', action:'Menulis', from:prev, to:w});
  }
  if(n.history.length > 300) n.history.splice(1, n.history.length-300);
  n.wc = w; n.updatedAt = iso;
  save(); updateEditorFoot(n); checkGoal();
}
function toggleTaskLine(id, line, checked){
  const n = getNote(id); if(!n) return;
  const lines = n.content.split('\n');
  const text = (lines[line]||'').replace(/^\s*[-*]\s\[( |x|X)\]\s/,'');
  lines[line] = lines[line].replace(/\[( |x|X)\]/, checked ? '[x]' : '[ ]');
  n.content = lines.join('\n');
  n.updatedAt = nowISO();
  n.history = n.history || [];
  n.history.push({at:n.updatedAt, kind:'task', action:(checked?'Menyelesaikan tugas: ':'Membuka kembali tugas: ')+text.slice(0,50)});
  save();
  if(checked){
    const items = extractActionItemsFromContent(n.content);
    if(items.length >= 2 && items.every(i=>i.done)){
      SN.fx.confetti(); SN.fx.ding(); toast('Semua tugas di "'+(n.title||'catatan')+'" selesai! 🎉');
    }
  }
}
function updateEditorFoot(n){
  const wc = document.getElementById('wc'); if(!wc) return;
  const w = n.wc != null ? n.wc : countWords(n.content);
  wc.textContent = w.toLocaleString('id-ID') + ' kata';
  const ch = document.getElementById('chars'); if(ch) ch.textContent = (n.content||'').length.toLocaleString('id-ID') + ' karakter';
  const m = activityMap(), k = dayKey(new Date()), goal = getGoal(), tw = m[k] ? m[k].words : 0;
  const f = document.getElementById('goal-fill'); if(f) f.style.width = Math.min(100, tw/goal*100) + '%';
  const t = document.getElementById('goal-txt'); if(t) t.textContent = 'Hari ini ' + tw + '/' + goal;
}
function goBack(){
  const p = state.prev || {view:'all'};
  state.view = p.view || 'all'; state.activeTag = p.tag || null; state.params = p.params || {};
  state.currentNoteId = null;
  if(state.view === 'tag' && !state.activeTag) state.view = 'all';
  render();
}
function historyLabel(e){
  if(e.kind === 'create') return {icon:'🌱', text:'Catatan dibuat'};
  if(e.kind === 'edit'){
    const d = (e.to||0) - (e.from||0);
    return {icon:'✒', text: d>0 ? 'Menulis · +'+d+' kata' : d<0 ? 'Menyunting · '+d+' kata' : 'Menyunting'};
  }
  if(e.kind === 'task' || /tugas/i.test(e.action)) return {icon:'✅', text:e.action};
  if(/trash/i.test(e.action)) return {icon:'🗑', text:e.action};
  if(/analysis/i.test(e.action)) return {icon:'✨', text:e.action};
  if(/link/i.test(e.action)) return {icon:'🔗', text:e.action};
  return {icon:'•', text:e.action};
}
function renderHistory(note){
  const h = (note.history||[]).slice().reverse().slice(0,40);
  if(!h.length) return '<span class="verify-note">Belum ada riwayat</span>';
  return '<div class="mini-tl">' + h.map(e=>{
    const l = historyLabel(e);
    return `<div class="mini-ev"><span class="ic">${l.icon}</span><div><strong>${fmtDate(e.at)}</strong><br>${escapeHtml(l.text)}</div></div>`;
  }).join('') + `</div><button class="link-btn" data-action="see-jejak" data-id="${note.id}">Lihat di Jejak →</button>`;
}

/* ============================================================
   MODAL
   ============================================================ */
function confirmModal(title, desc, onConfirm){
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p>
    <div class="row"><button data-x="cancel">Batal</button><button class="danger" data-x="ok">Ya, lanjutkan</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-x="cancel"]').onclick = ()=>wrap.remove();
  wrap.querySelector('[data-x="ok"]').onclick = ()=>{ wrap.remove(); onConfirm(); };
  wrap.addEventListener('click', e=>{ if(e.target===wrap) wrap.remove(); });
}
function promptModal(title, desc, value, onOk){
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p>
    <input class="modal-input" type="number" min="1" value="${escapeHtml(value)}" />
    <div class="row"><button data-x="cancel">Batal</button><button class="primary" data-x="ok">Simpan</button></div></div>`;
  document.body.appendChild(wrap);
  const inp = wrap.querySelector('input'); inp.focus(); inp.select();
  const ok = ()=>{ const v = inp.value; wrap.remove(); onOk(v); };
  wrap.querySelector('[data-x="cancel"]').onclick = ()=>wrap.remove();
  wrap.querySelector('[data-x="ok"]').onclick = ok;
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter') ok(); if(e.key==='Escape') wrap.remove(); });
  wrap.addEventListener('click', e=>{ if(e.target===wrap) wrap.remove(); });
}

/* ============================================================
   GLOBAL UI EVENTS
   ============================================================ */
let globalBound = false;
function refreshToggleLabels(){
  const s = document.getElementById('sound-btn'), i = document.getElementById('ink-btn');
  if(s) s.textContent = SN.fx.soundEnabled() ? '🔊 Suara' : '🔇 Suara';
  if(i) i.textContent = '✒ Jejak tinta: ' + (SN.fx.inkEnabled() ? 'aktif' : 'mati');
}
function bindGlobalEvents(){
  if(globalBound) return; globalBound = true;
  document.querySelectorAll('.nav-item[data-view]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.view = el.dataset.view; state.activeTag = null; state.currentNoteId = null; state.params = {};
      render();
      document.getElementById('sidebar').classList.remove('open');
    });
  });
  document.getElementById('search-input').addEventListener('input', e=>{
    state.search = e.target.value;
    if(['editor','book','jejak'].includes(state.view)) state.view = 'all';
    render();
  });
  document.querySelector('[data-action="export"]').onclick = exportAll;
  document.querySelector('[data-action="import"]').onclick = ()=> document.getElementById('import-input').click();
  document.getElementById('import-input').addEventListener('change', e=>{
    if(e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('sound-btn').onclick = ()=>{ SN.fx.setSound(!SN.fx.soundEnabled()); refreshToggleLabels(); SN.fx.flip(); };
  document.getElementById('ink-btn').onclick = ()=>{ SN.fx.setInk(!SN.fx.inkEnabled()); refreshToggleLabels(); };
  document.querySelector('[data-action="logout"]').onclick = ()=>{
    const pend = SN.pendingCount();
    confirmModal("Keluar dari akun?", pend ? "Ada "+pend+" perubahan yang belum tersimpan ke Sheet. Salinannya tetap aman di perangkat ini." : "Catatanmu aman tersimpan. Kamu bisa masuk lagi kapan saja.", ()=>SN.auth.logout());
  };
  document.querySelector('[data-action="toggle-sidebar"]').onclick = ()=>{
    document.getElementById('sidebar').classList.toggle('open');
  };
  document.addEventListener('click', e=>{
    const tagBtn = e.target.closest('[data-action="open-tag"]');
    if(tagBtn){ state.activeTag = tagBtn.dataset.tag; state.view='tag'; state.currentNoteId=null; render(); }
    const sj = e.target.closest('[data-action="see-jejak"]');
    if(sj){ SN.go('jejak',{noteId:sj.dataset.id}); }
  });
  document.addEventListener('keydown', e=>{
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
    if(e.key === 'Escape' && document.body.classList.contains('focus')) document.body.classList.remove('focus');
  });
  document.getElementById('focus-exit').onclick = ()=>document.body.classList.remove('focus');
  addEventListener('online', ()=>{ if(SN.backend.remote) doSync(); });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && SN.backend.remote) doSync(); });
}

function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('theme-btn').textContent = next==='dark' ? '☀️ Terang' : '🌙 Gelap';
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
}
function loadTheme(){
  let t = 'light';
  try{ t = localStorage.getItem(THEME_KEY) || 'light'; }catch(e){}
  document.documentElement.setAttribute('data-theme', t);
  const b = document.getElementById('theme-btn'); if(b) b.textContent = t==='dark' ? '☀️ Terang' : '🌙 Gelap';
}

/* ============================================================
   API PUBLIK (dipakai auth.js, book.js, jejak.js)
   ============================================================ */
SN.go = function(view, params){
  state.view = view; state.params = params || {}; state.activeTag = null; state.currentNoteId = null;
  render();
};
SN.start = function(user, server){
  USER = user; SN.user = user;
  let local = [];
  try{ local = JSON.parse(localStorage.getItem(K.notes(user.username)) || '[]'); }catch(e){}
  try{ pendingDel = JSON.parse(localStorage.getItem(K.pdel(user.username)) || '[]'); }catch(e){ pendingDel = []; }
  notes = mergeNotes(local, server);
  if(!notes.length && !localStorage.getItem(K.seeded(user.username)) && !(server && server.notes && server.notes.length)){
    let legacy = null;
    try{ legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); }catch(e){}
    if(Array.isArray(legacy) && legacy.length && !localStorage.getItem('sn_legacy_done')){
      notes = legacy; try{ localStorage.setItem('sn_legacy_done','1'); }catch(e){}
      toast(legacy.length + " catatan lama dari perangkat ini diimpor");
    } else notes = seedData();
    try{ localStorage.setItem(K.seeded(user.username),'1'); }catch(e){}
  }
  notes.forEach(n=>{ if(n.wc == null) n.wc = countWords(n.content); if(!n.history) n.history = []; });
  state.view = 'dashboard'; state.search = '';
  persistLocal();
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-handle').textContent = '@' + user.username;
  document.getElementById('user-avatar').textContent = (user.name || '?').trim().charAt(0).toUpperCase();
  refreshToggleLabels();
  bindGlobalEvents();
  render();
  if(server) scheduleSync(400); else if(!SN.backend.remote) setStatus('local'); else setStatus('pending');
};

Object.defineProperties(SN, {
  notes: {get: ()=>notes}, state: {get: ()=>state}
});
Object.assign(SN, {
  getNote, activeNotes, openNote, toast, escapeHtml, plainText, mdToHtml, fmtDate, fmtRelative,
  dayKey, activityMap, heatmapHtml, countWords, render, confirmModal, getGoal, streakDays
});
Object.defineProperty(SN, 'userName', {get: ()=>USER && USER.name});

/* ============================================================
   INIT
   ============================================================ */
loadTheme();

})();
