# Print & Kirim: ukuran QR dan keterbacaan — 16 November 2026

Penyebab: QR lama dibatasi148px dan aturan global memberi teks nama folder/tautan putih di atas kartu putih. Gambar QR juga bergantung pada host eksternal yang tidak ada di daftar img-src aplikasi desktop.

Perubahan:

- QR dibuat lokal dengan `qrcode`1.5.4, bukan layanan gambar eksternal. PNG sumber640px, quiet zone4 modul, hitam di atas putih. Modul pembuat QR dimuat saat dibutuhkan. Tidak perlu memperluas CSP.
- Tampilan QR240–320px, instruksi scan lebih besar, judul/nama folder/link/status printer memakai warna eksplisit yang kontras.
- Susunan desktop menampilkan preview strip dan kartu pengambilan foto berdampingan. Kartu QR memakai susunan mendatar agar nama folder, tautan dan status cetak tetap muat pada tinggi720px; layar sempit memakai satu kolom yang dapat digulir.
- Respons QR dari folder sebelumnya tidak ditampilkan saat folder berubah. Kegagalan pembuatan menampilkan pesan dan tautan folder tetap tersedia.

Verifikasi:155 tes frontend lulus, build produksi lulus tanpa peringatan ukuran chunk, `git diff --check` lulus. QR lokal terdekode dengan OpenCV pada240/280/320/640px; screenshot QR yang benar-benar dirender browser juga terdekode ke tautan contoh yang diharapkan. Pratinjau memakai tautan `example.com` dan strip sintetis; tidak membuka/mengirim foto pengguna, tidak menjalankan cetak/upload. Fixture dan file sementara dibersihkan.

Perubahan source lokal; belum dibuat installer Windows baru. Pembacaan kamera HP dan aplikasi Windows terpasang belum diuji dalam sesi ini.
