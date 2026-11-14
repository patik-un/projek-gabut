# Kontrol langsung pada stiker

Tujuan: pengguna menu Edit Photobooth dapat mengatur stiker langsung pada
preview strip dengan mouse atau sentuhan, termasuk pada Windows.

## Perilaku

- Klik stiker untuk menampilkan kotak seleksi mengikuti posisi dan putarannya.
- Tarik bagian tengah stiker untuk memindahkannya seperti sekarang.
- Tarik salah satu dari empat sudut untuk memperbesar atau memperkecil secara
  proporsional. Pusat stiker tetap, rasio gambar tidak berubah.
- Tarik pegangan putar untuk memutar dengan bebas.
- Tombol hapus tersedia langsung pada kotak seleksi.
- Kontrol tetap mudah ditekan saat stiker diperkecil atau diperbesar.
- Perubahan disimpan pada scale, rotation, x, y yang sudah dipakai hasil cetak
  dan GIF. Kotak serta pegangan tidak ikut diekspor.
- Stiker gambar, emoji, dan GIF memakai interaksi yang sama, termasuk dua strip.
- Panel kontrol yang sekarang tetap tersedia sebagai alternatif.

## Pendekatan

Pilihan yang diambil sebagai usulan implementasi: lengkapi kotak seleksi yang
sudah ada dengan pegangan sudut dan pegangan putar berbasis Pointer Events.
Tidak memerlukan pustaka baru dan memakai data stiker yang sudah ada.

Alternatif kontrol hanya lewat panel tidak memenuhi permintaan kontrol langsung
pada stiker. Mengganti seluruh editor dengan pustaka canvas akan memperluas
perubahan tanpa manfaat yang diperlukan untuk fitur ini.

## Verifikasi

Uji drag ukuran pada stiker yang sudah berputar, rotasi bebas, batas ukuran,
isolasi stiker terpilih, pointercancel, serta hasil ekspor. Jalankan tes frontend,
build, dan pemeriksaan visual kontrol sebelum menyatakan selesai.
