# Catatan Pintar ✒

Aplikasi catatan dengan login, penyimpanan ke **Google Sheet**, kursor bulu penulis, dashboard animatif,
**Buku Besar** (semua catatan dalam satu buku yang bisa dibalik) dan **Jejak** (riwayat tulisan per rentang tanggal).

## Struktur
| File | Fungsi |
|---|---|
| `index.html`, `style.css` | Tampilan & tema kertas/tinta (terang + gelap) |
| `config.js` | **Isi `API_URL` di sini** |
| `auth.js` | Login/daftar, sesi, koneksi ke Apps Script (atau mode lokal) |
| `script.js` | Inti aplikasi: editor, dashboard, sinkronisasi, AI heuristik, graph |
| `book.js` | Buku Besar (balik halaman 3D, daftar halaman, lompat halaman) |
| `jejak.js` | Jejak: linimasa, rentang tanggal, rentang hidup catatan, ekspor CSV |
| `cursor.js` | Kursor bulu, jejak/percikan tinta, konfeti, suara |
| `apps-script/Code.gs` | Backend untuk Google Sheet |

## Setup Google Sheet (sekali saja, ±5 menit)
1. Buka Sheet Anda → **Ekstensi → Apps Script**.
2. Hapus isi `Code.gs`, tempel seluruh isi `apps-script/Code.gs`. Pastikan `SHEET_ID` sesuai Sheet Anda.
3. Pilih fungsi **`setup`** → **Run** → setujui izin akses. Tab `Users`, `Sessions`, `Notes` dibuat otomatis.
4. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone** → Deploy.
5. Salin URL web app (berakhiran `/exec`) ke `config.js` → `API_URL`.
6. **Penting:** di tombol Share Sheet, ubah akses umum menjadi **Restricted**. Sheet berisi hash akun dan isi
   catatan; Web App tetap bisa menulis karena berjalan atas nama Anda.
7. Jika Code.gs diubah, deploy ulang sebagai **New version** agar perubahan berlaku.

Jalankan lewat **HTTPS atau localhost** (mis. GitHub Pages, atau `python3 -m http.server`).
Membuka lewat `file://` bisa gagal untuk fungsi kriptografi password.

## Keamanan singkat
- Password **tidak pernah dikirim atau disimpan polos**: browser menurunkan kunci (PBKDF2 150.000 iterasi),
  server menyimpan `SHA-256(salt + kunci)`. Kolom `password_hash` di Sheet bukan password asli.
- Sesi memakai token acak 30 hari (tab `Sessions`); 5 kali salah password mengunci login 10 menit.
- Setiap user hanya bisa membaca/menulis catatannya sendiri.
- Batas: ±180.000 karakter per catatan (batas sel Sheet). Skala cocok untuk pemakaian pribadi/kecil.

## Fitur
- **Login/daftar** beranimasi; sinkron otomatis ke Sheet, tetap bisa menulis saat offline lalu menyusul tersimpan.
- **Kursor bulu penulis** + jejak tinta (tahan klik & seret untuk mencoret). Bisa dimatikan di sidebar.
- **Dashboard**: sapaan, target kata harian (cincin progres, klik untuk ubah), beruntun menulis, heatmap 26 minggu,
  tugas terbuka lintas catatan, catatan terbaru, konfeti saat target/tugas selesai.
- **Buku Besar**: sampul kulit, daftar halaman bisa diklik, nomor halaman, balik halaman (klik tepi / ← → / geser),
  lompat ke halaman, lanjut membaca, urutan tanggal/terbaru/judul/kategori, mode satu halaman di ponsel.
- **Jejak**: filter 7/30/90 hari atau tanggal bebas, per catatan, per jenis; linimasa per hari dengan jam sesi menulis
  dan jumlah kata; tab *Rentang hidup catatan* (ditulis → terakhir diperbarui); klik heatmap untuk hari tertentu.
- **Mode fokus** di editor, penghitung kata, suara kertas/pena (opsional).
