# Verifikasi rilis 0.1.2 — 14 November 2026

## Perubahan pengguna

- Masuk kamera tidak lagi memerlukan Drive Awal yang sudah diatur.
- Sesi baru menghapus hitungan foto lama sebelum kamera dibuka; respons refresh sesi sebelumnya ditolak.
- Foto lama yang terkunci Windows tidak masuk daftar atau batas foto sesi baru; cleanup dicoba kembali setelah lock lepas.
- Stiker memiliki kotak seleksi dengan empat pegangan ukuran, putaran bebas, dan hapus langsung; ukuran area tekan tetap, kontrol tepi tetap terlihat.
- Perbaikan audit backend/desktop mencakup validasi gambar, pengiriman durable, deduplikasi, serialisasi capture, proteksi instance dan printer Windows.
- Error Drive permanen berhenti dicoba ulang dan ditampilkan sebagai kegagalan; file lokal tetap tersedia.
- Tes bridge kamera menjalankan fixture dengan interpreter Python agar lintas platform. Pemeriksaan mode file POSIX hanya berlaku di sistem POSIX, sedangkan JSON credential tetap diuji di Windows.

## Verifikasi lokal

- 117 tes frontend lulus.
- Patch dependensi kompatibel diterapkan: Vite 7.3.8 beserta dependensi transitif; npm audit melaporkan 0 kerentanan.
- 121 tes backend lulus.
- 2 tes Rust lulus.
- Pemeriksaan versi rilis lulus: 0.1.2.
- Build produksi frontend dan bundle Tauri macOS lengkap lulus.
- Smoke test binary paket lulus: health, autentikasi instance, provider default, tiga capture sintetis, penolakan capture keempat dan reset sesi. Data dan proses uji dibersihkan otomatis.
- Simulasi batasan Windows CreateProcess pada suite bridge kamera: 4 tes lulus.
- Review kode independen menemukan error permanen Drive dan fixture kamera Windows; keduanya diperbaiki dan diperiksa dengan reproduksi gagal lalu lulus.
- Scan pola kredensial pada file kode yang dikirim tidak menemukan kredensial; file auth, token, binary dan data runtime tidak disertakan dalam commit.

## Temuan runner Windows

Build #9 mengungkap UnicodeEncodeError pada konsol CP1252 dan satu asumsi pemisah path pada tes. Backend kini mengonfigurasi stdout/stderr agar karakter yang tidak didukung di-escape, sehingga pencatatan tidak menggagalkan reset sesi atau antrean. Seluruh 121 tes backend lulus dengan PYTHONIOENCODING=cp1252 setelah perbaikan.

## Batas

Kamera/printer fisik, Windows GDI, instalasi NSIS dan interaksi webview pada Windows memerlukan pengujian Windows nyata. Build GitHub Actions akan menjalankan tes pada runner Windows dan smoke test backend hasil paket. Kelulusan tes tidak berarti jaminan tanpa bug pada seluruh perangkat.
