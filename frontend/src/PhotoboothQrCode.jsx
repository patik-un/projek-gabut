import { useEffect, useState } from 'react';
import { createLocalPhotoboothQr } from './photoboothQr.js';

export default function PhotoboothQrCode({ value }) {
  const [image, setImage] = useState({ value: null, url: null, error: '' });
  useEffect(() => {
    let active = true;
    setImage({ value, url: null, error: '' });
    if (value) createLocalPhotoboothQr(value).then(url => {
      if (active) setImage({ value, url, error: '' });
    }).catch(() => {
      if (active) setImage({ value, url: null, error: 'Kode QR belum dapat dibuat. Gunakan tombol Buka Folder Drive.' });
    });
    return () => { active = false; };
  }, [value]);
  if (!value) return null;
  const current = image.value === value ? image : { url: null, error: '' };
  return <div className="drive-qr-card">
    <strong className="drive-qr-title">Scan untuk ambil foto</strong>
    {current.url ? <img src={current.url} alt="Kode QR untuk membuka folder foto Google Drive" width="640" height="640" />
      : <p className="drive-qr-message" role="status">{current.error || 'Menyiapkan kode QR…'}</p>}
    <span>Arahkan kamera HP ke kode QR ini.</span>
    <span className="drive-qr-hint">Buka tautan yang muncul untuk melihat dan mengunduh foto.</span>
  </div>;
}
