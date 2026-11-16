export async function createLocalPhotoboothQr(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) throw new Error('Tautan folder foto tidak valid.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Tautan folder foto tidak valid.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Tautan folder foto tidak valid.');
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(value, { width: 640, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000ff', light: '#ffffffff' } });
}
