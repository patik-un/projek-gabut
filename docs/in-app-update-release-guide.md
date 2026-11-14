# Rilis update aplikasi Windows

Mulai 0.1.6, aplikasi memeriksa GitHub Releases saat dibuka dan setiap 6 jam.
Tombol Tentang / Update dapat digunakan sebelum login. Versi lama harus
dipasangi 0.1.6 sekali secara manual; setelah itu versi baru tampil di aplikasi.
Pilih Unduh & pasang ketika sesi foto/cetak/penyimpanan telah selesai.

Kunci privat tetap lokal di `.update-signing/event-booth.key` (diabaikan Git,
izin 600 pada macOS). Simpan backup privat yang aman di luar checkout sebelum
memindahkan komputer/proyek. Jangan mengganti kunci pada rilis berikutnya:
aplikasi yang terpasang hanya mempercayai kunci publik yang dibundel.
GitHub tidak membutuhkan atau menerima kunci privat untuk alur ini.

## Menyiapkan rilis berikutnya

1. Naikkan versi pada package.json/package-lock.json, tauri.conf.json dan paket
   `frontend` pada Cargo.toml/Cargo.lock. Jangan mengganti versi dependensi lain.
2. Jalankan tes dan push commit. Jalankan workflow Build Windows Installer pada
   branch tersebut dengan `signed_release` kosong. CI membuat installer,
   menjalankan tes backend/frontend/native dan smoke test binary hasil paket.
3. Unduh artifact installer dari run yang berhasil. Simpan pada folder lokal
   `.update-signing/releases/` atau direktori kerja privat lainnya.
4. Dari folder frontend, tandatangani file di komputer yang memegang kunci:

   ```sh
   rtk proxy node scripts/sign-update-locally.mjs /path/to/installer.exe BUILD_RUN_ID FULL_SOURCE_SHA
   ```

   Script membuat `.sig` dan `.release.json`. Hanya `.release.json` berisi
   metadata publik; kunci privat tidak dimasukkan. Script juga memverifikasi
   tanda tangan terhadap kunci publik konfigurasi aplikasi.
5. Buat lightweight tag `v<versi>` tepat pada SHA source run tersebut, lalu push
   tag. Contoh: `rtk git tag v0.1.7 FULL_SOURCE_SHA`, lalu
   `rtk git push origin v0.1.7`.
6. Jalankan workflow yang sama dengan kolom `signed_release` berisi seluruh
   teks `.release.json`. Ini menjalankan job publikasi saja; tidak membangun
   ulang installer. Job memverifikasi run, tag, konfigurasi versi source,
   SHA256 dan tanda tangan, membuat draft berisi installer/.sig/latest.json,
   lalu menerbitkannya sebagai rilis terbaru. Versi harus meningkat.

Alur ini memerlukan satu langkah penandatanganan lokal setiap rilis karena
pengguna memilih agar kunci tidak dikirim ke GitHub. Pengguna aplikasi tetap
dapat mengunduh dan memasang update dari dalam aplikasi.

## Batas verifikasi

Tes otomatis mencakup kegagalan jaringan, klik berulang, penundaan, ukuran
unduhan tidak diketahui, pemulihan kegagalan, antrean dan pemrosesan foto yang
masih berjalan, verifikasi tanda tangan dan asal build rilis.
Pengujian instalasi update penuh dari versi updater awal ke versi berikutnya
perlu Windows interaktif; build CI dan smoke test tidak membuktikan transisi
tersebut sudah berjalan pada komputer pengguna.
