# Audit Event Booth Studio 0.1.1

Tanggal: 6 November 2026. Basis: commit `c70713f`, beserta working tree lokal.
Audit ini membaca jalur utama React, API FastAPI, kamera, pengolahan gambar,
antrean SQLite, OAuth Drive, launcher Rust, seed data, dan workflow installer.
Tidak ada perubahan implementasi atau push yang dilakukan selama audit.

## Kesimpulan

Aplikasi memiliki fondasi yang cukup baik untuk pengembangan dan uji coba,
tetapi belum layak dinyatakan siap untuk operasional event tanpa pengawasan.
Penghambat terpenting adalah validasi path, pencetakan Windows, integrasi kamera
SDK yang belum terhubung, dan ketahanan pengiriman hasil ketika jaringan gagal.
Keberhasilan build atau tes unit tidak membuktikan kesiapan installer pada
Windows maupun Raspberry Pi.

## Bukti pengujian

Pengujian ulang pada macOS:

| Pemeriksaan | Hasil |
|---|---|
| `npm test` | 102 lulus |
| Python unittest discovery | 98 lulus |
| `cargo test --offline --lib` | 2 lulus |
| `npm run check:release` | Versi 0.1.1 sinkron |
| `npm run build` | Berhasil, 48 modul |
| Probe path folder upload | File berhasil ditulis di luar direktori strip |
| Probe capture bukan gambar | HTTP 200, data diterima |
| Probe origin asing | HTTP 403 |
| Probe mutasi tanpa origin dan autentikasi | HTTP 200 |
| Simulasi modul printer Windows | HTTP 500, atribut SetDefaultPrinter salah modul |
| Probe deduplikasi sesudah mark_done | Konten sama mendapat job baru |

Probe menggunakan direktori sementara, layanan Drive tiruan, dan modul Windows
tiruan; tidak mengirim foto ke Google Drive atau mencetak. Windows aktual,
Linux ARM, kamera fisik, printer fisik, dan status artefak GitHub Actions tidak
diverifikasi. Python lokal 3.14; workflow Windows memakai 3.12.

## Temuan prioritas tinggi

### 1. P1 — Nama folder upload dapat keluar dari direktori hasil

Lokasi: `backend/api/server.py:1450–1463`.
`folder_name` digabung langsung ke nama file lokal tanpa normalisasi, sementara
hanya `filename` yang melewati basename. Nilai folder `../audit_escape` menulis
file pada parent direktori strip. Probe mendapatkan HTTP 502 karena layanan
Drive sengaja dibuat gagal, tetapi file di luar direktori strip sudah terbentuk.
Artinya kegagalan jaringan juga tidak membatalkan efek penulisan lokal.

Dampak: caller API lokal dapat membuat atau menimpa file yang dapat ditulis
oleh akun aplikasi, mengikuti format nama yang dibentuk endpoint. Backend
terikat ke loopback; temuan ini tidak membuktikan akses langsung dari internet.
Perbaikan: pisahkan nama tampilan Drive dari nama lokal, gunakan UUID untuk
nama lokal dan pastikan resolved path selalu berada di direktori tujuan.

### 2. P1 — Jalur pencetakan Windows rusak pada dependensi dan pemanggilan API

