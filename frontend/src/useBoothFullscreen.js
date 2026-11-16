import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { setBoothFullscreen } from './boothFullscreen.js';

export function useBoothFullscreen() {
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
    const escape = e => { if (e.key === 'Escape' && nativeWindow.current) void change(false); };
    document.addEventListener('fullscreenchange', sync);
    window.addEventListener('keydown', escape);
    if (nativeWindow.current) nativeWindow.current.onResized(sync).then(stop => { if (stopped) stop(); else unlisten = stop; })
      .catch(() => { if (!stopped) setError('Tidak dapat memantau fullscreen. Gunakan tombol keluar atau Esc.'); });
    void sync();
    return () => { stopped = true; unlisten?.(); document.removeEventListener('fullscreenchange', sync); window.removeEventListener('keydown', escape); };
  }, [change]);
  return { fullscreen, error, change };
}
