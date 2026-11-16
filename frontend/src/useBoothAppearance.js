import { useCallback, useEffect, useRef, useState } from 'react';
import { requestBackendJson } from './backendRequest.js';
import { createBoothAppearanceController, normalizeBoothAppearance } from './boothAppearance.js';

export function useBoothAppearance(apiUrl, backendReady) {
  const [appearance, setAppearance] = useState(() => normalizeBoothAppearance(null));
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const controller = useRef(null), readingFile = useRef(false), requestBusy = useRef(false);
  useEffect(() => {
    const next = createBoothAppearanceController({
      request: (path, options) => requestBackendJson(`${apiUrl}${path}`, { ...options, timeoutMs: 30000 }),
      onChange: setAppearance, onError: setError, onLoading: setLoading,
      onBusy: value => { requestBusy.current = value; setBusy(value); },
    });
    controller.current = next;
    return () => { next.dispose(); if (controller.current === next) controller.current = null; };
  }, [apiUrl]);
  useEffect(() => { if (backendReady) void controller.current?.load(); }, [backendReady, apiUrl]);
  const save = useCallback(value => {
    if (!backendReady || readingFile.current) return Promise.resolve(false);
    return controller.current?.save(value) ?? Promise.resolve(false);
  }, [backendReady]);
  const reload = useCallback(() => controller.current?.load(), []);
  const uploadFile = useCallback(async (file, dim) => {
    if (!file || !backendReady || readingFile.current || requestBusy.current) return false;
    if (file.size > 8 * 1024 * 1024 || !/\.(jpe?g|png)$/i.test(file.name) ||
        (file.type && !['image/jpeg', 'image/png'].includes(file.type))) {
      setError('Pilih gambar JPG/PNG maksimal 8 MB.'); return false;
    }
    const activeController = controller.current;
    readingFile.current = true; setReading(true); setError('');
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('File tidak dapat dibaca.'));
        reader.onabort = () => reject(new Error('Pembacaan file dibatalkan.'));
        reader.readAsDataURL(file);
      });
      if (controller.current !== activeController) return false;
      return await activeController.upload(data, dim);
    } catch (failure) {
      if (controller.current === activeController) setError(failure.message || 'Gagal membaca gambar.');
      return false;
    } finally {
      readingFile.current = false;
      if (controller.current === activeController) setReading(false);
    }
  }, [backendReady]);
  return { appearance, busy: busy || reading, loading, error, save, reload, uploadFile };
}
