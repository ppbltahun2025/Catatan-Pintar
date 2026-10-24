/**
 * CATATAN PINTAR — Backend Google Apps Script
 * --------------------------------------------------------------
 * Menyimpan akun (username + password ter-hash) dan semua catatan
 * ke Google Sheet. Aplikasi web (GitHub Pages / lokal) memanggil
 * script ini lewat HTTPS POST.
 *
 * Tab yang dibuat otomatis:
 *   Users    : username | display_name | salt | password_hash | created_at | last_login
 *   Sessions : token | username | created_at | expires_at
 *   Notes    : id | username | title | category | created_at | updated_at | deleted | json_1..json_4
 *
 * CATATAN KEAMANAN
 *  - Password TIDAK pernah disimpan polos. Browser menurunkan kunci
 *    dengan PBKDF2 (150.000 iterasi), lalu server menyimpan
 *    SHA-256(salt + kunci) di kolom password_hash.
 *  - Sheet ini berisi hash akun & isi catatan: JANGAN dibagikan
 *    "Anyone with the link". Set akses Sheet ke "Restricted".
 *    Web App berjalan sebagai pemilik Sheet, jadi tetap bisa menulis.
 */

const SHEET_ID = '1KAo9T0NZz_ZjL56ZsGcRRWneebfaLHKnsrgG0wHgrbs';
const SESSION_DAYS = 30;
const CHUNK = 45000;        // batas sel Google Sheets = 50.000 karakter
const MAX_CHUNKS = 4;       // => maks ~180.000 karakter per catatan
const MAX_FAILS = 5;        // percobaan login gagal sebelum dikunci
const LOCK_MINUTES = 10;

const SCHEMA = {
  Users:    ['username', 'display_name', 'salt', 'password_hash', 'created_at', 'last_login'],
  Sessions: ['token', 'username', 'created_at', 'expires_at'],
  Notes:    ['id', 'username', 'title', 'category', 'created_at', 'updated_at', 'deleted',
             'json_1', 'json_2', 'json_3', 'json_4']
};

/* ============================ ENTRY POINTS ============================ */

function doGet() {
  return json_({ ok: true, app: 'Catatan Pintar API', time: new Date().toISOString() });
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e.postData && e.postData.contents) || '{}');
    out = route_(req);
  } catch (err) {
    if (err && err.user) out = { ok: false, error: err.message, code: err.code || 'ERR' };
    else { console.error(err); out = { ok: false, error: 'Terjadi kesalahan pada server.', code: 'SERVER' }; }
  }
  return json_(out);
}

/** Jalankan SEKALI dari editor Apps Script (tombol Run) untuk membuat tab & memberi izin. */
function setup() {
  ensureSheets_();
  Logger.log('Siap. Tab Users, Sessions, Notes sudah tersedia.');
}

/* ================================ ROUTER ============================== */

function route_(req) {
  ensureSheets_();
  switch (req.action) {
    case 'register': return withLock_(() => register_(req));
    case 'login':    return login_(req);
    case 'logout':   return logout_(req);
    case 'load':     return load_(req);
    case 'sync':     return withLock_(() => sync_(req));
    default: fail_('Aksi tidak dikenal.');
  }
}

/* ============================== AUTH ================================= */

function register_(req) {
  const username = normUser_(req.username);
  const name = String(req.displayName || username).trim().slice(0, 40) || username;
  const pw = String(req.password || '');
  if (!/^[a-f0-9]{64}$/.test(pw)) fail_('Format password tidak valid.');

  const sh = sheet_('Users');
  if (findRow_(sh, 1, username)) fail_('Username sudah dipakai. Coba yang lain.');

  const salt = Utilities.getUuid();
  const now = new Date().toISOString();
  sh.appendRow([username, name, salt, hash_(salt, pw), now, now]);
  return startSession_(username, name);
}

function login_(req) {
  const username = normUser_(req.username);
  const pw = String(req.password || '');
  const cache = CacheService.getScriptCache();
  const failKey = 'fail:' + username;
  const fails = parseInt(cache.get(failKey) || '0', 10);
  if (fails >= MAX_FAILS) fail_('Terlalu banyak percobaan gagal. Coba lagi dalam ' + LOCK_MINUTES + ' menit.', 'LOCKED');

  const sh = sheet_('Users');
  const row = findRow_(sh, 1, username);
  let ok = false, name = username;
  if (row) {
    const v = sh.getRange(row, 1, 1, 6).getValues()[0];
    name = v[1];
    ok = hash_(v[2], pw) === v[3];
    if (ok) sh.getRange(row, 6).setValue(new Date().toISOString());
  }
  if (!ok) {
    cache.put(failKey, String(fails + 1), LOCK_MINUTES * 60);
    fail_('Username atau password salah.');
  }
  cache.remove(failKey);
  return withLock_(() => startSession_(username, name));
}

function logout_(req) {
  const sh = sheet_('Sessions');
  const row = findRow_(sh, 1, String(req.token || ''));
  if (row) sh.deleteRow(row);
  return { ok: true };
}

