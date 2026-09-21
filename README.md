# SmartNote AI

Aplikasi catatan pintar berbasis HTML/CSS/JS murni — tanpa framework, tanpa backend, tanpa database.
Data catatan disimpan di `localStorage` browser pengguna. Untuk mencadangkan atau memindahkan data,
gunakan tombol **Export semua (.json)** / **Import dari file** di dalam aplikasi.

## Isi folder

```
index.html   -> struktur halaman, memanggil style.css dan script.js
style.css    -> seluruh styling
script.js    -> seluruh logika aplikasi (render, penyimpanan, "AI" heuristik)
```

Tidak ada dependency eksternal (tidak ada CDN, tidak ada npm install) — cukup 3 file ini.

## Menjalankan secara lokal

Cukup buka `index.html` langsung di browser, atau jalankan server statis sederhana:

```bash
npx serve .
# atau
python3 -m http.server 8080
```

## Deploy ke GitHub Pages

1. Buat repository baru di GitHub, lalu upload ketiga file di atas ke root repository (atau ke folder `docs/`).
2. Masuk ke **Settings → Pages**.
3. Pada **Source**, pilih branch `main` dan folder `/ (root)` (atau `/docs` jika Anda meletakkan file di sana).
4. Simpan — GitHub akan memberi URL seperti `https://<username>.github.io/<repo>/` setelah build selesai (biasanya 1–2 menit).

Atau lewat command line:

```bash
git init
git add index.html style.css script.js README.md
git commit -m "Initial commit: SmartNote AI"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

Lalu aktifkan Pages seperti langkah di atas.

## Catatan penting

- Karena tidak ada server/API key, fitur "Analyze with AI" berjalan sepenuhnya di browser menggunakan
  aturan/heuristik (ringkasan ekstraktif, deteksi kata kunci, deteksi pola kalimat penting) — bukan
  pemahaman bahasa alami sungguhan.
- Setiap pengguna/browser punya penyimpanan `localStorage` masing-masing; data tidak otomatis
  tersinkron antar perangkat. Gunakan Export/Import untuk memindahkan data.
