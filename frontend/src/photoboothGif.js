import { requestBackendJson } from "./backendRequest.js";

export function animatedStripOverlays(stickers, composite, doubleStrip) {
  const stripWidth = composite.width / (doubleStrip ? 2 : 1);
  return stickers.filter((item) => item.type === "gif" && item.artwork).map((item) => {
    const art = item.artwork, width = stripWidth * art.widthPercent / 100 * (item.scale || 1);
    return { data_url: item.content, x: stripWidth * ((item.x / 100) + (doubleStrip ? item.sideIndex || 0 : 0)),
      y: composite.height * item.y / 100, width, height: width * art.height / art.width,
      rotation: item.rotation || 0, opacity: item.style?.opacity ?? 100, padding_x: 2 / art.width, padding_y: 2 / art.height };
  });
}

export async function photoGifFrames(captures, filters, { loadImage, makeCanvas = () => document.createElement("canvas"), revoke = (url) => URL.revokeObjectURL(url) }) {
  const frames = [];
  for (let index = 0; index < Math.min(20, captures.length); index += 1) {
    const loaded = await loadImage(captures[index].image_url);
    try {
      const canvas = makeCanvas(); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#101820"; ctx.fillRect(0, 0, 640, 480);
      const image = loaded.image, ratio = Math.min(640 / image.width, 480 / image.height), width = image.width * ratio, height = image.height * ratio;
      ctx.filter = filters[index] || "none";
      ctx.drawImage(image, (640 - width) / 2, (480 - height) / 2, width, height);
      frames.push(canvas.toDataURL("image/jpeg", .9));
    } finally { if (loaded.objectUrl) revoke(loaded.objectUrl); }
  }
  return frames;
}

export async function requestGifAssets(apiUrl, { photoFrames = [], backgroundData = null, overlays = [] }, { requestJson = requestBackendJson } = {}) {
  const jobs = [];
  if (photoFrames.length >= 2) jobs.push({ kind: "photos", label: "GIF foto", payload: { mode: "photos", frames: photoFrames, duration_ms: 500 } });
  if (overlays.length && backgroundData) jobs.push({ kind: "animated-strip", label: "GIF strip", payload: { mode: "strip", background_data: backgroundData, overlays } });
  const results = await Promise.allSettled(jobs.map(async (job) => {
    const data = await requestJson(`${apiUrl}/photobooth/gif`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job.payload), timeoutMs: 60000 });
    if (!data.success || !data.data_url?.startsWith("data:image/gif;base64,")) throw new Error(data.message || "Backend belum mendukung GIF. Restart backend lalu coba lagi.");
    return { kind: job.kind, label: job.label, dataUrl: data.data_url, dataBase64: data.data_url.split(",")[1],
      filename: job.kind === "photos" ? "photobooth-photos.gif" : "photobooth-animated-strip.gif", width: data.width, height: data.height, frameCount: data.frame_count };
  }));
  return { assets: results.filter((item) => item.status === "fulfilled").map((item) => item.value),
    errors: results.flatMap((item, index) => item.status === "rejected" ? [`${jobs[index].label}: ${item.reason?.message || "Gagal membuat GIF"}`] : []) };
}
