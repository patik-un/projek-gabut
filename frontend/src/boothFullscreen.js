export async function setBoothFullscreen(enabled, { nativeWindow, document }) {
  if (nativeWindow) return nativeWindow.setFullscreen(enabled);
  if (enabled) {
    if (!document.documentElement?.requestFullscreen) throw new Error('Fullscreen tidak didukung pada browser ini. Gunakan aplikasi desktop.');
    return document.documentElement.requestFullscreen();
  }
  if (document.fullscreenElement) return document.exitFullscreen();
}
