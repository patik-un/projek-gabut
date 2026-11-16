import { normalizeCaptureReview } from './captureReview.js';
import { normalizeBoothOperations } from './boothOperations.js';

export const ADMIN_TABS = [['photobooth', 'Photobooth'], ['strip', 'Strip'], ['camera', 'Kamera'], ['print', 'Cetak'], ['timing', 'Waktu'], ['system', 'Sistem']];
export function AdminOperationsTabs({ value, onChange }) {
  return <nav className="admin-operations-tabs" aria-label="Pengaturan admin">
    {ADMIN_TABS.map(([id, label]) => <button key={id} type="button" aria-pressed={value === id}
      className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}
  </nav>;
}
export function PrintOperationsSettings({ settings, onChange, onTest, disabled, printing = false }) {
  const update = patch => onChange(current => ({ ...current, ...patch, ...normalizeBoothOperations({ ...current, ...patch }) }));
  return <div className="booth-settings-fields">
    <label>Ukuran kertas awal / tes cetak<select value={settings.paperSize} onChange={e => update({ paperSize: e.target.value })}>
      <option value="3r">3R — 88,9 × 127 mm</option><option value="4r">4R — 101,6 × 152,4 mm</option>
    </select></label>
    <p className="booth-setting-help">Cetak hasil sesi mengikuti kertas pada tab Strip. Pilihan ini menjadi ukuran awal strip baru dan kertas untuk tes cetak.</p>
    <label>Orientasi<select value={settings.printOrientation} onChange={e => update({ printOrientation: e.target.value })}>
      <option value="portrait">Portrait (tegak)</option><option value="landscape">Landscape (mendatar)</option>
    </select></label>
    <label>Salinan per sesi<input type="number" min="1" max="10" step="1" value={settings.printCopies}
      onChange={e => update({ printCopies: Math.round(Math.max(1, Math.min(10, Number(e.target.value) || 1))) })} /></label>
    <label>Penyesuaian gambar<select value={settings.printFit} onChange={e => update({ printFit: e.target.value })}>
      <option value="fit">Utuh — seluruh gambar terlihat</option><option value="fill">Penuhi area — tepi gambar dapat terpotong</option>
    </select></label>
    <p className="booth-setting-help">Borderless dan kualitas tinta diatur melalui Printing Preferences printer. Area cetak mengikuti kemampuan driver.</p>
    <button type="button" className="secondary-button compact" disabled={disabled || !settings.printerName.trim()} onClick={onTest}>
      {printing ? 'Sedang mencetak…' : 'Cetak tes (1 lembar)'}
    </button>
  </div>;
}
export function TimingOperationsSettings({ settings, onChange }) {
  const review = normalizeCaptureReview(settings.captureReview);
  const updateReview = patch => onChange(current => ({ ...current,
    captureReview: normalizeCaptureReview({ ...normalizeCaptureReview(current.captureReview), ...patch }) }));
  const fields = [['initialCountdown', 'Hitungan mundur foto pertama', 1, 30], ['nextCountdown', 'Hitungan mundur foto berikutnya', 1, 30],
    ['sessionSeconds', 'Batas sesi foto dan edit', 0, 3600], ['selectionSeconds', 'Waktu memilih strip', 0, 600], ['editSeconds', 'Waktu mengedit foto', 0, 600]];
  return <section className="admin-card booth-timing-card">
    <h2>Waktu Photobooth</h2><p className="booth-setting-help">Disimpan otomatis. Pengaturan baru berlaku mulai sesi berikutnya. Isi 0 pada batas waktu untuk menonaktifkannya.</p>
    <div className="booth-settings-fields">{fields.map(([key, label, min, max]) => <label key={key}>{label} (detik)
      <input type="number" min={min} max={max} step="1" value={settings.timing[key]} onChange={e => {
        const value = Math.round(Math.max(min, Math.min(max, Number(e.target.value) || min)));
        onChange(current => ({ ...current, timing: { ...current.timing, [key]: value } }));
      }} /></label>)}</div>
    <h3>Pratinjau dan Ulang Foto</h3>
    <div className="booth-settings-fields">
      <label>Tampilkan hasil setelah setiap foto<select value={String(review.enabled)} onChange={e => updateReview({ enabled: e.target.value === 'true' })}>
        <option value="true">Aktif</option><option value="false">Nonaktif</option>
      </select></label>
      <label>Durasi pratinjau (detik)<input type="number" min="2" max="30" step="1" value={review.seconds} disabled={!review.enabled}
        onChange={e => updateReview({ seconds: Math.max(2, Math.min(30, Math.round(Number(e.target.value) || 2))) })} /></label>
      <label>Izinkan ulang foto<select value={String(review.allowRetake)} disabled={!review.enabled} onChange={e => updateReview({ allowRetake: e.target.value === 'true' })}>
        <option value="true">Ya</option><option value="false">Tidak</option>
      </select></label>
      <label>Batas ulang per foto<input type="number" min="1" max="5" step="1" value={review.maxRetakes} disabled={!review.enabled || !review.allowRetake}
        onChange={e => updateReview({ maxRetakes: Math.max(1, Math.min(5, Math.round(Number(e.target.value) || 1))) })} /></label>
    </div>
    <p className="booth-setting-help">Saat pratinjau habis, foto otomatis dipakai. Foto lama tetap aman bila pengambilan ulang gagal. Berlaku mulai sesi berikutnya.</p>
    <ul className="booth-setting-help"><li>Waktu pilih strip habis: mulai dengan strip terpilih ketika sistem siap.</li>
      <li>Waktu edit habis: lanjut ke halaman hasil; cetak dan simpan tetap memerlukan tindakan pengguna.</li>
      <li>Batas sesi habis: sesi dijeda dan foto tetap tersedia sampai sesi dilanjutkan atau diakhiri.</li>
      <li>Timer dijeda saat sistem memproses foto/cetak, aplikasi tidak terlihat, atau pengguna berada di menu lain.</li></ul>
  </section>;
}
