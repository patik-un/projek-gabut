# Pemaketan printer Windows — versi 0.1.4

Epson L3250 tersedia di Windows dan berhasil mencetak test page, tetapi aplikasi
menampilkan pesan Install pywin32 serta daftar printer kosong.

Pemeriksaan xref paket 0.1.3 menunjukkan win32print/win32gui/win32ui sudah
terkumpul, sedangkan modul pendukung pywintypes dan pythoncom tidak tercantum.
Dependensi yang diimpor dari ekstensi native perlu dimasukkan secara eksplisit.

Build Windows kini memeriksa seluruh modul printer sebelum PyInstaller dimulai
dan memberi hidden-import untuk shim pywintypes/pythoncom serta modul Win32.
Hook PyInstaller terkait mengumpulkan DLL pendukung. Pembacaan daftar printer
memuat runtime printer lengkap terlebih dahulu sehingga tidak menampilkan
kesiapan palsu ketika salah satu komponen native rusak.

Smoke test Windows memanggil /printers pada binary hasil paket, tanpa mengirim
job cetak. Pemeriksaan ini mencakup impor runtime native dan enumerasi printer,
bukan cetak fisik Epson. Pesan pemulihan installer tidak meminta pengguna
memasang paket Python secara manual.

Verifikasi lokal: 123 tes backend, 117 tes frontend dan 2 tes Rust lulus.
Versi seluruh manifest sinkron pada 0.1.4. Review kode tidak menemukan masalah tambahan.
