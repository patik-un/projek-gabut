# Mencoba Event Booth Studio di Raspberry Pi

Panduan ini untuk uji awal lewat Chromium pada Raspberry Pi sendiri. Belum
diverifikasi pada perangkat Raspberry Pi; tes yang dijalankan di Mac meliputi
102 tes frontend, 98 tes backend, dan build frontend.

## Persiapan

Gunakan Raspberry Pi OS Desktop 64-bit pada perangkat yang mendukungnya.
Lihat [dokumentasi Raspberry Pi OS](https://www.raspberrypi.com/documentation/computers/os.html).
Siapkan Node.js 22.12 atau lebih baru beserta npm dari
[situs resmi Node.js](https://nodejs.org/en/download), lalu cek `node --version`.

```bash
sudo apt update
sudo apt install -y git python3-venv python3-dev build-essential libgl1 libglib2.0-0
git clone https://github.com/patik-un/projek-gabut.git
cd projek-gabut
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend
npm ci
```

Jika repository privat, gunakan akun GitHub yang memiliki akses saat clone.

## Menjalankan

Terminal pertama, dari root `projek-gabut`:

```bash
backend/.venv/bin/python backend/main.py
```

Terminal kedua:

```bash
cd projek-gabut/frontend
npm run dev -- --host 127.0.0.1
```

Buka **http://127.0.0.1:1420** di Chromium pada Raspberry Pi yang sama.
Backend berjalan di port 8000. Kedua terminal harus tetap terbuka; Ctrl+C
untuk menghentikan. Jangan memakai alamat IP Raspberry Pi dari komputer lain,
karena aplikasi saat ini memakai backend localhost dan membatasi origin.

## Uji kamera dan fitur

1. Sambungkan webcam USB, lalu pilih provider webcam di aplikasi.
2. Coba live preview, ambil foto, pilih strip, simpan hasil, dan buat GIF.
3. Pilih ulang folder output/watch di Raspberry Pi; path dari Mac tidak berlaku.
4. Untuk Google Drive, siapkan OAuth desktop client sendiri pada
   `backend/auth/client_secrets.json`, kemudian login kembali. File ini diabaikan Git.

Mode browser memiliki batasan: dialog folder dan perintah native Tauri belum
tersedia. Gunakan input path manual jika disediakan. Installer macOS/Windows
tidak dapat dijalankan di Raspberry Pi. Bridge Sony yang ada ditujukan untuk
macOS; SDK Canon/Sony untuk Linux ARM dan kamera CSI belum diverifikasi.
Mulai dengan webcam USB sebelum mencoba kamera lain.

Jika instalasi OpenCV gagal, simpan keluaran error beserta `uname -m`,
`python3 --version`, dan `node --version` untuk pemeriksaan dependensi ARM.
