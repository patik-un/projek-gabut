import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { setBoothFullscreen, handleBoothFullscreenKey } from './boothFullscreen.js';

export function useBoothFullscreen(active = true) {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const changing = useRef(false);
  const nativeWindow = useRef(null);
  if (isTauri() && !nativeWindow.current) nativeWindow.current = getCurrentWindow();
  const change = useCallback(async enabled => {
    if (changing.current) return;
    changing.current = true; setError('');
    try {
      await setBoothFullscreen(enabled, { nativeWindow: nativeWindow.current, document });
      setFullscreen(nativeWindow.current ? await nativeWindow.current.isFullscreen() : Boolean(document.fullscreenElement));
    } catch (failure) { setError(`Gagal mengubah fullscreen: ${failure.message || failure}`); }
    finally { changing.current = false; }
  }, []);
  useEffect(() => {
    let stopped = false, unlisten;
    const sync = async () => {
      try {
        const value = nativeWindow.current ? await nativeWindow.current.isFullscreen() : Boolean(document.fullscreenElement);
        if (!stopped) setFullscreen(value);
      } catch { /* The action handler displays actionable errors. */ }
    };
    const escape = e => handleBoothFullscreenKey(e, active, change);
    document.addEventListener('fullscreenchange', sync);
    window.addEventListener('keydown', escape);
    if (nativeWindow.current) nativeWindow.current.onResized(sync).then(stop => { if (stopped) stop(); else unlisten = stop; })
      .catch(() => { if (!stopped) setError('Tidak dapat memantau fullscreen. Tekan Esc untuk keluar.'); });
    void sync();
    return () => { stopped = true; unlisten?.(); document.removeEventListener('fullscreenchange', sync); window.removeEventListener('keydown', escape); };
  }, [active, change]);
  return { fullscreen, error, change };
}
