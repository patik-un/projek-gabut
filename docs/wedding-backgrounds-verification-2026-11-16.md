# Background photobooth pernikahan — 16 November 2026

## Pemakaian

Buka **Admin → Photobooth → Tampilan Photobooth**. Pilih Original, Elegant Cream, Soft Pink atau Floral, atur tingkat gelap 0–85%, lalu pilih **Gunakan tampilan**. Pratinjau memperlihatkan pilihan sebelum disimpan.

Untuk gambar sendiri, unggah JPG/PNG maksimal 8 MiB dan 24 juta piksel. Upload yang berhasil langsung disimpan dan diterapkan. Gambar tersimpan dapat dipilih lagi setelah memakai tema lain. Aset berada di direktori data backend, sehingga tidak mengisi localStorage dengan base64. Gambar disesuaikan ke sisi terpanjang maksimal 4096 piksel, orientasi EXIF diperbaiki, transparansi diberi dasar putih, lalu disimpan sebagai JPEG tanpa metadata.

Background berlaku pada seluruh alur photobooth dan fullscreen. Tema tidak diterapkan ke admin, Auto Upload atau Edit & Optimasi, dan tidak masuk ke piksel kamera, komposit foto, GIF atau hasil cetak.

## Verifikasi

- Frontend: 153 tes lulus, termasuk validasi tema/URL aset, kegagalan upload/save, permintaan awal terlambat, mutasi bersamaan dan respons setelah dispose.
- Backend: 153 tes lulus, termasuk upload gambar nyata, batas ukuran/piksel/request, restart persistence, penolakan format/path, alpha/EXIF/resize, file korup/truncated dan rollback ketika penulisan gagal.
- Build produksi frontend dan `git diff --check` lulus.
- Browser menggunakan API/store asli yang terisolasi di direktori sementara. Upload JPG putih, pemakaian custom, reload dan pemilihan ulang gambar, tema Floral/kegelapan20%, serta fullscreen/Escape terverifikasi. Lapisan background ditemukan pada kelima tahap photobooth dan tidak ada di admin.
- Review independen menemukan kontras petunjuk kamera kurang pada gambar putih dengan kegelapan0%. Direproduksi lalu diperbaiki dengan permukaan gelap terbatas pada header/footer/status. Browser memverifikasi teks terang di atas permukaan rgba(15,17,20,0.9).
- Fixture, server pratinjau dan file upload sementara dihapus. Data aplikasi utama tidak digunakan oleh pratinjau.

## Batas

Perilaku paket Windows/WebView dan perangkat kamera/printer fisik belum diuji untuk fitur ini. Source disimpan lokal; installer/rilis publik tetap 0.1.7 sampai rilis berikutnya dibuat.
