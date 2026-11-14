# Perbaikan hasil audit — 6 November 2026

Perubahan pada branch `codex/audit-fixes`, berdasarkan audit aplikasi 0.1.1.
Konfigurasi pengguna, template dan alur webcam dipertahankan. Tidak dilakukan
pemecahan besar App.jsx/API atau perubahan desain layar. Pilihan provider SDK
ditambahkan ke panel kamera yang sudah ada agar modul yang sebelumnya terpisah
bisa digunakan melalui aplikasi.

## Perbaikan

1. File strip memakai nama lokal UUID; nama folder Drive tidak menjadi path lokal.
2. Gambar diverifikasi sebelum disimpan, dengan batas ukuran dan piksel. Capture
   dan print memakai pembacaan JSON berbatas.
3. Printer Windows memakai GDI pada printer yang dipilih, menerapkan ukuran
   3R/4R, menjaga rasio gambar dan tidak mengganti printer default sistem.
   Dependensi pywin32 ditambahkan hanya untuk Windows.
4. Upload sukses dicatat sebelum cleanup; kegagalan cleanup tidak mengulang upload.
5. Deduplikasi mempertimbangkan histori sukses pada sumber/tujuan yang sama.
   Transaksi IMMEDIATE melindungi penerimaan dan klaim job lintas proses.
6. Pembuatan folder, sharing dan staging upload menjadi pekerjaan durable.
   Job tetap tersedia ketika offline dan worker mencoba ulang. Semua lampiran
   distage dahulu; pelepasan antrean dan pencatatan rencana pengiriman selesai
   dilakukan dalam transaksi yang sama. Identitas GIF ikut dihitung.
7. Operasi Drive, printer dan capture berat dipindahkan dari event loop.
8. Manager Canon/Sony terhubung ke status, pemilihan, preview, pengaturan dan
   capture API. UI memakai backend saat SDK dipilih dan mempertahankan webcam
   sebagai default. Cleanup stream lama tidak menghentikan stream baru.
9. Tauri membuat kredensial acak per instance dan memasukkannya ke backend serta
   request API dari aplikasi. Origin asing tetap ditolak. Preflight CORS tetap
   diizinkan. Mode browser localhost pengembangan tetap berjalan tanpa kredensial
   native; media lokal dan health endpoint tetap bisa dibaca sesuai kebutuhan UI.
10. Sesi aktif dilindungi dari tab lain. Lease diperbarui oleh polling pemilik,
    dan dapat diambil alih setelah 120 detik tidak aktif. Capture/reset diserialkan
    secara async sehingga jumlah foto tidak melewati batas dan tidak memenuhi
    threadpool dengan penunggu lock.
11. Backend memegang OS lock selama hidupnya; proses kedua dengan folder data yang
    sama ditolak. Shutdown API berlangsung sebelum lock dilepas.
12. Workflow Windows menjalankan tes dan smoke test backend hasil paket sebelum
    mengunggah installer. Script build lokal berhenti ketika satu tahap gagal.

UI pengiriman membedakan penyimpanan offline dari folder Drive siap, lalu
memperbarui hasil setelah worker menyelesaikan staging folder.

## Hasil verifikasi

- 117 tes Python lulus.
- 103 tes JavaScript lulus.
- 2 tes Rust lulus.
- Pemeriksaan versi dan build frontend berhasil.
- Startup backend dengan data sementara: health HTTP 200, request tanpa
  kredensial HTTP 401, request dengan kredensial HTTP 200.
- Pemeriksaan reviewer terpisah selesai; temuan tambahan ditutup dengan tes
  regresi: preflight, race capture, lease tab, dan cleanup stream.

## Batas verifikasi

Windows GDI, installer NSIS, driver printer, kamera Canon/Sony dan Raspberry Pi
belum diuji pada hardware nyata. Workflow pemeriksa Windows tersedia, tetapi
keberhasilannya belum diklaim dari Mac ini.

Kredensial instance melindungi akses dari klien lokal lain; perubahan ini tidak
menambahkan model akun/role admin baru ke produk. Browser development localhost
tetap merupakan lingkungan tepercaya, dan akses media lokal tidak diberi token.

Pengiriman memakai retry setidaknya sekali. Jika proses mati persis setelah
Google membuat folder tetapi sebelum identitasnya tersimpan di SQLite, percobaan
berikutnya masih dapat membuat folder tambahan. Jaminan tepat sekali pada layanan
remote memerlukan mekanisme idempotensi Drive tersendiri. File lokal tidak
dihapus sebelum pencatatan upload sukses.
