# Ukuran cetak foto Windows — 0.1.5

Gejala: memilih 4R menghasilkan foto yang memenuhi A4 pada Epson L3250.
Kode sebelumnya meminta ukuran custom tanpa menormalisasi pengaturan privat
driver, lalu selalu membesarkan gambar ke seluruh area cetak yang dikembalikan
driver. Jika driver mempertahankan A4, hasil gambar ikut membesar.

Perbaikan memilih ID form 3R/4R yang diiklankan driver berdasarkan dimensi,
menghapus nama form lama, menetapkan skala 100%, lalu memanggil
DocumentProperties untuk menyinkronkan pengaturan driver sebelum CreateDC.
Driver tanpa daftar form memakai ukuran custom seperti sebelumnya.

Sebelum StartDoc, dimensi fisik halaman dari PHYSICALWIDTH/PHYSICALHEIGHT
dan LOGPIXELSX/Y harus sesuai ukuran yang dipilih (toleransi 3 mm).
Jika driver kembali ke A4, cetak ditolak dengan petunjuk Printing Preferences.
Area gambar dibatasi ukuran foto, mempertahankan rasio fisik walaupun DPI
horizontal dan vertikal printer berbeda. Default printer Windows tidak diubah.

Tujuh tes baru menguji pemilihan form 3R/4R, penolakan fallback A4 tanpa
mengirim job, rasio pada DPI berbeda, fallback custom, dan penolakan driver.
130 tes backend dan 117 tes frontend lulus lokal. Ukuran hasil cetak fisik
Epson tetap perlu diperiksa di Windows dengan kertas 4R (101,6 × 152,4 mm).
