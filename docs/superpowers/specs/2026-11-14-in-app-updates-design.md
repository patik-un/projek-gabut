# Pembaruan aplikasi dari dalam aplikasi

Status: disetujui pengguna pada 14 November 2026 ("bolehhh").

## Tujuan dan kondisi sekarang

Pengguna ingin aplikasi mengetahui ketika ada versi baru dan bisa mengunduh
serta memasangnya langsung, tanpa mencari installer di GitHub setiap kali.
Saat ini aplikasi Tauri 2 versi 0.1.5 tidak memasang plugin updater. Workflow
Windows menghasilkan artifact Actions saja. Repository patik-un/projek-gabut
publik, sehingga rilis GitHub dapat diakses aplikasi tanpa token GitHub.

Rancangan ini berfokus pada Windows, sesuai masalah distribusi saat ini.
Updater pertama direncanakan masuk versi 0.1.6. Versi 0.1.5 dan sebelumnya
perlu satu kali pemasangan installer baru secara manual. Setelah itu rilis
berikutnya bisa dideteksi dari aplikasi. Distribusi macOS melalui updater
memerlukan pipeline dan artifact macOS sendiri; UI harus menyatakan dengan
jelas jika platform belum didukung, bukan mengatakan aplikasi sudah terbaru.

## Pendekatan

Pilihan builder yang diusulkan: plugin updater resmi Tauri, dengan installer
NSIS bertanda tangan updater dan latest.json pada GitHub Releases.
Ini sesuai stack yang sudah digunakan dan menyediakan pemeriksaan versi,
verifikasi tanda tangan, unduhan, dan pemasangan Windows.

Alternatif tautan ke halaman unduh tetap memerlukan instalasi manual, sehingga
tidak memenuhi tujuan. Updater buatan sendiri atau server rilis baru menambah
pekerjaan dan pengelolaan server tanpa kebutuhan saat ini.

## Pengalaman pengguna

Aplikasi desktop memeriksa update setelah tampilan siap dan berkala setiap
enam jam selama aplikasi terbuka. Pemeriksaan tidak membutuhkan login Drive
atau backend kamera. Koneksi gagal tidak menghalangi penggunaan aplikasi.
Area Tentang/Update menampilkan versi aplikasi dari metadata native,
hasil pemeriksaan terakhir dan tombol Periksa update.

Contoh pemberitahuan yang tidak mengambil fokus sesi foto:

    Versi 0.1.7 tersedia
    [Lihat pembaruan] [Nanti]

Panel pembaruan menampilkan versi sekarang, versi baru, catatan rilis sebagai
teks biasa, tombol Unduh & pasang, dan pilihan Nanti. Proses menampilkan
kemajuan unduhan (atau indikator tanpa persen jika ukuran tidak diketahui),
verifikasi, lalu pemasangan. Pengguna diberi tahu bahwa aplikasi akan ditutup
dan dibuka kembali. Windows dapat menampilkan permintaan izin sistem.

Pemasangan hanya atas klik pengguna, bukan diam-diam. Menunda tidak menghapus
informasi update dari panel. Klik berulang tidak menjalankan beberapa updater.
Kesalahan pemeriksaan/unduhan/tanda tangan/pemasangan ditampilkan dengan
pilihan Coba lagi; gagal memeriksa tidak boleh dilaporkan sebagai sudah terbaru.

## Perlindungan sesi dan data

Notifikasi tidak membuka modal di tengah sesi. Instalasi ditolak selama sesi
foto aktif, pencetakan, penyimpanan desain atau unggah foreground berjalan.
Saat proses update dimulai dari keadaan aman, UI mencegah sesi/mutasi baru.
Pemeriksaan dan unduhan dapat gagal tanpa menghentikan backend atau kamera.
Setelah unduhan terverifikasi, sebelum menjalankan installer, pastikan tidak
ada pekerjaan backend yang sedang diproses; jika masih ada, tampilkan status
menunggu dan jangan memaksa menghentikan pekerjaan. Pekerjaan antrean yang
belum mulai tetap tersimpan untuk dilanjutkan setelah restart.

