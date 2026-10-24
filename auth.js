/* ============================================================
   AUTH + BACKEND (Google Sheet via Apps Script, atau mode lokal)
   ============================================================ */
(function(){
"use strict";
const SN = window.SN;
const CFG = window.SN_CONFIG || {};
const REMOTE = /^https:\/\//.test(CFG.API_URL || "");
const $ = id => document.getElementById(id);
const SES_KEY = 'sn_session';
const LU_KEY = 'sn_local_users';
const enc = s => new TextEncoder().encode(s);
const hex = u8 => Array.from(u8).map(b=>b.toString(16).padStart(2,'0')).join('');

/* ---------- penurunan kunci (password polos tidak keluar dari browser) ---------- */
async function derive(username, password){
  if(!(window.crypto && crypto.subtle)) throw new Error('Browser menolak kriptografi. Buka aplikasi lewat HTTPS atau localhost.');
  const key = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:enc('catatan-pintar::'+username), iterations:150000}, key, 256);
  return hex(new Uint8Array(bits));
}

/* ---------- backend jarak jauh ---------- */
async function call(action, payload, opts){
  opts = opts || {};
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), opts.timeout || 25000);
  let res;
  try{
    res = await fetch(CFG.API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(Object.assign({action}, payload)), signal: ctrl.signal, redirect:'follow', keepalive: !!opts.keepalive});
  }catch(e){ throw Object.assign(new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.'), {code:'NETWORK'}); }
  finally{ clearTimeout(t); }
  let data;
  try{ data = await res.json(); }
  catch(e){ throw Object.assign(new Error('Respons server tidak valid. Pastikan Web App di-deploy dengan akses "Anyone".'), {code:'BAD'}); }
  if(!data.ok) throw Object.assign(new Error(data.error || 'Terjadi kesalahan.'), {code: data.code || 'ERR'});
  return data;
}

let session = null; // {username,name,token}
const readSession = ()=>{ try{ return JSON.parse(localStorage.getItem(SES_KEY)||'null'); }catch(e){ return null; } };
const writeSession = s=>{ try{ localStorage.setItem(SES_KEY, JSON.stringify(s)); }catch(e){} };

const remoteApi = {
  remote:true,
  async register(u,n,pw){ return call('register',{username:u, displayName:n, password:pw}); },
  async login(u,pw){ return call('login',{username:u, password:pw}); },
  async load(){ return call('load',{username:session.username, token:session.token}); },
  async sync(p, o){ return call('sync', Object.assign({username:session.username, token:session.token}, p), o); },
  async logout(){ try{ await call('logout',{token:session.token},{timeout:6000}); }catch(e){} }
};
const localApi = {
  remote:false,
  _users(){ try{ return JSON.parse(localStorage.getItem(LU_KEY)||'{}'); }catch(e){ return {}; } },
  async register(u,n,pw){
    const us=this._users(); if(us[u]) throw new Error('Username sudah dipakai. Coba yang lain.');
    us[u]={name:n, pw}; localStorage.setItem(LU_KEY, JSON.stringify(us));
    return {ok:true, token:'local', user:{username:u,name:n}};
  },
  async login(u,pw){
    const x=this._users()[u]; if(!x || x.pw!==pw) throw new Error('Username atau password salah.');
    return {ok:true, token:'local', user:{username:u,name:x.name}};
  },
  async load(){ return null; },
  async sync(){ return {ok:true, saved:[], newer:[]}; },
  async logout(){}
};
SN.backend = REMOTE ? remoteApi : localApi;

/* ---------- UI ---------- */
let mode = 'login', busy = false;
function setMode(m){
  mode = m;
  const card = $('auth-card');
  card.classList.toggle('is-reg', m==='register');
  document.querySelectorAll('.auth-tabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===m));
  document.querySelector('.auth-tabs').dataset.on = m;
  $('auth-go').querySelector('.lbl').textContent = m==='login' ? 'Masuk' : 'Buat akun';
  $('a-pass').autocomplete = m==='login' ? 'current-password' : 'new-password';
  $('auth-err').textContent = '';
}
function showErr(msg){
  const e=$('auth-err'); e.textContent=msg; e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake');
  $('auth-card').classList.remove('nope'); void $('auth-card').offsetWidth; $('auth-card').classList.add('nope');
}
function renderModeNote(){
  $('auth-mode').innerHTML = REMOTE
    ? '<span class="dot ok"></span> Terhubung ke Google Sheet'
    : '<span class="dot warn"></span> Mode lokal — akun & catatan hanya di browser ini. Isi <code>API_URL</code> di <code>config.js</code> untuk menyimpan ke Google Sheet.';
}

async function submit(ev){
  ev.preventDefault(); if(busy) return;
  const username = $('a-user').value.trim().toLowerCase();
  const pass = $('a-pass').value, name = $('a-name').value.trim();
  if(!/^[a-z0-9_.]{3,24}$/.test(username)) return showErr('Username 3–24 karakter: huruf kecil, angka, titik, atau garis bawah.');
  if(pass.length < 6) return showErr('Password minimal 6 karakter.');
  if(mode==='register'){
    if(!name) return showErr('Isi nama panggilan dulu ya.');
    if(pass !== $('a-pass2').value) return showErr('Konfirmasi password tidak sama.');
  }
  busy = true; $('auth-go').classList.add('loading'); $('auth-err').textContent='';
  try{
    const key = await derive(username, pass);
    const r = mode==='register' ? await SN.backend.register(username, name, key) : await SN.backend.login(username, key);
    session = {username:r.user.username, name:r.user.name, token:r.token, remote:REMOTE};
    writeSession(session);
    let server = null;
    try{ server = await SN.backend.load(); }catch(e){ if(e.code==='AUTH') throw e; }
    enter(server, ev);
  }catch(e){ showErr(e.message || 'Gagal masuk.'); }
  finally{ busy=false; $('auth-go').classList.remove('loading'); }
}

/* transisi: tinta menyebar membuka aplikasi */
function enter(server, ev){
  const btn = $('auth-go').getBoundingClientRect();
  const x = btn.left + btn.width/2, y = btn.top + btn.height/2;
  const auth = $('auth');
  SN.start({username:session.username, name:session.name}, server);
  $('app').hidden = false;
  auth.style.setProperty('--x', x+'px'); auth.style.setProperty('--y', y+'px');
  auth.classList.add('leaving');
  setTimeout(()=>{ auth.hidden = true; auth.classList.remove('leaving'); }, 900);
  if(SN.fx && SN.fx.confetti && mode==='register') setTimeout(()=>SN.fx.confetti(x,y), 350);
}

function showAuth(msg){
  $('app').hidden = true; $('auth').hidden = false;
  $('a-pass').value=''; $('a-pass2').value='';
  setMode('login'); renderModeNote();
  if(msg) showErr(msg);
}

SN.auth = {
  get session(){ return session; },
  async logout(){
    const canPurge = REMOTE && SN.pendingCount && SN.pendingCount()===0;
    await SN.backend.logout();
    try{
      localStorage.removeItem(SES_KEY);
      if(canPurge) ['sn_notes_','sn_pdel_'].forEach(p=>localStorage.removeItem(p+session.username));
    }catch(e){}
    location.reload();
  },
  forceLogout(msg){
    try{ localStorage.removeItem(SES_KEY); }catch(e){}
    session = null; showAuth(msg);
  }
};

/* ---------- init ---------- */
function init(){
  document.querySelectorAll('.auth-tabs button').forEach(b=>b.onclick=()=>setMode(b.dataset.tab));
  $('auth-form').addEventListener('submit', submit);
  $('a-eye').onclick = ()=>{ const p=$('a-pass'); p.type = p.type==='password' ? 'text':'password'; };
  renderModeNote(); setMode('login');

  const s = readSession();
  if(s && s.token && s.remote===REMOTE){
    session = s;
    $('auth').hidden = true; $('app').hidden = false;
    SN.start({username:s.username, name:s.name}, null);   // langsung tampil dari cache lokal
    if(REMOTE){
      const tryLoad = ()=>SN.backend.load().then(d=>SN.applyServer(d)).catch(e=>{
        if(e.code==='AUTH') SN.auth.forceLogout('Sesi berakhir. Silakan masuk lagi.');
        else { SN.setStatus('offline'); setTimeout(tryLoad, 20000); }
      });
      tryLoad();
    }
  } else {
    if(s) localStorage.removeItem(SES_KEY);
    $('auth').hidden = false;
  }
}
init();
})();
