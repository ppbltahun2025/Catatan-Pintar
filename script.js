(function(){
"use strict";

/* ============================================================
   STORAGE & STATE
   ============================================================ */
const STORE_KEY = "smartnote_notes_v1";
const THEME_KEY = "smartnote_theme";

let notes = [];
let state = {
  view: "dashboard",       // dashboard | all | favorites | trash | graph | tag | editor
  search: "",
  activeTag: null,
  currentNoteId: null,
  editorMode: "write"       // write | preview
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
function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg){
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .2s'; el.style.opacity='0'; setTimeout(()=>el.remove(),200); }, 2400);
}

function save(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(notes));
  }catch(e){ toast("Gagal menyimpan ke penyimpanan lokal browser."); }
  renderSidebarMeta();
}

function load(){
  let raw = null;
  try{ raw = localStorage.getItem(STORE_KEY); }catch(e){}
  if(raw){
    try{ notes = JSON.parse(raw); return; }catch(e){}
  }
  notes = seedData();
  save();
}

/* ============================================================
   SEED DATA
   ============================================================ */
function seedData(){
  const t = nowISO();
  function mk(o){
    return Object.assign({
      id: uid(), category:"Umum", priority:"Sedang", status:"Berjalan",
      favorite:false, pinned:false, archived:false, trashed:false,
      createdAt:t, updatedAt:t, analysis:null,
      links:[], history:[{at:t, action:"Catatan dibuat"}]
    }, o);
  }
  return [
    mk({
      title:"Rapat Koordinasi Pengadaan",
      category:"Rapat", priority:"Tinggi", tags:["pengadaan","spse","tender","pemerintah"],
      content:"# Rapat Koordinasi Pengadaan 2026\n\nRapat membahas evaluasi proses pengadaan barang/jasa tahun 2026, "+
        "dengan fokus pada tahapan tender melalui SPSE, evaluasi dokumen administrasi, serta kendala anggaran di beberapa unit kerja.\n\n"+
        "## Permasalahan\n- Beberapa dokumen kontrak belum lengkap\n- Verifikasi anggaran belum selesai untuk paket 03\n"+
        "- Risiko keterlambatan tender jika dokumen tidak segera diperbaiki\n\n"+
        "## Rencana Tindak Lanjut\n- [ ] Periksa dokumen kontrak paket 03\n- [ ] Hubungi tim pengadaan terkait jadwal ulang tender\n"+
        "- [ ] Verifikasi data anggaran sebelum 25 September\n- [ ] Kirim laporan evaluasi ke kepala dinas\n\n"+
        "Catatan: prosedur mengacu pada portal INAPROC dan SPSE daerah. https://inaproc.id"
    }),
    mk({
      title:"Ide Pengembangan Sistem Dashboard",
      category:"Ide", priority:"Sedang", tags:["dashboard","apps-script","ide"],
      content:"# Ide Pengembangan\n\nMemikirkan penambahan fitur distribusi operator pada dashboard permohonan agar "+
        "lebih mudah dipantau per wilayah.\n\n## Catatan Penting\nData operator saat ini masih diinput manual, perlu "+
        "verifikasi ulang sebelum digunakan untuk laporan resmi.\n\n- [ ] Rancang struktur tabel distribusi operator\n"+
        "- [ ] Diskusikan dengan tim terkait kebutuhan filter wilayah"
    }),
    mk({
      title:"Evaluasi Pekerjaan Triwulan",
      category:"Pekerjaan", priority:"Tinggi", tags:["evaluasi","laporan","pekerjaan"],
      content:"# Evaluasi Pekerjaan\n\nSecara umum progres pekerjaan triwulan ini berjalan sesuai rencana, meskipun "+
        "ada beberapa target yang tertunda karena keterbatasan sumber daya.\n\n## Perlu Diperhatikan\n"+
        "Deadline penyelesaian laporan akhir jatuh pada akhir bulan, sementara dua item masih menunggu data dari tim lain.\n\n"+
        "- [ ] Susun draf laporan akhir\n- [x] Kumpulkan data capaian bulan pertama\n- [ ] Minta data dari tim keuangan"
    }),
    mk({
      title:"Materi Belajar: Dasar SQL",
      category:"Belajar", priority:"Rendah", tags:["belajar","sql","database"],
      content:"# Dasar SQL\n\nCatatan ringkas mempelajari perintah dasar SQL seperti SELECT, WHERE, JOIN, dan GROUP BY "+
        "untuk kebutuhan analisis data sederhana.\n\n## Poin Penting\nBelum sempat mencoba JOIN bertingkat, perlu latihan "+
        "lebih lanjut dengan data contoh yang lebih kompleks.\n\n- [ ] Latihan query JOIN dua tabel\n- [ ] Baca ulang materi GROUP BY"
    }),
    mk({
      title:"Rencana Proyek Q4",
      category:"Proyek", priority:"Tinggi", tags:["proyek","perencanaan","q4"],
      content:"# Rencana Proyek Kuartal 4\n\nMenyusun rencana kerja kuartal terakhir tahun ini, termasuk pembagian "+
        "tugas tim dan target penyelesaian modul utama.\n\n## Risiko\nAda ketergantungan dengan pekerjaan tim lain yang "+
        "jadwalnya belum pasti, berpotensi menggeser target penyelesaian.\n\n- [ ] Finalisasi timeline proyek\n"+
        "- [ ] Koordinasi dengan tim terkait ketergantungan modul\n- [ ] Kirim rencana ke pemangku kepentingan sebelum 30 September"
    }),
  ];
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
   RENDER: ROOT VIEW SWITCH
   ============================================================ */
function render(){
  renderSidebar();
  const root = document.getElementById('view-root');
  if(state.view === 'editor' && state.currentNoteId){
    root.innerHTML = renderEditorView(getNote(state.currentNoteId));
    bindEditorEvents();
    return;
  }
  if(state.view === 'graph'){
    root.innerHTML = renderGraphView();
    bindGraphEvents();
    return;
  }
  if(state.view === 'trash'){
    root.innerHTML = renderListView(notes.filter(n=>n.trashed), "Trash", "Catatan yang dihapus akan tersimpan di sini sampai dihapus permanen.");
    bindListEvents();
    return;
  }
  if(state.activeTag){
    const list = activeNotes().filter(n=>(n.tags||[]).includes(state.activeTag));
    root.innerHTML = renderListView(list, "#"+state.activeTag, "Tidak ada catatan dengan tag ini.");
    bindListEvents();
    return;
  }
  if(state.view === 'favorites'){
    root.innerHTML = renderListView(activeNotes().filter(n=>n.favorite), "Favorit", "Belum ada catatan favorit. Tandai bintang pada sebuah catatan untuk menyimpannya di sini.");
    bindListEvents();
    return;
  }
  if(state.view === 'all'){
    root.innerHTML = renderListView(activeNotes(), "Semua Catatan", "Belum ada catatan.");
    bindListEvents();
    return;
  }
  root.innerHTML = renderDashboard();
  bindListEvents();
  bindDashboardEvents();
}

/* ---------- Dashboard ---------- */
function renderDashboard(){
  const list = searchFilter(activeNotes());
  const recent = [...list].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,6);
  const weekAgo = Date.now() - 7*86400000;
  const thisWeek = activeNotes().filter(n=>new Date(n.createdAt).getTime() >= weekAgo).length;
  const tagCounts = {};
  activeNotes().forEach(n=>(n.tags||[]).forEach(t=>tagCounts[t]=(tagCounts[t]||0)+1));
  const topTag = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1])[0];
  const catCounts = {};
  activeNotes().forEach(n=>catCounts[n.category]=(catCounts[n.category]||0)+1);
  const topCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0];
  const linkedPairs = activeNotes().reduce((sum,n)=>sum + relatedNotes(n).length, 0)/2;

  return `
    <div class="welcome">
      <h1>Selamat datang kembali 👋</h1>
      <p>Apa yang sedang ingin Anda catat hari ini?</p>
      <div class="quick-capture">
        <input id="quick-input" placeholder="Tulis cepat lalu tekan Enter untuk membuat catatan..." />
        <button data-action="quick-create">＋ Buat Catatan Baru</button>
      </div>
    </div>

    <div class="section-head"><h2>Knowledge Overview</h2></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${activeNotes().length}</div><div class="label">Total catatan</div></div>
      <div class="stat-card"><div class="num">${thisWeek}</div><div class="label">Catatan minggu ini</div></div>
      <div class="stat-card"><div class="num">${topCat ? escapeHtml(topCat[0]) : '—'}</div><div class="label">Topik paling sering</div></div>
      <div class="stat-card"><div class="num">${topTag ? '#'+escapeHtml(topTag[0]) : '—'}</div><div class="label">Tag paling banyak dipakai</div></div>
    </div>

    <div class="section-head"><h2>Catatan Terbaru</h2>${list.length>6 ? '<button class="link" data-action="goto-all">Lihat semua →</button>':''}</div>
    ${recent.length ? `<div class="note-grid">${recent.map(noteCardHtml).join('')}</div>` :
      `<div class="empty-state">Belum ada catatan yang cocok.<br><button class="new-note-btn" style="display:inline-flex; margin-top:12px;" data-action="new-note">＋ Buat catatan pertama</button></div>`}
  `;
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

