# Verifikasi autoupdate Windows — 16 November 2026

- Rilis stabil: https://github.com/patik-un/projek-gabut/releases/tag/v0.1.6
- Source installer/tag: `69b930dc6d93541aa5ba3fd90723d0f48fe4037a`.
- Build Windows #17 / run `43607198662`: berhasil; tes regresi, 3 tes Rust Windows dan smoke test backend paket berhasil.
- Artifact ZIP SHA256 cocok dengan digest GitHub sebelum diekstrak.
- Installer ditandatangani lokal dan diverifikasi terhadap kunci publik aplikasi. Kunci privat tidak diunggah.
- Publikasi #18 / run `43784483894`: berhasil tanpa membangun ulang installer.
- Installer SHA256: `998260ea2abbc4fe0a4674af751e56f8a407db65c62c9805688d2b171816e98e`.
- Pemeriksaan publik menemukan GitHub mengganti spasi nama aset menjadi titik. Tes manifest direproduksi gagal, generator diperbaiki, seluruh 133 tes frontend lulus. Perbaikan source: `05dfd41`.
- Setelah persetujuan pengguna, hanya `latest.json` diganti melalui halaman GitHub; binary dan tanda tangan tidak berubah.
- Verifikasi akhir tanpa autentikasi: endpoint latest, versi 0.1.6, URL installer aktual (HTTP 200 dan panjang 102762113 byte), digest installer, tanda tangan manifest/file `.sig`, dan tepat tiga aset rilis semuanya cocok.

Versi 0.1.5 dan sebelumnya perlu memasang installer 0.1.6 satu kali secara manual. Sesudah itu pemeriksaan versi tersedia dalam aplikasi dan berkala setiap enam jam; pemasangan dilakukan atas tindakan pengguna ketika sesi telah selesai.

Transisi pemasangan penuh dari 0.1.6 ke versi berikutnya, UAC, kamera dan printer fisik belum diuji pada Windows interaktif. Kelulusan CI dan validasi aset tidak membuktikan transisi tersebut.
