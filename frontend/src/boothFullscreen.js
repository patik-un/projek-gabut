export async function setBoothFullscreen(enabled, { nativeWindow, document }) {
  if (nativeWindow) return nativeWindow.setFullscreen(enabled);
  if (enabled) {
    if (!document.documentElement?.requestFullscreen) throw new Error('Fullscreen tidak didukung pada browser ini. Gunakan aplikasi desktop.');
    return document.documentElement.requestFullscreen();
  }
  if (document.fullscreenElement) return document.exitFullscreen();
}

export function handleBoothFullscreenKey(event, active, change) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (event.key !== 'Escape' && !(active && event.key === 'F12')) return;
  event.preventDefault();
  void change(event.key === 'F12');
}