function noteCardHtml(n){
  const preview = plainText(n.content).slice(0,140) || 'Catatan kosong.';
  const tags = (n.tags||[]).slice(0,3).map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
  return `
    <div class="note-card" data-action="open-note" data-id="${n.id}">
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
    history:[{at:nowISO(), action:"Catatan dibuat"}]
  };
  notes.unshift(note);
  save();
  return note;
}
function openNote(id){
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
function renderHistory(note){
  const h = (note.history||[]).slice().reverse();
  return h.map(e=>`<div style="margin-bottom:6px;"><strong style="font-size:11.5px; color:var(--ink);">${fmtDate(e.at)}</strong><br>${escapeHtml(e.action)}</div>`).join('') || '<span class="verify-note">Belum ada riwayat</span>';
}

/* ---------- Editor event binding ---------- */
function bindEditorEvents(){
  const note = getNote(state.currentNoteId);
  if(!note) return;

  document.querySelector('[data-action="back"]').onclick = ()=>{ state.view='all'; state.currentNoteId=null; render(); };

  const titleInput = document.getElementById('title-input');
  titleInput.addEventListener('input', ()=>{ note.title = titleInput.value; touchNote(note); save(); renderSidebar(); });

  const contentArea = document.getElementById('content-textarea');
  if(contentArea){
    contentArea.addEventListener('input', ()=>{
      note.content = contentArea.value;
      touchNote(note);
      save();
    });
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
    note.content = contentArea.value; touchNote(note); save();
    contentArea.focus(); contentArea.selectionStart = s+pre.length; contentArea.selectionEnd = e+pre.length;
  }
  function prefixLine(prefix){
    if(!contentArea) return;
    const s = contentArea.selectionStart;
    const val = contentArea.value;
    const lineStart = val.lastIndexOf('\n', s-1)+1;
    contentArea.value = val.slice(0,lineStart) + prefix + val.slice(lineStart);
    note.content = contentArea.value; touchNote(note); save();
    contentArea.focus(); contentArea.selectionStart = contentArea.selectionEnd = s+prefix.length;
  }
  function insertBlock(text){
    if(!contentArea) return;
    const s = contentArea.selectionStart;
    const val = contentArea.value;
    contentArea.value = val.slice(0,s) + text + val.slice(s);
    note.content = contentArea.value; touchNote(note); save();
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
      const n = getNote(cb.dataset.id);
      const lines = n.content.split('\n');
      const idx = parseInt(cb.dataset.line,10);
      lines[idx] = lines[idx].replace(/\[( |x|X)\]/, cb.checked ? '[x]' : '[ ]');
      n.content = lines.join('\n');
      touchNote(n); save();
      if(document.getElementById('content-textarea')) document.getElementById('content-textarea').value = n.content;
    };
  });
  const addActionBtn = document.querySelector('[data-action="add-action"]');
  if(addActionBtn){
    addActionBtn.onclick = ()=>{
      const input = document.getElementById('new-action-input');
      if(!input.value.trim()) return;
      note.content += (note.content.endsWith('\n') || !note.content ? '' : '\n') + '- [ ] ' + input.value.trim();
      touchNote(note); save(); render();
    };
  }

  // links
  document.querySelectorAll('[data-action="toggle-checkline"]').forEach(cb=>{
    cb.onchange = ()=>{
      const n = getNote(cb.dataset.note);
      const lines = n.content.split('\n');
      const idx = parseInt(cb.dataset.line,10);
      lines[idx] = lines[idx].replace(/\[( |x|X)\]/, cb.checked ? '[x]' : '[ ]');
      n.content = lines.join('\n');
      touchNote(n); save(); render();
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
  const payload = { app:"SmartNote AI", exportedAt: nowISO(), notes };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'smartnote-export-' + new Date().toISOString().slice(0,10) + '.json';
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

/* ============================================================
   GLOBAL UI EVENTS
   ============================================================ */
function bindGlobalEvents(){
  document.querySelectorAll('.nav-item[data-view]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.view = el.dataset.view; state.activeTag = null; state.currentNoteId=null;
      render();
      document.getElementById('sidebar').classList.remove('open');
    });
  });
  document.getElementById('search-input').addEventListener('input', e=>{
    state.search = e.target.value;
    if(state.view === 'editor') { state.view = 'all'; }
    render();
  });
  document.querySelector('[data-action="export"]').onclick = exportAll;
  document.querySelector('[data-action="import"]').onclick = ()=> document.getElementById('import-input').click();
  document.getElementById('import-input').addEventListener('change', e=>{
    if(e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('theme-btn').onclick = toggleTheme;
  document.querySelector('[data-action="toggle-sidebar"]').onclick = ()=>{
    document.getElementById('sidebar').classList.toggle('open');
  };
  document.addEventListener('click', e=>{
    const tagBtn = e.target.closest('[data-action="open-tag"]');
    if(tagBtn){ state.activeTag = tagBtn.dataset.tag; state.view='tag'; state.currentNoteId=null; render(); }
  });
  document.addEventListener('keydown', e=>{
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
  });
}

function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('theme-btn').textContent = next==='dark' ? '☀️ Mode terang' : '🌙 Mode gelap';
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
}
function loadTheme(){
  let t = 'light';
  try{ t = localStorage.getItem(THEME_KEY) || 'light'; }catch(e){}
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-btn').textContent = t==='dark' ? '☀️ Mode terang' : '🌙 Mode gelap';
}

/* ============================================================
   INIT
   ============================================================ */
loadTheme();
load();
bindGlobalEvents();
render();

})();
