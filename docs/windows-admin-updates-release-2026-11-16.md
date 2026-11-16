# Rilis Windows 0.1.7 — 16 November 2026

- Menu Tentang / Update dan pemberitahuan versi baru hanya ditampilkan di header Admin Panel setelah login admin.
- Pemeriksaan update berjalan saat panel admin dibuka dan setiap enam jam selama panel tetap terbuka.
- Dialog update menggunakan portal di luar area aplikasi yang dibuat inert saat pemasangan, sehingga status pemasangan tetap dapat diakses.
- Pengaman sesi foto, cetak dan penyimpanan tetap berlaku.

## Verifikasi

- 133 tes frontend, pemeriksaan konsistensi versi 0.1.7, build produksi dan pemeriksaan diff lulus.
- Pratinjau browser dengan adapter native tiruan: tombol tidak muncul sebelum masuk admin; muncul di header admin; dialog tampil; saat unduhan dimulai kontrol latar tidak masuk accessibility tree dan dialog tidak berada di dalam elemen inert.
- Source/tag: `f9fa7e1bc73740c3f84257138e6f271f4a72d714` / `v0.1.7`.
- Build Windows #19 / run `43787798576` berhasil, termasuk regresi backend/frontend, tes native Windows dan smoke test backend paket.
- ZIP artifact SHA256: `b7288fa46719451c27c5b6a90f077903c326721c80a88a232246cef91b2d98ce`.
- Installer ditandatangani lokal dengan kunci yang sama; tanda tangan diverifikasi terhadap kunci publik aplikasi. Kunci privat tetap lokal.
- Installer SHA256: `62fd84c8a8283aef28f8e168e5eaf1735e71f3023e5845399b5437cbb2f555a7`.
- Publikasi #20 / run `43791945208` berhasil.
- Verifikasi tanpa login: latest menunjuk v0.1.7; manifest menunjuk URL installer aktual yang merespons HTTP 200; digest installer dan tanda tangan `.sig`/manifest cocok; tiga aset rilis lengkap.

Rilis: https://github.com/patik-un/projek-gabut/releases/tag/v0.1.7

Pengguna 0.1.6 dapat mengambil 0.1.7 melalui menu update. Versi 0.1.5 dan sebelumnya perlu memasang installer baru secara manual sekali. Transisi instalasi penuh di Windows interaktif serta perangkat kamera/printer fisik belum diuji dalam sesi ini.
