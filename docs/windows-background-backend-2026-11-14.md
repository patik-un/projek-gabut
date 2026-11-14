# Backend Windows tanpa jendela konsol — versi 0.1.3

Backend konsol sebelumnya dijalankan dengan CREATE_NEW_PROCESS_GROUP saja,
sehingga Windows dapat membuka jendela konsol di samping aplikasi Tauri.

Launcher sekarang mempertahankan process group dan menambahkan CREATE_NO_WINDOW.
Standard input/output/error diarahkan ke perangkat null agar proses Python
memiliki handle yang valid tanpa konsol. Backend tetap dikelola aplikasi dan
berhenti melalui mekanisme shutdown yang sudah ada.

Tes native Windows menjalankan subprocess probe GetConsoleWindow: cara peluncuran
lama harus terdeteksi memiliki konsol, sedangkan konfigurasi produksi harus tidak
memiliki konsol. Workflow menjalankan cargo test --release --locked sesudah build
installer dan sebelum smoke test backend hasil paket.

Pemeriksaan lokal: versi seluruh manifest sinkron pada 0.1.3; tes Rust macOS
lulus. Tes khusus konsol dan installer diverifikasi oleh workflow Windows.