Lokasi: `backend/api/server.py:1721–1752`, `backend/requirements.txt`.
`pywin32` tidak dideklarasikan dalam requirements, padahal kode mengimpor
`win32api`. Bahkan jika tersedia, pemanggilan `win32api.SetDefaultPrinter`
mengarah ke modul yang keliru. Fungsi tersebut berada di win32print;
lihat [sumber resmi pywin32](https://github.com/mhammond/pywin32/blob/main/win32/src/win32print/win32print.cpp).
Simulasi modul mereproduksi HTTP 500 dengan kesalahan atribut itu.

Selain itu parameter `paper_size` tidak dipakai di implementasi Windows,
sehingga pilihan 3R/4R tidak diterapkan oleh fungsi tersebut. ShellExecute
bergantung pada asosiasi aplikasi pencetak gambar di Windows.
Perbaikan: dependensi khusus Windows, API printer yang benar, pengaturan media
yang nyata, dan uji spooler/driver pada mesin target.

### 3. P1 — Provider Canon/Sony belum terintegrasi ke aplikasi utama

Lokasi: `backend/camera/providers.py:333`, `backend/api/server.py:153`,
`frontend/src/App.jsx:2205`.
CameraProviderManager dan bridge memiliki kode serta tes sendiri, tetapi
server tidak mengimpor atau membuat manager itu. API kamera tetap memakai
OpenCV; frontend memakai getUserMedia atau stream backend. Tidak ditemukan
rute untuk memilih provider SDK dalam server maupun pemanggilnya pada App.

Dampak: menyertakan bridge ke installer dan mengatur environment Rust belum
membuat capture Canon/Sony berjalan melalui aplikasi ini. Dokumentasi integrasi
dan petunjuk pemilihan provider sebelumnya terlalu jauh dibanding wiring aktual.
Perbaikan: hubungkan pilihan provider, status, live view, capture, dan lifecycle
melalui API, kemudian uji alur dari UI sampai file hasil.

### 4. P1 — Backend tidak menegakkan sesi atau hak akses admin

Lokasi: `backend/api/server.py:95–104`, endpoint konfigurasi, print dan session.
Middleware memeriksa Origin ketika header ada, tetapi tidak memerlukan token
atau sesi. Probe POST `/camera/start` tanpa Origin dan autentikasi berhasil.
Login Google mengembalikan profil; tidak menghasilkan otorisasi yang kemudian
diwajibkan pada endpoint admin.

Dampak: proses lokal lain dapat mengubah konfigurasi atau memanggil aksi API
tanpa login UI. Jika model produk hanya mempercayai seluruh pengguna/proses
lokal, batas ini harus eksplisit. Untuk kiosk dengan pemisahan operator/tamu,
login UI belum menjadi pengaman backend. Origin asing memang sudah ditolak.
Perbaikan: identitas instance aplikasi dan otorisasi admin yang diverifikasi
server, dengan transport rahasia yang tidak terekspos ke halaman asing.

### 5. P1 — Operasi sinkron berat dijalankan di dalam endpoint async

Lokasi: `backend/api/server.py:1430`, `1627`, `2140`.
Endpoint async melakukan panggilan Drive sinkron, subprocess pencetakan,
penulisan/decode file dan pengambilan frame secara langsung. Saat operasi itu
menunggu, event loop API ikut tertahan. Konfigurasi Drive menggunakan timeout
HTTP 180 detik; bukan berarti setiap panggilan pasti selama itu, tetapi operasi
jaringan sinkron bisa menahan permintaan lain.

Dampak: health check, polling antrean, dan aksi lain dapat terlihat macet saat
upload/printer lambat. GIF sudah memakai run_in_threadpool, sehingga pola
perbaikannya telah tersedia. Pindahkan I/O berat ke worker/threadpool dan beri
batas concurrency; ukur waktu respons ketika print dan upload berlangsung.

### 6. P1 — Foto dihapus sebelum keberhasilan upload dicatat di database

Lokasi: `backend/queue_db.py:676–686`.
Sesudah Drive mengembalikan file_id, worker menghapus file lokal lebih dulu,
baru menjalankan mark_done. Jika aplikasi mati atau SQLite gagal di sela itu,
job masih dapat terlihat processing/pending, tetapi file lokal sudah hilang dan
ID Drive belum tercatat. Recovery kemudian mencoba file yang tidak tersedia.

Perbaikan: simpan hasil Drive dan status sukses secara durable terlebih dahulu,
lalu hapus file melalui cleanup yang dapat diulang. Uji fault injection pada
batas setelah upload, sebelum commit, dan sebelum cleanup.

## Temuan prioritas menengah

### 7. P2 — Kegagalan membuat folder Drive terjadi sebelum antrean durable

Lokasi: `backend/api/server.py:1465–1490`, `frontend/src/App.jsx:5626`.
Endpoint menulis strip, mencoba membuat folder Drive, lalu baru memasukkan
job upload. Ketika jaringan mati pada create_drive_folder, endpoint mengembalikan
502 dan strip tidak mendapat job retry. File lokal mungkin tersisa, tetapi
tidak ada pengiriman otomatis yang melanjutkan proses itu.

Perbaikan: antrikan pekerjaan lengkap terlebih dahulu, termasuk pembuatan
folder, sharing dan upload lampiran. Simpan status per tahap serta identitas
job yang tetap sama saat retry agar tidak membuat folder ganda.

### 8. P2 — Deduplikasi tidak memeriksa histori upload sukses

Lokasi: `backend/queue_db.py:209–256`, `436–480`.
add_to_queue hanya memeriksa tabel queue. mark_done memindahkan catatan ke
upload_history dan menghapus queue. Probe dengan konten sama setelah mark_done
menghasilkan job baru. Indeks dedupe pada upload_history belum dipakai untuk
keputusan penerimaan job.

Dampak: retry dari caller atau pemrosesan ulang file bisa menghasilkan upload
ganda setelah job pertama selesai. Tentukan apakah upload ulang memang
diinginkan; jika tidak, gunakan idempotency key durable dengan batas tujuan,
sumber, dan sesi yang jelas. Jangan melarang konten sama untuk sesi berbeda
tanpa keputusan produk.

### 9. P2 — Validasi payload gambar belum konsisten

Lokasi: `backend/api/server.py:377–396`, `2140–2204`.
Capture menerima base64 yang dapat didecode tanpa memeriksa isi gambar.
Probe string NOT_AN_IMAGE dibungkus base64 menghasilkan HTTP 200 dan file
berekstensi jpg. Endpoint capture/print juga membaca JSON tanpa batas body
seperti read_bounded_json pada GIF.

Dampak: preview rusak, error tertunda di tahap berikutnya, dan tekanan memori
dari request besar. Terapkan batas byte, dimensi, format nyata, serta schema
payload yang konsisten sebelum menulis file. Modul GIF/sticker sudah memiliki
validasi yang lebih baik untuk dijadikan pola.

### 10. P2 — Sesi photobooth bersifat global untuk seluruh backend

Lokasi: `backend/api/server.py:455–475`, `794–819`, `2142`.
Foto semua sesi memakai OUTPUT_DIR yang sama. Start/finish menghapus seluruh
capture jpg di direktori itu dan batas foto dihitung secara global. Membuka
dua instance/tab atau menerima perintah sesi terlambat berpotensi menghapus
foto sesi lain. Tidak ada session_id untuk mengisolasi kepemilikan foto.

Perbaikan: direktori per sesi dan session_id pada capture/finalisasi, atau
tegakkan single-instance dengan penolakan eksplisit untuk sesi kedua.

### 11. P2 — Pipeline Windows belum menguji hasil paket

Lokasi: `.github/workflows/windows-installer.yml`, `build-windows.bat`.
Workflow menginstal dependensi, membangun NSIS dan mengunggah artefak, tetapi
tidak menjalankan suite tes atau smoke test backend executable. Script bat
lokal juga tidak memeriksa errorlevel sesudah setiap tahap sehingga dapat
mencetak pesan selesai setelah tahap sebelumnya gagal.

Perbaikan: tes Python pada 3.12/Windows, tes frontend, jalankan backend hasil
PyInstaller pada data sementara dan cek health endpoint; hentikan script lokal
ketika langkah gagal. Tetap perlu uji instalasi/update dan printer fisik.

## Arsitektur, performa, dan hal yang sudah baik

- App.jsx 10.542 baris dan App.css 11.527 baris; App.jsx menghimpun kamera,
  admin, sesi, editor dan pengiriman.
  Penggabungan state ini memperbesar ruang regresi. Pecah menurut lifecycle
  fitur secara bertahap, dengan tes perilaku sebelum pemindahan.
- server.py 2.295 baris menyatukan autentikasi, printer, kamera, storage dan
  antrean. Router terpisah dan service layer akan membuat batas I/O lebih jelas.
- Respons stream kamera meng-encode JPEG quality 100 berulang, melakukan copy
  frame, dan setiap koneksi generator membuka kamera sendiri. Ini berpotensi
  mahal/berkonflik pada Pi. Belum ada benchmark hardware sehingga tidak ada
  klaim FPS atau pemakaian RAM. Gunakan satu producer kamera dan ukur kualitas,
  latency serta konsumsi CPU sebelum mengubah konfigurasi.
- Antrean memiliki retry delay, recovery job, dan pencatatan histori. Namun
  threading.Lock hanya melindungi satu proses; backend development menjalankan
  API dalam subprocess terpisah dari detector/worker. Audit lanjutan concurrency
  sebaiknya menguji transaksi lintas proses dan unique constraint, bukan hanya
  menjalankan worker paralel dalam satu proses.
- Seed update menggabungkan file yang belum ada, menjaga konfigurasi pengguna.
  Dua tes Rust memverifikasi merge dan permission auth Unix. Status
  last_successful_version ditulis sebelum backend benar-benar siap, jadi
  jangan gunakan nilai itu sebagai bukti startup berhasil.
- Loopback binding, penolakan Origin asing, CSP, tidak membaca pickle lama,
  permission token Unix, guard token saat release, dan validasi GIF/sticker
  merupakan perlindungan yang sudah baik.
- Tes frontend menjalankan callback aktual dengan konteks state/I/O tiruan.
  Ini berguna untuk logika tetapi tidak membuktikan interaksi React lengkap,
  perilaku WebView, kamera, atau printer. Tambahkan beberapa tes alur pengguna
  utama tanpa mengganti seluruh suite yang sudah berguna.
- Tidak dilakukan audit CVE seluruh dependensi, benchmark RAM/FPS, pemeriksaan
  riwayat secret secara menyeluruh, atau uji visual semua layar. Semua ini
  memerlukan bukti tersendiri; hasil tes saat ini tidak menggantikannya.

## Kesiapan platform

| Platform | Bukti tersedia | Batas yang tersisa |
|---|---|---|
| macOS | Build frontend, tes Python/JS/Rust lokal | Installer produksi, kamera dan printer nyata belum diuji dalam audit |
| Windows | Konfigurasi NSIS dan workflow tersedia | Print bermasalah; paket dan update nyata belum diuji |
| Raspberry Pi | Jalur Python + Vite localhost dapat disiapkan | Instalasi ARM, hardware, performa, printer dan Tauri Linux belum diuji |
| Canon/Sony | Bridge dan unit test terpisah | Wiring UI/API tidak ada, distribusi SDK dan target OS perlu validasi |

## Urutan perbaikan

1. Tutup penulisan path di luar direktori dan validasi input gambar.
2. Pulihkan jalur printer Windows, lalu smoke test executable hasil paket.
3. Buat pengiriman durable: catat sukses sebelum cleanup, antrikan operasi Drive
   lengkap, dan gunakan identitas job yang bertahan sepanjang retry.
4. Putuskan batas keamanan admin dan kebijakan single-session.
5. Sambungkan provider SDK sampai alur UI, kemudian uji kamera fisik.
6. Uji Windows serta Pi, termasuk jaringan putus, restart saat upload, printer
   offline, dua instance, dan upgrade yang mempertahankan konfigurasi/token.
7. Setelah perilaku utama stabil, pecah App/API dan ukur performa Pi.
