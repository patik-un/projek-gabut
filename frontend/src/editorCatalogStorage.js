import { requestBackendJson } from "./backendRequest.js";

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  return value;
}
function assertSameDesign(expected, response) {
  if (response?.success !== true || JSON.stringify(ordered(expected)) !== JSON.stringify(ordered(response.settings))) {
    throw new Error("Desain dari backend berbeda dengan preview. Perubahan Anda tetap tersimpan di editor; coba simpan kembali setelah restart backend.");
  }
}

export async function persistEditorCatalog(apiUrl, draft, { requestJson = requestBackendJson } = {}) {
  // Freeze the outgoing design and match backend whitespace normalization.
  const settings = JSON.parse(JSON.stringify(draft));
  for (const item of settings.texts) {
    item.text = item.text.trim();
    if (!item.text) throw new Error("Isi tulisan tidak boleh kosong.");
  }
  for (const item of settings.stickers) {
    item.name = item.name.trim();
    if (!item.name) throw new Error("Nama stiker tidak boleh kosong.");
  }
  const endpoint = `${apiUrl}/photobooth/editor-settings`;
  const capability = await requestJson(endpoint);
  if (capability?.success !== true || !(capability.schema_version >= 2)) {
    throw new Error("Backend masih versi lama. Restart backend agar gaya desain dapat disimpan. Perubahan Anda tetap ada di editor.");
  }
  const response = await requestJson(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
  });
  assertSameDesign(settings, response);
  const persisted = await requestJson(endpoint);
  assertSameDesign(settings, persisted);
  return persisted.settings;
}