function startSession_(username, name) {
  const sh = sheet_('Sessions');
  purgeExpired_(sh);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 86400000);
  sh.appendRow([token, username, now.toISOString(), exp.toISOString()]);
  return { ok: true, token: token, user: { username: username, name: name }, expiresAt: exp.toISOString() };
}

function auth_(req) {
  const sh = sheet_('Sessions');
  const row = findRow_(sh, 1, String(req.token || ''));
  if (!row) fail_('Sesi tidak valid. Silakan masuk lagi.', 'AUTH');
  const v = sh.getRange(row, 1, 1, 4).getValues()[0];
  if (v[1] !== String(req.username || '').toLowerCase() || new Date(v[3]) < new Date())
    fail_('Sesi berakhir. Silakan masuk lagi.', 'AUTH');
  return v[1];
}

function purgeExpired_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return;
  const vals = sh.getRange(2, 4, last - 1, 1).getValues();
  const now = new Date();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (new Date(vals[i][0]) < now) sh.deleteRow(i + 2);
  }
}

/* ============================== NOTES ================================ */

function load_(req) {
  const username = auth_(req);
  const sh = sheet_('Notes');
  const last = sh.getLastRow();
  const notes = [], deletedIds = [];
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, 11).getValues();
    vals.forEach(function (r) {
      if (r[1] !== username) return;
      if (String(r[6]) === 'TRUE') { deletedIds.push(r[0]); return; }
      const raw = [r[7], r[8], r[9], r[10]].join('');
      try { notes.push(JSON.parse(raw)); } catch (e) { /* baris rusak dilewati */ }
    });
  }
  return { ok: true, notes: notes, deletedIds: deletedIds, serverTime: new Date().toISOString() };
}

function sync_(req) {
  const username = auth_(req);
  const sh = sheet_('Notes');
  const last = sh.getLastRow();
  const index = {}; // id -> {row, owner, updated}
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 6).getValues().forEach(function (r, i) {
      index[r[0]] = { row: i + 2, owner: r[1], updated: r[5] };
    });
  }

  const saved = [], newer = [], rejected = [], appendRows = [];
  (req.upsert || []).forEach(function (n) {
    if (!n || !n.id) return;
    const ex = index[n.id];
    if (ex && ex.owner !== username) { rejected.push(n.id); return; }
    const raw = JSON.stringify(n);
    if (raw.length > CHUNK * MAX_CHUNKS) { rejected.push(n.id); return; }

    // versi di server lebih baru? -> kembalikan ke klien, jangan timpa
    if (ex && ex.updated && n.updatedAt && new Date(ex.updated) > new Date(n.updatedAt)) {
      const cur = readNote_(sh, ex.row);
      if (cur) { newer.push(cur); return; }
    }
    const row = [n.id, username, String(n.title || '').slice(0, 200), String(n.category || ''),
                 n.createdAt || '', n.updatedAt || '', ''];
    for (let c = 0; c < MAX_CHUNKS; c++) row.push(raw.slice(c * CHUNK, (c + 1) * CHUNK));
    if (ex) sh.getRange(ex.row, 1, 1, 11).setValues([row]);
    else { appendRows.push(row); index[n.id] = { row: -1, owner: username }; }
    saved.push(n.id);
  });
  if (appendRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, 11).setValues(appendRows);
  }

  (req.remove || []).forEach(function (id) {
    const ex = index[id];
    if (ex && ex.owner === username && ex.row > 0) {
      sh.getRange(ex.row, 7, 1, 5).setValues([['TRUE', '', '', '', '']]); // tombstone
    }
  });

  return { ok: true, saved: saved, newer: newer, rejected: rejected, serverTime: new Date().toISOString() };
}

function readNote_(sh, row) {
  const r = sh.getRange(row, 8, 1, 4).getValues()[0];
  try { return JSON.parse(r.join('')); } catch (e) { return null; }
}

/* ============================== HELPERS ============================== */

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function ensureSheets_() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      // pakai tab "Sheet1" bawaan yang masih kosong untuk Users
      const def = ss.getSheetByName('Sheet1');
      if (name === 'Users' && def && def.getLastRow() === 0) { def.setName('Users'); sh = def; }
      else sh = ss.insertSheet(name);
    }
    const cols = SCHEMA[name].length;
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols).setValues([SCHEMA[name]]).setFontWeight('bold').setBackground('#efe3c8');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, sh.getMaxRows(), cols).setNumberFormat('@'); // semua kolom = teks
    }
  });
}

function sheet_(name) { return ss_().getSheetByName(name); }

function findRow_(sh, col, value) {
  const last = sh.getLastRow();
  if (last < 2 || !value) return 0;
  const f = sh.getRange(2, col, last - 1, 1).createTextFinder(String(value))
              .matchEntireCell(true).matchCase(true).findNext();
  return f ? f.getRow() : 0;
}

function hash_(salt, pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function normUser_(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,24}$/.test(s)) fail_('Username 3–24 karakter: huruf kecil, angka, titik, atau garis bawah.');
  return s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function fail_(message, code) { throw { user: true, message: message, code: code }; }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