Backend milik aplikasi harus dihentikan dan ditunggu sebelum installer
mengganti executable, termasuk proses anak PyInstaller di Windows. Jika tahap
instalasi gagal dan aplikasi masih hidup, UI harus memulihkan backend melalui
jalur startup yang ada. Pemanggilan updater Windows yang keluar dari proses
harus menggunakan hook penghentian sebelum keluar, bukan hanya WindowEvent.

Identifier aplikasi dan lokasi app-data tidak berubah. Upgrade memakai
strategi merge-missing yang sudah ada, sehingga foto, antrean, template,
pengaturan printer dan autentikasi pengguna tidak ditimpa seed bawaan.

## Integrasi dan rilis

Rust memasang plugin updater dan mengendalikan penghentian backend serta
pemasangan/restart. React mengelola tampilan dan status update; gunakan akses
native dengan izin terbatas. Endpoint HTTPS:
https://github.com/patik-un/projek-gabut/releases/latest/download/latest.json

Kunci publik updater masuk konfigurasi aplikasi. Sesuai instruksi lanjutan
pengguna ("Jangan kirim kunci"), kunci privat hanya disimpan pada file lokal
yang diabaikan Git, tidak dikirim ke GitHub Actions, tidak pernah dicetak
atau dimasukkan source/installer. Penandatanganan dijalankan lokal setelah
build Windows lulus. GitHub hanya menerima payload publik berisi versi,
ID run, SHA source, checksum installer dan tanda tangan. Dokumentasikan
lokasi backup dan kebutuhan mempertahankan kunci yang sama pada rilis nanti.
Tanda tangan updater terpisah dari sertifikat penandatangan Windows.

Workflow tetap bisa membuat build uji sebagai artifact. Publikasi rilis stabil
memerlukan tag versi eksplisit yang cocok dengan semua manifest dan payload
penandatanganan lokal melalui workflow_dispatch; build biasa di
branch kerja tidak mengganti latest.json. Publikasikan installer, .sig dan
latest.json setelah seluruh tes dan smoke test Windows lulus. Manifest
menunjuk asset versi tetap untuk windows-x86_64 dan menggunakan isi .sig,
bukan URL-nya. Publikasi harus berasal dari commit yang ditag dan teruji;
tidak memakai artifact dari run lain atau private key sementara.

Pengguna sudah mengizinkan pengiriman perubahan ke GitHub dan menyetujui
pembuatan rilis stabil pertama. Instruksi berikutnya melarang pengiriman
kunci privat; tidak ada secret updater yang dikirim. Tidak ada biaya server baru.

## Verifikasi dan batas klaim

Tes perilaku: tersedia/tidak tersedia/error/offline, progres tanpa ukuran,
klik ganda, penundaan, kegagalan dan retry, pembatasan sesi aktif, penutupan
backend, dan pemulihan kegagalan. Tes skrip manifest memakai fixture installer
dan signature serta menolak versi/asset yang tidak konsisten. Jalankan seluruh
suite frontend/backend/native, build Windows dan smoke test hasil paket.

Uji transisi dari build updater awal ke build bertanda tangan yang lebih baru
pada Windows diperlukan untuk membuktikan instalasi dan restart secara penuh.
Jika host Windows interaktif belum tersedia, laporkan batas ini secara jelas;
CI build dan smoke test bukan bukti bahwa upgrade fisik Epson/Windows pengguna
sudah berhasil. Jangan menerbitkan rilis percobaan sebagai latest stabil hanya
untuk memalsukan pembuktian jalur upgrade.

Detail komponen UI, struktur modul, timeout jaringan, dan fixture pengujian
diserahkan pada builder selama memenuhi perilaku dan batasan di atas.
