# Pengaturan operasional photobooth — 16 November 2026

## Perubahan

- Admin dibagi ke tab Photobooth, Strip, Kamera, Cetak, Waktu, dan Sistem. Kartu tetap terpasang agar perpindahan tab tidak menghapus draft.
- Cetak mendukung 3R/4R, portrait/landscape, 1–10 salinan, gambar utuh atau potong untuk memenuhi area cetak, dan gambar tes satu lembar. Pengaturan diterapkan pada job Windows/CUPS tanpa mengubah default printer global. Ukuran per strip tetap mengatur hasil sesi; ukuran awal/tes dijelaskan pada UI. Borderless diatur pada driver.
- Fullscreen photobooth menyembunyikan navigasi aplikasi; tombol keluar/Esc memulihkan navigasi tanpa reset sesi. Tauri menggunakan izin window fullscreen yang terbatas.
- Countdown awal dan berikutnya 1–30 detik (default 3). Batas sesi sampai 3600 detik, pilih strip/edit sampai 600 detik. Default batas tambahan 0/nonaktif. Pengaturan waktu disalin saat sesi mulai dan berlaku pada sesi berikutnya.
- Timer dijeda ketika aplikasi tersembunyi, berada di menu lain, atau memproses capture/cetak/unggahan/finalisasi. Countdown foto dibatalkan saat tersembunyi dan dimulai kembali dengan waktu persiapan saat kembali.
- Habis waktu memilih strip memulai strip terpilih ketika backend siap. Habis waktu edit membuat pratinjau tanpa mengirim cetak/upload. Habis waktu sesi menampilkan pilihan lanjut/akhiri; tidak membuang foto otomatis.

## Bukti

- Frontend: `npm test` — 146 tes lulus.
- Backend: `.venv/bin/python -m unittest discover -p 'test_*.py'` — 146 tes lulus.
- `npm run build`, `cargo check --locked --offline --manifest-path frontend/src-tauri/Cargo.toml`, dan `git diff --check` lulus.
- Tes backend mencakup input tidak valid sebelum job, landscape yang diabaikan driver, salinan bawaan driver, rasio fisik dengan DPI berbeda, fill/crop, dan argumen CUPS.
- Review independen menemukan countdown foto tetap berjalan saat tersembunyi dan pratinjau kosong setelah waktu edit habis. Keduanya diperbaiki dengan regresi gagal kemudian lulus, termasuk penolakan hasil pratinjau sesi lama.
- Pratinjau browser menggunakan adapter API/kamera tiruan: tab, penyimpanan printer/orientasi/salinan setelah reload, fullscreen yang menghapus navigasi dari accessibility tree, dan pemulihan Esc diverifikasi. Tidak ada cetak fisik atau akses kamera dalam pratinjau. Fixture sementara dihapus.

## Batas

Cetak fisik, driver Windows/CUPS nyata dan fullscreen pada Windows webview belum diuji. Perubahan tersimpan pada source lokal; installer/rilis Windows baru belum dibuat untuk fitur ini. Versi rilis publik tetap 0.1.7.
