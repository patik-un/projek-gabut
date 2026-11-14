import { useEffect, useRef, useState } from 'react';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { createAppUpdater } from './appUpdater.js';
import './AppUpdates.css';

const nativeUpdater = {
  version: () => isTauri() ? getVersion() : Promise.resolve('Browser'),
  check: () => isTauri() ? invoke('check_app_update') : Promise.resolve({ supported: false, currentVersion: 'Browser' }),
  download: onProgress => { const progress = new Channel(); progress.onmessage = onProgress; return invoke('download_app_update', { progress }); },
  install: onProgress => { const progress = new Channel(); progress.onmessage = onProgress; return invoke('install_app_update', { progress }); },
  cancel: () => invoke('cancel_app_update'),
};

export default function AppUpdates({ busyReason, onLock, adapter = nativeUpdater }) {
  const busy = useRef(busyReason); busy.current = busyReason;
  const controller = useRef(null);
  const [state, setState] = useState({ phase: 'idle', currentVersion: '', update: null });
  const [open, setOpen] = useState(false);
  const locked = ['downloading', 'waiting', 'installing'].includes(state.phase);
  useEffect(() => {
    const updater = createAppUpdater({ native: adapter, busy: () => busy.current, onState: setState, onLock });
    controller.current = updater;
    const initial = window.setTimeout(() => updater.check(), 1200);
    const interval = window.setInterval(() => updater.check(), 6 * 60 * 60 * 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); updater.dispose(); };
  }, [adapter, onLock]);
  const labels = { idle: 'Belum diperiksa', checking: 'Memeriksa update…', current: 'Aplikasi sudah terbaru',
    available: 'Update tersedia', unsupported: 'Update otomatis tersedia untuk aplikasi Windows. Platform ini belum didukung.',
    downloading: 'Mengunduh dan memverifikasi update…', waiting: 'Menunggu pekerjaan selesai…',
    installing: 'Memasang update… Aplikasi akan dibuka kembali.', installed: 'Update selesai. Buka kembali aplikasi jika belum terbuka.' };
  return <aside className="app-updates" aria-label="Pembaruan aplikasi">
    <button type="button" className="update-launcher" onClick={() => setOpen(true)}>
      {state.update ? `Update ${state.update.version}` : 'Tentang / Update'}
    </button>
    {state.notice && !open && <div className="update-notice" role="status">
      <span>Versi {state.update.version} tersedia</span>
      <button type="button" onClick={() => setOpen(true)}>Lihat pembaruan</button>
      <button type="button" onClick={() => controller.current.postpone()}>Nanti</button>
    </div>}
    {(open || locked) && <div className="update-shade">
      <section className="update-panel" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <h2 id="update-title">Pembaruan aplikasi</h2>
        <p>Versi sekarang: <strong>{state.currentVersion || 'Memuat…'}</strong></p>
        <p role="status">{labels[state.phase]}</p>
        {state.checkedAt && <small>Terakhir diperiksa: {new Date(state.checkedAt).toLocaleString('id-ID')}</small>}
        {state.update && <><h3>Versi {state.update.version}</h3><pre className="update-notes">{state.update.notes || 'Pembaruan Event Booth Studio.'}</pre></>}
        {state.phase === 'downloading' && <><progress aria-label="Progres unduhan" max="100" value={state.percent ?? undefined} />
          <span>{state.percent === null ? 'Mengunduh…' : `${state.percent}%`}</span></>}
        {state.error && <p role="alert" className="update-error">{state.error}</p>}
        {busyReason && state.update && !locked && <p>{busyReason}. Selesaikan dahulu agar update bisa dipasang.</p>}
        {state.update && <p>Aplikasi akan ditutup untuk pemasangan, lalu dibuka kembali. Foto dan pengaturan tetap tersimpan.</p>}
        <div className="update-actions">
          {!locked && <button type="button" onClick={() => { setOpen(false); controller.current.postpone(); }}>Nanti / Tutup</button>}
          {!locked && <button type="button" disabled={state.phase === 'checking' || state.phase === 'unsupported'} onClick={() => controller.current.check()}>Periksa update</button>}
          {state.update && <button type="button" className="update-primary" disabled={locked || Boolean(busyReason) || state.phase === 'checking'}
            onClick={() => controller.current.install()}>{state.phase === 'error' ? 'Coba lagi' : 'Unduh & pasang'}</button>}
        </div>
      </section>
    </div>}
  </aside>;
}
