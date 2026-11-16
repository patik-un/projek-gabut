const flower = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><g id="f"><ellipse rx="36" ry="70" cy="-45" fill="#d8b3bc" opacity=".55"/><ellipse rx="36" ry="70" cy="-45" fill="#edd1d3" opacity=".8" transform="rotate(72)"/><ellipse rx="36" ry="70" cy="-45" fill="#d8b3bc" opacity=".6" transform="rotate(144)"/><ellipse rx="36" ry="70" cy="-45" fill="#edd1d3" opacity=".8" transform="rotate(216)"/><ellipse rx="36" ry="70" cy="-45" fill="#d8b3bc" opacity=".65" transform="rotate(288)"/><circle r="18" fill="#c7a66b"/></g></defs><g fill="none" stroke="#9aa58d" stroke-width="4" opacity=".65"><path d="M-40 410Q220 180 360-60M1210 1060Q1390 790 1660 650"/><path d="M60 300q120-15 110-120q-105 4-110 120M195 140q90 10 100-100q-110 10-100 100M1340 900q95 15 100-100q-110 10-100 100M1470 775q100 15 100-90q-100 0-100 90"/></g><use href="#f" x="90" y="130"/><use href="#f" x="260" y="35" transform="rotate(20 260 35)"/><use href="#f" x="1550" y="875"/><use href="#f" x="1395" y="990"/></svg>`;
export const BOOTH_APPEARANCE_THEMES = [
  { id: 'default', label: 'Original', description: 'Tampilan gelap aplikasi', background: 'linear-gradient(135deg,#080808,#171717)' },
  { id: 'elegant', label: 'Elegant Cream', description: 'Ivory hangat dengan aksen emas', background: 'radial-gradient(ellipse at 0% 0%,#dec490 0%,transparent 48%),radial-gradient(ellipse at 100% 100%,#d5bc8d 0%,transparent 48%),linear-gradient(135deg,#fbf6e9,#e7ddc6)' },
  { id: 'pink', label: 'Soft Pink', description: 'Nuansa blush untuk momen romantis', background: 'radial-gradient(ellipse at 10% 20%,#fff2ed 0%,transparent 45%),radial-gradient(ellipse at 100% 80%,#c38d9d 0%,transparent 50%),linear-gradient(135deg,#f2d6dc,#e8b7c5)' },
  { id: 'floral', label: 'Floral', description: 'Bunga lembut dan dedaunan sage', background: `url("data:image/svg+xml,${encodeURIComponent(flower)}"),linear-gradient(135deg,#f5eee4,#eadcdb)` },
];
const THEMES = new Set([...BOOTH_APPEARANCE_THEMES.map(theme => theme.id), 'custom']);
const validDim = value => Number.isInteger(value) && value >= 0 && value <= 85;
export function normalizeBoothAppearance(value) {
  const data = value && typeof value === 'object' ? value : {};
  const image_url = typeof data.image_url === 'string' && /^\/watermark-files\/booth_background_[a-f0-9]{32}\.jpg$/.test(data.image_url) && data.has_image === true
    ? data.image_url : null;
  let theme = THEMES.has(data.theme) ? data.theme : 'default';
  if (theme === 'custom' && !image_url) theme = 'default';
  return { theme, dim: validDim(data.dim) ? data.dim : 35, image_url, has_image: Boolean(image_url) };
}
export function boothAppearanceStyle(value, apiUrl = 'http://127.0.0.1:8000') {
  const appearance = normalizeBoothAppearance(value);
  return {
    '--booth-background': appearance.theme === 'custom'
      ? `url("${apiUrl.replace(/\/$/, '')}${appearance.image_url}")`
      : BOOTH_APPEARANCE_THEMES.find(theme => theme.id === appearance.theme).background,
    '--booth-dim-opacity': appearance.dim / 100,
  };
}
export function createBoothAppearanceController({ request, onChange = () => {}, onBusy = () => {}, onError = () => {}, onLoading = () => {} }) {
  let current = normalizeBoothAppearance(null), revision = 0, busy = false, disposed = false;
  const apply = data => { current = normalizeBoothAppearance(data); onChange(current); };
  const mutate = async (path, body) => {
    if (disposed || busy) return false;
    busy = true; const id = ++revision;
    onLoading(false); onError(''); onBusy(true);
    try {
      const data = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (disposed || id !== revision) return false;
      apply(data); return true;
    } catch (error) {
      if (!disposed && id === revision) onError(`Gagal menyimpan tampilan: ${error.message || error}`);
      return false;
    } finally { busy = false; if (!disposed) onBusy(false); }
  };
  return {
    async load() {
      if (disposed || busy) return false;
      const id = ++revision; onLoading(true); onError('');
      try {
        const data = await request('/photobooth/appearance');
        if (disposed || id !== revision) return false;
        apply(data); return true;
      } catch (error) {
        if (!disposed && id === revision) onError(`Gagal memuat tampilan: ${error.message || error}`);
        return false;
      } finally { if (!disposed && id === revision) onLoading(false); }
    },
    async save(value) {
      if (disposed || busy) return false;
      if (value.theme === 'custom' && !current.has_image) { onError('Unggah gambar terlebih dahulu.'); return false; }
      const settings = normalizeBoothAppearance({ ...current, ...value });
      return mutate('/photobooth/appearance', { theme: settings.theme, dim: settings.dim });
    },
    upload(dataBase64, dim = current.dim) {
      return mutate('/photobooth/appearance/image', { data_base64: dataBase64, dim: validDim(dim) ? dim : 35 });
    },
    dispose() { disposed = true; revision++; },
  };
}
