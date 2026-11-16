# Rilis Windows 0.1.8 — 16 November 2026

## Isi pembaruan
- Pengaturan cetak: kertas, orientasi, salinan, penyesuaian gambar, dan tes cetak di Admin.
- Admin dikelompokkan menjadi tab Photobooth, Strip, Kamera, Cetak, Waktu, dan Sistem.
- Photobooth fullscreen melalui F12; Esc kembali, tanpa tombol fullscreen pada layar pengguna.
- Timer hitungan foto, pemilihan strip, edit, dan batas sesi.
- Stiker dan teks digabung; ukuran teks dapat diatur langsung.
- Tema wedding dan unggah background khusus photobooth; container transparan dengan blur ringan.
- Preview kamera dipusatkan; foto ditampilkan utuh.
- Print & Kirim lebih terbaca dengan QR lokal berukuran besar.
- Pratinjau tiap foto dengan Pakai Foto/Ulang Foto, durasi dan batas ulang diatur Admin → Waktu. Foto lama dipertahankan jika pengambilan ulang gagal.

## Build dan distribusi
Source: `16d0fd57a5b0758ae78c6793b98f3ab86867a94f`.
Build run #21: https://github.com/patik-un/projek-gabut/actions/runs/43851948517
Status: rilis publik berhasil diterbitkan sebagai Latest.
Publikasi run #22: https://github.com/patik-un/projek-gabut/actions/runs/43853362264
Rilis: https://github.com/patik-un/projek-gabut/releases/tag/v0.1.8
Tag `v0.1.8` menunjuk source SHA build di atas.

Verifikasi CI: build Windows, tes regresi backend/frontend, tes native Windows dan smoke test backend hasil paket lulus.
ZIP artifact SHA256: `40bde4fa6f4194e80ddfd307db3cb136432df225d3a1640415f6e0ed7d62b4e6`.
Installer SHA256: `f349b8e5e3718491bfca5c4cd4f847dfcc2da5d91f53e4c645db5be735c9a42c` (102798973 byte).
Tanda tangan installer dibuat lokal dan diverifikasi terhadap kunci publik aplikasi.

Verifikasi publik tanpa login: Latest menunjuk v0.1.8, tiga aset aplikasi tersedia (installer, .sig, latest.json), manifest menunjuk URL installer yang benar, HEAD installer HTTP 200 dengan ukuran yang sesuai, digest aset installer cocok dengan artifact lokal, tanda tangan manifest/.sig/lokal identik. Tanda tangan dari manifest publik diverifikasi ulang terhadap bytes installer dan kunci publik aplikasi. Screenshot halaman rilis disimpan di artifacts percakapan sebagai windows-release-0.1.8.png.

Pengguna versi 0.1.6/0.1.7 dapat memeriksa update melalui Tentang / Update di Admin Panel. Installer juga dapat diunduh manual dari halaman rilis.

Kunci updater tidak berubah dan tetap lokal. Data operasional lokal tidak disertakan dalam commit rilis. Nomor versi 0.1.8 lulus pemeriksaan konsistensi. Pengujian fitur lokal sebelumnya: 168 tes frontend, 157 tes backend, dan build Vite lulus. Kamera/printer fisik serta transisi pemasangan penuh pada Windows interaktif perlu dicek di komputer pengguna.
