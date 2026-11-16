import { useEffect, useState } from 'react';
import { BOOTH_APPEARANCE_THEMES, boothAppearanceStyle } from './boothAppearance.js';
import './BoothAppearance.css';

export default function BoothAppearanceSettings({ apiUrl, backendReady, appearanceState }) {
  const { appearance, loading, busy, error, save, reload, uploadFile } = appearanceState;
  const [draft, setDraft] = useState(appearance), [message, setMessage] = useState('');
  useEffect(() => { setDraft(appearance); }, [appearance]);
  const locked = busy || loading || !backendReady;
  const select = patch => { setDraft(current => ({ ...current, ...patch })); setMessage(''); };
  return <section className="admin-card booth-appearance-card">
    <div className="template-panel-header"><div><h2>Tampilan Photobooth</h2>
      <span>Pilih suasana untuk acara pernikahan Anda.</span></div></div>
    <p className="booth-appearance-help">Tema berlaku dari halaman awal sampai hasil photobooth dan fullscreen. Tampilan foto dan hasil cetak tetap mengikuti desain strip.</p>
    <fieldset className="booth-appearance-fields" disabled={locked}>
      <legend className="booth-appearance-legend">Tema background</legend>
      <div className="booth-theme-choices">
        {BOOTH_APPEARANCE_THEMES.map(theme => <button key={theme.id} type="button" aria-pressed={draft.theme === theme.id}
          className={`booth-theme-choice${draft.theme === theme.id ? ' selected' : ''}`} onClick={() => select({ theme: theme.id })}>
          <span className="booth-theme-swatch" aria-hidden="true" style={{ backgroundImage: theme.background }} />
          <strong>{theme.label}</strong><small>{theme.description}</small>
        </button>)}
        {appearance.has_image && <button type="button" className={`booth-theme-choice${draft.theme === 'custom' ? ' selected' : ''}`}
          aria-pressed={draft.theme === 'custom'} onClick={() => select({ theme: 'custom' })}>
          <img className="booth-theme-swatch" src={`${apiUrl}${appearance.image_url}`} alt="Background upload tersimpan" />
          <strong>Gambar sendiri</strong><small>Gunakan kembali gambar tersimpan</small>
        </button>}
      </div>
      <div className="booth-appearance-bottom">
        <div className="booth-appearance-controls">
          <label className="booth-dim-control">Tingkat gelap <strong>{draft.dim}%</strong>
            <input type="range" min="0" max="85" step="1" disabled={draft.theme === 'default'} value={draft.dim}
              onChange={event => select({ dim: Number(event.target.value) })} /></label>
          <p className="booth-appearance-help">Atur agar tulisan tetap terbaca. Tingkat gelap berlaku saat tema atau gambar dipakai.</p>
          <label className="booth-background-upload">Unggah background JPG / PNG
            <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={async event => {
              const file = event.target.files?.[0]; event.target.value = ''; setMessage('');
              if (await uploadFile(file, draft.dim)) setMessage('Gambar tersimpan dan sudah dipakai di photobooth.');
            }} /></label>
          <p className="booth-appearance-help">Maksimal 8 MB. Gunakan gambar mendatar untuk layar landscape. Gambar yang berhasil diunggah langsung disimpan dan diterapkan.</p>
          <button type="button" className="upload-button compact" onClick={async () => {
            setMessage(''); if (await save(draft)) setMessage('Tampilan photobooth tersimpan.');
          }}>Gunakan tampilan</button>
        </div>
        <div className="booth-appearance-preview" style={boothAppearanceStyle(draft, apiUrl)} aria-label="Pratinjau background photobooth">
          <div className="booth-preview-dim" />
          <div className="booth-preview-card"><span>WEDDING PHOTOBOOTH</span><strong>Rayakan momen bahagia</strong><span className="booth-preview-button">Mulai Foto</span></div>
        </div>
      </div>
    </fieldset>
    {loading && <p role="status" className="booth-appearance-help">Memuat tampilan tersimpan…</p>}
    {busy && <p role="status" className="booth-appearance-help">Menyimpan tampilan…</p>}
    {!backendReady && <p className="booth-appearance-help">Hubungkan backend untuk memuat atau menyimpan tampilan.</p>}
    {error && <div className="booth-appearance-error" role="alert"><span>{error}</span>
      <button type="button" className="secondary-button compact" disabled={locked} onClick={reload}>Muat ulang tampilan</button></div>}
    {message && <p role="status" className="booth-appearance-help">{message}</p>}
  </section>;
}
