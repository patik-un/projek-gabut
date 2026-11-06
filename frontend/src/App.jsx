import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { googleLogout } from "@react-oauth/google";
import { invoke } from "@tauri-apps/api/core";
import { isDriveAuthReady, runDriveLogin } from "./driveAuth.js";
import { requestBackendJson } from "./backendRequest.js";
import PhotoboothEditorAdmin from "./PhotoboothEditorAdmin.jsx";
import { DEFAULT_EDITOR_CATALOG, visibleEditorItems, resolveEditorTextItem } from "./photoboothEditor.js";
import { createTextArtwork, createStickerArtwork, decorationStyle } from "./decorationArtwork.js";
import DecorationArtwork from "./DecorationArtwork.jsx";
import PhotoboothGifResults from "./PhotoboothGifResults.jsx";
import { animatedStripOverlays, photoGifFrames, requestGifAssets } from "./photoboothGif.js";
import sisikitaCompanyLogo from "./assets/sisikita-company-logo.png";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";
const DEFAULT_WATERMARK_SETTINGS = {
  fit: "manual",
  position: "bottom-right",
  scale: 24,
  rotation: 0,
  opacity: 100,
  frame_scale: 100,
  frame_x: 0,
  frame_y: 0,
  photo_scale: 100,
  photo_x: 0,
  photo_y: 0,
};
const DEFAULT_WATERMARK_PROFILES = {
  landscape: DEFAULT_WATERMARK_SETTINGS,
  portrait: {
    ...DEFAULT_WATERMARK_SETTINGS,
    position: "bottom-center",
    scale: 32,
  },
};
const WATERMARK_POSITIONS = [
  ["top-left", "top-center", "top-right"],
  ["center-left", "center", "center-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
];
const WATERMARK_POSITION_LABELS = {
  "top-left": "Atas kiri",
  "top-center": "Atas tengah",
  "top-right": "Atas kanan",
  "center-left": "Tengah kiri",
  center: "Tengah",
  "center-right": "Tengah kanan",
  "bottom-left": "Bawah kiri",
  "bottom-center": "Bawah tengah",
  "bottom-right": "Bawah kanan",
};
const DEFAULT_TEMPLATE_SLOTS = [
  { left: 36.8, top: 5.2, width: 28.8, height: 18 },
  { left: 36.8, top: 26.4, width: 28.8, height: 18 },
  { left: 36.8, top: 47.8, width: 28.8, height: 18 },
  { left: 36.8, top: 69.1, width: 28.8, height: 18 },
];
const DEFAULT_SLOT_ADJUSTMENT = {
  scale: 100,
  x: 0,
  y: 0,
  rotation: 0,
};
const PHOTOBOOTH_EFFECTS = [
  {
    id: "natural",
    name: "Natural",
    filter: "contrast(1.04) saturate(1.06)",
  },
  {
    id: "glow",
    name: "Glow",
    filter: "brightness(1.08) contrast(1.05) saturate(1.18)",
  },
  {
    id: "mono",
    name: "Mono",
    filter: "grayscale(1) contrast(1.15)",
  },
  {
    id: "warm",
    name: "Warm",
    filter: "sepia(0.18) brightness(1.06) saturate(1.12)",
  },
  {
    id: "cool",
    name: "Cool",
    filter: "brightness(1.03) contrast(1.06) saturate(1.08) hue-rotate(-8deg)",
  },
  {
    id: "vivid",
    name: "Vivid",
    filter: "contrast(1.14) saturate(1.34) brightness(1.03)",
  },
  {
    id: "soft",
    name: "Soft",
    filter: "brightness(1.08) contrast(0.92) saturate(1.04)",
  },
  {
    id: "dream",
    name: "Dream",
    filter: "brightness(1.12) contrast(0.88) saturate(1.18) sepia(0.08)",
  },
  {
    id: "film",
    name: "Film",
    filter: "contrast(1.08) saturate(0.88) sepia(0.16)",
  },
  {
    id: "cinema",
    name: "Cinema",
    filter: "brightness(0.96) contrast(1.22) saturate(0.92)",
  },
  {
    id: "matte",
    name: "Matte",
    filter: "brightness(1.04) contrast(0.86) saturate(0.9) sepia(0.08)",
  },
  {
    id: "noir",
    name: "Noir",
    filter: "grayscale(1) contrast(1.35) brightness(0.96)",
  },
  {
    id: "silver",
    name: "Silver",
    filter: "grayscale(1) contrast(0.98) brightness(1.12)",
  },
  {
    id: "sepia",
    name: "Sepia",
    filter: "sepia(0.58) contrast(1.08) brightness(1.03)",
  },
  {
    id: "retro",
    name: "Retro",
    filter: "sepia(0.32) saturate(1.35) contrast(1.08)",
  },
  {
    id: "polaroid",
    name: "Polaroid",
    filter: "brightness(1.12) contrast(0.94) saturate(1.22) sepia(0.12)",
  },
  {
    id: "pastel",
    name: "Pastel",
    filter: "brightness(1.12) contrast(0.82) saturate(0.88)",
  },
  {
    id: "peach",
    name: "Peach",
    filter: "brightness(1.08) contrast(0.96) saturate(1.15) sepia(0.12)",
  },
  {
    id: "rose",
    name: "Rose",
    filter: "brightness(1.08) contrast(1.02) saturate(1.18) hue-rotate(8deg)",
  },
  {
    id: "golden",
    name: "Golden",
    filter: "brightness(1.1) contrast(1.05) saturate(1.18) sepia(0.24)",
  },
  {
    id: "emerald",
    name: "Emerald",
    filter: "brightness(1.03) contrast(1.08) saturate(1.18) hue-rotate(18deg)",
  },
  {
    id: "aqua",
    name: "Aqua",
    filter: "brightness(1.05) contrast(1.06) saturate(1.16) hue-rotate(-18deg)",
  },
  {
    id: "neon",
    name: "Neon",
    filter: "brightness(1.08) contrast(1.28) saturate(1.55)",
  },
  {
    id: "crisp",
    name: "Crisp",
    filter: "contrast(1.2) saturate(1.08) brightness(1.02)",
  },
  {
    id: "fade",
    name: "Fade",
    filter: "brightness(1.08) contrast(0.76) saturate(0.82)",
  },
  {
    id: "lowkey",
    name: "Low Key",
    filter: "brightness(0.88) contrast(1.22) saturate(0.95)",
  },
  {
    id: "highkey",
    name: "High Key",
    filter: "brightness(1.2) contrast(0.9) saturate(0.96)",
  },
  {
    id: "sunset",
    name: "Sunset",
    filter: "brightness(1.07) contrast(1.08) saturate(1.25) sepia(0.2)",
  },
  {
    id: "berry",
    name: "Berry",
    filter: "brightness(1.03) contrast(1.12) saturate(1.22) hue-rotate(14deg)",
  },
];
const STUDIO_PHOTOBOOTH_EFFECTS = [
  { id: "natural", name: "Natural", filter: "contrast(1.04) saturate(1.06)" },
  { id: "bw-classic", name: "Hitam Putih", filter: "grayscale(1) contrast(1.15)" },
  { id: "warm-sepia", name: "Hangat", filter: "sepia(0.42) contrast(1.04) brightness(1.04)" },
  { id: "soft-pastel", name: "Lembut", filter: "brightness(1.1) contrast(0.88) saturate(0.9)" },
  { id: "retro-90s", name: "Retro 90s", filter: "sepia(0.18) saturate(1.35) contrast(1.08)" },
  { id: "cyberpunk", name: "Warna Cerah", filter: "contrast(1.24) saturate(1.55) hue-rotate(18deg)" },
];
const EMOJI_STICKERS = [
  "❤️", "✨", "🔥", "🥳", "😎", "🌸", "✌️", "🎀", "🧸", "🐱",
  "👑", "⭐", "💖", "🍭", "🍕", "🎉", "🦋", "🎈", "💋", "🍀",
  "🌈", "⚡", "🎂", "🐶", "🍒", "🌼", "💐", "😍", "🤩", "🥰"
];
const PROP_STICKERS = [
  "👓", "🕶️", "🎩", "🧢", "👒", "💄", "💍", "🎸", "📸", "🍿",
  "🥤", "🍾", "🍩", "🥑", "🧁", "🍦", "👑", "🎧", "💡", "💎"
];
const DOODLE_COLORS = [
  { name: "Putih", value: "#ffffff" },
  { name: "Kuning neon", value: "#f4ff4e" },
  { name: "Pink pastel", value: "#ff9fce" },
  { name: "Biru langit", value: "#62d9ff" },
  { name: "Merah hati", value: "#ff4d6d" },
  { name: "Hitam", value: "#111318" },
];

const DOODLE_BRUSHES = [
  { id: "neon", name: "Neon", width: 8 },
  { id: "pencil", name: "Pensil", width: 3 },
  { id: "pastel", name: "Pastel", width: 12 },
];
const traceRoundedRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }

  ctx.rect(x, y, width, height);
};
const drawRoundedRectRing = (ctx, x, y, width, height, inset, radius, color) => {
  const innerWidth = width - inset * 2;
  const innerHeight = height - inset * 2;
  if (innerWidth <= 0 || innerHeight <= 0) return;

  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
    ctx.roundRect(
      x + inset,
      y + inset,
      innerWidth,
      innerHeight,
      Math.max(0, radius - inset)
    );
  } else {
    ctx.rect(x, y, width, height);
    ctx.rect(x + inset, y + inset, innerWidth, innerHeight);
  }
  ctx.fillStyle = color;
  ctx.fill("evenodd");
};
const drawDecorationsToContext = (ctx, canvasWidth, canvasHeight, doodles, stickers, texts, stickerImages = {}) => {
  if (Array.isArray(doodles) && doodles.length > 0) {
    doodles.forEach((doodle) => {
      if (!doodle.points || doodle.points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = doodle.color || "#ffffff";
      const brush = doodle.brush || "pencil";
      const scaleFactor = canvasWidth / 400;
      ctx.lineWidth = Math.max(2, (doodle.size || 4) * scaleFactor);
      if (brush === "neon") {
        ctx.shadowColor = doodle.color || "#ffffff";
        ctx.shadowBlur = ctx.lineWidth * 2.5;
      } else if (brush === "pastel") {
        ctx.globalAlpha = 0.58;
      }
      const firstPt = doodle.points[0];
      ctx.moveTo(firstPt.x * canvasWidth, firstPt.y * canvasHeight);
      for (let i = 1; i < doodle.points.length; i += 1) {
        const pt = doodle.points[i];
        ctx.lineTo(pt.x * canvasWidth, pt.y * canvasHeight);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  if (Array.isArray(stickers) && stickers.length > 0) {
    stickers.forEach((sticker) => {
      ctx.save();
      const posX = (sticker.x / 100) * canvasWidth;
      const posY = (sticker.y / 100) * canvasHeight;
      const scale = sticker.scale || 1;
      const rotation = ((sticker.rotation || 0) * Math.PI) / 180;
      ctx.translate(posX, posY);
      ctx.rotate(rotation);
      if (sticker.artwork) {
        const art = sticker.artwork;
        const width = canvasWidth * art.widthPercent / 100 * scale;
        const height = width * art.height / art.width;
        const image = stickerImages[art.src];
        if (image) ctx.drawImage(image, -width / 2, -height / 2, width, height);
        ctx.restore();
        return;
      }
      const baseFontSize = (canvasWidth * 0.12) * scale;
      ctx.font = `${Math.round(baseFontSize)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = canvasWidth * 0.015 * scale;
      ctx.shadowOffsetY = canvasWidth * 0.0075 * scale;
      if (sticker.type === "image") {
        const image = stickerImages[sticker.content];
        if (image) {
          const width = baseFontSize;
          const height = width * image.height / image.width;
          ctx.drawImage(image, -width / 2, -height / 2, width, height);
        }
      } else {
        ctx.fillText(sticker.content, 0, 0);
      }
      ctx.restore();
    });
  }
  if (Array.isArray(texts) && texts.length > 0) {
    texts.forEach((textItem) => {
      if (!textItem.text) return;
      ctx.save();
      const posX = (textItem.x / 100) * canvasWidth;
      const posY = (textItem.y / 100) * canvasHeight;
      const scale = textItem.scale || 1;
      const rotation = ((textItem.rotation || 0) * Math.PI) / 180;
      ctx.translate(posX, posY);
      ctx.rotate(rotation);
      if (textItem.artwork) {
        const art = textItem.artwork;
        const width = canvasWidth * art.widthPercent / 100 * scale;
        const height = width * art.height / art.width;
        const image = stickerImages[art.src];
        if (image) ctx.drawImage(image, 0, -height / 2, width, height);
        ctx.restore();
        return;
      }
      const fontSize = Math.round((canvasWidth * 0.055) * scale);
      let fontFamily = 'system-ui, -apple-system, sans-serif';
      if (textItem.font === 'cute') fontFamily = '"Comic Sans MS", "Caveat", cursive, sans-serif';
      else if (textItem.font === 'retro') fontFamily = '"Courier New", Courier, monospace';
      else if (textItem.font === 'bold') fontFamily = 'Impact, "Arial Black", sans-serif';
      ctx.font = `800 ${fontSize}px ${fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const metrics = ctx.measureText(textItem.text);
      const paddingX = fontSize * 0.5;
      const paddingY = fontSize * 0.25;
      if (textItem.hasBg) {
        const bgWidth = metrics.width + paddingX * 2;
        const bgHeight = fontSize + paddingY * 2;
        ctx.fillStyle = textItem.bgColor || "rgba(0, 0, 0, 0.75)";
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = canvasWidth * 0.03 * scale;
        ctx.shadowOffsetY = canvasWidth * 0.01 * scale;
        ctx.beginPath();
        const r = 6 * (canvasWidth / 400) * scale;
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(0, -bgHeight / 2, bgWidth, bgHeight, r);
        } else {
          ctx.rect(0, -bgHeight / 2, bgWidth, bgHeight);
        }
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      ctx.fillStyle = textItem.color || "#ffffff";
      ctx.fillText(textItem.text, paddingX, 0);
      ctx.restore();
    });
  }
};
const PHOTOBOOTH_STEPS = [
  { id: 1, title: "Mulai Sesi", meta: "Setup" },
  { id: 2, title: "Capture", meta: "Foto" },
  { id: 3, title: "Edit", meta: "Efek & Strip" },
  { id: 4, title: "Kirim", meta: "Drive" },
];
const PHOTOBOOTH_INITIAL_CAPTURE_DELAY = 3;
const PHOTOBOOTH_NEXT_CAPTURE_DELAY = 3;
const PHOTOBOOTH_INITIAL_READY_MS = 1500;
const PHOTOBOOTH_NEXT_READY_MS = 1500;
const PHOTOBOOTH_FINAL_PREVIEW_MS = 1800;
const PHOTOBOOTH_ADMIN_SETTINGS_KEY = "photobooth_admin_settings";
const PHOTOBOOTH_STRIP_SETTINGS_KEY = "photobooth_strip_settings";
const PHOTOBOOTH_SLOT_COUNTS = [1, 2, 3];
const OUTPUT_COMPRESSION_QUALITIES = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const PHOTO_FILTERS = [
  { id: "none", name: "Normal", css: "" },
  { id: "grayscale", name: "Grayscale", css: "grayscale(1)" },
  { id: "sepia", name: "Sepia", css: "sepia(0.72) saturate(1.08)" },
  { id: "vintage", name: "Vintage", css: "sepia(0.45) contrast(0.9) brightness(1.06)" },
  { id: "noir", name: "Noir", css: "grayscale(1) contrast(1.35)" },
  { id: "cool", name: "Cool", css: "hue-rotate(-10deg) saturate(1.08) brightness(1.02)" },
  { id: "warm", name: "Warm", css: "sepia(0.16) saturate(1.14) brightness(1.04)" },
  { id: "vivid", name: "Vivid", css: "contrast(1.12) saturate(1.32)" },
  { id: "faded", name: "Faded", css: "brightness(1.08) contrast(0.82) saturate(0.78)" },
];
const PHOTO_RESIZE_MODES = [
  { id: "keep", name: "Ukuran Asli" },
  { id: "width", name: "Sesuai Lebar" },
  { id: "height", name: "Sesuai Tinggi" },
  { id: "cover", name: "Pas (Cover)" },
  { id: "contain", name: "Muat (Contain)" },
  { id: "stretch", name: "Regang (Stretch)" },
];
const EDIT_TOOLS = [
  {
    id: "crop",
    name: "Krop",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2v14a2 2 0 0 0 2 2h14" />
        <path d="M18 22V8a2 2 0 0 0-2-2H2" />
      </svg>
    ),
  },
  {
    id: "rotate",
    name: "Rotasi",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    ),
  },
  {
    id: "text",
    name: "Teks",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
  },
];
const CROP_ASPECTS = [
  { id: "free", name: "Bebas", ratio: 0 },
  { id: "square", name: "1:1", ratio: 1 },
  { id: "4:3", name: "4:3", ratio: 4 / 3 },
  { id: "3:2", name: "3:2", ratio: 3 / 2 },
  { id: "16:9", name: "16:9", ratio: 16 / 9 },
  { id: "3:4", name: "3:4", ratio: 3 / 4 },
  { id: "9:16", name: "9:16", ratio: 9 / 16 },
];
const TEXT_CSS_FONTS = {
  arial: "Arial",
  helvetica: "Helvetica",
  verdana: "Verdana",
  georgia: "Georgia",
  times: "Times New Roman",
  impact: "Impact",
  courier: "Courier New",
  comic: "Comic Sans MS",
};
const TEXT_FONT_OPTIONS = [
  { id: "arial", name: "Arial" },
  { id: "helvetica", name: "Helvetica" },
  { id: "verdana", name: "Verdana" },
  { id: "georgia", name: "Georgia" },
  { id: "times", name: "Times New Roman" },
  { id: "impact", name: "Impact" },
  { id: "courier", name: "Courier New" },
  { id: "comic", name: "Comic Sans MS" },
];
const DEFAULT_EDIT_TEXT_DRAFT = {
  text: "",
  size: 5,
  font: "arial",
  color: "#ffffff",
  opacity: 100,
  x: 50,
  y: 50,
  align: "center",
};
const hexToRgba = (hex, opacity) => {
  let color = String(hex || "").replace("#", "").trim();
  if (color.length === 3) {
    color = color.split("").map((channel) => channel + channel).join("");
  }
  if (color.length !== 6) return `rgba(255, 255, 255, ${opacity / 100})`;
  const red = parseInt(color.slice(0, 2), 16);
  const green = parseInt(color.slice(2, 4), 16);
  const blue = parseInt(color.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity / 100})`;
};
const COMPRESS_EDIT_EFFECTS = [
  {
    id: "none",
    name: "Normal",
    filter: "",
  },
  {
    id: "grayscale",
    name: "Grayscale",
    filter: "grayscale(1)",
  },
  {
    id: "sepia",
    name: "Sepia",
    filter: "sepia(0.72) saturate(1.08)",
  },
  {
    id: "bw",
    name: "B&W",
    filter: "grayscale(1) contrast(1.28)",
  },
  {
    id: "vivid",
    name: "Vivid",
    filter: "contrast(1.12) saturate(1.32)",
  },
  {
    id: "cinema",
    name: "Cinema",
    filter: "brightness(0.96) contrast(1.2) saturate(0.9)",
  },
  {
    id: "fade",
    name: "Fade",
    filter: "brightness(1.08) contrast(0.82) saturate(0.78)",
  },
  {
    id: "warm",
    name: "Warm",
    filter: "sepia(0.16) saturate(1.14) brightness(1.04)",
  },
  {
    id: "cool",
    name: "Cool",
    filter: "hue-rotate(-10deg) saturate(1.08) brightness(1.02)",
  },
];
const DEFAULT_COMPRESS_EDIT_ADJUSTMENTS = {
  temperature: 0,
  tint: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
};
const COMPRESS_EDIT_RESIZE_PRESETS = [
  { label: "Original", width: "", height: "" },
  { label: "HD", width: 1280, height: 720 },
  { label: "Full HD", width: 1920, height: 1080 },
  { label: "Square", width: 1080, height: 1080 },
];
const TEXT_OVERLAY_FONTS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Comic Sans MS",
  "Trebuchet MS",
  "Palatino",
];
const TEXT_OVERLAY_POSITIONS = [
  { label: ".", x: 5, y: 5 },
  { label: ".", x: 50, y: 5 },
  { label: ".", x: 95, y: 5 },
  { label: ".", x: 5, y: 50 },
  { label: ".", x: 50, y: 50 },
  { label: ".", x: 95, y: 50 },
  { label: ".", x: 5, y: 95 },
  { label: ".", x: 50, y: 95 },
  { label: ".", x: 95, y: 95 },
];
const getCompressEditMediaKind = (file) => {
  const type = String(file?.type || "");
  const name = String(file?.name || file?.webkitRelativePath || "");
  if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(name)) {
    return "image";
  }
  if (type.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(name)) {
    return "video";
  }
  return "unsupported";
};
const simplifyRatio = (w, h) => {
  if (!w || !h) return "Unknown";
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const common = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w / common)}:${Math.round(h / common)}`;
};
const buildCompressEditPreviewFilter = (adjustments, effectId) => {
  const effect = COMPRESS_EDIT_EFFECTS.find((item) => item.id === effectId);
  const temperature = clampNumber(Number(adjustments.temperature) || 0, -100, 100);
  const tint = clampNumber(Number(adjustments.tint) || 0, -100, 100);
  const brightness = clampNumber(Number(adjustments.brightness) || 100, 0, 200);
  const contrast = clampNumber(Number(adjustments.contrast) || 100, 0, 200);
  const saturation = clampNumber(Number(adjustments.saturation) || 100, 0, 200);
  const temperatureSepia = Math.max(0, temperature) / 260;
  const temperatureHue = temperature < 0 ? temperature / 5 : temperature / 12;
  const tintHue = tint / 3;
  return [
    `brightness(${brightness / 100})`,
    `contrast(${contrast / 100})`,
    `saturate(${saturation / 100})`,
    temperatureSepia ? `sepia(${temperatureSepia})` : "",
    temperatureHue || tintHue ? `hue-rotate(${temperatureHue + tintHue}deg)` : "",
    effect?.filter || "",
  ]
    .filter(Boolean)
    .join(" ");
};
const DEFAULT_PHOTOBOOTH_ADMIN_SETTINGS = {
  stripPhotoCount: 1,
  defaultStripId: "photobooth-strip-1",
  stripSettings: {},
  editEnabled: true,
  autoPrintEnabled: true,
  outputCompressionEnabled: false,
  outputCompressionQuality: 70,
  printerName: "",
  paperSize: "4r",
  doubleStripEnabled: false,
  initialDriveFolderId: "",
  mode: "oto",
};
const CAMERA_VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};
const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));
const STRIP_BASE_WIDTH = 1200;
const STRIP_BASE_HEIGHT = 1800;
const STRIP_PAPER_SIZES = {
  "3r": {
    label: "3R",
    width: STRIP_BASE_WIDTH,
    height: Math.round(STRIP_BASE_WIDTH * (10 / 7)),
    ratioLabel: "7:10",
  },
  "4r": {
    label: "4R",
    width: STRIP_BASE_WIDTH,
    height: STRIP_BASE_HEIGHT,
    ratioLabel: "2:3",
  },
};
const STRIP_PHOTO_ASPECT_RATIO = 16 / 9;
const STRIP_SLOT_WIDTH_BY_COUNT = {
  1: 86,
  2: 84,
  3: 78,
};
const getStripPaperConfig = (paperSize = "4r") =>
  STRIP_PAPER_SIZES[paperSize] || STRIP_PAPER_SIZES["4r"];
const getStripBaseSize = (slotCount = 3, paperSize = "4r") => {
  const paperConfig = getStripPaperConfig(paperSize);

  if (Number(slotCount) === 1) {
    return {
      width: paperConfig.height,
      height: paperConfig.width,
    };
  }

  return {
    width: paperConfig.width,
    height: paperConfig.height,
  };
};
const buildCenteredStripSlots = (
  slotCount = 3,
  paperSize = "4r",
  stripBaseSizeOverride = null
) => {
  const normalizedSlotCount = clampNumber(Math.round(Number(slotCount) || 3), 1, 10);
  const stripBaseSize =
    stripBaseSizeOverride || getStripBaseSize(normalizedSlotCount, paperSize);
  let slotWidth = STRIP_SLOT_WIDTH_BY_COUNT[normalizedSlotCount] || 78;
  // Keep extra poses inside the paper, preserving the photo aspect ratio.
  const maxSlotHeight = (100 - (normalizedSlotCount + 1) * 2) / normalizedSlotCount;
  slotWidth = Math.min(slotWidth, maxSlotHeight * STRIP_PHOTO_ASPECT_RATIO * stripBaseSize.height / stripBaseSize.width);
  const slotHeight =
    ((slotWidth / 100) *
      stripBaseSize.width *
      (1 / STRIP_PHOTO_ASPECT_RATIO) /
      stripBaseSize.height) *
    100;
  const slotGap = (100 - slotHeight * normalizedSlotCount) / (normalizedSlotCount + 1);

  return Array.from({ length: normalizedSlotCount }, (_, index) => ({
    left: (100 - slotWidth) / 2,
    top: slotGap + index * (slotHeight + slotGap),
    width: slotWidth,
    height: slotHeight,
  }));
};
const STRIP_SLOTS = buildCenteredStripSlots(3);
const STRIP_MIN_SLOT_SIZE = 1200;
const STRIP_MAX_RENDER_SCALE = 2;
const getStripSlots = (slotCount = STRIP_SLOTS.length, paperSize = "4r") =>
  buildCenteredStripSlots(slotCount, paperSize);
const getStripBaseWidth = (slotCount = 3, paperSize = "4r") =>
  getStripBaseSize(slotCount, paperSize).width;
const getStripBaseHeight = (slotCount = 3, paperSize = "4r") =>
  getStripBaseSize(slotCount, paperSize).height;
const createEmptyStripMap = (slotCount = 3, filledCount = 0) =>
  Array.from({ length: slotCount }, (_, index) => index < filledCount ? index : null);
const addUrlCacheBust = (url) =>
  url
    ? `${url}${url.includes("?") ? "&" : "?"}preview_v=${Date.now()}`
    : url;
const createEmptyPhotoboothTemplate = (slotCount) => ({
  id: `photobooth-strip-${slotCount}`,
  name: `Strip ${slotCount} Pose`,
  active: true,
  image_url: null,
  slot_count: slotCount,
  pose_count: slotCount,
  slots: [],
  width: null,
  height: null,
});
const getPreferredStripTemplateMode = (template) =>
  template?.active && template.image_url ? "uploaded" : "default";
const normalizePhotoboothTemplates = (data = {}) => {
  const templateEntries = Object.entries(data.templates || {});
  const entries = templateEntries.length
    ? templateEntries
    : (Array.isArray(data.strip_options) ? data.strip_options : []).map(
        (template, index) => [
          String(template?.pose_count || template?.slot_count || index + 1),
          template,
        ]
      );

  return entries.reduce((templates, [key, template]) => {
    const slotCount = Number(
      template?.pose_count || template?.slot_count || key
    );

    if (!Number.isInteger(slotCount) || slotCount < 1) {
      return templates;
    }

    templates[String(slotCount)] = {
      ...createEmptyPhotoboothTemplate(slotCount),
      ...(template || {}),
      id: String(template?.id || `photobooth-strip-${slotCount}`),
      name: String(template?.name || `Strip ${slotCount} Pose`),
      slot_count: slotCount,
      pose_count: slotCount,
      slots: Array.isArray(template?.slots) ? template.slots : [],
    };

    return templates;
  }, {});
};
const normalizePhotoboothStripOptions = (data = {}, templates = {}) => {
  const source = Array.isArray(data.strip_options)
    ? data.strip_options
    : Object.values(templates);

  return source
    .map((template) => {
      const poseCount = Number(
        template?.pose_count || template?.slot_count
      );

      if (!Number.isInteger(poseCount) || poseCount < 1 || poseCount > 10) {
        return null;
      }

      return {
        ...createEmptyPhotoboothTemplate(poseCount),
        ...(template || {}),
        id: String(template?.id || `photobooth-strip-${poseCount}`),
        name: String(template?.name || `Strip ${poseCount} Pose`),
        image_url: template?.image_url || null,
        active: template?.active !== false,
        slot_count: Number(template?.slot_count) || poseCount,
        pose_count: poseCount,
        slots: Array.isArray(template?.slots) ? template.slots : [],
      };
    })
    .filter(Boolean);
};
const resolvePhotoboothStripSelection = (options, selectedId, defaultId) =>
  options.find((strip) => strip.active !== false && strip.id === selectedId) ||
  options.find((strip) => strip.active !== false && strip.id === defaultId) ||
  options.find((strip) => strip.active !== false) || null;
const loadPhotoboothStripCache = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PHOTOBOOTH_STRIP_SETTINGS_KEY) || "null");
    if (Array.isArray(saved?.strip_options) && saved.strip_options.length) {
      const options = normalizePhotoboothStripOptions(saved);
      if (options.length) return { ...saved, strip_options: options };
    }
  } catch {
    // A damaged cache should not prevent the booth from opening.
  }
  return { strip_options: PHOTOBOOTH_SLOT_COUNTS.map(createEmptyPhotoboothTemplate), pending_sync: false };
};
const createQrCodeUrl = (value) =>
  value
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(value)}`
    : null;
const normalizeCompressionQuality = (value) => {
  const quality = Number(value);

  return OUTPUT_COMPRESSION_QUALITIES.includes(quality) ? quality : 70;
};
const normalizeWatermarkSettings = (settings = {}) => {
  if (!settings.portrait && !settings.landscape) {
    const normalized = {
      ...DEFAULT_WATERMARK_SETTINGS,
      ...settings,
    };

    return {
      landscape: normalized,
      portrait: {
        ...normalized,
        position: "bottom-center",
      },
    };
  }

  return {
    landscape: {
      ...DEFAULT_WATERMARK_PROFILES.landscape,
      ...(settings.landscape || {}),
    },
    portrait: {
      ...DEFAULT_WATERMARK_PROFILES.portrait,
      ...(settings.portrait || {}),
    },
  };
};

const loadPhotoboothAdminSettings = () => {
  try {
    const saved = window.localStorage.getItem(PHOTOBOOTH_ADMIN_SETTINGS_KEY);

    if (!saved) {
      return DEFAULT_PHOTOBOOTH_ADMIN_SETTINGS;
    }

    const parsed = JSON.parse(saved);
    const stripPhotoCount = Number(
      parsed.stripPhotoCount || parsed.stripCopies
    );

    return {
      stripPhotoCount: Number.isInteger(stripPhotoCount) && stripPhotoCount >= 1 && stripPhotoCount <= 10
        ? stripPhotoCount
        : 1,
      defaultStripId: String(parsed.defaultStripId || "photobooth-strip-1"),
      stripSettings: parsed.stripSettings && typeof parsed.stripSettings === "object" ? parsed.stripSettings : {},
      editEnabled: parsed.editEnabled !== false,
      autoPrintEnabled: parsed.autoPrintEnabled !== false,
      outputCompressionEnabled: parsed.outputCompressionEnabled === true,
      outputCompressionQuality: normalizeCompressionQuality(
        parsed.outputCompressionQuality
      ),
      printerName: String(parsed.printerName || ""),
      paperSize: ["3r", "4r"].includes(parsed.paperSize) ? parsed.paperSize : "4r",
      doubleStripEnabled: parsed.doubleStripEnabled === true,
      initialDriveFolderId: String(parsed.initialDriveFolderId || "").trim(),
      mode: ["oto", "admin"].includes(parsed.mode) ? parsed.mode : "oto",
      stripTheme: ["white", "dark", "pink", "blue", "cream"].includes(parsed.stripTheme)
        ? parsed.stripTheme
        : "white",
    };
  } catch {
    return DEFAULT_PHOTOBOOTH_ADMIN_SETTINGS;
  }
};

const normalizeOutputSettingsFromBackend = (settings = {}) => ({
  outputCompressionEnabled: settings.compression_enabled === true,
  outputCompressionQuality: normalizeCompressionQuality(
    settings.compression_quality
  ),
});

const mergeWatermarkData = (current, data, uploadOrientation = null) => {
  const imageUrls = {
    ...(current?.image_urls || {}),
  };

  if (data?.image_urls) {
    ["landscape", "portrait"].forEach((orientation) => {
      if (data.image_urls[orientation]) {
        imageUrls[orientation] = data.image_urls[orientation];
      } else if (!(orientation in imageUrls)) {
        imageUrls[orientation] = null;
      }
    });
  }

  if (uploadOrientation && data?.image_url) {
    imageUrls[uploadOrientation] = data.image_url;
  }

  const imageUrl =
    data?.image_url ||
    imageUrls.landscape ||
    imageUrls.portrait ||
    current?.image_url ||
    null;

  return {
    ...(current || {}),
    ...(data || {}),
    active: Boolean(imageUrls.landscape || imageUrls.portrait || imageUrl),
    image_url: imageUrl,
    image_urls: imageUrls,
  };
};

function App() {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const watchSettingsRevisionRef = useRef(0);
  const watchFolderDraftRef = useRef(null);
  const driveFolderDraftRef = useRef(null);
  const editFileInputRef = useRef(null);
  const editFolderInputRef = useRef(null);
  const photoboothTemplateInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraStartIdRef = useRef(0);
  const retryTimer = useRef(null);
  const backendReadyRef = useRef(false);
  const stripGestureRef = useRef(null);
  const stripPhotoWasDraggedRef = useRef(false);
  const stripDragRef = useRef(null);
const stripCarouselRef = useRef(null);
const stripCarouselSettleRef = useRef(null);
const isDraggingCarouselRef = useRef(false);
const carouselStartXRef = useRef(0);
const carouselScrollLeftRef = useRef(0);
const hasMovedCarouselRef = useRef(false);
  const captureStripScrollRef = useRef(null);
  const autoCaptureTimeoutRef = useRef(null);
  const autoCaptureCountdownRef = useRef(null);
  const autoCaptureReadyRef = useRef(null);
  const watermarkSettingsSaveId = useRef(0);
  const watermarkSettingsSaveRef = useRef({
    inFlight: false,
    pending: null,
    timer: null,
  });
  const outputSettingsLoadedRef = useRef(false);
  const lastStripResultRef = useRef(null);
  const photoboothFinalBase64Ref = useRef(null);
  const photoboothCompositionKeyRef = useRef("");
  const photoboothFinalizationLockRef = useRef(false);
  const lastPrintedStripRef = useRef(null);
  const previewContainerRef = useRef(null);
  const currentDoodlePathRef = useRef([]);
  const currentDoodleSideRef = useRef(0);

  const [adminUser, setAdminUser] = useState(null);
  const [isVerifyingGoogleToken, setIsVerifyingGoogleToken] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState("");
  const [startupComplete, setStartupComplete] = useState(false);
  const [isRunningStartup, setIsRunningStartup] = useState(false);
  const [startupAttempted, setStartupAttempted] = useState(false);
  const [startupChecks, setStartupChecks] = useState([]);
  const [startupError, setStartupError] = useState("");
  const [driveAuthStatus, setDriveAuthStatus] = useState(null);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [driveAuthError, setDriveAuthError] = useState("");
  const driveAuthAttemptRef = useRef(null);
  const driveAuthStatusTimerRef = useRef(null);

  useEffect(() => () => {
    driveAuthAttemptRef.current?.abort();
    driveAuthAttemptRef.current = null;
    window.clearTimeout(driveAuthStatusTimerRef.current);
  }, []);
  const [printers, setPrinters] = useState([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isPrintingStrip, setIsPrintingStrip] = useState(false);
  const [printError, setPrintError] = useState("");
  const [activeView, setActiveView] = useState("photobooth");
  const [adminStep, setAdminStep] = useState(1);
  const [editorCatalog, setEditorCatalog] = useState(null);
  const [editorCatalogError, setEditorCatalogError] = useState("");
  const [editorCatalogReload, setEditorCatalogReload] = useState(0);
  const editorCatalogRevisionRef = useRef(0);
  const publishedEditorItems = useMemo(() => visibleEditorItems(editorCatalog || { stickers: [], texts: [] }), [editorCatalog]);
  const [photoboothStep, setPhotoboothStep] = useState(1);
  const [isCapturing, setIsCapturing] = useState(false);
  const [autoCaptureCountdown, setAutoCaptureCountdown] = useState(null);
  const [autoCaptureLabel, setAutoCaptureLabel] = useState("");
  const [autoCaptureReady, setAutoCaptureReady] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingWatermark, setIsUploadingWatermark] = useState(false);
  const [isClearingQueue, setIsClearingQueue] = useState(false);
  const [isCleaningManualUploads, setIsCleaningManualUploads] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [streamVersion, setStreamVersion] = useState(Date.now());
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPreviewReady, setCameraPreviewReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [activeCameraLabel, setActiveCameraLabel] = useState("");
  const [cameraPreviewSource, setCameraPreviewSource] = useState("none");
  const [status, setStatus] = useState("Menunggu kamera...");
  const [captures, setCaptures] = useState([]);
  const [photoQueue, setPhotoQueue] = useState([]);
  const [watermark, setWatermark] = useState(null);
  const [photoboothTemplate, setPhotoboothTemplate] = useState(null);
  const [photoboothTemplates, setPhotoboothTemplates] = useState({});
  const [photoboothStripOptions, setPhotoboothStripOptions] = useState(
    () => loadPhotoboothStripCache().strip_options
  );
  const [adminEditingStripId, setAdminEditingStripId] = useState(null);
  const [adminStripTab, setAdminStripTab] = useState("upload");
  const [adminStripDraft, setAdminStripDraft] = useState({ name: "", pose_count: 1, active: true });
  const [adminNewStripOpen, setAdminNewStripOpen] = useState(false);
  const [adminNewStripName, setAdminNewStripName] = useState("");
  const [adminNewStripPoseCount, setAdminNewStripPoseCount] = useState(4);
  const [adminNewSlotOpen, setAdminNewSlotOpen] = useState(false);
  const [adminNewSlotCount, setAdminNewSlotCount] = useState(4);
  const stripSettingsSaveQueueRef = useRef(Promise.resolve());
  const stripSettingsRevisionRef = useRef(0);
  const stripManagementRef = useRef(null);
  const [selectedPhotoboothStrip, setSelectedPhotoboothStrip] = useState(null);
  const selectedPhotoboothStripRef = useRef(selectedPhotoboothStrip);
  selectedPhotoboothStripRef.current = selectedPhotoboothStrip;
  const [photoboothTemplateOverlayUrl, setPhotoboothTemplateOverlayUrl] =
    useState(null);
  const [stripTemplateMode, setStripTemplateMode] = useState("default");
  const [pendingPhotoboothTemplateFile, setPendingPhotoboothTemplateFile] =
    useState(null);
  const [photoboothTemplateSlots, setPhotoboothTemplateSlots] = useState(
    STRIP_SLOTS
  );
  const [photoboothEditMode, setPhotoboothEditMode] = useState("photo");
  const [selectedEditPhotoIndex, setSelectedEditPhotoIndex] = useState(0);
  const [draftPhotoEffect, setDraftPhotoEffect] = useState("natural");
  const [photoEffectMap, setPhotoEffectMap] = useState(
    ["natural", "natural", "natural", "natural"]
  );
  const [slotPhotoMap, setSlotPhotoMap] = useState(createEmptyStripMap);
  const [draggingStripPhoto, setDraggingStripPhoto] = useState(null);
  const [photoboothEmail, setPhotoboothEmail] = useState("");
  const [isUploadingPhotoboothDrive, setIsUploadingPhotoboothDrive] = useState(false);
  const [photoboothDriveResult, setPhotoboothDriveResult] = useState(null);
  const [photoboothFinalPreviewUrl, setPhotoboothFinalPreviewUrl] = useState(null);
  const [photoboothFinalComposite, setPhotoboothFinalComposite] = useState(null);
  const [photoboothGifAssets, setPhotoboothGifAssets] = useState([]);
  const [photoboothGifErrors, setPhotoboothGifErrors] = useState([]);
  const [isPreparingPhotoboothGif, setIsPreparingPhotoboothGif] = useState(false);
  const photoboothGifAssetsRef = useRef([]);
  const photoboothGifRevisionRef = useRef(0);
  const [photoboothDeliveryStatus, setPhotoboothDeliveryStatus] = useState({
    drive: "idle",
    printer: "idle",
  });
  const [isFinalizingPhotobooth, setIsFinalizingPhotobooth] = useState(false);
  const [isRenderingPhotoboothPreview, setIsRenderingPhotoboothPreview] = useState(false);
  const [photoboothAdminSettings, setPhotoboothAdminSettings] = useState(() => {
    const settings = loadPhotoboothAdminSettings();
    const cache = loadPhotoboothStripCache();
    return { ...settings, defaultStripId: cache.default_strip_id ?? settings.defaultStripId,
      stripSettings: cache.strip_settings || settings.stripSettings || {} };
  });
  stripManagementRef.current = { options: photoboothStripOptions, settings: photoboothAdminSettings };
  const [stripSelectionStage, setStripSelectionStage] = useState('selectingStripType');
  const [selectedTemplateSlot, setSelectedTemplateSlot] = useState(0);
  const [stripDecorations, setStripDecorations] = useState([]);
  const decorationRevisionRef = useRef(0);
  const [stripTexts, setStripTexts] = useState([]);
  const [stripDoodles, setStripDoodles] = useState([]);
  const [activeStudioSide, setActiveStudioSide] = useState(0);
  const [editStudioTab, setEditStudioTab] = useState("filter");
  const [studioFilterScope, setStudioFilterScope] = useState("all");
  const [activeDoodleColor, setActiveDoodleColor] = useState("#ff4d6d");
  const [activeDoodleSize, setActiveDoodleSize] = useState(3);
  const [activeDoodleBrush, setActiveDoodleBrush] = useState("pencil");
  const [studioFrameColor, setStudioFrameColor] = useState("#f7f7f2");
  const [pendingSwapSlot, setPendingSwapSlot] = useState(null);
  const [selectedDecoration, setSelectedDecoration] = useState(null);
  const [isDoodling, setIsDoodling] = useState(false);

  // Reset selection stage when entering step 2
  useEffect(() => {
    if (photoboothStep === 2) {
      setStripSelectionStage('selectingStripType');
    }
  }, [photoboothStep]);
  const [templatePhotoAdjustments, setTemplatePhotoAdjustments] = useState(
    DEFAULT_TEMPLATE_SLOTS.map(() => ({ ...DEFAULT_SLOT_ADJUSTMENT }))
  );
  const [photoboothImageFitRatios, setPhotoboothImageFitRatios] = useState({});
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  const [lastDetectedSlot, setLastDetectedSlot] = useState(null);
  const [cameraWidth, setCameraWidth] = useState(
    () => Number(window.localStorage.getItem("photobooth_camera_width")) || 1280
  );
  const [cameraHeight, setCameraHeight] = useState(
    () => Number(window.localStorage.getItem("photobooth_camera_height")) || 720
  );
  const [cameraFps, setCameraFps] = useState(
    () => Number(window.localStorage.getItem("photobooth_camera_fps")) || 30
  );
  const [cameraBrightness, setCameraBrightness] = useState(() => {
    const v = Number(window.localStorage.getItem("photobooth_cam_brightness"));
    return isNaN(v) ? 0 : v;
  });
  const [cameraContrast, setCameraContrast] = useState(() => {
    const v = Number(window.localStorage.getItem("photobooth_cam_contrast"));
    return isNaN(v) ? 0 : v;
  });
  const [cameraSaturation, setCameraSaturation] = useState(() => {
    const v = Number(window.localStorage.getItem("photobooth_cam_saturation"));
    return isNaN(v) ? 0 : v;
  });
  const [cameraSharpness, setCameraSharpness] = useState(() => {
    const v = Number(window.localStorage.getItem("photobooth_cam_sharpness"));
    return isNaN(v) ? 0 : v;
  });
  const [cameraExposureComp, setCameraExposureComp] = useState(() => {
    const v = Number(window.localStorage.getItem("photobooth_cam_exposure"));
    return isNaN(v) ? 0 : v;
  });
  const [cameraWhiteBalance, setCameraWhiteBalance] = useState(() => {
    const v = Number(window.localStorage.getItem("photobooth_cam_wb"));
    return Number.isFinite(v) && v >= 2500 && v <= 10000 ? v : 5600;
  });
  const [watermarkSettings, setWatermarkSettings] = useState(
    DEFAULT_WATERMARK_PROFILES
  );
  const [watermarkOrientation, setWatermarkOrientation] = useState("landscape");
  const [previewOrientation, setPreviewOrientation] = useState("landscape");
  const [queue, setQueue] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadInputMode, setUploadInputMode] = useState("user");
  const [editUploadInputMode, setEditUploadInputMode] = useState("user");
  const [autoPreviewUrl, setAutoPreviewUrl] = useState(null);
  const [autoPreviewInfo, setAutoPreviewInfo] = useState(null);
  const [autoPreviewFiles, setAutoPreviewFiles] = useState([]);
  const [uploadStep, setUploadStep] = useState(1);
  const [editUploadStep, setEditUploadStep] = useState(1);
  const [compressEditStep, setCompressEditStep] = useState(1);
  const [compressEditFiles, setCompressEditFiles] = useState([]);
  const [compressEditInputMode, setCompressEditInputMode] = useState("file");
  const [isCompressEditDragging, setIsCompressEditDragging] = useState(false);
  const [compressEditSelectedIndex, setCompressEditSelectedIndex] = useState(0);
  const [compressEditPreviewUrl, setCompressEditPreviewUrl] = useState("");
  const [compressEditCompression, setCompressEditCompression] = useState(70);
  const [compressEditResizeEnabled, setCompressEditResizeEnabled] = useState(false);
  const [compressEditResizeWidth, setCompressEditResizeWidth] = useState("");
  const [compressEditResizeHeight, setCompressEditResizeHeight] = useState("");
  const [compressEditOutputFormat, setCompressEditOutputFormat] = useState("original");
  const [compressEditAdjustments, setCompressEditAdjustments] = useState(
    DEFAULT_COMPRESS_EDIT_ADJUSTMENTS
  );
  const [compressEditEffect, setCompressEditEffect] = useState("none");
  const [compressEditTextOverlays, setCompressEditTextOverlays] = useState([]);
  const [compressEditSelectedTextIndex, setCompressEditSelectedTextIndex] = useState(-1);
  const [compressEditTextInput, setCompressEditTextInput] = useState("");
  const [compressEditImageOverlays, setCompressEditImageOverlays] = useState([]);
  const [compressEditSelectedImageIndex, setCompressEditSelectedImageIndex] = useState(-1);
  const [compressEditActiveTool, setCompressEditActiveTool] = useState("compress");
  const [compressEditRemovingBg, setCompressEditRemovingBg] = useState(false);
  const [compressEditEraserActive, setCompressEditEraserActive] = useState(false);
  const [compressEditEraserBrushSize, setCompressEditEraserBrushSize] = useState(20);
  const [compressEditProcessedFile, setCompressEditProcessedFile] = useState(null);
  const [compressEditRotation, setCompressEditRotation] = useState(0);
  const [compressEditPreviewDimensions, setCompressEditPreviewDimensions] = useState(null);
  const [compressEditHistory, setCompressEditHistory] = useState([]);
  const [compressEditHistoryIndex, setCompressEditHistoryIndex] = useState(-1);
  const [editPreviewIndex, setEditPreviewIndex] = useState(0);
  const [editPreviewDisplayIndex, setEditPreviewDisplayIndex] = useState(0);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [editSelectedFiles, setEditSelectedFiles] = useState([]);
  const [editEnhance, setEditEnhance] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpness: 0,
  });
  const [editFilter, setEditFilter] = useState("none");
  const [editResizeMode, setEditResizeMode] = useState("keep");
  const [editResizeWidth, setEditResizeWidth] = useState("");
  const [editResizeHeight, setEditResizeHeight] = useState("");
  const [editPreviewNaturalSize, setEditPreviewNaturalSize] = useState(null);

  const editThumbUrls = useMemo(
    () => editSelectedFiles.map((file) => URL.createObjectURL(file)),
    [editSelectedFiles]
  );

  useEffect(() => {
    return () => {
      editThumbUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [editThumbUrls]);

  const [editTool, setEditTool] = useState(null);
  const [editFocusMode, setEditFocusMode] = useState(false);
  const [editLeftOpen, setEditLeftOpen] = useState(false);
  const [editRightOpen, setEditRightOpen] = useState(false);
  const [editPreviewView, setEditPreviewView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const editPanDragRef = useRef(null);

  const [editRotation, setEditRotation] = useState(0);
  const [editFlipH, setEditFlipH] = useState(false);
  const [editFlipV, setEditFlipV] = useState(false);
  const [editCrop, setEditCrop] = useState(null);
  const [editCropAspect, setEditCropAspect] = useState("free");
  const [editTextOverlays, setEditTextOverlays] = useState([]);
  const [editTextDraft, setEditTextDraft] = useState(DEFAULT_EDIT_TEXT_DRAFT);
  const [editSelectedTextIndex, setEditSelectedTextIndex] = useState(-1);
  const [editTemperature, setEditTemperature] = useState(0);
  const [editTint, setEditTint] = useState(0);
  const [editVignette, setEditVignette] = useState(0);
  const editPreviewCanvasRef = useRef(null);
  const editCropWrapRef = useRef(null);
  const editLoadedImageRef = useRef(null);
  const editLoadedFileRef = useRef(null);
  const editCropDragRef = useRef(null);

  const editRot = ((editRotation % 360) + 360) % 360;
  const editRotSwap = editRot === 90 || editRot === 270;
  const editNaturalW = editPreviewNaturalSize?.width || 1;
  const editNaturalH = editPreviewNaturalSize?.height || 1;
  const editRotatedW = editRotSwap ? editNaturalH : editNaturalW;
  const editRotatedH = editRotSwap ? editNaturalW : editNaturalH;
  const editAppliedCrop = editCrop || { x: 0, y: 0, w: 1, h: 1 };
  const editCropW = Math.max(0.01, Math.min(1, editAppliedCrop.w));
  const editCropH = Math.max(0.01, Math.min(1, editAppliedCrop.h));
  const editCropX = Math.min(Math.max(0, editAppliedCrop.x), 1 - editCropW);
  const editCropY = Math.min(Math.max(0, editAppliedCrop.y), 1 - editCropH);
  const editFinalW = Math.max(1, Math.round(editRotatedW * editCropW));
  const editFinalH = Math.max(1, Math.round(editRotatedH * editCropH));
  const editPreviewWrapW = editTool === "crop" ? editRotatedW : editFinalW;
  const editPreviewWrapH = editTool === "crop" ? editRotatedH : editFinalH;

  useEffect(() => {
    const canvas = editPreviewCanvasRef.current;
    const file = editSelectedFiles[editPreviewDisplayIndex];
    if (!canvas || !file) return;

    const draw = () => {
      const context = canvas.getContext("2d");
      const image = editLoadedImageRef.current;
      if (!context || !image) return;
      const imageW = image.naturalWidth || image.width;
      const imageH = image.naturalHeight || image.height;
      const swap = editRot === 90 || editRot === 270;
      const rotatedW = swap ? imageH : imageW;
      const rotatedH = swap ? imageW : imageH;
      const cropW = Math.max(0.01, Math.min(1, editCropW));
      const cropH = Math.max(0.01, Math.min(1, editCropH));
      const cropX = Math.min(Math.max(0, editCropX), 1 - cropW);
      const cropY = Math.min(Math.max(0, editCropY), 1 - cropH);
      const showFull = editTool === "crop";
      const boxW = Math.max(1, Math.round(rotatedW * (showFull ? 1 : cropW)));
      const boxH = Math.max(1, Math.round(rotatedH * (showFull ? 1 : cropH)));
      const maxDimension = 1400;
      const scale = Math.min(1, maxDimension / Math.max(boxW, boxH));
      canvas.width = Math.max(1, Math.round(boxW * scale));
      canvas.height = Math.max(1, Math.round(boxH * scale));

      const fullScale = Math.min(1, 1600 / Math.max(rotatedW, rotatedH));
      const full = document.createElement("canvas");
      full.width = Math.max(1, Math.round(rotatedW * fullScale));
      full.height = Math.max(1, Math.round(rotatedH * fullScale));
      const fullContext = full.getContext("2d");
      if (editRot === 90) {
        fullContext.translate(full.width, 0);
        fullContext.rotate(Math.PI / 2);
      } else if (editRot === 180) {
        fullContext.translate(full.width, full.height);
        fullContext.rotate(Math.PI);
      } else if (editRot === 270) {
        fullContext.translate(0, full.height);
        fullContext.rotate((3 * Math.PI) / 2);
      }
      fullContext.scale(editFlipH ? -1 : 1, editFlipV ? -1 : 1);
      fullContext.drawImage(image, 0, 0, full.width, full.height);

      const sourceX = (showFull ? 0 : cropX) * full.width;
      const sourceY = (showFull ? 0 : cropY) * full.height;
      const sourceW = full.width * (showFull ? 1 : cropW);
      const sourceH = full.height * (showFull ? 1 : cropH);
      context.imageSmoothingEnabled = true;
      context.drawImage(full, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height);

      if (editTemperature > 0) {
        context.fillStyle = `rgba(255, 120, 20, ${(editTemperature / 100) * 0.25})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
      } else if (editTemperature < 0) {
        context.fillStyle = `rgba(40, 120, 255, ${(-editTemperature / 100) * 0.25})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (editTint > 0) {
        context.fillStyle = `rgba(255, 0, 180, ${(editTint / 100) * 0.12})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
      } else if (editTint < 0) {
        context.fillStyle = `rgba(0, 255, 80, ${(-editTint / 100) * 0.12})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (editVignette > 0) {
        const gradient = context.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          Math.min(canvas.width, canvas.height) * 0.3,
          canvas.width / 2,
          canvas.height / 2,
          Math.max(canvas.width, canvas.height) * 0.72
        );
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, `rgba(0,0,0,${(editVignette / 100) * 0.75})`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      context.textBaseline = "middle";
      const minDimension = Math.min(canvas.width, canvas.height);
      editTextOverlays.forEach((overlay) => {
        if (!overlay.text) return;
        const fontSize = Math.max(8, Math.round(minDimension * (overlay.size / 100)));
        context.font = `${fontSize}px ${TEXT_CSS_FONTS[overlay.font] || TEXT_CSS_FONTS.arial}`;
        context.textAlign = overlay.align || "center";
        context.fillStyle = hexToRgba(overlay.color, overlay.opacity);
        context.fillText(
          overlay.text,
          (overlay.x / 100) * canvas.width,
          (overlay.y / 100) * canvas.height
        );
      });
      if (editTextDraft.text.trim()) {
        const fontSize = Math.max(8, Math.round(minDimension * (editTextDraft.size / 100)));
        context.font = `${fontSize}px ${TEXT_CSS_FONTS[editTextDraft.font] || TEXT_CSS_FONTS.arial}`;
        context.textAlign = editTextDraft.align || "center";
        context.fillStyle = hexToRgba(editTextDraft.color, Math.max(20, editTextDraft.opacity / 2));
        context.fillText(
          editTextDraft.text,
          (editTextDraft.x / 100) * canvas.width,
          (editTextDraft.y / 100) * canvas.height
        );
      }
    };

    if (editLoadedFileRef.current === file && editLoadedImageRef.current) {
      draw();
      return;
    }
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const loader = new window.Image();
    loader.onload = () => {
      if (cancelled) return;
      editLoadedImageRef.current = loader;
      editLoadedFileRef.current = file;
      setEditPreviewNaturalSize((current) => {
        if (
          current &&
          current.width === loader.naturalWidth &&
          current.height === loader.naturalHeight
        ) {
          return current;
        }
        return { width: loader.naturalWidth, height: loader.naturalHeight };
      });
      draw();
    };
    loader.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [
    editSelectedFiles,
    editPreviewDisplayIndex,
    editUploadStep,
    editRot,
    editFlipH,
    editFlipV,
    editCropW,
    editCropH,
    editCropX,
    editCropY,
    editTool,
    editVignette,
    editTextOverlays,
    editTextDraft,
    editTemperature,
    editTint,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setEditPreviewDisplayIndex(editPreviewIndex), 110);
    return () => clearTimeout(timer);
  }, [editPreviewIndex]);

  useEffect(() => {
    setEditPreviewView({ zoom: 1, pan: { x: 0, y: 0 } });
  }, [editPreviewDisplayIndex]);

  const handleEditRotateRight = () => {
    setEditCrop(null);
    setEditRotation((current) => (current + 90) % 360);
  };
  const handleEditRotateLeft = () => {
    setEditCrop(null);
    setEditRotation((current) => (current + 270) % 360);
  };
  const handleEditFlipH = () => {
    setEditCrop(null);
    setEditFlipH((current) => !current);
  };
  const handleEditFlipV = () => {
    setEditCrop(null);
    setEditFlipV((current) => !current);
  };

  const startEditCropDrag = (mode) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    editCropDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop: { x: editCropX, y: editCropY, w: editCropW, h: editCropH },
    };
  };

  const onEditCropPointerMove = (event) => {
    const drag = editCropDragRef.current;
    const wrapper = editCropWrapRef.current;
    if (!drag || !wrapper) return;
    const bounds = wrapper.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const dx = (event.clientX - drag.startX) / bounds.width;
    const dy = (event.clientY - drag.startY) / bounds.height;
    const crop = drag.crop;
    const aspectId = editCropAspect;
    const aspect = CROP_ASPECTS.find((item) => item.id === aspectId)?.ratio || 0;

    let next;
    if (drag.mode === "move") {
      const w = crop.w;
      const h = crop.h;
      const x = Math.min(Math.max(0, crop.x + dx), 1 - w);
      const y = Math.min(Math.max(0, crop.y + dy), 1 - h);
      next = { x, y, w, h };
    } else {
      const hasEast = drag.mode === "tr" || drag.mode === "br";
      const hasSouth = drag.mode === "bl" || drag.mode === "br";
      const anchorX = hasEast ? crop.x : crop.x + crop.w;
      const anchorY = hasSouth ? crop.y : crop.y + crop.h;
      let pointerX = hasEast ? crop.x + crop.w + dx : crop.x + dx;
      let pointerY = hasSouth ? crop.y + crop.h + dy : crop.y + dy;
      let boxW = Math.max(0.02, Math.abs(pointerX - anchorX));
      let boxH = Math.max(0.02, Math.abs(pointerY - anchorY));
      if (aspect > 0) {
        if (boxW / boxH > aspect) {
          boxW = boxH * aspect;
        } else {
          boxH = boxW / aspect;
        }
      }
      let x = pointerX < anchorX ? anchorX - boxW : anchorX;
      let y = pointerY < anchorY ? anchorY - boxH : anchorY;
      x = Math.min(Math.max(0, x), 1 - boxW);
      y = Math.min(Math.max(0, y), 1 - boxH);
      next = { x, y, w: boxW, h: boxH };
    }
    setEditCrop(next);
  };

  const endEditCropDrag = () => {
    editCropDragRef.current = null;
  };

  const clampEditPreviewPan = (zoom, x, y) => {
    const wrap = editCropWrapRef.current;
    if (zoom <= 1) return { x: 0, y: 0 };
    if (!wrap) return { x, y };
    const fw = wrap.clientWidth;
    const fh = wrap.clientHeight;
    const mx = fw * (zoom - 1);
    const my = fh * (zoom - 1);
    return { x: Math.min(0, Math.max(-mx, x)), y: Math.min(0, Math.max(-my, y)) };
  };

  const setEditPreviewZoom = (next) => {
    setEditPreviewView((v) => {
      const z = Math.min(2, Math.max(0.5, next));
      const wrap = editCropWrapRef.current;
      const fw = wrap ? wrap.clientWidth : 0;
      const fh = wrap ? wrap.clientHeight : 0;
      const pan = clampEditPreviewPan(z, v.pan.x + (fw / 2) * (v.zoom - z), v.pan.y + (fh / 2) * (v.zoom - z));
      return { zoom: z, pan };
    });
  };

  const onEditPreviewWheel = (event) => {
    const wrap = editCropWrapRef.current;
    if (!wrap) return;
    if (event.ctrlKey) {
      const rect = wrap.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      const fw = wrap.clientWidth;
      const fh = wrap.clientHeight;
      const factor = Math.pow(1.2, -event.deltaY / 100);
      setEditPreviewView((v) => {
        const z2 = Math.min(2, Math.max(0.5, v.zoom * factor));
        if (z2 >= v.zoom) {
          const k = z2 / v.zoom;
          const pan = clampEditPreviewPan(z2, cx - (cx - v.pan.x) * k, cy - (cy - v.pan.y) * k);
          return { zoom: z2, pan };
        }
        const pan = clampEditPreviewPan(z2, (fw / 2) * (1 - z2), (fh / 2) * (1 - z2));
        return { zoom: z2, pan };
      });
    } else {
      setEditPreviewView((v) => ({
        zoom: v.zoom,
        pan: clampEditPreviewPan(v.zoom, v.pan.x - event.deltaX, v.pan.y - event.deltaY),
      }));
    }
  };

  const startEditPreviewPan = (event) => {
    if (editTool === "crop" || editPreviewView.zoom <= 1) return;
    event.preventDefault();
    editPanDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: editPreviewView.pan.x,
      panY: editPreviewView.pan.y,
    };
  };

  const onEditPreviewPanMove = (event) => {
    if (!editPanDragRef.current) return;
    const d = editPanDragRef.current;
    setEditPreviewView((v) => ({
      zoom: v.zoom,
      pan: clampEditPreviewPan(v.zoom, d.panX + (event.clientX - d.startX), d.panY + (event.clientY - d.startY)),
    }));
  };

  const endEditPreviewPan = () => {
    editPanDragRef.current = null;
  };

  const applyEditCropAspect = (aspectId) => {
    setEditCropAspect(aspectId);
    if (aspectId === "free") return;
    const aspect = CROP_ASPECTS.find((item) => item.id === aspectId)?.ratio || 0;
    if (aspect <= 0) return;
    let w = editCropW;
    let h = editCropH;
    if (w / h > aspect) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
    w = Math.min(w, 1);
    h = Math.min(h, 1);
    const x = Math.min(Math.max(0, editCropX), 1 - w);
    const y = Math.min(Math.max(0, editCropY), 1 - h);
    setEditCrop({ x, y, w, h });
  };

  const addEditTextOverlay = () => {
    const text = editTextDraft.text.trim();
    if (!text) return;
    setEditTextOverlays((current) => [...current, { ...editTextDraft, text }]);
    setEditTextDraft(DEFAULT_EDIT_TEXT_DRAFT);
  };

  const removeEditTextOverlay = (index) => {
    setEditTextOverlays((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (editSelectedTextIndex === index) {
      setEditSelectedTextIndex(-1);
    } else if (editSelectedTextIndex > index) {
      setEditSelectedTextIndex(editSelectedTextIndex - 1);
    }
  };

  const loadEditTextOverlay = (index) => {
    const overlay = editTextOverlays[index];
    if (!overlay) return;
    setEditTextDraft({
      text: overlay.text,
      size: overlay.size,
      font: overlay.font,
      color: overlay.color,
      opacity: overlay.opacity,
      x: overlay.x,
      y: overlay.y,
      align: overlay.align,
    });
    setEditTextOverlays((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setEditSelectedTextIndex(-1);
  };
  const [watchFolderPath, setWatchFolderPath] = useState("");
  const [activeWatchFolder, setActiveWatchFolder] = useState(null);
  const [isSavingWatchFolder, setIsSavingWatchFolder] = useState(false);
  const [isStoppingWatchFolder, setIsStoppingWatchFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditDragging, setIsEditDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    total: 0,
    queueIds: [],
    files: [],
    source: null,
  });
  const photoboothPhotoCount = photoboothAdminSettings.stripPhotoCount || 1;
  const visiblePhotoboothStripOptions = photoboothStripOptions.filter((strip) => strip.active !== false);
  const adminEditingStrip = photoboothStripOptions.find((strip) => strip.id === adminEditingStripId) || photoboothStripOptions[0];
  const adminStripPrintSettings = photoboothAdminSettings.stripSettings?.[adminEditingStrip?.id] || {
    paper_size: photoboothAdminSettings.paperSize || "4r",
    double_strip_enabled: photoboothAdminSettings.doubleStripEnabled === true,
  };
  const adminSlotCounts = [...new Set([...PHOTOBOOTH_SLOT_COUNTS, ...photoboothStripOptions.map((strip) => strip.slot_count)])].sort((a, b) => a - b);
  const isOtoPhotoboothMode = (photoboothAdminSettings.mode || "oto") === "oto";
  const photoboothInitialDriveFolderId =
    photoboothAdminSettings.initialDriveFolderId.trim();
  const photoboothDriveConfigured = Boolean(photoboothInitialDriveFolderId);
  const driveAuthReady = isDriveAuthReady(driveAuthStatus);
  const hasBlockingStartupIssue = startupChecks.some(
    (check) => check.status === "error" && check.required
  );
  const selectedStripPrintSettings = photoboothAdminSettings.stripSettings?.[selectedPhotoboothStrip?.id];
  const activePaperSize = selectedStripPrintSettings?.paper_size || photoboothAdminSettings.paperSize || "4r";
  const activePaperConfig = getStripPaperConfig(activePaperSize);
  const doubleStripAvailable = photoboothPhotoCount >= 1;
  const doubleStripEnabled =
    doubleStripAvailable && (selectedStripPrintSettings?.double_strip_enabled ?? photoboothAdminSettings.doubleStripEnabled);
  const photoboothCaptureCount = photoboothPhotoCount;
  const getPhotoboothSideSlotIndex = (slotIndex, sideIndex = 0) =>
    doubleStripEnabled && sideIndex === 1
      ? (slotIndex + photoboothPhotoCount - 1) % photoboothPhotoCount
      : slotIndex;
  const getPhotoboothSidePhotoIndex = (slotIndex, sideIndex = 0) =>
    slotPhotoMap[getPhotoboothSideSlotIndex(slotIndex, sideIndex)] ?? null;
  const captureUpcomingSlotIndex =
    captures.length >= photoboothCaptureCount
      ? Math.max(0, photoboothPhotoCount - 1)
      : captures.length % photoboothPhotoCount;
  const activeStripSlots = doubleStripEnabled
    ? buildCenteredStripSlots(photoboothPhotoCount, activePaperSize, {
        width: activePaperConfig.width / 2,
        height: activePaperConfig.height,
      })
    : getStripSlots(photoboothPhotoCount, activePaperSize);
  const activeStripBaseWidth = getStripBaseWidth(photoboothPhotoCount, activePaperSize);
  const activeStripBaseHeight = getStripBaseHeight(photoboothPhotoCount, activePaperSize);
  const activeStripPreviewStyle = {
    aspectRatio: `${activeStripBaseWidth} / ${activeStripBaseHeight}`,
  };
  const getActiveStripSlotStyle = (slot) => ({
    left: `${slot.left}%`,
    top: `${slot.top}%`,
    width: `${slot.width}%`,
    height: `${slot.height}%`,
  });
  const getPreviewFrameStyle = (width, height, maxWidth = 300, maxHeight = 260) => {
    const ratio = width / height;
    const previewWidth = Math.min(maxWidth, maxHeight * ratio);

    return {
      aspectRatio: `${width} / ${height}`,
      width: `min(100%, ${previewWidth}px)`,
    };
  };
  const selectedTemplateForPhotoCount =
    selectedPhotoboothStrip?.pose_count === photoboothPhotoCount
      ? selectedPhotoboothStrip
      : photoboothTemplate?.pose_count === photoboothPhotoCount
        ? photoboothTemplate
        : null;
  const activePhotoboothTemplate =
    selectedTemplateForPhotoCount ||
    photoboothTemplates[String(photoboothPhotoCount)] ||
    photoboothTemplate ||
    createEmptyPhotoboothTemplate(photoboothPhotoCount);
  const hasUploadedTemplateLayout =
    activePhotoboothTemplate?.active &&
      activePhotoboothTemplate.image_url &&
      activePhotoboothTemplate.slots?.length &&
      activePhotoboothTemplate.width &&
      activePhotoboothTemplate.height;
  const photoboothPreviewUsesUploadedTemplate =
    hasUploadedTemplateLayout &&
    selectedPhotoboothStrip?.pose_count === photoboothPhotoCount &&
    selectedPhotoboothStrip?.id === activePhotoboothTemplate?.id;
  const activePhotoboothTemplateSlots = photoboothPreviewUsesUploadedTemplate
    ? activePhotoboothTemplate.slots
    : activeStripSlots;
  const viewportHeight =
    typeof window === "undefined" ? 720 : window.innerHeight;
  const viewportWidth =
    typeof window === "undefined" ? 1280 : window.innerWidth;
  const editPreviewMaxHeight = viewportWidth <= 980
    ? Math.max(220, Math.min(viewportHeight * 0.54, viewportHeight - 250))
    : Math.max(280, Math.min(820, viewportHeight - 250));
  const capturePhotoboothPreviewStyle = activeStripPreviewStyle;
  const editPhotoboothPreviewStyle = photoboothPreviewUsesUploadedTemplate
    ? getPreviewFrameStyle(
        activePhotoboothTemplate.width * (doubleStripEnabled ? 2 : 1),
        activePhotoboothTemplate.height,
        920,
        editPreviewMaxHeight
      )
    : doubleStripEnabled
      ? { aspectRatio: `${activePaperConfig.width} / ${activePaperConfig.height}` }
      : activeStripPreviewStyle;
  const getPhotoboothTemplateSlotStyle = (slot) =>
    photoboothPreviewUsesUploadedTemplate
      ? {
          left: `${slot.left}%`,
          top: `${slot.top}%`,
          width: `${slot.width}%`,
          height: `${slot.height}%`,
        }
      : getActiveStripSlotStyle(slot);
  const adminPreviewSlots =
    adminEditingStrip?.slots?.length
      ? adminEditingStrip.slots
      : getStripSlots(adminEditingStrip?.slot_count || 1, adminStripPrintSettings.paper_size);
  const adminPreviewStyle =
    adminEditingStrip?.image_url &&
      adminEditingStrip.width &&
      adminEditingStrip.height
      ? getPreviewFrameStyle(
          adminEditingStrip.width,
          adminEditingStrip.height
        )
      : getPreviewFrameStyle(
          getStripBaseWidth(adminEditingStrip?.slot_count || 1, adminStripPrintSettings.paper_size),
          getStripBaseHeight(adminEditingStrip?.slot_count || 1, adminStripPrintSettings.paper_size)
        );
  const getAdminPreviewSlotStyle = (slot) =>
      ({
          left: `${slot.left}%`,
          top: `${slot.top}%`,
          width: `${slot.width}%`,
          height: `${slot.height}%`,
        });

  const loadCaptures = async ({ signal } = {}) => {
    const data = await requestBackendJson(`${API_URL}/captures`, { signal });
    if (!signal?.aborted) setCaptures(data);
  };

  const loadQueue = async ({ signal } = {}) => {
    const data = await requestBackendJson(`${API_URL}/queue?source=auto_upload`, { signal });
    if (!signal?.aborted) setQueue(data);
  };

  const loadPhotoQueue = async ({ signal } = {}) => {
    const data = await requestBackendJson(`${API_URL}/queue?source=photobooth`, { signal });
    if (!signal?.aborted) setPhotoQueue(data);
  };

  const loadAutoWatchFolder = async ({ signal } = {}) => {
    const revision = watchSettingsRevisionRef.current;
    const data = await requestBackendJson(`${API_URL}/auto-watch-folder`, { signal });

    if (signal?.aborted || revision !== watchSettingsRevisionRef.current) return;
    setActiveWatchFolder(data);

    if (watchFolderDraftRef.current === null) {
      setWatchFolderPath(data.folder_path || "");
    }

    if (driveFolderDraftRef.current === null) {
      setDriveFolderId(data.drive_folder_id || "");
    }
  };

  const loadWatermark = async ({ signal } = {}) => {
    const data = await requestBackendJson(`${API_URL}/watermark`, { signal });
    if (signal?.aborted) return;

    setWatermark((current) => mergeWatermarkData(current, data));
    setWatermarkSettings(normalizeWatermarkSettings(data.settings));
  };

  const saveOutputSettings = async (settings, { signal } = {}) => {
    await requestBackendJson(`${API_URL}/output-settings`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        settings: {
          compression_enabled: settings.outputCompressionEnabled,
          compression_quality: settings.outputCompressionQuality,
        },
      }),
    });

  };

  const loadOutputSettings = async ({ signal } = {}) => {
    const data = await requestBackendJson(`${API_URL}/output-settings`, { signal });
    if (signal?.aborted) return;
    const settings = data.settings || {};

    if (settings.configured) {
      setPhotoboothAdminSettings((current) => ({
        ...current,
        ...normalizeOutputSettingsFromBackend(settings),
      }));
    } else {
      await saveOutputSettings(photoboothAdminSettings, { signal });
    }

    if (!signal?.aborted) outputSettingsLoadedRef.current = true;
  };

  const commitPhotoboothStripChanges = (options, settings = stripManagementRef.current.settings, { dirty = true } = {}) => {
    const defaultStrip = resolvePhotoboothStripSelection(options, settings.defaultStripId);
    const nextSettings = { ...settings, defaultStripId: defaultStrip?.id || null };
    const payload = {
      strip_options: options,
      default_strip_id: nextSettings.defaultStripId,
      strip_settings: nextSettings.stripSettings || {},
    };
    try {
      window.localStorage.setItem(PHOTOBOOTH_STRIP_SETTINGS_KEY, JSON.stringify({ ...payload, pending_sync: dirty }));
    } catch {
      setStatus("Penyimpanan lokal penuh atau tidak tersedia. Strip belum disimpan.");
      return null;
    }
    stripSettingsRevisionRef.current += 1;
    stripManagementRef.current = { options, settings: nextSettings };
    setPhotoboothStripOptions(options);
    setPhotoboothAdminSettings((current) => ({ ...current,
      defaultStripId: nextSettings.defaultStripId, stripSettings: nextSettings.stripSettings || {} }));
    return payload;
  };

  const persistPhotoboothStrips = (payload, { signal } = {}) => {
    if (!payload || !backendReadyRef.current) return Promise.resolve(false);
    const revision = stripSettingsRevisionRef.current;
    const save = async () => {
      if (signal?.aborted) return false;
      try {
        const data = await requestBackendJson(`${API_URL}/photobooth/settings`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload), signal,
        });
        if (data.success !== true || signal?.aborted) return false;
        if (revision === stripSettingsRevisionRef.current) {
          if (Array.isArray(data.strip_options)) {
            const current = stripManagementRef.current;
            const options = normalizePhotoboothStripOptions(data);
            if (!options.length) return false;
            return Boolean(commitPhotoboothStripChanges(options, { ...current.settings,
              defaultStripId: data.default_strip_id ?? current.settings.defaultStripId,
              stripSettings: data.strip_settings || current.settings.stripSettings,
            }, { dirty: false }));
          }
          window.localStorage.setItem(PHOTOBOOTH_STRIP_SETTINGS_KEY, JSON.stringify({ ...payload, pending_sync: false }));
        }
        return true;
      } catch {
        return false;
      }
    };
    const saving = stripSettingsSaveQueueRef.current.then(save, save);
    stripSettingsSaveQueueRef.current = saving;
    return saving;
  };

  const loadPhotoboothTemplate = async ({ signal } = {}) => {
    const revision = stripSettingsRevisionRef.current;
    const data = await requestBackendJson(`${API_URL}/photobooth/template`, { signal });
    if (!signal?.aborted && revision === stripSettingsRevisionRef.current) {
      const cached = loadPhotoboothStripCache();
      if (cached.pending_sync) {
        const current = stripManagementRef.current;
        const payload = { strip_options: current.options,
          default_strip_id: current.settings.defaultStripId,
          strip_settings: current.settings.stripSettings || cached.strip_settings || {} };
        await persistPhotoboothStrips(payload, { signal });
        return;
      }
      const templates = normalizePhotoboothTemplates(data);
      const stripOptions = normalizePhotoboothStripOptions(data, templates);
      if (!stripOptions.length) return;
      const previousSettings = stripManagementRef.current.settings;
      const settings = { ...stripManagementRef.current.settings,
        defaultStripId: data.default_strip_id,
        stripSettings: data.configured === false
          ? Object.fromEntries(stripOptions.map((strip) => [strip.id, previousSettings.stripSettings?.[strip.id] || {
              paper_size: previousSettings.paperSize || "4r", double_strip_enabled: previousSettings.doubleStripEnabled === true,
            }]))
          : data.strip_settings || previousSettings.stripSettings || {} };
      const selectedTemplate = resolvePhotoboothStripSelection(stripOptions,
        selectedPhotoboothStripRef.current?.id, settings.defaultStripId);

      setPhotoboothTemplates(templates);
      commitPhotoboothStripChanges(stripOptions, settings, { dirty: false });
      selectedPhotoboothStripRef.current = selectedTemplate;
      setSelectedPhotoboothStrip(selectedTemplate);
      setPhotoboothTemplate(selectedTemplate);
      setStripTemplateMode(getPreferredStripTemplateMode(selectedTemplate));

      setLastDetectedSlot(null);
    }
  };

  const selectPhotoboothStrip = (strip) => {
    if (!strip || strip.active === false) {
      return;
    }

    if (selectedPhotoboothStripRef.current === strip) {
      return;
    }

    selectedPhotoboothStripRef.current = strip;
    setSelectedPhotoboothStrip(strip);
    setPhotoboothTemplate(strip);
    setStripTemplateMode(getPreferredStripTemplateMode(strip));
    setPhotoboothAdminSettings((current) =>
      current.stripPhotoCount === strip.pose_count
        ? current
        : { ...current, stripPhotoCount: strip.pose_count }
    );
  };

  const handleAddNewStrip = async (name, poseCount) => {
    const count = Number(poseCount);
    if (!String(name).trim() || !Number.isInteger(count) || count < 1 || count > 10) {
      setStatus("Isi nama strip dan jumlah pose antara 1 sampai 10");
      return false;
    }
    const current = stripManagementRef.current;
    const strip = { ...createEmptyPhotoboothTemplate(count),
      id: `photobooth-strip-custom-${crypto.randomUUID()}`, name: String(name).trim() };
    const settings = { ...current.settings, stripSettings: { ...current.settings.stripSettings,
      [strip.id]: { paper_size: "4r", double_strip_enabled: false } } };
    const payload = commitPhotoboothStripChanges([...current.options, strip], settings);
    if (!payload) return false;
    setAdminEditingStripId(strip.id);
    const saved = await persistPhotoboothStrips(payload);
    setStatus(saved ? "Strip baru berhasil disimpan" : "Strip baru tersimpan lokal; akan disinkronkan saat backend siap");
    return true;
  };

  const handleUpdateStrip = async (stripId, changes) => {
    const current = stripManagementRef.current;
    const target = current.options.find((strip) => strip.id === stripId);
    if (!target) return false;
    const name = String(changes.name ?? target.name).trim();
    const poseCount = Number(changes.pose_count ?? target.pose_count);
    if (!name || !Number.isInteger(poseCount) || poseCount < 1 || poseCount > 10) {
      setStatus("Isi nama strip dan jumlah pose antara 1 sampai 10");
      return false;
    }
    const next = { ...target, name, pose_count: poseCount, active: changes.active ?? target.active };
    if (poseCount !== target.pose_count) {
      next.slot_count = poseCount;
      next.slots = target.image_url && target.width && target.height
        ? buildCenteredStripSlots(poseCount, "4r", { width: target.width, height: target.height }) : [];
    }
    const payload = commitPhotoboothStripChanges(current.options.map((strip) => strip.id === stripId ? next : strip));
    if (!payload) return false;
    const saved = await persistPhotoboothStrips(payload);
    setStatus(saved ? "Perubahan strip berhasil disimpan" : "Perubahan tersimpan lokal; akan disinkronkan saat backend siap");
    return true;
  };

  const handleDeleteStrip = async (stripId) => {
    const current = stripManagementRef.current;
    if (current.options.length <= 1) {
      setStatus("Minimal satu strip harus tersedia");
      return;
    }
    const strip = current.options.find((option) => option.id === stripId);
    if (!strip || !window.confirm(`Hapus strip “${strip.name}”?`)) return;
    const options = current.options.filter((option) => option.id !== stripId);
    const stripSettings = { ...current.settings.stripSettings };
    delete stripSettings[stripId];
    const payload = commitPhotoboothStripChanges(options, { ...current.settings, stripSettings });
    if (!payload) return;
    setAdminEditingStripId(options[0].id);
    const saved = await persistPhotoboothStrips(payload);
    setStatus(saved ? "Strip berhasil dihapus" : "Strip dihapus secara lokal; akan disinkronkan saat backend siap");
  };

  const handleUpdateStripSettings = async (stripId, changes) => {
    const current = stripManagementRef.current;
    const strip = current.options.find((option) => option.id === stripId);
    if (!strip) return;
    const previous = current.settings.stripSettings?.[stripId] || {
      paper_size: current.settings.paperSize || "4r", double_strip_enabled: current.settings.doubleStripEnabled === true,
    };
    const settings = { ...current.settings,
      defaultStripId: changes.isDefault ? stripId : current.settings.defaultStripId,
      stripSettings: { ...current.settings.stripSettings, [stripId]: {
        paper_size: changes.paper_size || previous.paper_size,
        double_strip_enabled: changes.double_strip_enabled ?? previous.double_strip_enabled,
      } } };
    const payload = commitPhotoboothStripChanges(current.options, settings);
    if (!payload) return;
    const saved = await persistPhotoboothStrips(payload);
    setStatus(saved ? "Pengaturan strip berhasil disimpan" : "Pengaturan tersimpan lokal; akan disinkronkan saat backend siap");
  };

  const preparePhotoboothStripSelection = () => {
    selectPhotoboothStrip(resolvePhotoboothStripSelection(photoboothStripOptions,
      null, photoboothAdminSettings.defaultStripId));
    setPhotoboothStep(2);
  };

  const handleStripCarouselScroll = () => {
    window.clearTimeout(stripCarouselSettleRef.current);
    stripCarouselSettleRef.current = window.setTimeout(() => {
      const carousel = stripCarouselRef.current;

      if (!carousel) {
        return;
      }

      const carouselRect = carousel.getBoundingClientRect();
      const centerX = carouselRect.left + carousel.clientWidth / 2;
      const items = Array.from(
        carousel.querySelectorAll("[data-strip-option-id]")
      );
      if (items.length === 0) return;

      let centeredItem = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      items.forEach((item) => {
        const itemRect = item.getBoundingClientRect();
        const itemCenter = itemRect.left + itemRect.width / 2;
        const distance = Math.abs(itemCenter - centerX);
        if (distance < nearestDistance) {
          centeredItem = item;
          nearestDistance = distance;
        }
      });

      const targetId = centeredItem?.dataset.stripOptionId;
      if (targetId && targetId !== selectedPhotoboothStripRef.current?.id) {
        const selectedStrip = photoboothStripOptions.find(
          (strip) => strip.id === targetId
        );
        if (selectedStrip) {
          selectPhotoboothStrip(selectedStrip);
        }
      }
    }, 140);
  };

  const centerStripCarouselCard = (card, behavior = "smooth") => {
    const carousel = stripCarouselRef.current;
    if (!carousel || !card) return;

    const carouselRect = carousel.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const delta =
      cardRect.left + cardRect.width / 2 -
      (carouselRect.left + carousel.clientWidth / 2);
    const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    carousel.scrollTo({
      left: Math.max(0, Math.min(maxScrollLeft, carousel.scrollLeft + delta)),
      behavior,
    });
  };

  const handleCarouselMouseDown = (e) => {
    const carousel = stripCarouselRef.current;
    if (!carousel || e.button !== 0) return;
    isDraggingCarouselRef.current = true;
    hasMovedCarouselRef.current = false;
    carouselStartXRef.current = e.clientX;
    carouselScrollLeftRef.current = carousel.scrollLeft;
    carousel.style.scrollSnapType = "none";
    carousel.style.scrollBehavior = "auto";
    window.addEventListener("mousemove", handleCarouselMouseMove);
    window.addEventListener("mouseup", handleCarouselMouseUp, { once: true });
  };

  const handleCarouselMouseMove = (e) => {
    if (!isDraggingCarouselRef.current) return;
    const carousel = stripCarouselRef.current;
    if (!carousel) return;
    e.preventDefault();
    const walk = (e.clientX - carouselStartXRef.current) * 1.1;
    if (Math.abs(walk) > 5) {
      hasMovedCarouselRef.current = true;
    }
    carousel.scrollLeft = carouselScrollLeftRef.current - walk;
  };

  const handleCarouselMouseUp = () => {
    window.removeEventListener("mousemove", handleCarouselMouseMove);
    if (isDraggingCarouselRef.current) {
      isDraggingCarouselRef.current = false;
      const carousel = stripCarouselRef.current;
      if (carousel) {
        carousel.style.scrollSnapType = "";
        carousel.style.scrollBehavior = "";
        handleStripCarouselScroll();
      }
    }
  };

  const handleScrollCarousel = (direction) => {
    const carousel = stripCarouselRef.current;
    if (!carousel) return;
    const cards = Array.from(carousel.querySelectorAll("[data-strip-option-id]"));
    if (cards.length === 0) return;
    const currentIndex = cards.findIndex(
      (card) => card.dataset.stripOptionId === selectedPhotoboothStrip?.id
    );
    let targetIndex = 0;
    if (direction === "next") {
      targetIndex = Math.min(cards.length - 1, currentIndex >= 0 ? currentIndex + 1 : 1);
    } else {
      targetIndex = Math.max(0, currentIndex >= 0 ? currentIndex - 1 : 0);
    }
    const targetCard = cards[targetIndex];
    if (targetCard) {
      centerStripCarouselCard(targetCard);
      const selectedStrip = photoboothStripOptions.find(
        (s) => s.id === targetCard.dataset.stripOptionId
      );
      if (selectedStrip) {
        selectPhotoboothStrip(selectedStrip);
      }
    }
  };

  const stopBrowserCamera = ({ invalidatePending = true } = {}) => {
    if (invalidatePending) {
      cameraStartIdRef.current += 1;
    }

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setCameraPreviewReady(false);
    setActiveCameraLabel("");
    setCameraPreviewSource("none");
  };

  const getCameraLabel = (devices, stream) => {
    const activeTrack = stream.getVideoTracks()[0];
    const activeDeviceId = activeTrack?.getSettings().deviceId;
    const activeDevice = devices.find(
      (device) => device.deviceId && device.deviceId === activeDeviceId
    );

    return activeDevice?.label || activeTrack?.label || "Kamera aktif";
  };

  const startBrowserCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Browser tidak mendukung akses kamera");
      setCameraActive(false);
      return;
    }

    const startId = cameraStartIdRef.current + 1;
    cameraStartIdRef.current = startId;

    stopBrowserCamera({ invalidatePending: false });
    setCameraPreviewReady(false);
    setStatus("Menyambungkan kamera...");

    try {
      let stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: selectedCameraId
          ? {
              deviceId: {
                exact: selectedCameraId,
              },
              width: { ideal: cameraWidth },
              height: { ideal: cameraHeight },
              frameRate: { ideal: cameraFps },
            }
          : {
              width: { ideal: cameraWidth },
              height: { ideal: cameraHeight },
              frameRate: { ideal: cameraFps },
            },
      });

      if (cameraStartIdRef.current !== startId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput"
      );

      if (cameraStartIdRef.current !== startId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setCameraDevices(devices);
      const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;

      if (!selectedCameraId && activeDeviceId) {
        setSelectedCameraId(activeDeviceId);
      }

      cameraStreamRef.current = stream;

      setActiveCameraLabel(getCameraLabel(devices, stream));
      setCameraActive(true);
      setCameraPreviewSource("browser");
      setStatus((current) =>
        current === "Menyambungkan kamera..." || current === "Menunggu kamera..."
          ? ""
          : current
      );

      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;

        try {
          await cameraVideoRef.current.play();
        } catch (error) {
          console.warn("Preview kamera belum bisa autoplay", error);
        }
      }
    } catch (error) {
      if (cameraStartIdRef.current !== startId) {
        return;
      }

      setCameraActive(false);
      setCameraPreviewSource("none");
      setStatus(
        error?.name === "NotAllowedError"
          ? "Izin kamera ditolak. Buka System Settings > Privacy & Security > Camera lalu izinkan aplikasi ini."
          : error?.message || "Kamera tidak bisa dibuka"
      );
    }
  };

  const handleBackendCameraLoad = () => {
    if (cameraStreamRef.current) {
      return;
    }

    setCameraActive(true);
    setCameraPreviewReady(true);
    setCameraPreviewSource("backend");
    setActiveCameraLabel("Kamera backend aktif");
    setStatus((current) =>
      current === "Menyambungkan kamera..." || current === "Menunggu kamera..."
        ? ""
        : current
    );
  };

  const handleBackendCameraError = () => {
    if (cameraStreamRef.current) {
      return;
    }

    setCameraActive(false);
    setCameraPreviewReady(false);
    setCameraPreviewSource("none");
  };

  const handleBrowserCameraReady = () => {
    const video = cameraVideoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    setCameraActive(true);
    setCameraPreviewReady(true);
    setCameraPreviewSource("browser");
  };

  const captureBrowserCameraFrame = () => {
    const video = cameraVideoRef.current;

    if (
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 1.0);
  };

  const attachCameraVideoElement = useCallback((videoElement) => {
    if (!videoElement) {
      cameraVideoRef.current = null;
      return;
    }

    if (cameraVideoRef.current === videoElement) {
      return;
    }

    cameraVideoRef.current = videoElement;
    setCameraPreviewReady(false);

    if (!cameraStreamRef.current) {
      return;
    }

    videoElement.srcObject = cameraStreamRef.current;
    videoElement.play().catch((error) => {
      console.warn("Preview kamera belum bisa autoplay", error);
    });
  }, []);

  const clearAutoCaptureTimers = () => {
    window.clearTimeout(autoCaptureTimeoutRef.current);
    window.clearInterval(autoCaptureCountdownRef.current);
    window.clearTimeout(autoCaptureReadyRef.current);
    autoCaptureTimeoutRef.current = null;
    autoCaptureCountdownRef.current = null;
    autoCaptureReadyRef.current = null;
  };

  useEffect(() => {
    let isMounted = true;
    let healthInFlight = false;
    let dataInFlight = false;
    let cancelHealthRequest = null;
    let cancelDataRequest = null;

    backendReadyRef.current = false;
    setBackendReady(false);

    const markDisconnected = () => {
      if (!isMounted) return;
      cancelDataRequest?.();
      backendReadyRef.current = false;
      setBackendReady(false);
      setStatus("Menunggu kamera...");
    };

    const refreshData = async (loaders) => {
      if (!isMounted || dataInFlight) return;
      dataInFlight = true;
      const controller = new AbortController();
      let requestTimer;
      let cancelBatch;
      const cancelled = new Promise((_, reject) => {
        cancelBatch = (reason = Object.assign(new Error("Backend data refresh cancelled"), { name: "AbortError" })) => {
          if (controller.signal.aborted) return;
          controller.abort(reason);
          if (isMounted) setIsLoadingPrinters(false);
          reject(reason);
        };
        cancelDataRequest = cancelBatch;
        requestTimer = window.setTimeout(() => cancelBatch(Object.assign(
          new Error("Backend data refresh timed out"), { name: "TimeoutError" }
        )), 12000);
      });
      try {
        const results = await Promise.race([
          Promise.allSettled(loaders.map((load) => Promise.resolve().then(() => {
            if (isMounted && !controller.signal.aborted) return load({ signal: controller.signal });
          }))),
          cancelled,
        ]);
        if (!isMounted) return;
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length) {
          console.warn("Backend data refresh failed:", failures.map((result) => result.reason));
        }
      } catch (error) {
        if (isMounted && error.name !== "AbortError") {
          console.warn("Backend data refresh failed:", error);
        }
      } finally {
        window.clearTimeout(requestTimer);
        if (cancelDataRequest === cancelBatch) {
          cancelDataRequest = null;
          dataInFlight = false;
        }
      }
    };

    const checkBackend = async () => {
      if (!isMounted || healthInFlight) return;
      healthInFlight = true;
      const controller = new AbortController();
      let requestTimer = null;
      try {
        const response = await Promise.race([
          Promise.resolve().then(() => fetch(`${API_URL}/`, {
            cache: "no-store",
            signal: controller.signal,
          })),
          new Promise((_, reject) => {
            cancelHealthRequest = () => {
              controller.abort();
              reject(new Error("Backend health request cancelled or timed out"));
            };
            requestTimer = window.setTimeout(cancelHealthRequest, 2000);
          }),
        ]);

        if (!isMounted) {
          return;
        }

        if (response.ok) {
          if (adminUser) {
            if (!backendReadyRef.current) {
              setStreamVersion(Date.now());
              void refreshData([
                loadCaptures,
                loadQueue,
                loadPhotoQueue,
                loadAutoWatchFolder,
                loadWatermark,
                loadOutputSettings,
                loadPhotoboothTemplate,
                loadDriveAuthStatus,
                loadPrinters,
              ]);
            }

            backendReadyRef.current = true;
            setBackendReady(true);
            setStatus((current) =>
              current === "Menunggu kamera..." ? "" : current
            );
          } else {
            // For non-admin users (oto mode), still set backendReady to true
            // and load the Admin-managed strip templates for the selector.
            if (!backendReadyRef.current) {
              void refreshData([loadPhotoboothTemplate]);
              backendReadyRef.current = true;
              setBackendReady(true);
              setStatus((current) =>
                current === "Menunggu kamera..." ? "" : current
              );
            }
          }
        } else {
          markDisconnected();
        }
      } catch {
        markDisconnected();
      } finally {
        window.clearTimeout(requestTimer);
        cancelHealthRequest = null;
        healthInFlight = false;
      }
    };

    void checkBackend();
    const healthInterval = window.setInterval(checkBackend, 1200);
    const dataInterval = window.setInterval(() => {
      if (isMounted && backendReadyRef.current) {
        return refreshData([loadCaptures, loadQueue, loadPhotoQueue, loadAutoWatchFolder]);
      }
    }, 3000);

    return () => {
      isMounted = false;
      backendReadyRef.current = false;
      cancelHealthRequest?.();
      cancelDataRequest?.();
      window.clearInterval(healthInterval);
      window.clearInterval(dataInterval);
      window.clearTimeout(retryTimer.current);
      clearAutoCaptureTimers();
      window.clearTimeout(watermarkSettingsSaveRef.current.timer);
    };
  }, [adminUser]);


  const commitEditorCatalog = (settings) => {
    editorCatalogRevisionRef.current += 1;
    setEditorCatalog(settings);
  };

  const loadPhotoboothEditorCatalog = async ({ signal } = {}) => {
    const revision = editorCatalogRevisionRef.current;
    const data = await requestBackendJson(`${API_URL}/photobooth/editor-settings`, { signal });
    if (!signal?.aborted && revision === editorCatalogRevisionRef.current) {
      setEditorCatalog(data.settings ?? DEFAULT_EDITOR_CATALOG);
    }
  };

  useEffect(() => {
    if (!backendReady) return;
    const controller = new AbortController();
    setEditorCatalogError("");
    loadPhotoboothEditorCatalog({ signal: controller.signal })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setEditorCatalogError(error.message || "Gagal memuat pilihan edit");
        }
      });
    return () => controller.abort();
  }, [backendReady, editorCatalogReload]);

  useEffect(() => {
    if ((editStudioTab === "sticker" && !publishedEditorItems.stickers.length) ||
        (editStudioTab === "text" && !publishedEditorItems.texts.length)) {
      setEditStudioTab("filter");
    }
  }, [publishedEditorItems, editStudioTab]);

  useEffect(() => {
    window.localStorage.setItem(
      PHOTOBOOTH_ADMIN_SETTINGS_KEY,
      JSON.stringify(photoboothAdminSettings)
    );
  }, [photoboothAdminSettings]);

  useEffect(() => {
    if (!backendReady || !outputSettingsLoadedRef.current) {
      return;
    }

    saveOutputSettings(photoboothAdminSettings).catch((error) => {
      console.warn("backend output settings failed:", error);
    });
  }, [
    backendReady,
    photoboothAdminSettings.outputCompressionEnabled,
    photoboothAdminSettings.outputCompressionQuality,
  ]);

  useEffect(() => {
    const isOtoMode = (photoboothAdminSettings.mode || "oto") === "oto";

    if (!photoboothAdminSettings.editEnabled) {
      if (isOtoMode && photoboothStep === 4) {
        setPhotoboothStep(5);
      } else if (!isOtoMode && photoboothStep === 3) {
        setPhotoboothStep(4);
      }
    }
  }, [photoboothAdminSettings.editEnabled, photoboothAdminSettings.mode, photoboothStep]);

  useEffect(() => {
    window.localStorage.setItem("photobooth_camera_width", String(cameraWidth));
  }, [cameraWidth]);
  useEffect(() => {
    window.localStorage.setItem("photobooth_camera_height", String(cameraHeight));
  }, [cameraHeight]);
  useEffect(() => {
    window.localStorage.setItem("photobooth_camera_fps", String(cameraFps));
  }, [cameraFps]);
  useEffect(() => { window.localStorage.setItem("photobooth_cam_brightness", String(cameraBrightness)); }, [cameraBrightness]);
  useEffect(() => { window.localStorage.setItem("photobooth_cam_contrast", String(cameraContrast)); }, [cameraContrast]);
  useEffect(() => { window.localStorage.setItem("photobooth_cam_saturation", String(cameraSaturation)); }, [cameraSaturation]);
  useEffect(() => { window.localStorage.setItem("photobooth_cam_sharpness", String(cameraSharpness)); }, [cameraSharpness]);
  useEffect(() => { window.localStorage.setItem("photobooth_cam_exposure", String(cameraExposureComp)); }, [cameraExposureComp]);
  useEffect(() => { window.localStorage.setItem("photobooth_cam_wb", String(cameraWhiteBalance)); }, [cameraWhiteBalance]);

  useEffect(() => {
    (async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput"
      );
      setCameraDevices(devices);
    })();
  }, []);

  useEffect(() => {
    const selected = resolvePhotoboothStripSelection(photoboothStripOptions,
      selectedPhotoboothStripRef.current?.id, photoboothAdminSettings.defaultStripId);
    selectedPhotoboothStripRef.current = selected;
    setSelectedPhotoboothStrip(selected);
    setPhotoboothTemplate(selected);
    setStripTemplateMode(getPreferredStripTemplateMode(selected));
    if (selected) {
      setPhotoboothAdminSettings((current) => current.stripPhotoCount === selected.pose_count
        ? current : { ...current, stripPhotoCount: selected.pose_count });
    }
  }, [photoboothStripOptions, photoboothAdminSettings.defaultStripId]);

  useEffect(() => {
    if (!adminEditingStrip) return;
    setAdminEditingStripId(adminEditingStrip.id);
    setAdminStripDraft({ name: adminEditingStrip.name, pose_count: adminEditingStrip.pose_count,
      active: adminEditingStrip.active !== false });
    setPendingPhotoboothTemplateFile(null);
    setLastDetectedSlot(null);
    setAdminNewSlotOpen(false);
  }, [adminEditingStrip?.id, adminEditingStrip?.name, adminEditingStrip?.pose_count, adminEditingStrip?.active]);

  useEffect(() => {
    if (photoboothStep !== 2) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const targetId =
        selectedPhotoboothStripRef.current?.id || visiblePhotoboothStripOptions[0]?.id;
      const item = Array.from(
        stripCarouselRef.current?.querySelectorAll("[data-strip-option-id]") || []
      ).find(
        (candidate) => candidate.dataset.stripOptionId === targetId
      );

      centerStripCarouselCard(item, "auto");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [photoboothStep, photoboothStripOptions, selectedPhotoboothStrip?.id]);

  useEffect(
    () => () => window.clearTimeout(stripCarouselSettleRef.current),
    []
  );

  useEffect(() => {
    setSelectedTemplateSlot((current) =>
      Math.min(current, Math.max(0, photoboothPhotoCount - 1))
    );
  }, [photoboothPhotoCount]);

  useEffect(() => {
    const isOtoMode = (photoboothAdminSettings.mode || "oto") === "oto";
    const captureStepNum = isOtoMode ? 3 : 2;

    if (activeView === "photobooth" && photoboothStep <= captureStepNum) {
      const activeDeviceId =
        cameraStreamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;

      if (
        !cameraStreamRef.current ||
        (selectedCameraId && activeDeviceId && activeDeviceId !== selectedCameraId)
      ) {
        startBrowserCamera();
      }

      return undefined;
    }

    stopBrowserCamera();
    window.clearTimeout(retryTimer.current);

    return undefined;
  }, [activeView, photoboothStep, selectedCameraId, photoboothAdminSettings.mode]);

  useEffect(() => {
    const isOtoMode = (photoboothAdminSettings.mode || "oto") === "oto";
    const captureStepNum = isOtoMode ? 3 : 2;

    if (activeView !== "photobooth" || photoboothStep !== captureStepNum || !backendReady) {
      if (backendReady) {
        fetch(`${API_URL}/camera/stop`, {
          method: "POST",
        });
      }

      return undefined;
    }

    fetch(`${API_URL}/camera/start`, {
      method: "POST",
    }).finally(() => {
      setStreamVersion(Date.now());
    });

    return () => {
      fetch(`${API_URL}/camera/stop`, {
        method: "POST",
      });
    };
  }, [activeView, backendReady, photoboothStep, photoboothAdminSettings.mode]);

  useEffect(() => {
    if (
      !backendReady ||
      activeView !== "upload" ||
      uploadInputMode !== "folder" ||
      !activeWatchFolder?.enabled
    ) {
      return undefined;
    }

    const watchInterval = window.setInterval(loadAutoWatchFolder, 1000);

    return () => window.clearInterval(watchInterval);
  }, [activeView, activeWatchFolder?.enabled, backendReady, uploadInputMode]);

  useEffect(() => {
    const watchFiles = activeWatchFolder?.pending_files || [];
    const imageFiles =
      uploadInputMode === "folder"
        ? []
        : selectedFiles.filter((file) => file.type.startsWith("image/"));
    const objectUrls = [];
    let cancelled = false;

    if (uploadInputMode === "folder" && watchFiles.length > 0) {
      Promise.all(
        watchFiles.map(
          (file) =>
            new Promise((resolve) => {
              const url = `${API_URL}/auto-watch-folder/file?path=${encodeURIComponent(file.path)}`;

              const image = new Image();
              image.crossOrigin = "anonymous";
              image.onload = () => {
                const orientation =
                  image.naturalHeight > image.naturalWidth
                    ? "portrait"
                    : "landscape";

                resolve({
                  id: file.path,
                  file,
                  url,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                  orientation,
                  orientationLabel:
                    orientation === "portrait" ? "Portrait" : "Landscape",
                });
              };
              image.onerror = () => {
                resolve({
                  id: file.path,
                  file,
                  url,
                  width: null,
                  height: null,
                  orientation: "landscape",
                  orientationLabel: "File",
                  previewError: true,
                });
              };
              image.src = url;
            })
        )
      ).then((items) => {
        if (!cancelled) {
          setAutoPreviewFiles(items.filter(Boolean));
        }
      });

      return () => {
        cancelled = true;
      };
    }

    if (imageFiles.length === 0) {
      setAutoPreviewFiles([]);
      return undefined;
    }

    Promise.all(
      imageFiles.map(
        (file) =>
          new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            objectUrls.push(url);

            const image = new Image();
            image.onload = () => {
              const orientation =
                image.naturalHeight > image.naturalWidth
                  ? "portrait"
                  : "landscape";

              resolve({
                id: `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
                file,
                url,
                width: image.naturalWidth,
                height: image.naturalHeight,
                orientation,
                orientationLabel:
                  orientation === "portrait" ? "Portrait" : "Landscape",
              });
            };
            image.onerror = () => {
              resolve({
                id: `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
                file,
                url,
                width: null,
                height: null,
                orientation: "landscape",
                orientationLabel: "File",
                previewError: true,
              });
            };
            image.src = url;
          })
      )
    ).then((items) => {
      if (!cancelled) {
        setAutoPreviewFiles(items.filter(Boolean));
      }
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedFiles, uploadInputMode, activeWatchFolder]);

  useEffect(() => {
    if (autoPreviewFiles.length === 0) {
      setAutoPreviewUrl(null);
      setAutoPreviewInfo(null);
      return;
    }

    const matchingPreview = autoPreviewFiles.find(
      (item) => item.orientation === watermarkOrientation
    );
    const nextPreview = matchingPreview || autoPreviewFiles[0];

    if (!matchingPreview && nextPreview.orientation !== watermarkOrientation) {
      setWatermarkOrientation(nextPreview.orientation);
    }

    setAutoPreviewUrl(nextPreview.url);
    setAutoPreviewInfo(nextPreview);
    setPreviewOrientation(nextPreview.orientation);
  }, [autoPreviewFiles, watermarkOrientation]);

  useEffect(() => {
    const nextSlots =
      photoboothTemplate?.active && photoboothTemplate.slots?.length
        ? photoboothTemplate.slots
        : getStripSlots(photoboothPhotoCount, activePaperSize);

    setPhotoboothTemplateSlots(nextSlots);
    setTemplatePhotoAdjustments((current) =>
      nextSlots.map((_, index) =>
        current[index] || { ...DEFAULT_SLOT_ADJUSTMENT }
      )
    );
    setSelectedTemplateSlot((current) =>
      Math.min(current, nextSlots.length - 1)
    );
  }, [photoboothTemplate, photoboothPhotoCount, activePaperSize]);

  const retryStream = () => {
    window.clearTimeout(retryTimer.current);

    retryTimer.current = window.setTimeout(() => {
      setStreamVersion(Date.now());
    }, 1000);
  };

  const resetPhotoboothLocalSession = () => {
    clearPhotoboothGifs();
    const sessionTemplate = resolvePhotoboothStripSelection(photoboothStripOptions,
      null, photoboothAdminSettings.defaultStripId);
    selectedPhotoboothStripRef.current = sessionTemplate;
    setSelectedPhotoboothStrip(sessionTemplate);
    if (sessionTemplate) setPhotoboothAdminSettings((current) => ({ ...current, stripPhotoCount: sessionTemplate.pose_count }));
    const sessionSlots =
      sessionTemplate?.active && sessionTemplate.slots?.length
        ? sessionTemplate.slots
        : getStripSlots(photoboothPhotoCount, activePaperSize);

    clearAutoCaptureTimers();
    setCaptures([]);
    setAutoCaptureCountdown(null);
    setAutoCaptureLabel("");
    setAutoCaptureReady(false);
    setShowResult(false);
    setPhotoboothEditMode("photo");
    setSelectedEditPhotoIndex(0);
    setDraftPhotoEffect("natural");
    setPhotoEffectMap(Array.from({ length: photoboothCaptureCount }, () => "natural"));
    setSlotPhotoMap(createEmptyStripMap(sessionTemplate?.pose_count || photoboothPhotoCount));
    setPhotoboothTemplate(sessionTemplate);
    setStripTemplateMode(getPreferredStripTemplateMode(sessionTemplate));
    setSelectedTemplateSlot(0);
    setTemplatePhotoAdjustments(
      sessionSlots.map(() => ({ ...DEFAULT_SLOT_ADJUSTMENT }))
    );
    setPhotoboothEmail("");
    decorationRevisionRef.current += 1;
    setStripDecorations([]);
    setStripTexts([]);
    setStripDoodles([]);
    setActiveStudioSide(0);
    setSelectedDecoration(null);
    setEditStudioTab("filter");
    setStudioFilterScope("all");
    setActiveDoodleBrush("pencil");
    setActiveDoodleSize(3);
    setStudioFrameColor("#f7f7f2");
    setPendingSwapSlot(null);
    setPhotoboothDriveResult(null);
    setPhotoboothFinalComposite(null);
    setPhotoboothDeliveryStatus({ drive: "idle", printer: "idle" });
    setPhotoboothFinalPreviewUrl(null);
    photoboothFinalBase64Ref.current = null;
    setIsRenderingPhotoboothPreview(false);
    setDraggingStripPhoto(null);
    stripDragRef.current = null;
    stripGestureRef.current = null;
    setStreamVersion(Date.now());
  };

  const handleStartPhotoboothSession = async () => {
    clearPhotoboothGifs();
    if (!backendReady) {
      setStatus("Backend belum siap");
      return;
    }

    if (!photoboothDriveConfigured) {
      setStatus("Admin harus mengisi Drive Awal Photobooth dulu");
      window.setTimeout(() => setStatus(""), 3000);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/photobooth/session/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          drive_folder_id: photoboothInitialDriveFolderId,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal memulai sesi");
      }

      const sessionTemplate =
        photoboothStripOptions.find(
          (strip) =>
            strip.id === selectedPhotoboothStrip?.id &&
            strip.pose_count === photoboothPhotoCount
        ) ||
        photoboothTemplates[String(photoboothPhotoCount)] ||
        photoboothTemplate ||
        createEmptyPhotoboothTemplate(photoboothPhotoCount);
      const sessionSlots =
        sessionTemplate?.active && sessionTemplate.slots?.length
          ? sessionTemplate.slots
          : getStripSlots(photoboothPhotoCount, activePaperSize);

      setStatus("Sesi baru siap, kamera akan aktif untuk atur posisi");
      setAutoCaptureCountdown(null);
      setAutoCaptureLabel("Menyiapkan...");
      setAutoCaptureReady(false);
      setPhotoboothEditMode("strip");
      setSelectedEditPhotoIndex(0);
      setDraftPhotoEffect("natural");
      setPhotoEffectMap(Array.from({ length: photoboothCaptureCount }, () => "natural"));
      setSlotPhotoMap(createEmptyStripMap(photoboothPhotoCount));
      setPhotoboothTemplate(sessionTemplate);
      setStripTemplateMode(getPreferredStripTemplateMode(sessionTemplate));
      setTemplatePhotoAdjustments(
        sessionSlots.map(() => ({ ...DEFAULT_SLOT_ADJUSTMENT }))
      );
      decorationRevisionRef.current += 1;
      setStripDecorations([]);
      setStripTexts([]);
      setStripDoodles([]);
      setActiveStudioSide(0);
      setSelectedDecoration(null);
      setEditStudioTab("filter");
      setStudioFilterScope("all");
      setActiveDoodleBrush("pencil");
      setActiveDoodleSize(3);
      setStudioFrameColor("#f7f7f2");
      setPendingSwapSlot(null);
      setPhotoboothDriveResult(null);
      setPhotoboothFinalComposite(null);
      setPhotoboothDeliveryStatus({ drive: "idle", printer: "idle" });
      setPhotoboothFinalPreviewUrl(null);
      photoboothFinalBase64Ref.current = null;
      const isOto = (photoboothAdminSettings.mode || "oto") === "oto";
      setPhotoboothStep(isOto ? 3 : 2);
      await loadCaptures();
      await loadPhotoQueue();
      setStreamVersion(Date.now());
    } catch (error) {
      setStatus(error.message || "Gagal memulai sesi");
    } finally {
      window.setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleFinishPhotoboothSession = async () => {
    setStatus("Membersihkan sesi photobooth...");
    resetPhotoboothLocalSession();
    setPhotoboothStep(1);

    if (!backendReady) {
      window.setTimeout(() => setStatus(""), 2500);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/photobooth/session/finish`, {
        method: "POST",
      });
      const data = await response.json();


      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal membersihkan sesi");
      }

      await loadCaptures();
      await loadPhotoQueue();
      setStatus("Sesi selesai, siap untuk user berikutnya");
    } catch (error) {
      setStatus(error.message || "Sesi lokal dibersihkan, file lama perlu dicek");
    } finally {
      window.setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleCapture = async ({ automatic = false } = {}) => {
    if (isCapturing || !backendReady) {
      setStatus("Kamera belum siap");
      return false;
    }

    if (captures.length >= photoboothCaptureCount) {
      setStatus(`Sesi ini sudah berisi ${photoboothCaptureCount} foto`);
      return false;
    }

    clearAutoCaptureTimers();
    setIsCapturing(true);
    setAutoCaptureCountdown(null);
    setAutoCaptureLabel("Mengambil...");
    setStatus(automatic ? `Mengambil Foto ${captures.length + 1} otomatis...` : "Mengambil foto...");

    try {
      const cameraFrame = captureBrowserCameraFrame();
      const capturePayload = {
        max_photo_count: photoboothCaptureCount,
        ...(cameraFrame ? { data_base64: cameraFrame } : {}),
      };
      const response = await fetch(`${API_URL}/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(capturePayload),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal mengambil foto");
      }

      setStatus(`Foto ${captures.length + 1} tersimpan`);
      const nextCaptureCount = captures.length + 1;
      await loadCaptures();
      await loadPhotoQueue();
      setShowResult(true);

      if (nextCaptureCount >= photoboothCaptureCount) {
        clearAutoCaptureTimers();
        setAutoCaptureCountdown(null);
        setAutoCaptureLabel("Selesai");
        setSlotPhotoMap(createEmptyStripMap(photoboothPhotoCount, photoboothPhotoCount));
        setPhotoboothEditMode("strip");
        setStatus(`${photoboothCaptureCount} foto selesai, menyiapkan hasil...`);
      } else {
        window.setTimeout(() => setShowResult(false), 1800);
      }

      return true;
    } catch (error) {
      setStatus(error.message || "Gagal mengambil foto");
      return false;
    } finally {
      setIsCapturing(false);
      window.setTimeout(() => setStatus(""), 2500);
    }
  };

  useEffect(() => {
    if (activeView !== "photobooth" || photoboothStep !== 2) {
      return;
    }

    setSlotPhotoMap(createEmptyStripMap(photoboothPhotoCount, Math.min(captures.length, photoboothPhotoCount)));
  }, [activeView, captures.length, photoboothPhotoCount, photoboothStep]);

  useEffect(() => {
    if (activeView !== "photobooth" || photoboothStep !== 2) {
      return undefined;
    }

    const scrollTargetIndex = showResult
      ? Math.max(0, captures.length - 1) % photoboothPhotoCount
      : captureUpcomingSlotIndex;
    const scrollFrame = window.requestAnimationFrame(() => {
      const stripViewport = captureStripScrollRef.current;
      const targetSlot = stripViewport?.querySelector(
        `[data-capture-strip-slot="${scrollTargetIndex}"]`
      );

      if (!stripViewport || !targetSlot) {
        return;
      }

      stripViewport.scrollTo({
        top:
          scrollTargetIndex === 0
            ? Math.max(0, targetSlot.offsetTop - 18)
            : Math.max(
                0,
                targetSlot.offsetTop -
                  Math.min(
                    targetSlot.clientHeight * 0.72,
                    (stripViewport.clientHeight - targetSlot.clientHeight) / 2
                  )
              ),
        behavior: "auto",
      });
    });

    return () => window.cancelAnimationFrame(scrollFrame);
  }, [
    activeView,
    captureUpcomingSlotIndex,
    captures.length,
    photoboothPhotoCount,
    photoboothStep,
    showResult,
  ]);

  useEffect(() => {
    const isOtoMode = (photoboothAdminSettings.mode || "oto") === "oto";
    const captureStepNum = isOtoMode ? 3 : 2;

    if (activeView !== "photobooth" || photoboothStep !== captureStepNum) {
      clearAutoCaptureTimers();
      setAutoCaptureCountdown(null);
      setAutoCaptureLabel("");
      setAutoCaptureReady(false);
      setShowResult(false);
      return undefined;
    }

    if (captures.length >= photoboothCaptureCount) {
      clearAutoCaptureTimers();
      setAutoCaptureCountdown(null);
      setAutoCaptureLabel("Selesai");
      setSlotPhotoMap(createEmptyStripMap(photoboothPhotoCount, photoboothPhotoCount));
      setPhotoboothEditMode("strip");

      const nextStepTimer = window.setTimeout(() => {
        if (isOtoMode) {
          const nextOtoStep = photoboothAdminSettings.editEnabled ? 4 : 5;
          setPhotoboothStep(nextOtoStep);
          setStatus(
            photoboothAdminSettings.editEnabled
              ? `${photoboothCaptureCount} foto selesai, silakan edit strip`
              : `${photoboothCaptureCount} foto selesai, strip siap dikirim atau dicetak`
          );
        } else if (photoboothAdminSettings.editEnabled) {
          setPhotoboothStep(3);
          setStatus(`${photoboothCaptureCount} foto selesai, silakan edit strip`);
        } else {
          setPhotoboothStep(4);
          setStatus(`${photoboothCaptureCount} foto selesai, strip siap dikirim atau dicetak`);
        }
      }, PHOTOBOOTH_FINAL_PREVIEW_MS);

      return () => window.clearTimeout(nextStepTimer);
    }

    if (!backendReady || isCapturing || !cameraActive || !cameraPreviewReady) {
      clearAutoCaptureTimers();
      setAutoCaptureCountdown(null);
      setAutoCaptureLabel(
        !cameraActive || !cameraPreviewReady
          ? "Menunggu kamera aktif"
          : "Menunggu sistem siap"
      );
      return undefined;
    }

    if (showResult) {
      clearAutoCaptureTimers();
      return undefined;
    }

    if (photoboothAdminSettings.mode === "admin") {
      clearAutoCaptureTimers();
      setAutoCaptureReady(false);
      setAutoCaptureCountdown(null);
      setAutoCaptureLabel("Mode Admin (Manual)");
      return undefined;
    }

    const delay =
      captures.length === 0
        ? PHOTOBOOTH_INITIAL_CAPTURE_DELAY
        : PHOTOBOOTH_NEXT_CAPTURE_DELAY;
    const readyDelay =
      captures.length === 0
        ? PHOTOBOOTH_INITIAL_READY_MS
        : PHOTOBOOTH_NEXT_READY_MS;

    clearAutoCaptureTimers();
    setAutoCaptureReady(true);
    setAutoCaptureCountdown(null);
    setAutoCaptureLabel("Siap");

    autoCaptureReadyRef.current = window.setTimeout(() => {
      setAutoCaptureReady(false);
      setAutoCaptureLabel("Countdown");
      setAutoCaptureCountdown(delay);

      autoCaptureCountdownRef.current = window.setInterval(() => {
        setAutoCaptureCountdown((current) =>
          current === null ? null : Math.max(current - 1, 0)
        );
      }, 1000);

      autoCaptureTimeoutRef.current = window.setTimeout(() => {
        handleCapture({ automatic: true });
      }, delay * 1000);
    }, readyDelay);

    return () => {
      clearAutoCaptureTimers();
    };
  }, [
    activeView,
    backendReady,
    cameraActive,
    cameraPreviewReady,
    captures.length,
    isCapturing,
    photoboothAdminSettings.editEnabled,
    photoboothAdminSettings.mode,
    photoboothCaptureCount,
    photoboothPhotoCount,
    photoboothStep,
    showResult,
  ]);

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result);
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };

      reader.onerror = () => reject(new Error("Gagal membaca file"));
      reader.readAsDataURL(file);
    });

  const handleWatermarkUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!backendReady) {
      setStatus("Backend belum siap");
      return;
    }

    setIsUploadingWatermark(true);
    setStatus("Mengupload watermark...");

    try {
      const uploadOrientation = watermarkOrientation;
      const dataBase64 = await readFileAsBase64(file);
      const response = await fetch(`${API_URL}/watermark`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          data_base64: dataBase64,
          orientation: uploadOrientation,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal upload watermark");
      }

      setWatermark((current) =>
        mergeWatermarkData(current, data, uploadOrientation)
      );
      if (data.settings) {
        setWatermarkSettings(normalizeWatermarkSettings(data.settings));
      }
      setStatus(
        uploadOrientation === "portrait"
          ? "Watermark portrait aktif"
          : "Watermark landscape aktif"
      );
    } catch (error) {
      setStatus(
        error.message === "Load failed" || error instanceof TypeError
          ? "Backend tidak terhubung. Restart backend lalu coba upload lagi."
          : error.message || "Gagal upload watermark"
      );
    } finally {
      setIsUploadingWatermark(false);
      event.target.value = "";
      window.setTimeout(() => setStatus(""), 2500);
    }
  };

  const handleAddSticker = async (content, type = "emoji", stickerId = null) => {
    const item = editorCatalog?.stickers.find((entry) => entry.id === stickerId && entry.visible === true && entry.content === content);
    if (!item) return;
    type = item.kind;
    const revision = decorationRevisionRef.current;
    const sideIndex = doubleStripEnabled ? activeStudioSide : 0;
    let artwork;
    try { artwork = await createStickerArtwork(item); }
    catch (error) { setStatus(error.message || "Gagal membuat stiker"); return; }
    if (revision !== decorationRevisionRef.current) return;
    const style = decorationStyle("sticker", item.style);
    const newSticker = {
      id: `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      stickerId: stickerId || `${type}-${content}`,
      type,
      content,
      style,
      artwork,
      sideIndex,
      x: 50,
      y: 40 + (Math.random() - 0.5) * 20,
      scale: 1,
      rotation: style.rotation,
    };
    setStripDecorations((prev) => [...prev, newSticker]);
    setSelectedDecoration({ type: "sticker", id: newSticker.id });
  };

  const handleAddText = (textValue = null, presetId = null) => {
    const item = editorCatalog && resolveEditorTextItem(editorCatalog, textValue, presetId);
    if (!item) return;
    let artwork;
    try { artwork = createTextArtwork(item); }
    catch (error) { setStatus(error.message || "Gagal membuat tulisan"); return; }
    const style = decorationStyle("text", item.style);
    const newText = {
      id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      text: item.text,
      presetId: item.id,
      style,
      artwork,
      sideIndex: doubleStripEnabled ? activeStudioSide : 0,
      x: 10,
      y: 82,
      scale: 1,
      rotation: style.rotation,
    };
    setStripTexts((prev) => [...prev, newText]);
    setSelectedDecoration({ type: "text", id: newText.id });
  };



  const handleDeleteDecoration = (type, id) => {
    if (type === "sticker") {
      setStripDecorations((prev) => prev.filter((s) => s.id !== id));
    } else if (type === "text") {
      setStripTexts((prev) => prev.filter((t) => t.id !== id));
    }
    setSelectedDecoration(null);
  };

  const handleResetAllDecorations = () => {
    decorationRevisionRef.current += 1;
    setStripDecorations([]);
    setStripTexts([]);
    setStripDoodles([]);
    setActiveStudioSide(0);
    setPhotoEffectMap(Array.from({ length: photoboothCaptureCount }, () => "natural"));
    setTemplatePhotoAdjustments(
      photoboothTemplateSlots.map(() => ({ ...DEFAULT_SLOT_ADJUSTMENT }))
    );
    setStudioFrameColor("#f7f7f2");
    setSelectedDecoration(null);
  };

  const handleApplyFilterToAll = (effectId) => {
    setDraftPhotoEffect(effectId);
    setPhotoEffectMap(Array.from({ length: photoboothCaptureCount }, () => effectId));
  };

  const handleApplyFilterToPhoto = (photoIndex, effectId) => {
    setDraftPhotoEffect(effectId);
    setPhotoEffectMap((prev) => {
      const next = [...prev];
      next[photoIndex] = effectId;
      return next;
    });
  };

  const handleSelectStudioFilter = (effectId) => {
    if (studioFilterScope === "all") {
      handleApplyFilterToAll(effectId);
    } else {
      handleApplyFilterToPhoto(slotPhotoMap[selectedTemplateSlot] ?? selectedTemplateSlot, effectId);
    }
  };

  const handleChangeStudioFilterTarget = (value) => {
    setPendingSwapSlot(null);
    setStudioFilterScope(value === "all" ? "all" : "selected");
    if (value !== "all") setSelectedTemplateSlot(Number(value));
  };

  const handleDoodlePointerDown = (event, sideIndex = 0) => {
    if (editStudioTab !== "doodle") return;
    const canvas = event.currentTarget;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setIsDoodling(true);
    setActiveStudioSide(sideIndex);
    currentDoodleSideRef.current = sideIndex;
    currentDoodlePathRef.current = [{ x, y }];
    if (typeof canvas.setPointerCapture === "function") {
      canvas.setPointerCapture(event.pointerId);
    }
  };

  const handleDoodlePointerMove = (event) => {
    if (!isDoodling || editStudioTab !== "doodle") return;
    const canvas = event.currentTarget;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    currentDoodlePathRef.current.push({ x, y });

    const pts = currentDoodlePathRef.current;
    if (pts.length >= 2) {
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];
      const previewCanvas = event.currentTarget;
      if (previewCanvas) {
        const ctx = previewCanvas.getContext("2d");
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = activeDoodleColor;
        ctx.lineWidth = activeDoodleSize * (previewCanvas.width / 400);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (activeDoodleBrush === "neon") {
          ctx.shadowColor = activeDoodleColor;
          ctx.shadowBlur = ctx.lineWidth * 2.5;
        } else if (activeDoodleBrush === "pastel") {
          ctx.globalAlpha = 0.58;
        }
        ctx.moveTo(p1.x * previewCanvas.width, p1.y * previewCanvas.height);
        ctx.lineTo(p2.x * previewCanvas.width, p2.y * previewCanvas.height);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const handleDoodlePointerUp = () => {
    if (!isDoodling) return;
    setIsDoodling(false);
    if (currentDoodlePathRef.current.length > 1) {
      setStripDoodles((prev) => [
        ...prev,
        {
          points: [...currentDoodlePathRef.current],
          color: activeDoodleColor,
          brush: activeDoodleBrush,
          size: activeDoodleSize,
          sideIndex: currentDoodleSideRef.current,
        },
      ]);
    }
    currentDoodlePathRef.current = [];
  };

  const handleUndoDoodle = () => {
    setStripDoodles((prev) => {
      const sideDoodles = prev.filter(
        (doodle) => (doodle.sideIndex ?? 0) === activeStudioSide
      );
      const lastDoodle = sideDoodles[sideDoodles.length - 1];
      return lastDoodle
        ? prev.filter((doodle) => doodle !== lastDoodle)
        : prev;
    });
  };

  const handleClearDoodles = () => {
    setStripDoodles((prev) =>
      prev.filter((doodle) => (doodle.sideIndex ?? 0) !== activeStudioSide)
    );
  };

  useEffect(() => {
    const previewCanvases = previewContainerRef.current?.querySelectorAll(
      ".strip-doodle-canvas"
    );
    if (!previewCanvases?.length) return;

    previewCanvases.forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      stripDoodles
        .filter(
          (doodle) => (doodle.sideIndex ?? 0) === Number(canvas.dataset.stripSide || 0)
        )
        .forEach((doodle) => {
          if (!doodle.points || doodle.points.length < 2) return;
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = doodle.color;
          ctx.lineWidth = doodle.size * (canvas.width / 400);
          if (doodle.brush === "neon") {
            ctx.shadowColor = doodle.color;
            ctx.shadowBlur = ctx.lineWidth * 2.5;
          } else if (doodle.brush === "pastel") {
            ctx.globalAlpha = 0.58;
          }
          const first = doodle.points[0];
          ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
          for (let i = 1; i < doodle.points.length; i += 1) {
            ctx.lineTo(
              doodle.points[i].x * canvas.width,
              doodle.points[i].y * canvas.height
            );
          }
          ctx.stroke();
          ctx.restore();
        });
    });
  }, [activeView, photoboothStep, stripDoodles]);

  const handleDecorationPointerDown = (event, type, id, sideIndex = 0) => {
    event.stopPropagation();
    setActiveStudioSide(sideIndex);
    setSelectedDecoration({ type, id });
    const targetElement = event.currentTarget;
    if (typeof targetElement.setPointerCapture === "function") {
      targetElement.setPointerCapture(event.pointerId);
    }
    const pointerId = event.pointerId;

    const container = event.currentTarget.parentElement;
    if (!container) return;
    const dragBounds = doubleStripEnabled
      ? container.closest(".studio-template-preview") || container
      : container;
    const dragBoundsRect = dragBounds.getBoundingClientRect();
    const startPointerX = event.clientX;
    const startPointerY = event.clientY;

    let initialItem = null;
    if (type === "sticker") {
      initialItem = stripDecorations.find((s) => s.id === id);
    } else {
      initialItem = stripTexts.find((t) => t.id === id);
    }
    if (!initialItem) return;
    const initialX = initialItem.x;
    const initialY = initialItem.y;
    let currentSideIndex = doubleStripEnabled
      ? Number(initialItem.sideIndex ?? sideIndex)
      : 0;
    const initialGlobalX = doubleStripEnabled
      ? currentSideIndex * 50 + initialX / 2
      : initialX;

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaXPercent =
        ((moveEvent.clientX - startPointerX) / dragBoundsRect.width) * 100;
      const deltaYPercent =
        ((moveEvent.clientY - startPointerY) / dragBoundsRect.height) * 100;
      const globalX = Math.max(
        0,
        Math.min(100, initialGlobalX + deltaXPercent)
      );
      const newSideIndex = doubleStripEnabled && globalX >= 50 ? 1 : 0;
      const newX = doubleStripEnabled
        ? (globalX - newSideIndex * 50) * 2
        : globalX;
      const newY = Math.max(0, Math.min(100, initialY + deltaYPercent));

      if (newSideIndex !== currentSideIndex) {
        currentSideIndex = newSideIndex;
        setActiveStudioSide(newSideIndex);
      }

      if (type === "sticker") {
        setStripDecorations((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, x: newX, y: newY, sideIndex: newSideIndex }
              : s
          )
        );
      } else {
        setStripTexts((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, x: newX, y: newY, sideIndex: newSideIndex }
              : t
          )
        );
      }
    };

    const onPointerUp = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const updateSelectedDecorationScale = (delta) => {
    if (!selectedDecoration) return;
    const { type, id } = selectedDecoration;
    if (type === "sticker") {
      setStripDecorations((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, scale: Math.max(0.4, Math.min(2.8, Math.round(((s.scale || 1) + delta) * 10) / 10)) }
            : s
        )
      );
    } else {
      setStripTexts((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, scale: Math.max(0.4, Math.min(2.8, Math.round(((t.scale || 1) + delta) * 10) / 10)) }
            : t
        )
      );
    }
  };

  const updateSelectedDecorationRotation = (deltaDeg) => {
    if (!selectedDecoration) return;
    const { type, id } = selectedDecoration;
    if (type === "sticker") {
      setStripDecorations((prev) =>
        prev.map((s) => (s.id === id ? { ...s, rotation: ((s.rotation || 0) + deltaDeg) % 360 } : s))
      );
    } else {
      setStripTexts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, rotation: ((t.rotation || 0) + deltaDeg) % 360 } : t))
      );
    }
  };

  const nudgeSelectedDecorationHorizontally = (delta) => {
    if (!selectedDecoration) return;
    const { type, id } = selectedDecoration;
    const updateX = (item) =>
      item.id === id
        ? { ...item, x: clampNumber(Number(item.x) + delta, 0, 100) }
        : item;

    if (type === "sticker") {
      setStripDecorations((prev) => prev.map(updateX));
    } else if (type === "text") {
      setStripTexts((prev) => prev.map(updateX));
    }
  };

  const handlePhotoboothTemplateUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.type !== "image/png" && !/\.png$/i.test(file.name || "")) {
      setStatus("Pilih file PNG untuk template strip");
      event.target.value = "";
      return;
    }

    setPendingPhotoboothTemplateFile(file);
    setStatus(`${file.name} siap disimpan`);
    event.target.value = "";
    window.setTimeout(() => setStatus(""), 2500);
  };

  const readStripImageSize = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("File PNG tidak dapat dibaca"));
    image.src = src;
  });

  const handleSavePhotoboothTemplate = async () => {
    const file = pendingPhotoboothTemplateFile;
    const stripId = adminEditingStrip?.id;
    if (!file || !stripId) return;
    setIsUploadingTemplate(true);
    setStatus("Menyimpan template strip...");
    try {
      const dataBase64 = await readFileAsBase64(file);
      const imageUrl = `data:image/png;base64,${dataBase64}`;
      const size = await readStripImageSize(imageUrl);
      let uploaded = null;
      if (backendReadyRef.current) {
        const current = stripManagementRef.current;
        const ready = await persistPhotoboothStrips({ strip_options: current.options,
          default_strip_id: current.settings.defaultStripId, strip_settings: current.settings.stripSettings || {} });
        if (ready) {
          try {
            const data = await requestBackendJson(`${API_URL}/photobooth/template`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ strip_id: stripId, filename: file.name, data_base64: dataBase64 }),
            });
            if (data.success !== true) throw new Error(data.message || "Gagal menyimpan PNG");
            uploaded = data.strip_options?.find((strip) => strip.id === stripId);
          } catch (error) {
            // Validation errors are actionable; disconnected IO can use the local cache.
            if (error.status >= 400 && error.status < 500) throw error;
          }
        }
      }
      const current = stripManagementRef.current;
      const target = current.options.find((strip) => strip.id === stripId);
      if (!target) return;
      const next = uploaded
        ? { ...target, ...uploaded, name: target.name, active: target.active }
        : { ...target, image_url: imageUrl, ...size, slots: [] };
      const payload = commitPhotoboothStripChanges(current.options.map((strip) => strip.id === stripId ? next : strip));
      if (!payload) return;
      const saved = await persistPhotoboothStrips(payload);
      setLastDetectedSlot(uploaded?.slot_count || null);
      setPendingPhotoboothTemplateFile(null);
      setStatus(saved ? "Template strip berhasil disimpan" : "Template tersimpan lokal; akan disinkronkan saat backend siap");
    } catch (error) {
      setStatus(error.message || "Gagal menyimpan template strip");
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  const handlePhotoboothTemplateReset = async () => {
    const stripId = adminEditingStrip?.id;
    if (!stripId) return;
    const current = stripManagementRef.current;
    const options = current.options.map((strip) => strip.id === stripId
      ? { ...strip, image_url: null, slots: [], width: null, height: null } : strip);
    const payload = commitPhotoboothStripChanges(options);
    if (!payload) return;
    setPendingPhotoboothTemplateFile(null);
    setLastDetectedSlot(null);
    const saved = await persistPhotoboothStrips(payload);
    setStatus(saved ? "Template strip direset" : "Template direset secara lokal; akan disinkronkan saat backend siap");
  };

  const addSelectedFiles = (files, inputMode = "user") => {
    setUploadInputMode(inputMode);
    const imageFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png)$/i.test(file.name || file.webkitRelativePath || "")
    );

    setSelectedFiles((currentFiles) => {
      const indexedFiles = new Map(
        currentFiles.map((file) => [
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file,
        ])
      );

      imageFiles.forEach((file) => {
        indexedFiles.set(
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file
        );
      });

      return Array.from(indexedFiles.values());
    });
  };

  const handleSelectFiles = (event) => {
    addSelectedFiles(Array.from(event.target.files || []), "user");
  };

  const handleSelectFolderFiles = (event) => {
    addSelectedFiles(Array.from(event.target.files || []), "user");
  };

  const handleDropFiles = (event) => {
    event.preventDefault();
    setIsDragging(false);
    addSelectedFiles(Array.from(event.dataTransfer.files || []), "user");
  };

  const saveAutoWatchFolder = async (folderPath) => {
    const folder = folderPath.trim();
    const drive = driveFolderId.trim();
    const response = await fetch(`${API_URL}/auto-watch-folder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        folder_path: folder,
        drive_folder_id: drive || null,
      }),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Gagal mengaktifkan folder watcher");
    }

    if (watchFolderDraftRef.current === null || watchFolderDraftRef.current.trim() === folder) {
      watchFolderDraftRef.current = null;
    }
    if (driveFolderDraftRef.current === null || driveFolderDraftRef.current.trim() === drive) {
      driveFolderDraftRef.current = null;
    }
    watchSettingsRevisionRef.current += 1;
    return data.watch;
  };

  const saveWatchDriveTarget = async () => {
    const draft = driveFolderDraftRef.current;
    if (draft === null || !backendReady || !activeWatchFolder?.folder_path) return;
    const revision = watchSettingsRevisionRef.current;

    try {
      const response = await fetchWithTimeout(`${API_URL}/auto-watch-folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drive_folder_id: draft.trim() || null }),
      }, 5000);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal menyimpan tujuan Google Drive");
      }
      if (revision !== watchSettingsRevisionRef.current) return;
      driveFolderDraftRef.current = null;
      watchSettingsRevisionRef.current += 1;
      setDriveFolderId(data.watch.drive_folder_id || "");
      setActiveWatchFolder(data.watch);
    } catch (error) {
      setStatus(error.message || "Gagal menyimpan tujuan Google Drive");
    }
  };

  const handlePickWatchFolder = async () => {
    setUploadInputMode("folder");

    try {
      const folderPath = await invoke("pick_folder_path");

      if (folderPath) {
        watchSettingsRevisionRef.current += 1;
        watchFolderDraftRef.current = folderPath;
        setWatchFolderPath(folderPath);
        setIsSavingWatchFolder(true);
        setStatus("Membaca folder...");
        const watch = await saveAutoWatchFolder(folderPath);
        setActiveWatchFolder(watch);
        setStatus("Folder aktif, file baru akan masuk ke daftar terpilih");
      }
    } catch (error) {
      const message = String(error || "");

      if (!message.includes("dibatalkan")) {
        setStatus(message || "Gagal memilih folder watch");
      }
    } finally {
      setIsSavingWatchFolder(false);
      window.setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleSetAutoWatchFolder = async () => {
    if (!backendReady) {
      setStatus("Backend belum siap");
      return;
    }

    if (!watchFolderPath.trim()) {
      setStatus("Isi folder path dulu");
      return;
    }

    setIsSavingWatchFolder(true);
    setStatus("Mengaktifkan folder watcher...");

    try {
      const watch = await saveAutoWatchFolder(watchFolderPath);
      setActiveWatchFolder(watch);
      setUploadInputMode("folder");
      setStatus("Folder aktif, file baru akan masuk ke daftar terpilih");
    } catch (error) {
      setStatus(error.message || "Gagal mengaktifkan folder watcher");
    } finally {
      setIsSavingWatchFolder(false);
      window.setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleDisableAutoWatchFolder = async () => {
    if (!backendReady || isStoppingWatchFolder) {
      return;
    }

    setIsStoppingWatchFolder(true);
    setStatus("Mematikan pembacaan folder...");

    try {
      const response = await fetch(`${API_URL}/auto-watch-folder`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal mematikan pembacaan folder");
      }

      setActiveWatchFolder(data.watch);
      watchSettingsRevisionRef.current += 1;
      setStatus("Pembacaan folder dimatikan");
    } catch (error) {
      setStatus(error.message || "Gagal mematikan pembacaan folder");
    } finally {
      setIsStoppingWatchFolder(false);
      window.setTimeout(() => setStatus(""), 2500);
    }
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    setUploadInputMode("user");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  };

  const handleManualUpload = async () => {
    const watchPendingFiles = activeWatchFolder?.pending_files || [];

    if (!backendReady) {
      setStatus("Backend belum siap");
      return;
    }

    if (uploadInputMode === "folder" && watchPendingFiles.length === 0) {
      setStatus("Belum ada file baru dari folder");
      return;
    }

    if (uploadInputMode !== "folder" && selectedFiles.length === 0) {
      setStatus("Pilih file dulu");
      return;
    }

    if (!driveFolderId.trim()) {
      setStatus("Isi Google Drive Folder ID dulu");
      return;
    }

    setIsUploading(true);
    setStatus("Menyiapkan file ke queue...");

    let batchId = null;

    try {
      window.clearTimeout(watermarkSettingsSaveRef.current.timer);
      await flushWatermarkSettings();

      if (uploadInputMode === "folder") {
        const response = await fetch(`${API_URL}/auto-watch-folder/commit-pending`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            drive_folder_id: driveFolderId.trim(),
          }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Gagal membuka auto upload folder");
        }

        setUploadProgress({
          total: data.committed,
          queueIds: data.queue_ids || [],
          files: (data.files || []).map((file) => ({
            name: file.name,
            path: file.path,
            size: file.size,
            image_url: `${API_URL}/auto-watch-folder/file?path=${encodeURIComponent(file.path)}`,
          })),
          source: "folder",
        });
        setActiveWatchFolder(data.watch);
        setUploadStep(3);
        setStatus(
          data.committed > 0
            ? `${data.committed} file diproses, auto upload berikutnya aktif`
            : "Auto upload berikutnya aktif"
        );
        await loadQueue();
        return;
      }

      const uploadedQueueIds = [];
      batchId = `auto-${Date.now()}-${crypto.randomUUID()}`;

      for (const file of selectedFiles) {
        const uploadParams = new URLSearchParams({
          filename: file.webkitRelativePath || file.name,
          drive_folder_id: driveFolderId.trim(),
          batch_id: batchId,
        });
        const response = await fetch(`${API_URL}/manual-upload?${uploadParams}`, {
          method: "POST",
          body: file,
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || `Gagal upload ${file.name}`);
        }

        uploadedQueueIds.push(data.queue_id);
      }

      const commitResponse = await fetch(`${API_URL}/manual-upload/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batch_id: batchId,
        }),
      });
      const commitData = await commitResponse.json();

      if (!commitResponse.ok || !commitData.success) {
        throw new Error(commitData.message || "Gagal membuka batch upload");
      }

      setUploadProgress({
        total: selectedFiles.length,
        queueIds: uploadedQueueIds.filter(Boolean),
        files: selectedFiles.map((file) => ({
          name: file.webkitRelativePath || file.name,
          size: file.size,
        })),
        source: "user",
      });
      clearSelectedFiles();
      setUploadStep(3);
      setStatus("Semua file masuk queue, upload dimulai");
      await loadQueue();
    } catch (error) {
      if (batchId) {
        fetch(`${API_URL}/manual-upload/cancel`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            batch_id: batchId,
          }),
        });
      }

      setStatus(
        error.message === "Load failed" || error instanceof TypeError
          ? "Gagal mengirim file ke backend. Restart backend lalu coba lagi."
          : error.message || "Gagal menambahkan file"
      );
    } finally {
      setIsUploading(false);
      window.setTimeout(() => setStatus(""), 3000);
    }
  };

  const activeProgressIds = new Set(queue.map((item) => item.id));
  const watchPendingFiles = activeWatchFolder?.pending_files || [];
  const selectedUploadCount =
    uploadInputMode === "folder" ? watchPendingFiles.length : selectedFiles.length;
  const uploadedCount =
    uploadProgress.total === 0
      ? 0
      : uploadProgress.queueIds.filter((id) => !activeProgressIds.has(id))
          .length;
  const queueSummary = {
    total: queue.length,
    pending: queue.filter((item) => item.status === "pending").length,
    processing: queue.filter((item) => item.status === "processing").length,
    failed: queue.filter((item) => item.status === "failed").length,
  };
  const uploadBatchQueueMap = new Map(queue.map((item) => [item.id, item]));
  const uploadPreviewItems = (uploadProgress.files || []).map((file, index) => {
    const queueId = uploadProgress.queueIds[index];
    const queueItem = uploadBatchQueueMap.get(queueId);
    const statusValue = queueItem?.status || (queueId ? "uploaded" : "pending");

    return {
      id: queueId || file.path || file.name || index,
      name: queueItem?.filename || file.name || `File ${index + 1}`,
      size: file.size || 0,
      image_url: queueItem?.image_url || file.image_url || null,
      status: statusValue,
      error: queueItem?.last_error || "",
      meta:
        statusValue === "uploaded"
          ? "Selesai upload"
          : statusValue === "processing"
            ? "Sedang berjalan"
            : statusValue === "failed"
              ? "Butuh tindakan"
              : "Menunggu giliran",
    };
  });
  const uploadPreviewSummary = {
    total: uploadPreviewItems.length,
    uploaded: uploadPreviewItems.filter((item) => item.status === "uploaded").length,
    processing: uploadPreviewItems.filter((item) => item.status === "processing").length,
    pending: uploadPreviewItems.filter(
      (item) => item.status === "pending" || item.status === "staged"
    ).length,
    failed: uploadPreviewItems.filter((item) => item.status === "failed").length,
  };
  const photoQueueSummary = {
    total: photoQueue.length,
    pending: photoQueue.filter((item) => item.status === "pending").length,
    processing: photoQueue.filter((item) => item.status === "processing").length,
    failed: photoQueue.filter((item) => item.status === "failed").length,
  };
  const adminRecentQueue = [...photoQueue, ...queue]
    .sort((first, second) => Number(second.id || 0) - Number(first.id || 0))
    .slice(0, 8);
  const activeWatchLabel = activeWatchFolder?.enabled
    ? activeWatchFolder.auto_upload_enabled
      ? "Auto upload aktif"
      : "Membaca file baru"
    : "Belum aktif";
  const getQueueStatusLabel = (status) => {
    if (status === "processing") {
      return "Mengupload";
    }

    if (status === "pending") {
      return "Menunggu";
    }

    if (status === "failed") {
      return "Gagal";
    }

    if (status === "staged") {
      return "Siap dikirim";
    }

    if (status === "uploaded") {
      return "Terupload";
    }

    return status;
  };
  const getQueueMeta = (item) => {
    if (item.status === "failed" && item.last_error) {
      return "Butuh tindakan";
    }

    if (item.status === "pending" && item.next_attempt_at) {
      return `Retry ${item.retry || 0}`;
    }

    if (item.status === "processing") {
      return "Sedang berjalan";
    }

    return item.drive_folder_id || "Folder default";
  };

  const handleClearQueue = async () => {
    if (!backendReady || isClearingQueue) {
      return;
    }

    setIsClearingQueue(true);
    setStatus("Membersihkan queue...");

    try {
      const response = await fetch(`${API_URL}/queue/clear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "auto_upload",
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal membersihkan queue");
      }

      setUploadProgress({
        total: 0,
        queueIds: [],
        files: [],
        source: null,
      });
      setStatus(`${data.deleted} item queue dibersihkan`);
      await loadQueue();
    } catch (error) {
      setStatus(error.message || "Gagal membersihkan queue");
    } finally {
      setIsClearingQueue(false);
      window.setTimeout(() => setStatus(""), 2500);
    }
  };

  const handleRetryFailed = async () => {
    if (!backendReady || isRetryingFailed) {
      return;
    }

    setIsRetryingFailed(true);
    setStatus("Mengulang queue failed...");

    try {
      const response = await fetch(`${API_URL}/queue/retry-failed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "auto_upload",
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal mengulang queue");
      }

      setStatus(`${data.retried} item queue gagal akan diulang`);
      await loadQueue();
    } catch (error) {
      setStatus(error.message || "Gagal mengulang queue");
    } finally {
      setIsRetryingFailed(false);
      window.setTimeout(() => setStatus(""), 2500);
    }
  };

  const handleCleanManualUploads = async () => {
    if (!backendReady || isCleaningManualUploads) {
      return;
    }
    setIsCleaningManualUploads(true);
    setStatus("Membersihkan file upload lama...");
    try {
      const response = await fetch(`${API_URL}/maintenance/manual-uploads/cleanup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_age_seconds: 0,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal membersihkan file upload lama");
      }
      setStatus(`${data.deleted} file upload lama dibersihkan`);
      await loadQueue();
    } catch (error) {
      setStatus(error.message || "Gagal membersihkan file upload lama");
    } finally {
      setIsCleaningManualUploads(false);
      window.setTimeout(() => setStatus(""), 2500);
    }
  };

  const handleEditSelectFiles = (event) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png)$/i.test(file.name || file.webkitRelativePath || "")
    );
    setEditSelectedFiles((currentFiles) => {
      const indexedFiles = new Map(
        currentFiles.map((file) => [
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file,
        ])
      );
      imageFiles.forEach((file) => {
        indexedFiles.set(
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file
        );
      });
      return Array.from(indexedFiles.values());
    });
  };

  const handleEditClearFiles = () => {
    setEditSelectedFiles([]);
  };

  const handleEditDropFiles = (event) => {
    event.preventDefault();
    setIsEditDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    const imageFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png)$/i.test(file.name || file.webkitRelativePath || "")
    );

    setEditSelectedFiles((currentFiles) => {
      const indexedFiles = new Map(
        currentFiles.map((file) => [
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file,
        ])
      );

      imageFiles.forEach((file) => {
        indexedFiles.set(
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file
        );
      });

      return Array.from(indexedFiles.values());
    });
  };

  const handleEditSelectFolderFiles = (event) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png)$/i.test(file.name || file.webkitRelativePath || "")
    );

    setEditSelectedFiles((currentFiles) => {
      const indexedFiles = new Map(
        currentFiles.map((file) => [
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file,
        ])
      );

      imageFiles.forEach((file) => {
        indexedFiles.set(
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file
        );
      });

      return Array.from(indexedFiles.values());
    });
  };

  const handleEditSaveAndUpload = async () => {
    const filesToUpload =
      editUploadInputMode === "folder"
        ? (activeWatchFolder?.pending_files || [])
        : editSelectedFiles;
    if (!backendReady || filesToUpload.length === 0) return;
    setStatus("Menyimpan & mengoptimasi...");
    let batchId = null;
    try {
      batchId = `edit-${Date.now()}-${crypto.randomUUID()}`;
      const commonParams = {
        drive_folder_id: driveFolderId.trim() || "default",
        batch_id: batchId,
        brightness: String(editEnhance.brightness),
        contrast: String(editEnhance.contrast),
        saturation: String(editEnhance.saturation),
        sharpness: String(editEnhance.sharpness),
        filter: editFilter,
        resize_mode: editResizeMode,
        width: editResizeWidth,
        height: editResizeHeight,
        rotation: String(editRotation),
        flip_h: editFlipH ? "true" : "false",
        flip_v: editFlipV ? "true" : "false",
        crop: editCrop ? JSON.stringify([editCropX, editCropY, editCropW, editCropH]) : "",
        temperature: String(editTemperature),
        tint: String(editTint),
        vignette: String(editVignette),
        text_overlays: editTextOverlays.length
          ? JSON.stringify(
              editTextOverlays.map((overlay) => ({
                text: overlay.text,
                size: overlay.size,
                font: overlay.font,
                color: overlay.color,
                opacity: overlay.opacity,
                x: overlay.x,
                y: overlay.y,
                align: overlay.align,
              }))
            )
          : "",
      };

      for (const file of filesToUpload) {
        const uploadParams = new URLSearchParams({
          filename: file.webkitRelativePath || file.name,
          ...commonParams,
        });
        const response = await fetch(`${API_URL}/manual-upload?${uploadParams}`, {
          method: "POST",
          body: file instanceof File ? file : undefined,
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Gagal upload ${file.name}`);
        }
      }

      const commitResponse = await fetch(`${API_URL}/manual-upload/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const commitData = await commitResponse.json();
      if (!commitResponse.ok || !commitData.success) {
        throw new Error(commitData.message || "Gagal membuka batch upload");
      }

      setStatus("Berhasil disimpan dan masuk antrean upload!");
      setEditUploadStep(1);
      setEditSelectedFiles([]);
      await loadQueue();
    } catch (error) {
      if (batchId) {
        try {
          await fetch(`${API_URL}/manual-upload/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batch_id: batchId }),
          });
        } catch (cancelError) {
          console.warn(cancelError);
        }
      }
      setStatus("Gagal menyimpan: " + error.message);
    } finally {
      window.setTimeout(() => setStatus(""), 3000);
    }
  };

  const failedQueueCount = queue.filter((item) => item.status === "failed").length;
  const photoFailedQueueCount = photoQueue.filter(
    (item) => item.status === "failed"
  ).length;
  const latestCapture = captures[0];
  const photoboothSlotCaptures = captures
    .slice(0, photoboothCaptureCount)
    .reverse();
  const getPhotoboothEffect = (effectId) =>
    STUDIO_PHOTOBOOTH_EFFECTS.find((effect) => effect.id === effectId) ||
    STUDIO_PHOTOBOOTH_EFFECTS[0];
  const selectedEditCapture =
    photoboothSlotCaptures[selectedEditPhotoIndex] || null;
  const draftEffect = getPhotoboothEffect(draftPhotoEffect);
  const selectedSlotAdjustment =
    templatePhotoAdjustments[selectedTemplateSlot] || DEFAULT_SLOT_ADJUSTMENT;
  const filledStripSlotCount = slotPhotoMap
    .slice(0, photoboothPhotoCount)
    .filter((photoIndex) => photoboothSlotCaptures[photoIndex]).length;
  const photoboothCompositionKey = JSON.stringify({
    strip: selectedPhotoboothStrip?.id,
    stripUrl: activePhotoboothTemplate?.image_url,
    count: photoboothPhotoCount,
    captures: photoboothSlotCaptures.map((capture) => capture?.file || capture?.filename || ""),
    slotPhotoMap: slotPhotoMap.slice(0, photoboothPhotoCount),
    adjustments: templatePhotoAdjustments.slice(0, photoboothPhotoCount),
    effects: photoEffectMap,
    stickers: stripDecorations,
    texts: stripTexts,
    doodles: stripDoodles,
    frameColor: studioFrameColor,
    doubleStripEnabled,
    paperSize: activePaperSize,
  });
  useEffect(() => {
    const previousKey = photoboothCompositionKeyRef.current;
    if (previousKey && previousKey !== photoboothCompositionKey) {
      clearPhotoboothGifs();
      setPhotoboothFinalComposite(null);
      setPhotoboothFinalPreviewUrl(null);
      setPhotoboothDeliveryStatus({ drive: "idle", printer: "idle" });
      photoboothFinalBase64Ref.current = null;
      lastStripResultRef.current = null;
    }
    photoboothCompositionKeyRef.current = photoboothCompositionKey;
  }, [photoboothCompositionKey]);
  const photoboothDriveQrUrl = createQrCodeUrl(
    photoboothDriveResult?.folder_url
  );
  const currentWatermarkSettings =
    watermarkSettings[watermarkOrientation] || DEFAULT_WATERMARK_PROFILES[watermarkOrientation];
  const previewWatermarkSettings =
    watermarkSettings[previewOrientation] || DEFAULT_WATERMARK_PROFILES[previewOrientation];
  const currentWatermarkImageUrl = watermark?.image_urls?.[watermarkOrientation];
  const previewWatermarkImageUrl = watermark?.image_urls?.[previewOrientation];
  const activeWatermarkItems =
    previewWatermarkImageUrl
      ? [{
          id: "active-watermark",
          name: "Watermark aktif",
          image_url: previewWatermarkImageUrl,
          opacity: previewWatermarkSettings.opacity,
        }]
      : [];
  const photoboothProgressPercent =
    ((photoboothStep - 1) / (PHOTOBOOTH_STEPS.length - 1)) * 100;

  const getManualPreviewWidth = () => {
    if (!autoPreviewInfo) {
      return `${previewWatermarkSettings.scale}%`;
    }

    const referenceSize = Math.min(
      autoPreviewInfo.width,
      autoPreviewInfo.height
    );
    const widthPercent =
      (referenceSize / autoPreviewInfo.width) *
      previewWatermarkSettings.scale;

    return `${widthPercent}%`;
  };

  const getPreviewWatermarkStyle = () => {
    if (previewWatermarkSettings.fit === "frame") {
      return {
        left: "50%",
        top: "50%",
        width: "100%",
        height: "100%",
        objectFit: "fill",
        transform: "translate(-50%, -50%)",
      };
    }

    const style = {
      width: getManualPreviewWidth(),
      height: "auto",
      transform: `rotate(${previewWatermarkSettings.rotation}deg)`,
    };

    const transforms = [];

    if (previewWatermarkSettings.position.includes("top")) {
      style.top = "4%";
    }

    if (previewWatermarkSettings.position.includes("bottom")) {
      style.bottom = "4%";
    }

    if (previewWatermarkSettings.position.includes("left")) {
      style.left = "4%";
    }

    if (previewWatermarkSettings.position.includes("right")) {
      style.right = "4%";
    }

    if (previewWatermarkSettings.position === "center") {
      style.top = "50%";
      style.left = "50%";
      transforms.push("translate(-50%, -50%)");
    } else if (previewWatermarkSettings.position.includes("center")) {
      if (previewWatermarkSettings.position.startsWith("center")) {
        style.top = "50%";
        transforms.push("translateY(-50%)");
      }

      if (previewWatermarkSettings.position.endsWith("center")) {
        style.left = "50%";
        transforms.push("translateX(-50%)");
      }
    }

    transforms.push(`rotate(${previewWatermarkSettings.rotation}deg)`);
    style.transform = transforms.join(" ");

    return style;
  };

  const getFramePreviewPhotoStyle = () => ({
    left: "50%",
    top: "50%",
    width: `${previewWatermarkSettings.photo_scale}%`,
    height: `${previewWatermarkSettings.photo_scale}%`,
    objectFit: "fill",
    transform: `translate(-50%, -50%) translate(${previewWatermarkSettings.photo_x}%, ${previewWatermarkSettings.photo_y}%)`,
  });

  const flushWatermarkSettings = async () => {
    const saveState = watermarkSettingsSaveRef.current;

    if (saveState.inFlight || !saveState.pending || !backendReady) {
      return;
    }

    const { orientation, saveId, settings } = saveState.pending;
    saveState.pending = null;
    saveState.inFlight = true;

    try {
      const response = await fetch(`${API_URL}/watermark/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orientation,
          ...settings,
        }),
      });
      if (!response.ok && saveId === watermarkSettingsSaveId.current) {
        setStatus("Gagal menyimpan setting watermark");
      }
    } catch {
      setStatus("Gagal menyimpan setting watermark");
    } finally {
      saveState.inFlight = false;

      if (saveState.pending) {
        flushWatermarkSettings();
      }
    }
  };

  const updateWatermarkSettings = (nextSettings) => {
    const saveId = watermarkSettingsSaveId.current + 1;
    watermarkSettingsSaveId.current = saveId;
    const orientation = watermarkOrientation;

    setWatermarkSettings((currentSettings) => ({
      ...currentSettings,
      [orientation]: nextSettings,
    }));
    setWatermark((current) => ({
      ...(current || {}),
      settings: {
        ...normalizeWatermarkSettings(current?.settings || watermarkSettings),
        [orientation]: nextSettings,
      },
    }));

    if (!backendReady) {
      return;
    }

    const saveState = watermarkSettingsSaveRef.current;
    saveState.pending = {
      orientation,
      saveId,
      settings: nextSettings,
    };
    window.clearTimeout(saveState.timer);
    saveState.timer = window.setTimeout(flushWatermarkSettings, 250);
  };

  const updatePhotoboothFrameSettings = (partialSettings) => {
    updateWatermarkSettings({
      ...currentWatermarkSettings,
      fit: "frame",
      ...partialSettings,
    });
  };

  const handleWatermarkOpacityChange = (event) => {
    updateWatermarkSettings({
      ...currentWatermarkSettings,
      opacity: Number(event.target.value),
    });
  };

  const updateTemplateSlotAdjustment = (partialAdjustment) => {
    setTemplatePhotoAdjustments((currentAdjustments) =>
      photoboothTemplateSlots.map((_, index) => {
        const currentAdjustment =
          currentAdjustments[index] || DEFAULT_SLOT_ADJUSTMENT;

        if (index !== selectedTemplateSlot) {
          return currentAdjustment;
        }

        return {
          ...currentAdjustment,
          ...partialAdjustment,
        };
      })
    );
  };

  const getPhotoboothImageFitKey = (slotIndex, photoIndex) =>
    `${activePhotoboothTemplate?.id || activePaperSize}:${doubleStripEnabled ? "double" : "single"}:${slotIndex}:${photoIndex}`;

  const measurePhotoboothImageFit = (event, slotIndex, photoIndex) => {
    const image = event.currentTarget;
    const slotRect = image.parentElement?.getBoundingClientRect();
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;

    if (!slotRect?.width || !slotRect?.height || !imageWidth || !imageHeight) {
      return;
    }

    const regularFitScale = Math.min(
      slotRect.width / imageWidth,
      slotRect.height / imageHeight
    );
    const rotatedFitScale = Math.min(
      slotRect.width / imageHeight,
      slotRect.height / imageWidth
    );
    const key = getPhotoboothImageFitKey(slotIndex, photoIndex);
    const fitRatio = rotatedFitScale / regularFitScale;

    setPhotoboothImageFitRatios((current) => {
      if (Math.abs((current[key] || 1) - fitRatio) < 0.001) {
        return current;
      }
      return { ...current, [key]: fitRatio };
    });
  };

  const getPhotoboothPreviewScale = (slotIndex, photoIndex, adjustment) => {
    const isQuarterTurn = Math.abs((adjustment.rotation || 0) % 180) === 90;
    const rotationFitRatio = isQuarterTurn
      ? photoboothImageFitRatios[
          getPhotoboothImageFitKey(slotIndex, photoIndex)
        ] || 1
      : 1;

    return (adjustment.scale / 100) * rotationFitRatio;
  };

  const updateTemplateSlotAdjustmentByIndex = (slotIndex, partialAdjustment) => {
    setTemplatePhotoAdjustments((currentAdjustments) =>
      photoboothTemplateSlots.map((_, index) => {
        const currentAdjustment =
          currentAdjustments[index] || DEFAULT_SLOT_ADJUSTMENT;

        if (index !== slotIndex) {
          return currentAdjustment;
        }

        return {
          ...currentAdjustment,
          ...partialAdjustment,
        };
      })
    );
  };

  const updateSlotPhoto = (slotIndex, photoIndex) => {
    setSlotPhotoMap((current) =>
      current.map((value, index) =>
        index === slotIndex ? photoIndex : value
      )
    );
  };

  const swapPhotoboothSlots = (firstSlot, secondSlot) => {
    if (firstSlot === secondSlot) {
      setPendingSwapSlot(null);
      return;
    }

    setSlotPhotoMap((current) => {
      const next = [...current];
      [next[firstSlot], next[secondSlot]] = [next[secondSlot], next[firstSlot]];
      return next;
    });
    setTemplatePhotoAdjustments((current) => {
      const next = [...current];
      [next[firstSlot], next[secondSlot]] = [
        next[secondSlot] || { ...DEFAULT_SLOT_ADJUSTMENT },
        next[firstSlot] || { ...DEFAULT_SLOT_ADJUSTMENT },
      ];
      return next;
    });
    setSelectedTemplateSlot(secondSlot);
    setPendingSwapSlot(null);
  };

  const handleSelectTemplateSlot = (slotIndex) => {
    if (pendingSwapSlot !== null) {
      swapPhotoboothSlots(pendingSwapSlot, slotIndex);
      return;
    }
    setSelectedTemplateSlot(slotIndex);
  };

  const handleSelectStudioPhoto = (slotIndex, sideIndex = 0, event = null) => {
    if (event?.detail > 0 && stripPhotoWasDraggedRef.current) {
      stripPhotoWasDraggedRef.current = false;
      return;
    }
    const sourceSlotIndex = getPhotoboothSideSlotIndex(slotIndex, sideIndex);
    setActiveStudioSide(sideIndex);
    setSelectedDecoration(null);
    handleSelectTemplateSlot(sourceSlotIndex);
    if (pendingSwapSlot !== null) return;
    setStudioFilterScope("selected");
    setEditStudioTab("filter");
  };

  const handleStudioPhotoScaleChange = (value) => {
    const scale = Number(value);
    if (!Number.isFinite(scale) || !photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]) return;
    updateTemplateSlotAdjustment({ scale: clampNumber(scale, 50, 240) });
  };

  const applyPhotoToStripSlot = (slotIndex, photoIndex) => {
    if (!photoboothSlotCaptures[photoIndex]) {
      return;
    }

    setSelectedTemplateSlot(slotIndex);
    updateSlotPhoto(
      slotIndex,
      doubleStripEnabled ? photoIndex % photoboothPhotoCount : photoIndex
    );
    updateTemplateSlotAdjustmentByIndex(slotIndex, {
      ...DEFAULT_SLOT_ADJUSTMENT,
    });
  };

  const handleStripPhotoDragStart = (event, photoIndex) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", String(photoIndex));
  };

  const handleStripSlotDrop = (event, slotIndex) => {
    event.preventDefault();
    const photoIndex = Number(event.dataTransfer.getData("text/plain"));

    if (!Number.isInteger(photoIndex) || !photoboothSlotCaptures[photoIndex]) {
      return;
    }

    applyPhotoToStripSlot(slotIndex, photoIndex);
  };

  const handleStripSourcePointerDown = (event, photoIndex) => {
    event.preventDefault();
    selectEditPhoto(photoIndex);

    stripDragRef.current = {
      photoIndex,
      startX: event.clientX,
      startY: event.clientY,
    };
    setDraggingStripPhoto({
      photoIndex,
      x: event.clientX,
      y: event.clientY,
      active: false,
    });
  };

  const handleStripSourcePointerMove = (event) => {
    if (!stripDragRef.current) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - stripDragRef.current.startX,
      event.clientY - stripDragRef.current.startY
    );

    setDraggingStripPhoto({
      photoIndex: stripDragRef.current.photoIndex,
      x: event.clientX,
      y: event.clientY,
      active: distance > 4,
    });
  };

  const handleStripSourcePointerUp = (event) => {
    if (!stripDragRef.current) {
      return;
    }

    const photoIndex = stripDragRef.current.photoIndex;
    stripDragRef.current = null;
    setDraggingStripPhoto(null);

    const dropTarget = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-strip-slot]");

    if (!dropTarget) {
      return;
    }

    const slotIndex = Number(dropTarget.getAttribute("data-strip-slot"));

    if (!Number.isInteger(slotIndex)) {
      return;
    }

    applyPhotoToStripSlot(slotIndex, photoIndex);
  };

  const handleStripSlotPointerDown = (event, slotIndex) => {
    stripPhotoWasDraggedRef.current = false;
    if (pendingSwapSlot !== null) {
      setSelectedTemplateSlot(slotIndex);
      return;
    }

    if (slotPhotoMap[slotIndex] === null || slotPhotoMap[slotIndex] === undefined) {
      setSelectedTemplateSlot(slotIndex);
      return;
    }

    event.preventDefault();
    setSelectedTemplateSlot(slotIndex);

    const currentAdjustment =
      templatePhotoAdjustments[slotIndex] || DEFAULT_SLOT_ADJUSTMENT;
    const rect = event.currentTarget.getBoundingClientRect();
    stripGestureRef.current = {
      pointerId: event.pointerId,
      slotIndex,
      startX: event.clientX,
      startY: event.clientY,
      originX: currentAdjustment.x,
      originY: currentAdjustment.y,
      width: rect.width || 1,
      height: rect.height || 1,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleStripSlotPointerMove = (event, slotIndex) => {
    const gesture = stripGestureRef.current;

    if (!gesture || gesture.slotIndex !== slotIndex) {
      return;
    }

    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) {
      stripPhotoWasDraggedRef.current = true;
    }

    const nextX =
      gesture.originX + ((event.clientX - gesture.startX) / gesture.width) * 100;
    const nextY =
      gesture.originY + ((event.clientY - gesture.startY) / gesture.height) * 100;

    updateTemplateSlotAdjustmentByIndex(slotIndex, {
      x: Math.round(clampNumber(nextX, -100, 100)),
      y: Math.round(clampNumber(nextY, -100, 100)),
    });
  };

  const handleStripSlotPointerUp = (event) => {
    if (!stripGestureRef.current) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(stripGestureRef.current.pointerId);
    stripGestureRef.current = null;
  };

  const handleStripSlotWheel = (event, slotIndex) => {
    if (slotPhotoMap[slotIndex] === null || slotPhotoMap[slotIndex] === undefined) {
      return;
    }

    event.preventDefault();
    setSelectedTemplateSlot(slotIndex);

    const currentAdjustment =
      templatePhotoAdjustments[slotIndex] || DEFAULT_SLOT_ADJUSTMENT;
    const delta = event.deltaY > 0 ? -5 : 5;

    updateTemplateSlotAdjustmentByIndex(slotIndex, {
      scale: clampNumber(currentAdjustment.scale + delta, 50, 240),
    });
  };

  useEffect(() => {
    if (!draggingStripPhoto) {
      return undefined;
    }

    window.addEventListener("pointermove", handleStripSourcePointerMove);
    window.addEventListener("pointerup", handleStripSourcePointerUp);
    window.addEventListener("pointercancel", handleStripSourcePointerUp);

    return () => {
      window.removeEventListener("pointermove", handleStripSourcePointerMove);
      window.removeEventListener("pointerup", handleStripSourcePointerUp);
      window.removeEventListener("pointercancel", handleStripSourcePointerUp);
    };
  }, [draggingStripPhoto]);

  const selectEditPhoto = (photoIndex) => {
    setSelectedEditPhotoIndex(photoIndex);
    setDraftPhotoEffect(photoEffectMap[photoIndex] || "natural");
  };

  const saveSelectedPhotoEffect = () => {
    setPhotoEffectMap((current) =>
      current.map((effect, index) =>
        index === selectedEditPhotoIndex ? draftPhotoEffect : effect
      )
    );
    setStatus(`Efek Foto ${selectedEditPhotoIndex + 1} disimpan`);
    window.setTimeout(() => setStatus(""), 1800);
  };

  const loadImage = async (src) => {
    if (src.startsWith("data:")) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ image, objectUrl: null });
        image.onerror = () => reject(new Error("Gagal membaca gambar strip"));
        image.src = src;
      });
    }
    const response = await fetch(src, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Gagal membaca gambar strip");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ image, objectUrl });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Gagal membaca gambar strip"));
      };
      image.src = objectUrl;
    });
  };

  const createPhotoboothTemplateOverlayCanvas = async (template) => {
    const loaded = await loadImage(template.image_url);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = loaded.image.naturalWidth || loaded.image.width;
      canvas.height = loaded.image.naturalHeight || loaded.image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      context.drawImage(loaded.image, 0, 0, canvas.width, canvas.height);

      const photoSlots = Array.isArray(template.slots) ? template.slots : [];
      if (photoSlots.length) {
        photoSlots.forEach((slot) => {
          const slotLeft = Number(slot.left);
          const slotTop = Number(slot.top);
          const slotWidth = Number(slot.width);
          const slotHeight = Number(slot.height);

          if (
            ![slotLeft, slotTop, slotWidth, slotHeight].every(Number.isFinite) ||
            slotWidth <= 0 ||
            slotHeight <= 0
          ) {
            return;
          }

          const left = clampNumber(
            Math.floor((slotLeft / 100) * canvas.width),
            0,
            canvas.width
          );
          const top = clampNumber(
            Math.floor((slotTop / 100) * canvas.height),
            0,
            canvas.height
          );
          const right = clampNumber(
            Math.ceil(((slotLeft + slotWidth) / 100) * canvas.width),
            left,
            canvas.width
          );
          const bottom = clampNumber(
            Math.ceil(((slotTop + slotHeight) / 100) * canvas.height),
            top,
            canvas.height
          );

          if (right <= left || bottom <= top) {
            return;
          }

          const slotImageData = context.getImageData(
            left,
            top,
            right - left,
            bottom - top
          );
          const pixels = slotImageData.data;

          for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 4) {
            if (
              pixels[pixelIndex + 3] > 0 &&
              pixels[pixelIndex] >= 245 &&
              pixels[pixelIndex + 1] >= 245 &&
              pixels[pixelIndex + 2] >= 245
            ) {
              pixels[pixelIndex + 3] = 0;
            }
          }

          context.putImageData(slotImageData, left, top);
        });
      }

      return canvas;
    } finally {
      if (loaded.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let overlayObjectUrl = null;

    setPhotoboothTemplateOverlayUrl(null);

    if (!photoboothPreviewUsesUploadedTemplate) {
      return undefined;
    }

    const prepareTemplatePreview = async () => {
      try {
        const canvas = await createPhotoboothTemplateOverlayCanvas(
          activePhotoboothTemplate
        );
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );

        if (!blob || cancelled) {
          return;
        }

        overlayObjectUrl = URL.createObjectURL(blob);
        setPhotoboothTemplateOverlayUrl(overlayObjectUrl);
      } catch (error) {
        console.warn("Template photobooth gagal diproses untuk preview", error);
      }
    };

    prepareTemplatePreview();

    return () => {
      cancelled = true;

      if (overlayObjectUrl) {
        URL.revokeObjectURL(overlayObjectUrl);
      }
    };
  }, [
    activePhotoboothTemplate?.id,
    activePhotoboothTemplate?.image_url,
    activePhotoboothTemplate?.slots,
    photoboothPreviewUsesUploadedTemplate,
  ]);

  const drawTemplateOverlay = (context, image, width, height) => {
    context.drawImage(image, 0, 0, width, height);
  };

  const renderPhotoboothStrip = async ({ excludeAnimatedStickers = false } = {}) => {
    const objectUrls = [];
    if (photoboothSlotCaptures.length < photoboothCaptureCount) {
      throw new Error(`Ambil ${photoboothCaptureCount} foto dulu sebelum upload`);
    }

    const usingUploadedTemplate = photoboothPreviewUsesUploadedTemplate;
    const renderDoubleStrip = doubleStripEnabled;
    const renderSlots =
      usingUploadedTemplate && activePhotoboothTemplate.slots?.length
        ? activePhotoboothTemplate.slots.slice(0, photoboothPhotoCount)
        : activeStripSlots;

    if (filledStripSlotCount < renderSlots.length) {
      throw new Error("Isi semua kotak strip dulu dengan drag and drop foto");
    }

    const loadedImages = new Map();
    let loadedTemplate = null;

    const loadCaptureImage = async (photoIndex) => {
      if (photoIndex === null || photoIndex === undefined) {
        return null;
      }

      const capture = photoboothSlotCaptures[photoIndex];

      if (!capture) {
        return null;
      }

        if (!loadedImages.has(photoIndex)) {
          const loaded = await loadImage(`${capture.image_url}?v=${streamVersion}`);
          objectUrls.push(loaded.objectUrl);
          loadedImages.set(photoIndex, loaded);
        }

      return loadedImages.get(photoIndex);
    };

    for (let index = 0; index < renderSlots.length; index += 1) {
      await loadCaptureImage(getPhotoboothSidePhotoIndex(index));
    }

    if (usingUploadedTemplate) {
      loadedTemplate = {
        image: await createPhotoboothTemplateOverlayCanvas(
          activePhotoboothTemplate
        ),
      };
    }

    const largestSourceSide = Array.from(loadedImages.values()).reduce((largest, loadedImage) => {
      if (!loadedImage) {
        return largest;
      }

      return Math.max(
        largest,
        loadedImage.image.naturalWidth || loadedImage.image.width,
        loadedImage.image.naturalHeight || loadedImage.image.height
      );
    }, STRIP_MIN_SLOT_SIZE);
    const templateImageWidth =
      loadedTemplate?.image.naturalWidth || loadedTemplate?.image.width || null;
    const templateImageHeight =
      loadedTemplate?.image.naturalHeight || loadedTemplate?.image.height || null;
    const slotWidthRatio = (renderSlots[0]?.width || STRIP_SLOTS[0].width) / 100;
    const baseWidth = loadedTemplate
      ? templateImageWidth
      : renderDoubleStrip
        ? activePaperConfig.width / 2
        : activeStripBaseWidth;
    const baseHeight = loadedTemplate
      ? templateImageHeight
      : renderDoubleStrip
        ? activePaperConfig.height
        : activeStripBaseHeight;
    const stripScale = loadedTemplate
      ? 1
      : Math.min(
          STRIP_MAX_RENDER_SCALE,
          largestSourceSide / (baseWidth * slotWidthRatio)
        );
    const stripWidth = Math.ceil(
      (renderDoubleStrip ? baseWidth * 2 : baseWidth) *
        stripScale
    );
    const stripHeight = Math.ceil(baseHeight * stripScale);
    const canvas = document.createElement("canvas");
    canvas.width = stripWidth;
    canvas.height = stripHeight;
    const context = canvas.getContext("2d");
    const drawCanvas = renderDoubleStrip ? document.createElement("canvas") : canvas;
    drawCanvas.width = renderDoubleStrip
      ? Math.ceil(baseWidth * stripScale)
      : canvas.width;
    drawCanvas.height = canvas.height;
    const drawContext = drawCanvas.getContext("2d");

    drawContext.fillStyle = studioFrameColor;
    drawContext.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

    const drawStripSide = async (sideIndex = 0) => {
      drawContext.fillStyle = studioFrameColor;
      drawContext.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

      for (let index = 0; index < renderSlots.length; index += 1) {
        const slot = renderSlots[index];
        const sourceSlotIndex = getPhotoboothSideSlotIndex(index, sideIndex);
        const photoIndex = getPhotoboothSidePhotoIndex(index, sideIndex);
        const capture = photoboothSlotCaptures[photoIndex];
        const adjustment = templatePhotoAdjustments[sourceSlotIndex] || DEFAULT_SLOT_ADJUSTMENT;
        const savedEffect = getPhotoboothEffect(photoEffectMap[photoIndex]);

        if (!capture) {
          continue;
        }

        const loadedImage = await loadCaptureImage(photoIndex);
        const image = loadedImage.image;
        const x = (slot.left / 100) * drawCanvas.width;
        const y = (slot.top / 100) * drawCanvas.height;
        const width = (slot.width / 100) * drawCanvas.width;
        const height = (slot.height / 100) * drawCanvas.height;
        const imageWidth = image.naturalWidth || image.width;
        const imageHeight = image.naturalHeight || image.height;
        const rotation = adjustment.rotation || 0;
        const isQuarterTurn = Math.abs(rotation % 180) === 90;
        const fitScale = Math.min(
          width / (isQuarterTurn ? imageHeight : imageWidth),
          height / (isQuarterTurn ? imageWidth : imageHeight)
        );
        const drawWidth = imageWidth * fitScale * (adjustment.scale / 100);
        const drawHeight = imageHeight * fitScale * (adjustment.scale / 100);
        const offsetX = (adjustment.x / 100) * width;
        const offsetY = (adjustment.y / 100) * height;
        const slotStyleScale = drawCanvas.width / 400;
        const slotRadius = 5 * slotStyleScale;

        drawContext.save();
        traceRoundedRect(drawContext, x, y, width, height, slotRadius);
        drawContext.clip();
        if (!usingUploadedTemplate) {
          traceRoundedRect(drawContext, x, y, width, height, slotRadius);
          drawContext.fillStyle = "#f7f7f2";
          drawContext.fill();
          drawRoundedRectRing(
            drawContext,
            x,
            y,
            width,
            height,
            20 * slotStyleScale,
            slotRadius,
            "rgba(17, 19, 24, 0.08)"
          );
          drawRoundedRectRing(
            drawContext,
            x,
            y,
            width,
            height,
            12 * slotStyleScale,
            slotRadius,
            "rgba(255, 255, 255, 0.7)"
          );
        }
        drawContext.filter = savedEffect.filter;
        drawContext.imageSmoothingEnabled = true;
        drawContext.imageSmoothingQuality = "high";
        drawContext.translate(
          x + width / 2 + offsetX,
          y + height / 2 + offsetY
        );
        drawContext.rotate((rotation * Math.PI) / 180);
        drawContext.drawImage(
          image,
          -drawWidth / 2,
          -drawHeight / 2,
          drawWidth,
          drawHeight
        );
        drawContext.restore();

        if (!usingUploadedTemplate) {
          const borderWidth = slotStyleScale;
          drawContext.save();
          traceRoundedRect(
            drawContext,
            x + borderWidth / 2,
            y + borderWidth / 2,
            width - borderWidth,
            height - borderWidth,
            Math.max(0, slotRadius - borderWidth / 2)
          );
          drawContext.strokeStyle = "rgba(17, 19, 24, 0.12)";
          drawContext.lineWidth = borderWidth;
          drawContext.stroke();
          drawContext.restore();
        }
      }

      if (loadedTemplate) {
        drawContext.save();
        drawContext.filter = "none";
        drawTemplateOverlay(
          drawContext,
          loadedTemplate.image,
          drawCanvas.width,
          drawCanvas.height
        );
        drawContext.restore();
      }

    };

    await drawStripSide(0);

    if (renderDoubleStrip) {
      context.fillStyle = studioFrameColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(drawCanvas, 0, 0);
      await drawStripSide(1);
      context.drawImage(drawCanvas, drawCanvas.width, 0);
      context.save();
      context.setLineDash([18 * stripScale, 12 * stripScale]);
      context.strokeStyle = "rgba(17, 19, 24, 0.42)";
      context.lineWidth = Math.max(2, 2 * stripScale);
      context.beginPath();
      context.moveTo(drawCanvas.width, 0);
      context.lineTo(drawCanvas.width, canvas.height);
      context.stroke();
      context.restore();
    }

    const stickerImages = {};
    const renderedStickers = excludeAnimatedStickers ? stripDecorations.filter((item) => item.type !== "gif") : stripDecorations;
    await Promise.all([...new Set([...renderedStickers, ...stripTexts]
      .map((item) => item.artwork?.src || (item.type === "image" ? item.content : null)).filter(Boolean))]
      .map(async (src) => { stickerImages[src] = (await loadImage(src)).image; }));

    const drawSideDecorations = (sideIndex) => {
      context.save();
      if (renderDoubleStrip) {
        context.translate(sideIndex * drawCanvas.width, 0);
      }
      drawDecorationsToContext(
        context,
        drawCanvas.width,
        canvas.height,
        stripDoodles.filter((doodle) => (doodle.sideIndex ?? 0) === sideIndex),
        renderedStickers.filter((sticker) => (sticker.sideIndex ?? 0) === sideIndex),
        stripTexts.filter((textItem) => (textItem.sideIndex ?? 0) === sideIndex),
        stickerImages
      );
      context.restore();
    };

    drawSideDecorations(0);
    if (renderDoubleStrip) {
      drawSideDecorations(1);
    }

    objectUrls.forEach((url) => URL.revokeObjectURL(url));

    const dataUrl = canvas.toDataURL(
      "image/jpeg",
      photoboothAdminSettings.outputCompressionEnabled
        ? normalizeCompressionQuality(photoboothAdminSettings.outputCompressionQuality) / 100
        : 0.98
    );
    const dataBase64 = dataUrl.split(",")[1];

    return {
      dataUrl,
      dataBase64,
      width: canvas.width,
      height: canvas.height,
    };
  };

  const clearPhotoboothGifs = () => {
    photoboothGifRevisionRef.current += 1;
    photoboothGifAssetsRef.current = [];
    setPhotoboothGifAssets([]);
    setPhotoboothGifErrors([]);
    setIsPreparingPhotoboothGif(false);
  };

  const preparePhotoboothGifs = async (composite) => {
    const revision = photoboothGifRevisionRef.current;
    setIsPreparingPhotoboothGif(true);
    setPhotoboothGifErrors([]);
    try {
      const overlays = animatedStripOverlays(stripDecorations, composite, doubleStripEnabled);
      const prepared = await Promise.allSettled([
        photoboothSlotCaptures.length >= 2 ? photoGifFrames(photoboothSlotCaptures,
          photoboothSlotCaptures.map((_, index) => getPhotoboothEffect(photoEffectMap[index]).filter), { loadImage }) : Promise.resolve([]),
        overlays.length ? renderPhotoboothStrip({ excludeAnimatedStickers: true }) : Promise.resolve(null),
      ]);
      const errors = prepared.flatMap((result, index) => result.status === "rejected" ? [`${index === 0 ? "GIF foto" : "GIF strip"}: ${result.reason?.message || "Gagal menyiapkan GIF"}`] : []);
      const result = await requestGifAssets(API_URL, { photoFrames: prepared[0].status === "fulfilled" ? prepared[0].value : [],
        overlays, backgroundData: prepared[1].status === "fulfilled" ? prepared[1].value?.dataUrl : null });
      if (revision !== photoboothGifRevisionRef.current) return [];
      setPhotoboothGifAssets(result.assets);
      photoboothGifAssetsRef.current = result.assets;
      setPhotoboothGifErrors([...errors, ...result.errors]);
      return result.assets;
    } catch (error) {
      if (revision === photoboothGifRevisionRef.current) setPhotoboothGifErrors([error.message || "Gagal membuat GIF"]);
      return [];
    } finally { if (revision === photoboothGifRevisionRef.current) setIsPreparingPhotoboothGif(false); }
  };

  const handlePhotoboothDriveUpload = async (customFolderName, renderedDataBase64 = null, gifAssets = null) => {
    if (!backendReady || isUploadingPhotoboothDrive) {
      return false;
    }

    setIsUploadingPhotoboothDrive(true);
    setStatus("Membuat strip dan folder Google Drive...");

    try {
      const existingDataBase64 = renderedDataBase64 ||
        photoboothFinalComposite?.dataBase64 ||
        photoboothFinalBase64Ref.current;
      const renderedComposite = existingDataBase64 ? null : await renderPhotoboothStrip();
      const dataBase64 = existingDataBase64 || renderedComposite?.dataBase64;
      const response = await fetch(`${API_URL}/photobooth/drive-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: "photobooth-strip.jpg",
          data_base64: dataBase64,
          folder_name: customFolderName,
          parent_drive_folder_id: photoboothInitialDriveFolderId,
          gif_files: (gifAssets || photoboothGifAssetsRef.current).map((item) => ({ filename: item.filename, data_base64: item.dataBase64 })),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal upload photobooth");
      }

      setPhotoboothDriveResult(data);
      setStatus(`Folder ${data.folder_name} dibuat`);
      loadPhotoQueue().catch(() => {});
      return true;
    } catch (error) {
      setStatus(error.message || "Gagal upload photobooth");
      return false;
    } finally {
      setIsUploadingPhotoboothDrive(false);
      window.setTimeout(() => setStatus(""), 3500);
    }
  };

  const finalizePhotobooth = async () => {
    if (photoboothFinalizationLockRef.current || isFinalizingPhotobooth || isRenderingPhotoboothPreview) return;
    if (photoboothSlotCaptures.length < photoboothCaptureCount) {
      setStatus(`Ambil ${photoboothCaptureCount} foto dulu sebelum menyimpan`);
      return;
    }
    if (filledStripSlotCount < Math.min(activePhotoboothTemplateSlots.length, photoboothPhotoCount)) {
      setStatus("Isi semua kotak strip dulu sebelum menyimpan");
      return;
    }

    photoboothFinalizationLockRef.current = true;
    setIsFinalizingPhotobooth(true);
    setIsRenderingPhotoboothPreview(true);
    setPhotoboothDeliveryStatus({ drive: "pending", printer: "pending" });
    setPhotoboothDriveResult(null);
    setPrintError("");
    setStatus("Menyusun strip final beresolusi tinggi...");

    try {
      const composite = await renderPhotoboothStrip();
      setPhotoboothFinalComposite(composite);
      setPhotoboothFinalPreviewUrl(composite.dataUrl);
      photoboothFinalBase64Ref.current = composite.dataBase64;
      lastStripResultRef.current = composite.dataUrl;
      setIsRenderingPhotoboothPreview(false);
      setPhotoboothStep(isOtoPhotoboothMode ? 5 : 4);

      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      let jobId = 1;
      try {
        const response = await fetch(`${API_URL}/photobooth/next-job-id`);
        const data = await response.json();
        if (response.ok && data.success) jobId = data.job_id;
      } catch {
        // The existing fallback job number keeps final delivery available offline.
      }
      const folderName = `Job - ${jobId} - ${hours}`;
      const updateDeliveryStatus = (target, statusValue) =>
        setPhotoboothDeliveryStatus((current) => ({ ...current, [target]: statusValue }));

      await Promise.all([
        preparePhotoboothGifs(composite).then((gifs) => handlePhotoboothDriveUpload(folderName, composite.dataBase64, gifs)).then((success) => {
          updateDeliveryStatus("drive", success ? "success" : "failed");
        }),
        printPhotoboothStrip(composite.dataBase64).then((success) => {
          updateDeliveryStatus("printer", success ? "success" : "failed");
        }),
      ]);
    } catch (error) {
      setPhotoboothDeliveryStatus({ drive: "failed", printer: "failed" });
      setStatus(error.message || "Gagal membuat hasil photobooth");
      setPhotoboothStep(isOtoPhotoboothMode ? 4 : 3);
    } finally {
      photoboothFinalizationLockRef.current = false;
      setIsRenderingPhotoboothPreview(false);
      setIsFinalizingPhotobooth(false);
    }
  };

  const formatCompressEditSize = (size) => {
    if (!size) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let sizeNum = Number(size);
    let unitIndex = 0;
    while (sizeNum >= 1024 && unitIndex < units.length - 1) {
      sizeNum /= 1024;
      unitIndex++;
    }
    return `${sizeNum.toFixed(1).replace(".0", "")} ${units[unitIndex]}`;
  };

  const updateCompressEditAdjustment = (key, value) => {
    setCompressEditAdjustments((prev) => ({
      ...prev,
      [key]: Number(value),
    }));
  };

  const handleAdjustmentChangeEnd = () => {
    saveCompressEditHistory();
  };

  const saveCompressEditHistory = () => {
    setCompressEditHistory((prev) => {
      const next = [...prev.slice(0, compressEditHistoryIndex + 1), { ...compressEditAdjustments }];
      return next.slice(-20);
    });
    setCompressEditHistoryIndex((prev) => prev + 1);
  };

  const undoCompressEdit = () => {
    if (compressEditHistoryIndex <= 0) return;
    const prev = compressEditHistory[compressEditHistoryIndex - 1];
    setCompressEditAdjustments(prev);
    setCompressEditHistoryIndex((prevIdx) => prevIdx - 1);
  };

  const redoCompressEdit = () => {
    if (compressEditHistoryIndex >= compressEditHistory.length - 1) return;
    const next = compressEditHistory[compressEditHistoryIndex + 1];
    setCompressEditAdjustments(next);
    setCompressEditHistoryIndex((prevIdx) => prevIdx + 1);
  };

  const handleCompressEditSelectFiles = (event) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png)$/i.test(file.name || file.webkitRelativePath || "")
    );
    setCompressEditFiles((currentFiles) => {
      const indexedFiles = new Map(
        currentFiles.map((file) => [
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file,
        ])
      );
      imageFiles.forEach((file) => {
        indexedFiles.set(
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file
        );
      });
      return Array.from(indexedFiles.values());
    });
  };

  const handleCompressEditSelectFolder = (event) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png)$/i.test(file.name || file.webkitRelativePath || "")
    );
    setCompressEditInputMode("folder");
    setCompressEditFiles((currentFiles) => {
      const indexedFiles = new Map(
        currentFiles.map((file) => [
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file,
        ])
      );
      imageFiles.forEach((file) => {
        indexedFiles.set(
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file
        );
      });
      return Array.from(indexedFiles.values());
    });
  };

  const handleCompressEditDropFiles = (event) => {
    event.preventDefault();
    setIsCompressEditDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    const imageFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(jpe?g|png)$/i.test(file.name || file.webkitRelativePath || "")
    );
    setCompressEditFiles((currentFiles) => {
      const indexedFiles = new Map(
        currentFiles.map((file) => [
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file,
        ])
      );
      imageFiles.forEach((file) => {
        indexedFiles.set(
          `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`,
          file
        );
      });
      return Array.from(indexedFiles.values());
    });
  };

  const clearCompressEditFiles = () => {
    setCompressEditFiles([]);
  };

  const loadPrinters = async ({ signal } = {}) => {
    if (signal?.aborted || (!backendReadyRef.current && !backendReady)) {
      return;
    }

    setIsLoadingPrinters(true);

    try {
      const data = await requestBackendJson(`${API_URL}/printers`, { signal });
      if (signal?.aborted) return;

      if (!data.success) {
        throw new Error(data.message || "Gagal membaca daftar printer");
      }

      const nextPrinters = Array.isArray(data.printers) ? data.printers : [];
      setPrinters(nextPrinters);

      setPhotoboothAdminSettings((current) => {
        if (current.printerName || !data.default_printer) {
          return current;
        }

        return {
          ...current,
          printerName: data.default_printer,
        };
      });
    } catch (error) {
      if (!signal?.aborted) setPrintError(error.message || "Gagal membaca printer");
    } finally {
      if (!signal?.aborted) setIsLoadingPrinters(false);
    }
  };

  const printPhotoboothStrip = async (dataBase64, { automatic = false } = {}) => {
    const printerName = photoboothAdminSettings.printerName.trim();
    const paperSize = activePaperSize;

    if (!printerName) {
      const message = "Pilih printer di admin panel dulu";
      setPrintError(message);
      if (!automatic) {
        setStatus(message);
      }
      return false;
    }

    if (!dataBase64) {
      const message = "Tidak ada strip untuk dicetak";
      setPrintError(message);
      if (!automatic) {
        setStatus(message);
      }
      return false;
    }

    setIsPrintingStrip(true);
    setPrintError("");
    setStatus(
      automatic
        ? `Mencetak otomatis ${paperSize.toUpperCase()} ke ${printerName}...`
        : `Mencetak ${paperSize.toUpperCase()} ke ${printerName}...`
    );

    try {
      const response = await fetch(`${API_URL}/photobooth/print`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: "photobooth-strip.jpg",
          data_base64: dataBase64,
          printer_name: printerName,
          paper_size: paperSize,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal mencetak strip");
      }

      setStatus(`Strip ${paperSize.toUpperCase()} dikirim ke printer ${printerName}`);
      return true;
    } catch (error) {
      const message = error.message || "Gagal mencetak strip";
      setPrintError(message);
      setStatus(message);
      return false;
    } finally {
      setIsPrintingStrip(false);
      window.setTimeout(() => setStatus(""), 3500);
    }
  };

  const handlePrintStrip = () => {
    const imageUrl = lastStripResultRef.current;
    if (!imageUrl) {
      setStatus("Tidak ada strip untuk dicetak");
      return;
    }

    const dataBase64 = imageUrl.includes(",")
      ? imageUrl.split(",", 2)[1]
      : imageUrl;

    printPhotoboothStrip(dataBase64);
  };

  const handleBrowserPrintStrip = () => {
    const imageUrl = lastStripResultRef.current;
    if (!imageUrl) {
      setStatus("Tidak ada strip untuk dicetak");
      return;
    }

    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) {
      setStatus("Izinkan pop-up untuk mencetak");
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Cetak Photobooth</title>
  <style>
    @page { margin: 0; size: auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #fff;
    }
    img {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <img src="${imageUrl}" onload="setTimeout(function(){window.print();window.close();},300)" />
</body>
</html>`);
    printWindow.document.close();
  };

  const updateStartupCheck = (id, partialCheck) => {
    setStartupChecks((current) => {
      const exists = current.some((check) => check.id === id);
      const nextCheck = {
        id,
        name: partialCheck.name || id,
        status: partialCheck.status || "pending",
        message: partialCheck.message || "",
        repair: partialCheck.repair || "",
        required: Boolean(partialCheck.required),
      };

      if (!exists) {
        return [...current, nextCheck];
      }

      return current.map((check) =>
        check.id === id
          ? {
              ...check,
              ...nextCheck,
            }
          : check
      );
    });
  };

  const runStartupChecks = useCallback(async () => {
    if (!adminUser || isRunningStartup) {
      return;
    }

    setStartupComplete(false);
    setStartupError("");
    setStartupAttempted(true);
    setIsRunningStartup(true);
    setStartupChecks([
      {
        id: "backend",
        name: "Backend service",
        status: "pending",
        message: "Menunggu service siap...",
        repair: "",
        required: true,
      },
      {
        id: "files",
        name: "File integrity",
        status: "pending",
        message: "Memeriksa folder, config, watermark, dan template...",
        repair: "",
        required: true,
      },
      {
        id: "drive",
        name: "Google Drive token",
        status: "pending",
        message: "Memeriksa token Drive...",
        repair: "",
        required: false,
      },
      {
        id: "assets",
        name: "Data awal aplikasi",
        status: "pending",
        message: "Memuat queue, watermark, template, dan printer...",
        repair: "",
        required: true,
      },
      {
        id: "camera",
        name: "Kamera lokal",
        status: "pending",
        message: "Membaca daftar kamera...",
        repair: "",
        required: false,
      },
    ]);

    try {
      const backendResponse = await fetch(`${API_URL}/`, {
        cache: "no-store",
      });

      if (!backendResponse.ok) {
        throw new Error("Backend belum siap");
      }

      updateStartupCheck("backend", {
        name: "Backend service",
        status: "ok",
        message: "Backend siap menerima request",
        required: true,
      });

      const fileResponse = await fetch(`${API_URL}/startup/checks`, {
        cache: "no-store",
      });
      const fileData = await fileResponse.json();

      if (!fileResponse.ok) {
        throw new Error(fileData.message || "Gagal memeriksa file startup");
      }

      const blockingIssues = (fileData.checks || []).filter(
        (check) => check.status === "error" && check.required
      );
      const warningCount = Number(fileData.warning_count || 0);

      updateStartupCheck("files", {
        name: "File integrity",
        status: blockingIssues.length ? "error" : warningCount ? "warning" : "ok",
        message: blockingIssues.length
          ? `${blockingIssues.length} file/folder wajib bermasalah`
          : warningCount
            ? `${warningCount} file opsional perlu dicek`
            : "Semua file wajib valid",
        repair: blockingIssues[0]?.repair || "File opsional bisa di-upload ulang dari admin panel.",
        required: true,
      });

      setStartupChecks((current) => [
        ...current.filter((check) => !check.id.startsWith("file-")),
        ...(fileData.checks || []).map((check, index) => ({
          id: `file-${index}`,
          ...check,
          required: Boolean(check.required),
        })),
      ]);

      if (blockingIssues.length) {
        throw new Error("Startup ditahan karena ada file wajib yang rusak.");
      }

      const nextDriveAuthStatus = await loadDriveAuthStatus();
      const nextDriveAuthReady = Boolean(
        nextDriveAuthStatus?.configured &&
          nextDriveAuthStatus?.token_exists &&
          nextDriveAuthStatus?.has_required_scopes &&
          (nextDriveAuthStatus?.valid || nextDriveAuthStatus?.has_refresh_token)
      );
      updateStartupCheck("drive", {
        name: "Google Drive token",
        status: nextDriveAuthReady ? "ok" : "warning",
        message: nextDriveAuthReady
          ? "Token Drive siap"
          : "Token Drive belum lengkap, hubungkan ulang dari admin bila upload gagal",
        repair: "Buka admin panel lalu tekan Reconnect Drive.",
        required: false,
      });

      await Promise.all([
        loadCaptures(),
        loadQueue(),
        loadPhotoQueue(),
        loadAutoWatchFolder(),
        loadWatermark(),
        loadPhotoboothTemplate(),
        loadPrinters(),
      ]);
      updateStartupCheck("assets", {
        name: "Data awal aplikasi",
        status: "ok",
        message: "Queue, watermark, template, dan printer selesai dimuat",
        required: true,
      });

      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === "videoinput"
        );
        setCameraDevices(devices);
        updateStartupCheck("camera", {
          name: "Kamera lokal",
          status: devices.length ? "ok" : "warning",
          message: devices.length
            ? `${devices.length} kamera terdeteksi`
            : "Kamera belum terdeteksi atau izin belum diberikan",
          repair: "Cek permission kamera di System Settings lalu restart app bila perlu.",
          required: false,
        });
      } else {
        updateStartupCheck("camera", {
          name: "Kamera lokal",
          status: "warning",
          message: "Browser runtime tidak menyediakan daftar kamera",
          repair: "Cek permission kamera dari sistem operasi.",
          required: false,
        });
      }

      setStartupComplete(true);
      setStatus("Aplikasi siap");
      window.setTimeout(() => setStatus(""), 1800);
    } catch (error) {
      setStartupError(error.message || "Startup gagal");
    } finally {
      setIsRunningStartup(false);
    }
  }, [adminUser, isRunningStartup]);

  const loadDriveAuthStatus = async ({ signal } = {}) => {
    try {
      const data = await requestBackendJson(`${API_URL}/auth/drive/status`, { signal });
      if (signal?.aborted) return null;

      if (data.success) {
        setDriveAuthStatus(data.drive);
        setDriveAuthError("");
        return data.drive;
      }
    } catch {
      if (!signal?.aborted) setDriveAuthStatus(null);
    }

    return null;
  };

  const handleConnectDriveAuth = async () => {
    if (!backendReady || isConnectingDrive || driveAuthAttemptRef.current) {
      return;
    }

    const controller = new AbortController();
    driveAuthAttemptRef.current = controller;
    window.clearTimeout(driveAuthStatusTimerRef.current);
    setIsConnectingDrive(true);
    setDriveAuthStatus(null);
    setDriveAuthError("");
    setStatus("Membuka login Google Drive...");

    try {
      const connection = await runDriveLogin({
        apiUrl: API_URL,
        signal: controller.signal,
        onWaiting: () => setStatus("Silakan selesaikan login di browser..."),
        onValidating: () => setStatus("Token terdeteksi! Memvalidasi..."),
      });
      if (driveAuthAttemptRef.current !== controller || controller.signal.aborted) return;
      setDriveAuthStatus(connection.drive);
      if (connection.user) setAdminUser(connection.user);
      setStatus("Google Drive berhasil terhubung!");
      driveAuthStatusTimerRef.current = window.setTimeout(() => setStatus(""), 3000);
    } catch (error) {
      if (driveAuthAttemptRef.current !== controller || controller.signal.aborted) return;
      setDriveAuthError(error.message || "Gagal menghubungkan Google Drive");
      setStatus(error.message || "Gagal menghubungkan Google Drive");
    } finally {
      if (driveAuthAttemptRef.current === controller) {
        driveAuthAttemptRef.current = null;
        setIsConnectingDrive(false);
      }
    }
  };

  const handleGoogleLogout = async () => {
    driveAuthAttemptRef.current?.abort();
    driveAuthAttemptRef.current = null;
    window.clearTimeout(driveAuthStatusTimerRef.current);
    setIsConnectingDrive(false);
    setIsVerifyingGoogleToken(false);
    setDriveAuthStatus(null);
    setDriveAuthError("");
    setStatus("Keluar dari sesi...");

    // Reset UI state immediately so logout is instant and guaranteed
    setAdminUser(null);
    setStartupComplete(false);
    setStartupError("");
    setStartupAttempted(false);
    setStartupChecks([]);
    setAdminAuthError("");
    setStatus("");

    try {
      googleLogout();
    } catch (e) {
      console.warn("Google OAuth logout failed:", e);
    }

    try {
      if (backendReady) {
        await fetch(`${API_URL}/auth/drive/logout`, {
          method: "POST",
        });
      }
    } catch (error) {
      console.warn("Backend logout failed:", error);
    }
  };

  const handleDriveAdminLogin = async () => {
    if (isVerifyingGoogleToken || driveAuthAttemptRef.current) return;

    const controller = new AbortController();
    driveAuthAttemptRef.current = controller;
    window.clearTimeout(driveAuthStatusTimerRef.current);
    setAdminAuthError("");
    setDriveAuthStatus(null);
    setIsVerifyingGoogleToken(true);
    setStatus("Menyiapkan koneksi aman...");

    try {
      const connection = await runDriveLogin({
        apiUrl: API_URL,
        signal: controller.signal,
        startBackend: () => invoke("start_backend").catch((error) =>
          console.warn("Start backend warning:", error)
        ),
        onWaiting: () => setStatus("Silakan selesaikan login di browser..."),
        onValidating: () => setStatus("Token terdeteksi! Memvalidasi..."),
      });
      if (driveAuthAttemptRef.current !== controller || controller.signal.aborted) return;
      setDriveAuthStatus(connection.drive);
      setAdminUser(connection.user || {
        email: "drive-token@event-booth.local",
        name: "Drive Token",
      });
      setStatus("Login Berhasil!");
      driveAuthStatusTimerRef.current = window.setTimeout(() => setStatus(""), 3000);
    } catch (error) {
      if (driveAuthAttemptRef.current !== controller || controller.signal.aborted) return;
      setAdminAuthError(error.message || "Login token Drive gagal");
      setStatus("");
    } finally {
      if (driveAuthAttemptRef.current === controller) {
        driveAuthAttemptRef.current = null;
        setIsVerifyingGoogleToken(false);
      }
    }
  };

  useEffect(() => {
    if (
      adminUser &&
      backendReady &&
      !startupComplete &&
      !isRunningStartup &&
      !startupAttempted
    ) {
      runStartupChecks();
    }
  }, [
    adminUser,
    backendReady,
    startupComplete,
    isRunningStartup,
    startupAttempted,
    runStartupChecks,
  ]);

  const watermarkPanel = (
    <div className="watermark-panel">
      <div>
        <h2>Preset Watermark</h2>
        <span>
          {currentWatermarkImageUrl
            ? `${watermarkOrientation === "portrait" ? "Portrait" : "Landscape"} aktif`
            : "Belum ada watermark"}
        </span>
      </div>
      <label
        className={
          !backendReady || isUploadingWatermark
            ? "watermark-button disabled"
            : "watermark-button"
        }
      >
        {isUploadingWatermark
          ? "Upload..."
          : `Upload ${watermarkOrientation === "portrait" ? "Portrait" : "Landscape"}`}
        <input
          className="watermark-upload-input"
          type="file"
          accept="image/*"
          disabled={!backendReady || isUploadingWatermark}
          onChange={handleWatermarkUpload}
        />
      </label>
      {currentWatermarkImageUrl && (
        <img
          src={currentWatermarkImageUrl}
          alt="Watermark aktif"
          className="watermark-preview"
          style={{
            opacity:
              currentWatermarkSettings.fit === "frame"
                ? 1
                : currentWatermarkSettings.opacity / 100,
          }}
        />
      )}
      <div className="watermark-controls">
        <div className="control-block">
          <div className="control-heading">Orientasi</div>
          <div className="orientation-toggle" aria-label="Orientasi watermark">
          <button
              type="button"
              className={
                watermarkOrientation === "landscape"
                  ? "orientation-button active"
                  : "orientation-button"
              }
              onClick={() => setWatermarkOrientation("landscape")}
            >
              Landscape
            </button>
            <button
              type="button"
              className={
                watermarkOrientation === "portrait"
                  ? "orientation-button active"
                  : "orientation-button"
              }
              onClick={() => setWatermarkOrientation("portrait")}
            >
              Portrait
            </button>
          </div>
        </div>
        <div className="control-block">
          <div className="control-heading">Mode</div>
          <div className="fit-toggle">
            <button
              type="button"
              className={
                currentWatermarkSettings.fit === "manual"
                  ? "fit-button active"
                  : "fit-button"
              }
              onClick={() =>
                updateWatermarkSettings({
                  ...currentWatermarkSettings,
                  fit: "manual",
                })
              }
            >
              Manual
            </button>
            <button
              type="button"
              className={
                currentWatermarkSettings.fit === "frame"
                  ? "fit-button active"
                  : "fit-button"
              }
              onClick={() =>
                updateWatermarkSettings({
                  ...currentWatermarkSettings,
                  fit: "frame",
                })
              }
            >
              Frame
            </button>
          </div>
        </div>
        {currentWatermarkSettings.fit !== "frame" && (
          <>
            <div className="control-block">
              <div className="control-heading">Posisi</div>
              <div className="position-grid">
                {WATERMARK_POSITIONS.flat().map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    data-position={pos}
                    className={
                      currentWatermarkSettings.position === pos
                        ? "position-button active"
                        : "position-button"
                    }
                    onClick={() =>
                      updateWatermarkSettings({
                        ...currentWatermarkSettings,
                        position: pos,
                      })
                    }
                  >
                    <span className="position-marker" />
                  </button>
                ))}
              </div>
            </div>
            <label className="range-control">
              Ukuran
              <span>{currentWatermarkSettings.scale}%</span>
              <input
                type="range"
                min="5"
                max="100"
                value={currentWatermarkSettings.scale}
                onChange={(event) =>
                  updateWatermarkSettings({
                    ...currentWatermarkSettings,
                    scale: Number(event.target.value),
                  })
                }
              />
            </label>
          </>
        )}
        {currentWatermarkSettings.fit === "frame" && (
          <div className="control-block">
            <div className="control-heading">Ukuran Foto</div>
            <label className="range-control">
              Zoom
              <span>{currentWatermarkSettings.photo_scale}%</span>
              <input
                type="range"
                min="50"
                max="200"
                value={currentWatermarkSettings.photo_scale}
                onChange={(event) =>
                  updateWatermarkSettings({
                    ...currentWatermarkSettings,
                    photo_scale: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="range-control">
              Geser X
              <span>{currentWatermarkSettings.photo_x}%</span>
              <input
                type="range"
                min="-100"
                max="100"
                value={currentWatermarkSettings.photo_x}
                onChange={(event) =>
                  updateWatermarkSettings({
                    ...currentWatermarkSettings,
                    photo_x: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="range-control">
              Geser Y
              <span>{currentWatermarkSettings.photo_y}%</span>
              <input
                type="range"
                min="-100"
                max="100"
                value={currentWatermarkSettings.photo_y}
                onChange={(event) =>
                  updateWatermarkSettings({
                    ...currentWatermarkSettings,
                    photo_y: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
        )}
        <label className="range-control">
          Opacity
          <span>{currentWatermarkSettings.opacity}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={currentWatermarkSettings.opacity}
            onChange={handleWatermarkOpacityChange}
          />
        </label>
      </div>
    </div>
  );
  const isOtoMode = (photoboothAdminSettings.mode || "oto") === "oto";
  const selectedStripOptionIndex = visiblePhotoboothStripOptions.findIndex(
    (strip) => strip.id === selectedPhotoboothStrip?.id
  );

  const photoboothStepItems = isOtoMode
    ? [
        { step: 1, label: "Mulai" },
        { step: 2, label: "Pilih Tema & Strip" },
        { step: 3, label: "Ambil Foto" },
        { step: 4, label: "Edit Foto" },
        { step: 5, label: "Print & Kirim" },
      ].filter((item) => photoboothAdminSettings.editEnabled || item.step !== 4)
    : [
        { step: 1, label: "Mulai" },
        { step: 2, label: "Foto" },
        { step: 3, label: "Edit" },
        { step: 4, label: "Kirim" },
      ].filter((item) => photoboothAdminSettings.editEnabled || item.step !== 3);
  const photoboothCurrentStepIndex = Math.max(
    0,
    photoboothStepItems.findIndex((item) => item.step === photoboothStep)
  );
  const photoboothModeSummary = doubleStripEnabled
    ? `${activePaperConfig.label} • 2 strip • ${photoboothCaptureCount} foto`
    : `${activePaperConfig.label} • ${photoboothPhotoCount} foto`;
  const captureProgressPercent =
    photoboothCaptureCount > 0
      ? Math.min(100, (captures.length / photoboothCaptureCount) * 100)
      : 0;
  const studioPreviewStripWidth = photoboothPreviewUsesUploadedTemplate
    ? activePhotoboothTemplate.width
    : doubleStripEnabled
      ? activePaperConfig.width / 2
      : activeStripBaseWidth;
  const studioPreviewStripHeight = photoboothPreviewUsesUploadedTemplate
    ? activePhotoboothTemplate.height
    : doubleStripEnabled
      ? activePaperConfig.height
      : activeStripBaseHeight;
  const studioDoodleCanvasHeight = Math.max(
    1,
    Math.round(400 * (studioPreviewStripHeight / studioPreviewStripWidth))
  );
  const renderStudioSelectionTools = (type) => {
    if (selectedDecoration?.type !== type) return null;
    const label = type === "sticker" ? "stiker" : "teks";
    const scaleStep = type === "sticker" ? 0.15 : 0.1;
    return (
      <div className="studio-selection-toolbar">
        <span>Geser {label} langsung pada strip.</span>
        <div className="selection-btn-group">
          <button type="button" className="secondary-button compact" aria-label={`Perkecil ${label}`}
            onClick={() => updateSelectedDecorationScale(-scaleStep)}>Perkecil</button>
          <button type="button" className="secondary-button compact" aria-label={`Perbesar ${label}`}
            onClick={() => updateSelectedDecorationScale(scaleStep)}>Perbesar</button>
          <button type="button" className="danger-button compact" aria-label={`Hapus ${label}`}
            onClick={() => handleDeleteDecoration(type, selectedDecoration.id)}>Hapus</button>
        </div>
        <details className="studio-inline-options">
          <summary>Posisi & putaran</summary>
          <div className="selection-btn-group">
            <button type="button" className="secondary-button compact" aria-label={`Geser ${label} ke kiri`}
              onClick={() => nudgeSelectedDecorationHorizontally(-2)}>← Kiri</button>
            <button type="button" className="secondary-button compact" aria-label={`Geser ${label} ke kanan`}
              onClick={() => nudgeSelectedDecorationHorizontally(2)}>Kanan →</button>
            <button type="button" className="secondary-button compact" aria-label={`Putar ${label}`}
              onClick={() => updateSelectedDecorationRotation(type === "sticker" ? 20 : 15)}>Putar</button>
          </div>
        </details>
      </div>
    );
  };

  const renderStudioDecorationLayer = (sideIndex = 0) => {
    const isActiveLayer =
      !doubleStripEnabled || sideIndex === activeStudioSide;
    const sideStickers = stripDecorations.filter(
      (sticker) => (sticker.sideIndex ?? 0) === sideIndex
    );
    const sideTexts = stripTexts.filter(
      (textItem) => (textItem.sideIndex ?? 0) === sideIndex
    );

    return (
      <>
        <canvas
          data-strip-side={sideIndex}
          width={400}
          height={studioDoodleCanvasHeight}
          className="strip-doodle-canvas"
          style={{
            pointerEvents: editStudioTab === "doodle" ? "auto" : "none",
            cursor: editStudioTab === "doodle" ? "crosshair" : "default",
          }}
          onPointerDown={(event) => handleDoodlePointerDown(event, sideIndex)}
          onPointerMove={handleDoodlePointerMove}
          onPointerUp={handleDoodlePointerUp}
          onPointerCancel={handleDoodlePointerUp}
        />
        {sideStickers.map((sticker) => {
          const isSelected =
            isActiveLayer &&
            selectedDecoration?.type === "sticker" &&
            selectedDecoration?.id === sticker.id;

          return (
            <div
              key={`${sideIndex}-${sticker.id}`}
              className={`studio-decoration-item studio-sticker-item ${
                isSelected ? "is-selected" : ""
              }`}
              style={{
                left: `${sticker.x}%`,
                top: `${sticker.y}%`,
                transform: `translate(-50%, -50%) rotate(${sticker.rotation || 0}deg) scale(${sticker.scale || 1})`,
              }}
              onPointerDown={(event) =>
                handleDecorationPointerDown(event, "sticker", sticker.id, sideIndex)
              }
            >
              {sticker.type === "gif" && sticker.artwork ? <span className="decoration-live-gif" style={{ width: `${sticker.artwork.widthPercent}cqw`, aspectRatio: `${sticker.artwork.width} / ${sticker.artwork.height}` }}>
                <img src={sticker.content} alt="Stiker GIF bergerak" draggable={false} style={{ left: `${200 / sticker.artwork.width}%`, top: `${200 / sticker.artwork.height}%`,
                  width: `${100 - 400 / sticker.artwork.width}%`, height: `${100 - 400 / sticker.artwork.height}%`, opacity: (sticker.style?.opacity ?? 100) / 100 }} />
                </span> : sticker.artwork ? <img className="decoration-saved-artwork" src={sticker.artwork.src} alt="Stiker" draggable={false}
                style={{ width: `${sticker.artwork.widthPercent}cqw` }} />
                : sticker.type === "image" ? <img className="decoration-image-content" src={sticker.content} alt="Stiker custom" draggable={false} /> : <span className="decoration-emoji-content">{sticker.content}</span>}
              {isSelected && (
                <div className="decoration-controls-bar">
                  <button
                    type="button"
                    className="decor-btn decor-del"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteDecoration("sticker", sticker.id);
                    }}
                    title="Hapus"
                    aria-label="Hapus stiker"
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    className="decor-btn decor-rot"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateSelectedDecorationRotation(15);
                    }}
                    title="Putar"
                    aria-label="Putar stiker"
                  >
                    🔄
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {sideTexts.map((textItem) => {
          const isSelected =
            isActiveLayer &&
            selectedDecoration?.type === "text" &&
            selectedDecoration?.id === textItem.id;

          return (
            <div
              key={`${sideIndex}-${textItem.id}`}
              className={`studio-decoration-item studio-text-item ${textItem.artwork ? "has-artwork" : ""} ${
                textItem.hasBg ? "has-background" : ""
              } ${isSelected ? "is-selected" : ""}`}
              style={{
                left: `${textItem.x}%`,
                top: `${textItem.y}%`,
                transform: `translateY(-50%) rotate(${textItem.rotation || 0}deg) scale(${textItem.scale || 1})`,
                color: textItem.color,
                backgroundColor: textItem.hasBg ? textItem.bgColor : "transparent",
                fontFamily:
                  textItem.font === "cute"
                    ? '"Comic Sans MS", "Caveat", cursive, sans-serif'
                    : textItem.font === "retro"
                      ? '"Courier New", Courier, monospace'
                      : textItem.font === "bold"
                        ? 'Impact, "Arial Black", sans-serif'
                        : "system-ui, sans-serif",
              }}
              onPointerDown={(event) =>
                handleDecorationPointerDown(event, "text", textItem.id, sideIndex)
              }
            >
              {textItem.artwork ? <img className="decoration-saved-artwork" src={textItem.artwork.src} alt={textItem.text} draggable={false}
                style={{ width: `${textItem.artwork.widthPercent}cqw` }} /> : <span className="decoration-text-inner">{textItem.text}</span>}
              {isSelected && (
                <div className="decoration-controls-bar">
                  <button
                    type="button"
                    className="decor-btn decor-del"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteDecoration("text", textItem.id);
                    }}
                    title="Hapus"
                    aria-label="Hapus teks"
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    className="decor-btn decor-rot"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateSelectedDecorationRotation(15);
                    }}
                    title="Putar"
                    aria-label="Putar teks"
                  >
                    🔄
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  if (!adminUser) {
    return (
      <div className="app app-gate">
        <main className="app-gate-view">
          <section className="admin-login-card app-login-card">
            <img
              className="login-company-logo"
              src={sisikitaCompanyLogo}
              alt="Sisikita Creative"
            />
            <span className="start-eyebrow">Enterprise Secure Access</span>
            <h2>Secure Admin Login</h2>
            <p>
              Silakan autentikasi untuk mengakses sistem manajemen Event Booth Studio.
            </p>
            <div className={backendReady ? "auth-note" : "auth-error"}>
              <span className="status-dot" aria-hidden="true" />
              {backendReady
                ? "Koneksi HTTPS Terenkripsi Siap"
                : "Menghubungkan ke Secure Gateway..."}
            </div>
            {adminAuthError && <div className="auth-error">{adminAuthError}</div>}
            {isVerifyingGoogleToken && (
              <div className="auth-note">
                <span className="status-dot status-dot-spin" aria-hidden="true" />
                Memverifikasi identitas melalui Secure Token...
              </div>
            )}
            <button
              type="button"
              className="upload-button compact admin-local-login"
              onClick={handleDriveAdminLogin}
              disabled={isVerifyingGoogleToken}
            >
              {isVerifyingGoogleToken ? "Verifikasi Keamanan..." : "Secure Login"}
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (!startupComplete) {
    return (
      <div className="app app-gate">
        <main className="app-gate-view">
          <section className="startup-card premium-startup-card">
            <div className="startup-card-header">
              <div className="startup-brand">
                <div className="startup-title-group">
                  <h2>Menyiapkan Aplikasi</h2>
                  <p className="startup-subtitle">Memastikan service, file, dan perangkat siap sebelum masuk.</p>
                </div>
              </div>
              <button
                type="button"
                className="secondary-button compact logout-btn"
                onClick={handleGoogleLogout}
                disabled={isRunningStartup}
              >
                Logout
              </button>
            </div>

            <div className="premium-loader-container">
              <div className="splash-loader">
                <div className="splash-loader-bar" />
              </div>
            </div>

            {startupError && (
              <div className="auth-error startup-error-alert">
                <span className="error-icon">⚠️</span>
                <span>{startupError}</span>
              </div>
            )}

            <div className="admin-action-row premium-action-row">
              <button
                type="button"
                className="upload-button compact reload-btn"
                onClick={runStartupChecks}
                disabled={!backendReady || isRunningStartup}
              >
                {isRunningStartup ? (
                  <>
                    <span className="spinner-mini" /> Memeriksa...
                  </>
                ) : (
                  "Cek Ulang"
                )}
              </button>
              <button
                type="button"
                className="secondary-button compact continue-btn"
                onClick={() => setStartupComplete(true)}
                disabled={isRunningStartup || hasBlockingStartupIssue}
              >
                Lanjutkan
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const getEditOutputSizeInfo = () => {
    const size = editPreviewNaturalSize;
    if (!size) return "Pilih preview untuk melihat ukuran hasil akhir.";
    const baseWidth = editRotatedW;
    const baseHeight = editRotatedH;
    const croppedWidth = Math.round(baseWidth * editCropW);
    const croppedHeight = Math.round(baseHeight * editCropH);
    const widthValue = parseInt(editResizeWidth, 10) || 0;
    const heightValue = parseInt(editResizeHeight, 10) || 0;

    if (editResizeMode === "keep" || (!widthValue && !heightValue)) {
      return `${croppedWidth} x ${croppedHeight} px`;
    }
    if (editResizeMode === "width" && widthValue) {
      return `${widthValue} x ${Math.round((croppedHeight / croppedWidth) * widthValue)} px`;
    }
    if (editResizeMode === "height" && heightValue) {
      return `${Math.round((croppedWidth / croppedHeight) * heightValue)} x ${heightValue} px`;
    }
    if (editResizeMode === "stretch") {
      return `${widthValue} x ${heightValue} px (ditegangkan)`;
    }
    if (editResizeMode === "contain" && widthValue && heightValue) {
      return `Muat dalam ${widthValue} x ${heightValue} px`;
    }
    if (editResizeMode === "cover" && widthValue && heightValue) {
      return `${widthValue} x ${heightValue} px (dipotong tengah)`;
    }
    return `${croppedWidth} x ${croppedHeight} px`;
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="app-brand">
          <img src={sisikitaCompanyLogo} alt="Sisikita Creative" />
          <div>
            <strong>Event Booth Studio</strong>
            <span>Photobooth & Drive Delivery</span>
          </div>
        </div>
        {/* Step indicators for Photobooth */}
        {activeView === "photobooth" && (
          <>
            <div className="topbar-step-indicator" aria-label="Langkah Photobooth">
              {photoboothStepItems.map((item, idx) => (
                <button
                  key={`topbar-pb-step-${item.step}`}
                  type="button"
                  className={photoboothStep === item.step ? "step-num active" : "step-num"}
                  onClick={() => setPhotoboothStep(item.step)}
                  title={`Langkah ${idx + 1}: ${item.label}`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            <span className="topbar-file-count">
              {photoboothStepItems.find((i) => i.step === photoboothStep)?.label || `Step ${photoboothStep}`}
            </span>
          </>
        )}

        {/* Step indicators for Auto Upload */}
        {activeView === "upload" && (
          <>
            <div className="topbar-step-indicator" aria-label="Langkah Auto Upload">
              <button
                type="button"
                className={uploadStep === 1 ? "step-num active" : "step-num"}
                onClick={() => setUploadStep(1)}
                title="Langkah 1: Sumber File / Watcher"
              >
                1
              </button>
              <button
                type="button"
                className={uploadStep === 2 ? "step-num active" : "step-num"}
                onClick={() => setUploadStep(2)}
                title="Langkah 2: Pilih Antrean Foto"
              >
                2
              </button>
              <button
                type="button"
                className={uploadStep === 3 ? "step-num active" : "step-num"}
                onClick={() => setUploadStep(3)}
                title="Langkah 3: Pengaturan Upload & Frame"
              >
                3
              </button>
              <button
                type="button"
                className={uploadStep === 4 ? "step-num active" : "step-num"}
                onClick={() => setUploadStep(4)}
                title="Langkah 4: Status & Log Upload"
              >
                4
              </button>
            </div>
            <span className="topbar-file-count">
              {uploadStep === 1 ? "Sumber File" : uploadStep === 2 ? "Pilih Foto" : uploadStep === 3 ? "Pengaturan" : "Status Upload"}
            </span>
          </>
        )}

        {/* Step indicators for Edit & Optimasi */}
        {activeView === "edit" && (
          <>
            <div className="topbar-step-indicator" aria-label="Langkah Editor">
              <button
                type="button"
                className={editUploadStep === 1 ? "step-num active" : "step-num"}
                onClick={() => setEditUploadStep(1)}
                title="Langkah 1: Upload / Pilih File"
              >
                1
              </button>
              <button
                type="button"
                className={editUploadStep === 2 ? "step-num active" : "step-num"}
                onClick={() => {
                  if (editSelectedFiles.length > 0) {
                    setEditPreviewIndex(0);
                    setEditUploadStep(2);
                  }
                }}
                disabled={editSelectedFiles.length === 0}
                title="Langkah 2: Edit & Watermark"
              >
                2
              </button>
            </div>
            {editSelectedFiles.length > 0 && (
              <span className="topbar-file-count">{editSelectedFiles.length} file</span>
            )}
          </>
        )}

        {/* Step indicators for Admin */}
        {activeView === "admin" && (
          <>
            <div className="topbar-step-indicator" aria-label="Langkah Admin">
              <button
                type="button"
                className={adminStep === 1 ? "step-num active" : "step-num"}
                onClick={() => setAdminStep(1)}
                title="Langkah 1: Auth Drive & Sistem"
              >
                1
              </button>
              <button
                type="button"
                className={adminStep === 2 ? "step-num active" : "step-num"}
                onClick={() => setAdminStep(2)}
                title="Langkah 2: Pengaturan Photobooth & Cetak"
              >
                2
              </button>
              <button
                type="button"
                className={adminStep === 3 ? "step-num active" : "step-num"}
                onClick={() => setAdminStep(3)}
                title="Langkah 3: Auto Upload & Preset Optimasi"
              >
                3
              </button>
            </div>
            <span className="topbar-file-count">
              {adminStep === 1 ? "Auth & Sistem" : adminStep === 2 ? "Photobooth & Cetak" : "Preset & Upload"}
            </span>
          </>
        )}
        <div className="tabs" role="tablist" aria-label="Mode aplikasi">
           <button
             type="button"
             className={activeView === "photobooth" ? "tab active" : "tab"}
             onClick={() => setActiveView("photobooth")}
           >
             Photobooth
           </button>
           <button
             type="button"
             className={activeView === "upload" ? "tab active" : "tab"}
             onClick={() => setActiveView("upload")}
           >
             Auto Upload
           </button>
           <button
             type="button"
             className={activeView === "edit" ? "tab active" : "tab"}
             onClick={() => setActiveView("edit")}
           >
             Edit & Optimasi
           </button>
           <button
             type="button"
             className={activeView === "admin" ? "tab active" : "tab"}
             onClick={() => setActiveView("admin")}
           >
             Admin
           </button>
        </div>
      </header>

      {activeView === "photobooth" ? (
        <main
          className={`photobooth-view${
            isOtoMode && photoboothStep === 2 ? " photobooth-strip-select-view" : ""
          }`}
        >
          <section className="photobooth-wizard">
            {/* MODE OTO - LANGKAH 1: MULAI FOTO */}
            {isOtoMode && photoboothStep === 1 && (
              <section className="step-panel photobooth-start-panel">
                <div className="start-card hero-oto-start">
                  <div className="start-copy">
                    <span className="start-eyebrow">Event Photobooth Studio</span>
                    <h1>Mulai Sesi Photobooth</h1>
                    <p>Tekan atau sentuh tombol di bawah untuk memilih tema & layout strip foto Anda.</p>
                  </div>
                  <button
                    type="button"
                    className="upload-button compact start-session-button"
                    onClick={preparePhotoboothStripSelection}
                    disabled={!backendReady}
                    style={{ minWidth: "240px", fontSize: "16px", padding: "14px 28px", marginTop: "16px" }}
                  >
                    {"📸 Mulai Foto"}
                  </button>
                </div>
              </section>
            )}

            {/* MODE OTO - LANGKAH 2: TAMPILAN STRIP */}
            {isOtoMode && photoboothStep === 2 && (
              <section className="step-panel photobooth-step2-panel">
                <div className="oto-step2-header">
                  <div className="step2-badge">Langkah 2 dari 5</div>
                  <h1>Pilih Strip Foto</h1>
                  <p>Geser ke kiri / kanan atau gunakan tombol panah untuk memilih template strip.</p>
                </div>

                <div className="strip-picker-container">
                  {/* FLOATING NAVIGATION ARROWS */}
                  <button
                    type="button"
                    className="carousel-nav-arrow carousel-nav-prev"
                    onClick={() => handleScrollCarousel("prev")}
                    aria-label="Template sebelumnya"
                    disabled={selectedStripOptionIndex <= 0}
                  >
                    ❮
                  </button>
                  <button
                    type="button"
                    className="carousel-nav-arrow carousel-nav-next"
                    onClick={() => handleScrollCarousel("next")}
                    aria-label="Template berikutnya"
                    disabled={
                      selectedStripOptionIndex < 0 ||
                      selectedStripOptionIndex >= visiblePhotoboothStripOptions.length - 1
                    }
                  >
                    ❯
                  </button>

                  <div className="strip-picker">
                    {visiblePhotoboothStripOptions.length > 0 ? (
                      <div
                        className="strip-carousel"
                        ref={stripCarouselRef}
                        onScroll={handleStripCarouselScroll}
                        onMouseDown={handleCarouselMouseDown}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                            event.preventDefault();
                            handleScrollCarousel(
                              event.key === "ArrowLeft" ? "prev" : "next"
                            );
                          }
                        }}
                        tabIndex={0}
                        aria-label="Pilihan template strip"
                      >
                        {visiblePhotoboothStripOptions.map((strip) => {
                          const isSelected = strip.id === selectedPhotoboothStrip?.id;

                          return (
                            <button
                              key={strip.id}
                              type="button"
                              className={`strip-carousel-card${isSelected ? " is-selected" : ""}`}
                              data-strip-option-id={strip.id}
                              aria-pressed={isSelected}
                              onClick={(event) => {
                                if (hasMovedCarouselRef.current) {
                                  hasMovedCarouselRef.current = false;
                                  if (event.detail > 0) return;
                                }
                                selectPhotoboothStrip(strip);
                                centerStripCarouselCard(event.currentTarget);
                              }}
                            >
                              <div className="strip-card-top-bar">
                                <span className="strip-card-pose-badge">
                                  {strip.pose_count} POSE
                                </span>
                                {isSelected && (
                                  <span className="strip-card-selected-tag">
                                    DIPILIH ✨
                                  </span>
                                )}
                              </div>
                              <div className="strip-carousel-artboard">
                                {strip.image_url ? (
                                  <img
                                    src={strip.image_url}
                                    alt={`${strip.name}, ${strip.pose_count} pose`}
                                    draggable={false}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <span className="strip-fallback-preview" aria-hidden="true">
                                    <strong>{strip.name}</strong>
                                    <span className="strip-fallback-poses">
                                      {Array.from({ length: strip.pose_count }).map((_, index) => (
                                        <span key={`${strip.id}-pose-${index}`} />
                                      ))}
                                    </span>
                                    <small>{strip.pose_count} POSE</small>
                                  </span>
                                )}
                              </div>
                              <div className="strip-card-info">
                                <span className="strip-carousel-name">{strip.name}</span>
                                <span className="strip-carousel-meta">
                                  Template Strip {strip.pose_count} Foto
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="strip-carousel-empty">
                        Template strip belum tersedia.
                      </div>
                    )}

                    {/* PAGINATION DOTS */}
                    {visiblePhotoboothStripOptions.length > 1 && (
                      <div className="carousel-dots-indicator" aria-label="Indikator pilihan template">
                        {visiblePhotoboothStripOptions.map((strip) => {
                          const isSelected = strip.id === selectedPhotoboothStrip?.id;
                          return (
                            <button
                              key={`dot-${strip.id}`}
                              type="button"
                              className={`carousel-dot ${isSelected ? "active" : ""}`}
                              onClick={() => {
                                selectPhotoboothStrip(strip);
                                const card = stripCarouselRef.current?.querySelector(
                                  `[data-strip-option-id="${strip.id}"]`
                                );
                                centerStripCarouselCard(card);
                              }}
                              title={`Pilih ${strip.name}`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* ACTION NAVIGATION BAR */}
                <div className="oto-step2-footer-bar">
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={() => setPhotoboothStep(1)}
                  >
                    Kembali
                  </button>
                  <div className="step2-footer-info">
                    <span>Strip Terpilih:</span>
                    <strong>{selectedPhotoboothStrip?.name || "Pilih salah satu template"}</strong>
                    {selectedPhotoboothStrip && (
                      <small>({selectedPhotoboothStrip.pose_count} pose foto)</small>
                    )}
                  </div>
                  <button
                    type="button"
                    className="upload-button compact start-session-button main-cta-glow"
                    onClick={() => {
                      handleStartPhotoboothSession();
                    }}
                    disabled={!backendReady || !selectedPhotoboothStrip}
                  >
                    Lanjut ke Kamera · {photoboothCaptureCount} Foto ✨
                  </button>
                </div>
              </section>
            )}

            {/* MODE ADMIN - LANGKAH 1: MULAI SESI */}
            {!isOtoMode && photoboothStep === 1 && (
              <section className="step-panel photobooth-start-panel">
                <div className="start-card">
                  <div className="start-copy">
                    <h1>Mulai Photobooth (Admin)</h1>
                    <p>Sesi dikontrol secara manual oleh Operator Admin. Pastikan user sudah siap di depan kamera.</p>
                  </div>
                  <div className="start-photo-count">
                    <div>
                      <span>Ringkasan Foto</span>
                      <strong>{photoboothCaptureCount} Foto ({doubleStripEnabled ? "2 Strip" : "1 Strip"})</strong>
                    </div>
                  </div>
                  <div className="start-session-meta">
                    <span>{activePaperConfig.label}</span>
                    <span>{doubleStripEnabled ? "2 Strip" : "1 Strip"}</span>
                    <span>{photoboothAdminSettings.autoPrintEnabled ? "Auto print" : "Tanpa print"}</span>
                  </div>
                  <button
                    type="button"
                    className="upload-button compact start-session-button"
                    onClick={handleStartPhotoboothSession}
                    disabled={!backendReady}
                  >
                    {"Mulai Sesi Admin"}
                  </button>
                </div>
              </section>
            )}

            {((isOtoMode && photoboothStep === 3) || (!isOtoMode && photoboothStep === 2)) && (
              <section className="step-panel photobooth-capture-panel">

                <div className="capture-strip-panel" aria-label="Preview strip otomatis">
                  <div className="capture-strip-header">
                    <div className="capture-session-copy">
                      <strong>
                        {captures.length >= photoboothCaptureCount
                          ? "Semua foto selesai"
                          : `Foto ${captures.length + 1}`}
                      </strong>
                      <span>
                        {showResult
                          ? "Preview hasil foto sebentar..."
                          : autoCaptureCountdown !== null
                            ? "Tahan posisi sampai kamera mengambil foto."
                            : "Arahkan wajah ke kamera dan tunggu hitungan."}
                      </span>
                    </div>
                    <div className="capture-photo-counter">
                      <strong>
                        {captures.length >= photoboothCaptureCount
                          ? "Selesai"
                          : `${captures.length + 1}`}
                      </strong>
                      <span>/ {photoboothCaptureCount}</span>
                    </div>
                  </div>
                  <div className="capture-progress">
                    <span style={{ width: `${captureProgressPercent}%` }} />
                  </div>
                  <div className="capture-camera-wrap">
                    <div className="capture-strip-background" aria-hidden="true">
                      <div
                        className={
                          [
                            "photobooth-template-preview",
                            "capture-actual-ghost-preview",
                            photoboothPreviewUsesUploadedTemplate ? "uploaded-template-preview" : "",
                            doubleStripEnabled ? "double-strip-edit-preview" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")
                        }
                        style={
                          doubleStripEnabled
                            ? {
                                aspectRatio: `${activePaperConfig.width} / ${activePaperConfig.height}`,
                              }
                            : activeStripPreviewStyle
                        }
                      >
                        {(doubleStripEnabled ? [0, 1] : [0]).map(
                          (sideIndex) => (
                            <div
                              className={
                                doubleStripEnabled
                                  ? "double-strip-preview-side"
                                  : "capture-single-ghost-side"
                              }
                              key={`capture-strip-mini-${sideIndex}`}
                            >
                              {activePhotoboothTemplateSlots.slice(0, photoboothPhotoCount).map((slot, index) => {
                                const sourceSlotIndex = getPhotoboothSideSlotIndex(index, sideIndex);
                                const photoIndex = getPhotoboothSidePhotoIndex(index, sideIndex);
                                const capture = photoboothSlotCaptures[photoIndex];
                                const adjustment =
                                  templatePhotoAdjustments[sourceSlotIndex] ||
                                  DEFAULT_SLOT_ADJUSTMENT;
                                const savedEffect = getPhotoboothEffect(photoEffectMap[photoIndex]);

                                return (
                                  <div
                                    data-strip-slot={sideIndex === 0 ? index : undefined}
                                    className={
                                      [
                                        "template-photo-slot",
                                        capture ? "filled" : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")
                                    }
                                    key={`capture-strip-mini-slot-${sideIndex}-${index}`}
                                    style={getPhotoboothTemplateSlotStyle(slot)}
                                  >
                                    {capture ? (
                                      <img
                                        src={`${capture.image_url}?v=${streamVersion}`}
                                        alt=""
                                        onLoad={(event) =>
                                          measurePhotoboothImageFit(event, index, photoIndex)
                                        }
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "contain",
                                          filter: savedEffect.filter,
                                          left: `calc(50% + ${adjustment.x}%)`,
                                          top: `calc(50% + ${adjustment.y}%)`,
                                          transform: `translate(-50%, -50%) rotate(${adjustment.rotation || 0}deg) scale(${getPhotoboothPreviewScale(index, photoIndex, adjustment)})`,
                                        }}
                                      />
                                    ) : (
                                      <span>{photoIndex !== null ? photoIndex + 1 : index + 1}</span>
                                    )}
                                  </div>
                                );
                              })}
                              {photoboothPreviewUsesUploadedTemplate && (
                                <img
                                  src={
                                    photoboothTemplateOverlayUrl ||
                                    activePhotoboothTemplate.image_url
                                  }
                                  alt=""
                                  className="template-overlay"
                                  draggable={false}
                                />
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                    <div className="capture-camera-frame">
                      {showResult && latestCapture ? (
                        <img
                          className="capture-result-photo"
                          src={`${latestCapture.image_url}?v=${streamVersion}`}
                          alt={latestCapture.filename}
                        />
                      ) : (
                        <>
                          <video
                            ref={attachCameraVideoElement}
                            className={`capture-live-camera ${
                              cameraPreviewSource === "backend" ? "camera-preview-hidden" : ""
                            }`}
                            autoPlay
                            playsInline
                            muted
                            onCanPlay={handleBrowserCameraReady}
                            onLoadedData={handleBrowserCameraReady}
                            onPlaying={handleBrowserCameraReady}
                          />
                          {backendReady && cameraPreviewSource !== "browser" && (
                            <img
                              className="capture-live-camera"
                              src={`${API_URL}/camera-stream?v=${streamVersion}`}
                              alt=""
                              onLoad={handleBackendCameraLoad}
                              onError={handleBackendCameraError}
                            />
                          )}
                          {!cameraActive && (
                            <div className="capture-camera-empty">Kamera belum aktif</div>
                          )}
                        </>
                      )}
                      {!showResult && captures.length < photoboothCaptureCount && (
                        <div className="capture-center-status">
                          {autoCaptureReady ? (
                            <div className="slot-countdown-overlay ready-overlay">
                              <strong>Siap</strong>
                              <span>Atur posisi</span>
                            </div>
                          ) : autoCaptureCountdown !== null ? (
                            <div className="slot-countdown-overlay countdown-overlay">
                              <strong>{autoCaptureCountdown}</strong>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="step-footer">
                  <div>
                    <strong>{captures.length}</strong>
                    <span>{Math.max(0, photoboothCaptureCount - captures.length)} foto lagi</span>
                  </div>
                  <div className="footer-actions">
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => setPhotoboothStep(isOtoMode ? 2 : 1)}
                    >
                      Kembali
                    </button>
                    {!isOtoMode && photoboothAdminSettings.mode === "admin" && captures.length < photoboothCaptureCount && (
                      <button
                        type="button"
                        className="upload-button compact"
                        onClick={() => handleCapture({ automatic: false })}
                        disabled={isCapturing || !cameraActive}
                        style={{ background: "#4fb286", color: "#08110c", fontWeight: "800" }}
                      >
                        {isCapturing ? "Mengambil Foto..." : "📸 Ambil Foto"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="upload-button compact"
                      onClick={() => {
                        setPhotoboothEditMode("strip");
                        setPhotoboothStep(
                          isOtoMode
                            ? photoboothAdminSettings.editEnabled
                              ? 4
                              : 5
                            : photoboothAdminSettings.editEnabled
                              ? 3
                              : 4
                        );
                      }}
                      disabled={captures.length < photoboothCaptureCount}
                    >
                      {isOtoMode && !photoboothAdminSettings.editEnabled
                        ? "Lanjut Hasil ➔"
                        : "Lanjut Edit ➔"}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {((isOtoMode && photoboothStep === 4) || (!isOtoMode && photoboothStep === 3)) && (
              <section className="step-panel photobooth-edit-panel studio-simple">
                <div className="studio-top-bar">
                  <div className="studio-top-info">
                    <span className="studio-badge-step">
                      {isOtoMode ? "Langkah 4 dari 5" : "Langkah 3 dari 4"}
                    </span>
                    <h1>Edit fotomu</h1>
                    <p>Klik foto untuk mengatur ukuran dan filternya, atau tambahkan hiasan.</p>
                  </div>
                  <div className="studio-top-badges">
                    <span className="studio-badge-pill">
                      {selectedPhotoboothStrip?.name || "Strip Foto"} · {photoboothPhotoCount} foto per strip
                    </span>
                  </div>
                </div>

                <div className="photo-edit-layout studio-layout">
                  {/* HERO PREVIEW CANVAS (LEFT/CENTER) */}
                  <div className="photo-edit-preview studio-canvas-area">
                    <div className="studio-canvas-wrapper">
                      <div
                        ref={previewContainerRef}
                        className={[
                          "photobooth-template-preview",
                          "studio-template-preview",
                          photoboothPreviewUsesUploadedTemplate ? "uploaded-template-preview" : "",
                          doubleStripEnabled ? "double-strip-edit-preview" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ ...editPhotoboothPreviewStyle, backgroundColor: studioFrameColor }}
                      >
                        {/* PHOTO SLOTS */}
                        {doubleStripEnabled
                          ? [0, 1].map((sideIndex) => (
                              <div
                                className={`double-strip-preview-side ${
                                  activeStudioSide === sideIndex ? "is-active-side" : ""
                                }`}
                                key={`double-preview-side-${sideIndex}`}
                                style={{ backgroundColor: studioFrameColor }}
                                onPointerDownCapture={() => {
                                  if (activeStudioSide !== sideIndex) {
                                    setActiveStudioSide(sideIndex);
                                    setSelectedDecoration(null);
                                  }
                                }}
                              >
                                {activePhotoboothTemplateSlots
                                  .slice(0, photoboothPhotoCount)
                                  .map((slot, index) => {
                                    const sourceSlotIndex = getPhotoboothSideSlotIndex(index, sideIndex);
                                    const photoIndex = getPhotoboothSidePhotoIndex(index, sideIndex);
                                    const capture = photoboothSlotCaptures[photoIndex];
                                    const adjustment =
                                      templatePhotoAdjustments[sourceSlotIndex] || DEFAULT_SLOT_ADJUSTMENT;
                                    const savedEffect = getPhotoboothEffect(
                                      photoEffectMap[photoIndex]
                                    );
                                    return (
                                      <div
                                        data-strip-slot={sideIndex === 0 ? index : undefined}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Edit foto ${(photoIndex ?? sourceSlotIndex) + 1} pada strip ${sideIndex === 0 ? "kiri" : "kanan"}`}
                                        aria-pressed={selectedTemplateSlot === sourceSlotIndex}
                                        className={[
                                          "template-photo-slot",
                                          selectedTemplateSlot === sourceSlotIndex
                                            ? "active"
                                            : "",
                                          capture ? "filled" : "empty",
                                        ]
                                          .filter(Boolean)
                                          .join(" ")}
                                        key={`double-slot-${sideIndex}-${index}`}
                                        onClick={(event) => handleSelectStudioPhoto(index, sideIndex, event)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            handleSelectStudioPhoto(index, sideIndex);
                                          }
                                        }}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={(event) => handleStripSlotDrop(event, sourceSlotIndex)}
                                        onPointerDown={(event) => handleStripSlotPointerDown(event, sourceSlotIndex)}
                                        onPointerMove={(event) => handleStripSlotPointerMove(event, sourceSlotIndex)}
                                        onPointerUp={handleStripSlotPointerUp}
                                        onPointerCancel={handleStripSlotPointerUp}
                                        onWheel={(event) => handleStripSlotWheel(event, sourceSlotIndex)}
                                        style={getPhotoboothTemplateSlotStyle(slot)}
                                      >
                                        {capture ? (
                                          <img
                                            src={`${capture.image_url}?v=${streamVersion}`}
                                            alt={capture.filename}
                                            onLoad={(event) =>
                                              measurePhotoboothImageFit(event, index, photoIndex)
                                            }
                                            style={{
                                              width: "100%",
                                              height: "100%",
                                              objectFit: "contain",
                                              filter: savedEffect.filter,
                                              left: `calc(50% + ${adjustment.x}%)`,
                                              top: `calc(50% + ${adjustment.y}%)`,
                                              transform: `translate(-50%, -50%) rotate(${adjustment.rotation || 0}deg) scale(${getPhotoboothPreviewScale(index, photoIndex, adjustment)})`,
                                            }}
                                            draggable={false}
                                          />
                                        ) : (
                                          <span>
                                            Foto {photoIndex !== null ? photoIndex + 1 : index + 1}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                {photoboothPreviewUsesUploadedTemplate && (
                                  <img
                                    src={
                                      photoboothTemplateOverlayUrl ||
                                      activePhotoboothTemplate.image_url
                                    }
                                    alt="Template strip terpilih"
                                    className="template-overlay"
                                    draggable={false}
                                  />
                                )}
                                {renderStudioDecorationLayer(sideIndex)}
                              </div>
                            ))
                          : activePhotoboothTemplateSlots
                              .slice(0, photoboothPhotoCount)
                              .map((slot, index) => {
                                const photoIndex = slotPhotoMap[index];
                                const capture = photoboothSlotCaptures[photoIndex];
                                const adjustment =
                                  templatePhotoAdjustments[index] || DEFAULT_SLOT_ADJUSTMENT;
                                const savedEffect = getPhotoboothEffect(photoEffectMap[photoIndex]);

                                return (
                                  <div
                                    data-strip-slot={index}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Edit foto ${(photoIndex ?? index) + 1}`}
                                    aria-pressed={selectedTemplateSlot === index}
                                    className={[
                                      "template-photo-slot",
                                      selectedTemplateSlot === index ? "active" : "",
                                      capture ? "filled" : "empty",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    key={`slot-${index}`}
                                    onClick={(event) => handleSelectStudioPhoto(index, 0, event)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        handleSelectStudioPhoto(index);
                                      }
                                    }}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => handleStripSlotDrop(event, index)}
                                    onPointerDown={(event) =>
                                      handleStripSlotPointerDown(event, index)
                                    }
                                    onPointerMove={(event) =>
                                      handleStripSlotPointerMove(event, index)
                                    }
                                    onPointerUp={handleStripSlotPointerUp}
                                    onPointerCancel={handleStripSlotPointerUp}
                                    onWheel={(event) => handleStripSlotWheel(event, index)}
                                    style={getPhotoboothTemplateSlotStyle(slot)}
                                  >
                                    {capture ? (
                                      <img
                                        src={`${capture.image_url}?v=${streamVersion}`}
                                        alt={capture.filename}
                                        onLoad={(event) =>
                                          measurePhotoboothImageFit(event, index, photoIndex)
                                        }
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "contain",
                                          filter: savedEffect.filter,
                                          left: `calc(50% + ${adjustment.x}%)`,
                                          top: `calc(50% + ${adjustment.y}%)`,
                                          transform: `translate(-50%, -50%) rotate(${adjustment.rotation || 0}deg) scale(${getPhotoboothPreviewScale(index, photoIndex, adjustment)})`,
                                        }}
                                        draggable={false}
                                      />
                                    ) : (
                                      <span>Kotak {index + 1}</span>
                                    )}
                                  </div>
                                );
                              })}

                        {/* FRAME OVERLAY (IF ANY) */}
                        {photoboothPreviewUsesUploadedTemplate && !doubleStripEnabled && (
                          <img
                            src={
                              photoboothTemplateOverlayUrl ||
                              activePhotoboothTemplate.image_url
                            }
                            alt="Template strip upload"
                            className="template-overlay"
                            draggable={false}
                          />
                        )}
                        {!doubleStripEnabled && renderStudioDecorationLayer(0)}
                      </div>
                    </div>
                  </div>

                  {/* CREATIVE STUDIO TOOLBAR DOCK (RIGHT) */}
                  <div className="photo-edit-sidebar studio-dock">
                    {doubleStripEnabled && (
                      <p className="studio-shared-side-note">
                        Klik foto di strip kiri atau kanan untuk mengatur ukuran dan filter. Foto yang sama ikut berubah di kedua strip.
                      </p>
                    )}
                    <div className="studio-tabs-bar" role="tablist" aria-label="Alat edit foto">
                      {[["filter", "Filter"], ["sticker", "Stiker"], ["text", "Teks"]]
                        .filter(([id]) => id === "filter" || (id === "sticker" ? publishedEditorItems.stickers.length : publishedEditorItems.texts.length))
                        .map(([id, label]) => (
                        <button key={id} type="button" role="tab" id={`studio-tool-${id}`}
                          aria-selected={editStudioTab === id} aria-controls={`studio-panel-${id}`}
                          className={`studio-tab-btn ${editStudioTab === id ? "active" : ""}`}
                          onClick={() => setEditStudioTab(id)}>{label}</button>
                      ))}
                    </div>
                    <details className="studio-more-tools">
                      <summary>Alat lainnya{editStudioTab === "doodle" ? " · Coretan" : editStudioTab === "adjust" ? " · Atur foto" : ""}</summary>
                      <div className="studio-extra-tool-grid">
                        {[["doodle", "Coretan"], ["adjust", "Atur foto"]].map(([id, label]) => (
                          <button key={id} type="button" id={`studio-tool-${id}`} aria-pressed={editStudioTab === id}
                            aria-controls={`studio-panel-${id}`}
                            className={`secondary-button compact ${editStudioTab === id ? "active" : ""}`}
                            onClick={() => setEditStudioTab(id)}>{label}</button>
                        ))}
                        <button type="button" className="secondary-button compact studio-reset-edit"
                          onClick={handleResetAllDecorations}>Mulai ulang edit</button>
                      </div>
                    </details>

                    {/* TAB CONTENT: FILTER */}
                    {editStudioTab === "filter" && (
                      <div className="studio-tab-panel" role="tabpanel" id="studio-panel-filter" aria-labelledby="studio-tool-filter">
                        <div className="studio-panel-header">
                          <h3>{studioFilterScope === "selected" ? `Edit foto ${(slotPhotoMap[selectedTemplateSlot] ?? selectedTemplateSlot) + 1}` : "Pilih filter"}</h3>
                          <span>Klik foto pada strip, lalu atur ukuran atau pilih filternya.</span>
                        </div>
                        {studioFilterScope === "selected" && (
                          <div className="studio-photo-controls" role="group" aria-label="Ukuran foto terpilih">
                            <label className="studio-photo-size-label" htmlFor="studio-photo-scale">
                              <span>Ukuran foto</span>
                              <output htmlFor="studio-photo-scale" aria-live="polite">{selectedSlotAdjustment.scale}%</output>
                            </label>
                            <input id="studio-photo-scale" type="range" min="50" max="240" step="1"
                              value={selectedSlotAdjustment.scale}
                              disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}
                              onChange={(event) => handleStudioPhotoScaleChange(event.target.value)} />
                            <div className="studio-photo-size-actions">
                              <button type="button" className="secondary-button compact"
                                disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}
                                onClick={() => handleStudioPhotoScaleChange(selectedSlotAdjustment.scale - 12)}>Perkecil</button>
                              <button type="button" className="secondary-button compact"
                                disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}
                                onClick={() => handleStudioPhotoScaleChange(selectedSlotAdjustment.scale + 12)}>Perbesar</button>
                              <button type="button" className="secondary-button compact" aria-label="Kembalikan ukuran foto ke 100%"
                                disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}
                                onClick={() => handleStudioPhotoScaleChange(100)}>100%</button>
                            </div>
                            <span>Geser foto pada strip untuk mengatur posisinya.</span>
                          </div>
                        )}
                        <label className="studio-filter-scope">
                          Terapkan ke
                          <select value={studioFilterScope === "all" ? "all" : String(selectedTemplateSlot)}
                            onChange={(event) => handleChangeStudioFilterTarget(event.target.value)}>
                            <option value="all">Semua foto</option>
                            {Array.from({ length: photoboothPhotoCount }, (_, index) => (
                              <option key={index} value={index}>Foto {index + 1}</option>
                            ))}
                          </select>
                        </label>
                        <div className="studio-filter-grid">
                          {STUDIO_PHOTOBOOTH_EFFECTS.map((effect) => {
                            const targetSlot = studioFilterScope === "all" ? 0 : selectedTemplateSlot;
                            const targetIdx = slotPhotoMap[targetSlot] ?? targetSlot;
                            const targetCapture = photoboothSlotCaptures[targetIdx];
                            const isActive = studioFilterScope === "all"
                              ? photoEffectMap.length >= photoboothCaptureCount && photoEffectMap.slice(0, photoboothCaptureCount).every((id) => id === effect.id)
                              : photoEffectMap[targetIdx] === effect.id;
                            return (
                              <button
                                key={effect.id}
                                type="button"
                                className={`studio-filter-card ${isActive ? "active" : ""}`}
                                aria-pressed={isActive}
                                onClick={() => handleSelectStudioFilter(effect.id)}
                              >
                                <span
                                  className="filter-sample"
                                  style={{
                                    filter: effect.filter,
                                    backgroundImage: targetCapture
                                      ? `url(${targetCapture.image_url}?v=${streamVersion})`
                                      : undefined,
                                  }}
                                />
                                <strong>{effect.name}</strong>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* TAB CONTENT: STIKER */}
                    {editStudioTab === "sticker" && (
                      <div className="studio-tab-panel" role="tabpanel" id="studio-panel-sticker" aria-labelledby="studio-tool-sticker">
                        <div className="studio-panel-header">
                          <h3>Tambahkan stiker</h3>
                          <span>Pilih stiker, lalu geser di strip.</span>
                        </div>

                        {renderStudioSelectionTools("sticker")}

                        <div className="studio-sticker-grid">
                          {publishedEditorItems.stickers.map((item) => (
                            <button key={item.id} type="button" className="studio-sticker-btn"
                              aria-label={`Tambahkan stiker ${item.name}`}
                              onClick={() => handleAddSticker(item.content, item.kind, item.id)}>
                              <DecorationArtwork item={item} type="sticker" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* TAB CONTENT: TEKS */}
                    {editStudioTab === "text" && (
                      <div className="studio-tab-panel" role="tabpanel" id="studio-panel-text" aria-labelledby="studio-tool-text">
                        <div className="studio-panel-header">
                          <h3>Tambahkan tulisan</h3>
                          <span>Pilih tulisan yang tersedia, lalu geser di strip.</span>
                        </div>
                        <div className="studio-preset-tags">
                          {publishedEditorItems.texts.map((item) => (
                            <button key={item.id} type="button" className="studio-preset-tag studio-designed-text" aria-label={`Tambahkan tulisan ${item.text}`}
                              onClick={() => handleAddText(item.text, item.id)}><DecorationArtwork item={item} type="text" /></button>
                          ))}
                        </div>

                        {renderStudioSelectionTools("text")}


                      </div>
                    )}

                    {/* TAB CONTENT: CORETAN / DOODLE */}
                    {editStudioTab === "doodle" && (
                      <div className="studio-tab-panel" role="tabpanel" id="studio-panel-doodle" aria-labelledby="studio-tool-doodle">
                        <div className="studio-panel-header">
                          <h3>Coretan</h3>
                          <span>Gambar langsung pada strip foto.</span>
                        </div>

                        <div className="studio-subheading">Warna kuas</div>
                        <div className="studio-color-swatches">
                          {DOODLE_COLORS.map((color) => (
                            <button
                              key={color.value}
                              type="button"
                              className={`studio-color-circle ${
                                activeDoodleColor === color.value ? "active" : ""
                              }`}
                              style={{ backgroundColor: color.value }}
                              aria-label={`Warna kuas ${color.name}`}
                              onClick={() => setActiveDoodleColor(color.value)}
                            />
                          ))}
                        </div>

                        <div className="studio-brush-sizes">
                          {DOODLE_BRUSHES.map((brush) => (
                            <button
                              key={brush.id}
                              type="button"
                              className={`studio-brush-pill ${
                                activeDoodleBrush === brush.id ? "active" : ""
                              }`}
                              onClick={() => {
                                setActiveDoodleBrush(brush.id);
                                setActiveDoodleSize(brush.width);
                              }}
                            >
                              {brush.name}
                            </button>
                          ))}
                        </div>

                        <div className="studio-doodle-actions">
                          <button
                            type="button"
                            className="secondary-button compact"
                            onClick={handleUndoDoodle}
                            disabled={stripDoodles.length === 0}
                          >
                            Urungkan
                          </button>
                          <button
                            type="button"
                            className="secondary-button compact"
                            onClick={handleClearDoodles}
                            disabled={stripDoodles.length === 0}
                          >
                            Hapus coretan
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TAB CONTENT: FRAME & PHOTO SLOTS */}
                    {editStudioTab === "adjust" && (
                      <div className="studio-tab-panel" role="tabpanel" id="studio-panel-adjust" aria-labelledby="studio-tool-adjust">
                        <div className="studio-panel-header">
                          <h3>Atur foto</h3>
                          <span>Pilih foto untuk mengubah ukuran atau posisinya.</span>
                        </div>

                        <div className="studio-subheading">Warna bingkai</div>
                        <div className="studio-frame-swatches">
                          {[
                            { name: "Putih gading", value: "#f7f7f2" },
                            { name: "Merah muda", value: "#f5dce5" },
                            { name: "Biru muda", value: "#dcecf2" },
                            { name: "Ungu muda", value: "#e9e2f3" },
                            { name: "Gelap", value: "#27252a" },
                          ].map((frame) => (
                            <button
                              key={frame.value}
                              type="button"
                              className={`studio-frame-swatch ${studioFrameColor === frame.value ? "active" : ""}`}
                              style={{ backgroundColor: frame.value }}
                              aria-label={`Bingkai ${frame.name}`}
                              title={frame.name}
                              aria-pressed={studioFrameColor === frame.value}
                              onClick={() => setStudioFrameColor(frame.value)}
                            />
                          ))}
                        </div>

                        <p className="studio-slot-hint">
                          Geser foto pada strip untuk mengatur posisinya.
                        </p>
                        <div className="photo-picker-grid">
                          {Array.from({ length: photoboothPhotoCount }, (_, index) => {
                            const photoIndex = slotPhotoMap[index];
                            const capture = photoboothSlotCaptures[photoIndex];
                            return (
                              <button
                                type="button"
                                key={`adjust-slot-${index}`}
                                className={selectedTemplateSlot === index ? "photo-picker-button active" : "photo-picker-button"}
                                onClick={() => handleSelectTemplateSlot(index)}
                              >
                                {capture ? (
                                  <img
                                    src={`${capture.image_url}?v=${streamVersion}`}
                                    alt={capture.filename}
                                    style={{ filter: getPhotoboothEffect(photoEffectMap[photoIndex]).filter }}
                                  />
                                ) : (
                                  <span className="studio-empty-slot">Kosong</span>
                                )}
                                <span>Foto {index + 1}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="studio-slot-controls">
                          <span>Foto {selectedTemplateSlot + 1} · Ukuran {selectedSlotAdjustment.scale}%</span>
                          <div className="studio-slot-action-row">
                            <button type="button" className="secondary-button compact" onClick={() => updateTemplateSlotAdjustment({ scale: clampNumber(selectedSlotAdjustment.scale - 12, 50, 240) })} disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}>Perkecil</button>
                            <button type="button" className="secondary-button compact" onClick={() => updateTemplateSlotAdjustment({ scale: clampNumber(selectedSlotAdjustment.scale + 12, 50, 240) })} disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}>Perbesar</button>
                            <button type="button" className="secondary-button compact" onClick={() => updateTemplateSlotAdjustment({ rotation: ((selectedSlotAdjustment.rotation || 0) + 90) % 360 })} disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}>Putar 90°</button>
                            <button
                              type="button"
                              className={`secondary-button compact ${pendingSwapSlot !== null ? "active" : ""}`}
                              onClick={() => setPendingSwapSlot(pendingSwapSlot === null ? selectedTemplateSlot : null)}
                              disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}
                            >
                              {pendingSwapSlot === null ? "Tukar foto" : "Batal tukar"}
                            </button>
                          </div>
                          {pendingSwapSlot !== null && (
                            <span className="studio-swap-prompt">Ketuk foto lain pada strip untuk menukar posisi.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* FOOTER ACTION BAR */}
                <div className="step-footer studio-footer">
                  <button
                    type="button"
                    className="secondary-button compact studio-back-btn"
                    onClick={() => setPhotoboothStep(isOtoMode ? 3 : 2)}
                  >
                    Kembali ke foto
                  </button>
                  <button
                    type="button"
                    className="upload-button compact main-cta-glow studio-finish-btn"
                    onClick={finalizePhotobooth}
                    disabled={
                      captures.length < photoboothCaptureCount ||
                      filledStripSlotCount < Math.min(activePhotoboothTemplateSlots.length, photoboothPhotoCount) ||
                      isFinalizingPhotobooth
                    }
                  >
                    {isFinalizingPhotobooth ? "Menyiapkan hasil..." : "Lanjut cetak & simpan"}
                  </button>
                </div>
              </section>
            )}

            {((isOtoMode && photoboothStep === 5) || (!isOtoMode && photoboothStep === 4)) && (
              <section className="step-panel photobooth-drive-panel">
                <section className="photobooth-final-preview">
                  <div className="template-panel-header">
                    <div>
                      <h2>Hasil Photobooth</h2>
                      <span>
                        Hasil memakai {selectedPhotoboothStrip?.name || activePhotoboothTemplate?.name || "strip terpilih"} dan akan masuk ke Google Drive serta printer.
                      </span>
                    </div>
                  </div>
                  <PhotoboothGifResults printUrl={photoboothFinalComposite?.dataUrl || photoboothFinalPreviewUrl}
                    assets={photoboothGifAssets} busy={isPreparingPhotoboothGif} errors={photoboothGifErrors}
                    canRetry={!isFinalizingPhotobooth && !!photoboothFinalComposite}
                    onRetry={() => photoboothFinalComposite && preparePhotoboothGifs(photoboothFinalComposite)} />
                </section>
                <section className="photobooth-drive-card">
                  <div className="template-panel-header">
                    <div>
                      <h2>Upload ke Google Drive</h2>
                      <span>{photoboothDriveResult ? "Folder siap untuk user." : "Strip JPG untuk cetak; GIF digital disertakan ke folder hasil."}</span>
                    </div>
                  </div>
                  {isUploadingPhotoboothDrive ? (
                    <span className="upload-status-text">Membuat folder dan mengupload hasil JPG / GIF...</span>
                  ) : photoboothDriveResult ? (
                    <div className="drive-result">
                      <div className="drive-result-copy">
                        <strong>{photoboothDriveResult.folder_name}</strong>
                        {photoboothDriveResult.folder_url && (
                          <a
                            href={photoboothDriveResult.folder_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Buka Folder Drive
                          </a>
                        )}
                      </div>
                      {photoboothDriveQrUrl && (
                        <div className="drive-qr-card">
                          <img
                            src={photoboothDriveQrUrl}
                            alt="QR link Google Drive"
                          />
                          <span>Scan untuk buka folder</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="upload-status-text">
                      {photoboothDeliveryStatus.drive === "failed"
                        ? "Upload ke Google Drive gagal. Anda dapat mencoba lagi."
                        : photoboothDeliveryStatus.drive === "success"
                          ? "Strip berhasil disimpan ke Google Drive."
                          : photoboothDeliveryStatus.drive === "pending"
                            ? "Mengupload strip final ke Google Drive..."
                            : "Belum ada hasil final yang diupload."}
                    </span>
                  )}
                  <div className="photobooth-delivery-status">
                    <strong>Printer</strong>
                    <span>
                      {photoboothDeliveryStatus.printer === "success"
                        ? "Strip sudah dikirim ke printer."
                        : photoboothDeliveryStatus.printer === "failed"
                          ? printError || "Pengiriman ke printer gagal."
                          : photoboothDeliveryStatus.printer === "pending"
                            ? "Mengirim strip final ke printer..."
                            : "Menunggu hasil final."}
                    </span>
                    {photoboothFinalComposite && (
                      <div className="photobooth-retry-actions">
                        {photoboothDeliveryStatus.drive === "failed" && (
                          <button
                            type="button"
                            className="secondary-button compact"
                            disabled={isUploadingPhotoboothDrive}
                            onClick={async () => {
                              setPhotoboothDeliveryStatus((current) => ({ ...current, drive: "pending" }));
                              const now = new Date();
                              const folderName = `Photobooth - ${now.toLocaleDateString("id-ID")}`;
                              const success = await handlePhotoboothDriveUpload(folderName, photoboothFinalComposite.dataBase64);
                              setPhotoboothDeliveryStatus((current) => ({ ...current, drive: success ? "success" : "failed" }));
                            }}
                          >
                            Ulangi upload
                          </button>
                        )}
                        {photoboothDeliveryStatus.printer === "failed" && (
                          <button
                            type="button"
                            className="secondary-button compact"
                            disabled={isPrintingStrip}
                            onClick={async () => {
                              setPhotoboothDeliveryStatus((current) => ({ ...current, printer: "pending" }));
                              const success = await printPhotoboothStrip(photoboothFinalComposite.dataBase64);
                              setPhotoboothDeliveryStatus((current) => ({ ...current, printer: success ? "success" : "failed" }));
                            }}
                          >
                            Cetak ulang
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
                <div className="step-footer">
                  {photoboothAdminSettings.editEnabled && (
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => setPhotoboothStep(isOtoMode ? 4 : 3)}
                      disabled={isFinalizingPhotobooth || isPreparingPhotoboothGif}
                    >
                      Kembali Edit
                    </button>
                  )}
                  {!photoboothFinalComposite && (
                    <button
                      type="button"
                      className="upload-button compact main-cta-glow"
                      onClick={finalizePhotobooth}
                      disabled={
                        isFinalizingPhotobooth ||
                        captures.length < photoboothCaptureCount ||
                        filledStripSlotCount < Math.min(activePhotoboothTemplateSlots.length, photoboothPhotoCount)
                      }
                    >
                      {isFinalizingPhotobooth ? "Menyusun hasil..." : "Cetak & Simpan ✨"}
                    </button>
                  )}
                    <button
                      type="button"
                      className="upload-button compact finish-button"
                      onClick={handleFinishPhotoboothSession}
                      disabled={isUploadingPhotoboothDrive || isFinalizingPhotobooth || isPreparingPhotoboothGif}
                    >
                      Selesai
                    </button>
                </div>
              </section>
            )}

          </section>
        </main>
      ) : activeView === "upload" ? (
        <main className="upload-view">
          <section className="upload-wizard">

            {uploadStep === 1 && (
              <section className="step-panel upload-step-panel">
                <div className="upload-source-grid">
                  <section
                    className={
                      uploadInputMode === "user"
                        ? "upload-source-card active"
                        : "upload-source-card"
                    }
                  >
                    <div className="source-card-header">
                      <div>
                        <strong>User Upload</strong>
                        <span>Tambah file atau folder dari komputer</span>
                      </div>
                      {uploadInputMode === "user" && (
                        <small className="mode-badge">Dipilih</small>
                      )}
                    </div>
                    <div
                      className={isDragging ? "drop-zone dragging" : "drop-zone"}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDropFiles}
                    >
                      <strong>Letakkan file di sini</strong>
                      <span>JPG, JPEG, atau PNG akan masuk ke daftar terpilih</span>
                    </div>
                    <div className="source-button-grid">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Pilih File
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => folderInputRef.current?.click()}
                      >
                        Pilih Folder
                      </button>
                    </div>
                  </section>

                  <section
                    className={
                      uploadInputMode === "folder"
                        ? "upload-source-card active"
                        : "upload-source-card"
                    }
                  >
                    <div className="source-card-header">
                      <div>
                        <strong>Folder Watcher</strong>
                        <span>File baru masuk otomatis ke daftar</span>
                      </div>
                      <small
                        className={
                          activeWatchFolder?.enabled
                            ? "mode-badge live"
                            : "mode-badge"
                        }
                      >
                        {activeWatchLabel}
                      </small>
                    </div>
                    <div className="drop-zone folder-change-zone">
                      <strong>{watchPendingFiles.length}</strong>
                      <span>
                        {activeWatchFolder?.auto_upload_enabled
                          ? "file baru berikutnya langsung diproses"
                          : "file baru menunggu edit pertama"}
                      </span>
                    </div>
                    <div className="watch-folder-control">
                      <label htmlFor="watch-folder-path">Folder Path</label>
                      <div className="watch-folder-picker">
                        <input
                          id="watch-folder-path"
                          type="text"
                          value={watchFolderPath}
                          onChange={(event) => {
                            watchSettingsRevisionRef.current += 1;
                            watchFolderDraftRef.current = event.target.value;
                            setUploadInputMode("folder");
                            setWatchFolderPath(event.target.value);
                          }}
                          placeholder="/Users/a1/Pictures/Event"
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={handlePickWatchFolder}
                        >
                          Pilih
                        </button>
                      </div>
                      <label htmlFor="watch-drive-folder-id">Google Drive Folder ID</label>
                      <input
                        id="watch-drive-folder-id"
                        type="text"
                        value={driveFolderId}
                        onChange={(event) => {
                          watchSettingsRevisionRef.current += 1;
                          driveFolderDraftRef.current = event.target.value;
                          setDriveFolderId(event.target.value);
                        }}
                        onBlur={saveWatchDriveTarget}
                        placeholder="Kosongkan untuk folder default"
                      />
                      {activeWatchFolder?.enabled && (
                        <div className="watch-status-panel">
                          <strong>{activeWatchLabel}</strong>
                          <span>{activeWatchFolder.folder_path}</span>
                          <small>
                            {activeWatchFolder.auto_upload_enabled
                              ? "File baru berikutnya akan otomatis diedit dan masuk queue."
                              : `${activeWatchFolder.pending_count || 0} file baru siap diedit sebelum upload pertama.`}
                          </small>
                        </div>
                      )}
                    </div>
                    <div className="watch-folder-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleSetAutoWatchFolder}
                        disabled={isSavingWatchFolder || !backendReady}
                      >
                        {isSavingWatchFolder ? "Mengaktifkan..." : "Aktifkan Folder"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleDisableAutoWatchFolder}
                        disabled={
                          isStoppingWatchFolder ||
                          !backendReady ||
                          !activeWatchFolder?.enabled
                        }
                      >
                        {isStoppingWatchFolder ? "Mematikan..." : "Matikan"}
                      </button>
                    </div>
                  </section>
                </div>

                <div className="picker-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={clearSelectedFiles}
                    disabled={selectedFiles.length === 0}
                  >
                    Kosongkan Pilihan
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleSelectFiles}
                  />
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    webkitdirectory="true"
                    directory="true"
                    onChange={handleSelectFolderFiles}
                  />
                </div>

                <div className="list-section-header">
                  <div>
                    <strong>File Terpilih</strong>
                    <span>
                      {uploadInputMode === "folder"
                        ? "Diambil dari file baru di folder watcher"
                        : "Dipilih manual oleh user"}
                    </span>
                  </div>
                  <small>{selectedUploadCount} file</small>
                </div>
                <div className="selected-list">
                  {selectedUploadCount === 0 ? (
                    <div className="empty-state">
                      {uploadInputMode === "folder"
                        ? "Folder aktif, menunggu file gambar baru"
                        : "Belum ada file dipilih"}
                    </div>
                  ) : (
                    (uploadInputMode === "folder" ? watchPendingFiles : selectedFiles).map((file) => {
                      const fileName =
                        uploadInputMode === "folder"
                          ? file.name
                          : file.webkitRelativePath || file.name;
                      const fileKey =
                        uploadInputMode === "folder"
                          ? file.path
                          : `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`;

                      return (
                        <div
                          className="selected-file"
                          key={fileKey}
                        >
                          <span>{fileName}</span>
                          <strong>{Math.ceil(file.size / 1024)} KB</strong>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="step-footer">
                  <div>
                    <strong>{selectedUploadCount}</strong>
                    <span>
                      {uploadInputMode === "folder"
                        ? "file baru dari perubahan folder"
                        : "file dari user upload"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="upload-button compact"
                    onClick={() => setUploadStep(2)}
                    disabled={selectedUploadCount === 0}
                  >
                    Lanjut Edit File
                  </button>
                </div>
              </section>
            )}

            {uploadStep === 2 && (
              <section className="step-panel edit-step-panel">
                <div className="edit-scroll-region">
                  <div className="edit-layout">
                    {watermarkPanel}

                    <div className="preview-panel inline-preview">
                      <div className="auto-preview-header">
                        <div>
                          <h2>Preview Otomatis</h2>
                          <p>
                            Mengikuti orientasi yang dipilih dan menampilkan gambar utuh.
                          </p>
                        </div>
                        <span>
                          {autoPreviewInfo
                            ? `${autoPreviewInfo.orientationLabel} ${autoPreviewInfo.width} x ${autoPreviewInfo.height} px`
                            : "Belum ada gambar"}
                        </span>
                      </div>
                      <div className="auto-preview-stage">
                        {autoPreviewUrl ? (
                          <div
                            className={
                              previewWatermarkSettings.fit === "frame"
                                ? "auto-preview-canvas frame-preview"
                                : "auto-preview-canvas"
                            }
                          >
                            <img
                              src={autoPreviewUrl}
                              alt="Preview file upload"
                              className="auto-preview-image"
                            />
                            {previewWatermarkSettings.fit === "frame" && (
                              <img
                                src={autoPreviewUrl}
                                alt=""
                                className="auto-preview-frame-photo"
                                style={getFramePreviewPhotoStyle()}
                              />
                            )}
                            {activeWatermarkItems.map((item) => (
                              <img
                                key={item.id}
                                src={item.image_url}
                                alt={item.name}
                                className="auto-preview-watermark"
                                style={{
                                  ...getPreviewWatermarkStyle(),
                                  opacity:
                                    previewWatermarkSettings.fit === "frame"
                                      ? 1
                                      : item.opacity / 100,
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <span>Pilih file gambar untuk melihat preview.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="step-footer">
                  <div className="footer-actions">
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => setUploadStep(1)}
                    >
                      Kembali Step 1
                    </button>
                  </div>
                  <button
                    type="button"
                    className="upload-button compact"
                    onClick={() => setUploadStep(3)}
                    disabled={selectedUploadCount === 0}
                  >
                    Lanjut Queue Drive
                  </button>
                </div>
              </section>
            )}

            {uploadStep === 3 && (
              <section className="step-panel queue-step-panel">
                <div className="drive-target">
                  <label htmlFor="drive-folder-id">Google Drive Folder ID</label>
                  <input
                    id="drive-folder-id"
                    type="text"
                    value={driveFolderId}
                    onChange={(event) => {
                      watchSettingsRevisionRef.current += 1;
                      driveFolderDraftRef.current = event.target.value;
                      setDriveFolderId(event.target.value);
                    }}
                    onBlur={uploadInputMode === "folder" ? saveWatchDriveTarget : undefined}
                    placeholder="Contoh: 1Y-A_3AIaLYGn2nrlKiIA9-OEFZPo9neE"
                  />
                </div>

                <div className="upload-progress">
                  <span>Progress upload</span>
                  <strong>
                    {uploadedCount} / {uploadProgress.total} file sudah di upload
                  </strong>
                </div>

                <div className="queue-summary-grid">
                  <div>
                    <span>Total Queue</span>
                    <strong>{queueSummary.total}</strong>
                  </div>
                  <div>
                    <span>Menunggu</span>
                    <strong>{queueSummary.pending}</strong>
                  </div>
                  <div>
                    <span>Berjalan</span>
                    <strong>{queueSummary.processing}</strong>
                  </div>
                  <div className={queueSummary.failed > 0 ? "summary-alert" : ""}>
                    <span>Gagal</span>
                    <strong>{queueSummary.failed}</strong>
                  </div>
                </div>

                <div className="queue-actions top-actions">
                  <button
                    type="button"
                    className="upload-button compact"
                    onClick={handleManualUpload}
                    disabled={
                      isUploading ||
                      selectedUploadCount === 0 ||
                      !backendReady ||
                      !driveFolderId.trim()
                    }
                  >
                    {isUploading
                      ? "Menambahkan..."
                      : `Upload ${selectedUploadCount} File`}
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={() => setUploadStep(1)}
                    disabled={isUploading}
                  >
                    Kembali Step 1
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={() => setUploadStep(2)}
                    disabled={isUploading}
                  >
                    Kembali Edit
                  </button>
                </div>

                <section className="queue-panel inline-queue">
                  <div className="queue-header">
                    <div>
                      <h2>Queue Upload</h2>
                      <span>{queueSummary.total} item aktif</span>
                    </div>
                    <div className="queue-actions">
                      <button
                        type="button"
                        className="retry-queue-button"
                        onClick={handleRetryFailed}
                        disabled={
                          isRetryingFailed ||
                          failedQueueCount === 0 ||
                          !backendReady
                        }
                      >
                        {isRetryingFailed ? "Mengulang..." : "Ulang Failed"}
                      </button>
                      <button
                        type="button"
                        className="clear-queue-button"
                        onClick={handleClearQueue}
                        disabled={isClearingQueue || queue.length === 0 || !backendReady}
                      >
                        {isClearingQueue ? "Membersihkan..." : "Bersihkan Queue"}
                      </button>
                      <button
                        type="button"
                        className="clear-queue-button"
                        onClick={handleCleanManualUploads}
                        disabled={isCleaningManualUploads || !backendReady}
                      >
                        {isCleaningManualUploads ? "Membersihkan..." : "Bersihkan File Lama"}
                      </button>
                    </div>
                  </div>
                  <div className="queue-list">
                    {queue.length === 0 ? (
                      <div className="empty-state">Queue kosong</div>
                    ) : (
                      queue.map((item) => (
                        <div className="queue-row" key={item.id}>
                          <span>
                            {item.filename}
                            {item.last_error && (
                              <small className="queue-error">{item.last_error}</small>
                            )}
                          </span>
                          <div className="queue-row-meta">
                            <small>{getQueueMeta(item)}</small>
                            <strong className={`queue-status ${item.status}`}>
                              {getQueueStatusLabel(item.status)}
                            </strong>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </section>
            )}

            {uploadStep === 4 && (
              <section className="step-panel upload-preview-step-panel">
                {uploadPreviewItems.length > 0 ? (
                  <section className="watch-upload-preview expanded">
                    <div className="watch-preview-header">
                      <div>
                        <h2>
                          {uploadProgress.source === "folder"
                            ? "Preview Upload Watcher"
                            : "Preview Upload"}
                        </h2>
                        <span>
                          {uploadPreviewSummary.total} file dalam batch terakhir
                        </span>
                      </div>
                      <div className="watch-preview-counters">
                        <span>
                          <strong>{uploadPreviewSummary.uploaded}</strong>
                          Upload
                        </span>
                        <span>
                          <strong>{uploadPreviewSummary.processing}</strong>
                          Proses
                        </span>
                        <span>
                          <strong>{uploadPreviewSummary.pending}</strong>
                          Tunggu
                        </span>
                        <span className={uploadPreviewSummary.failed > 0 ? "counter-alert" : ""}>
                          <strong>{uploadPreviewSummary.failed}</strong>
                          Gagal
                        </span>
                      </div>
                    </div>
                    <div className="watch-preview-list">
                      {uploadPreviewItems.map((item) => (
                        <div className="watch-preview-item" key={item.id}>
                          <div className="watch-preview-thumb">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} />
                            ) : (
                              <span>{item.name.slice(0, 1).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="watch-preview-copy">
                            <strong>{item.name}</strong>
                            <span>
                              {item.size ? `${Math.ceil(item.size / 1024)} KB` : item.meta}
                            </span>
                            {item.error && <small>{item.error}</small>}
                          </div>
                          <strong className={`queue-status ${item.status}`}>
                            {getQueueStatusLabel(item.status)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="watch-upload-preview expanded empty-preview">
                    <div className="watch-preview-header">
                      <div>
                        <h2>Preview Upload</h2>
                        <span>Belum ada batch upload untuk dipreview.</span>
                      </div>
                    </div>
                    <div className="empty-state">
                      Jalankan upload dari Folder Watcher atau User Upload dulu.
                    </div>
                  </section>
                )}
                <div className="step-footer">
                  <div>
                    <strong>{uploadPreviewSummary.total}</strong>
                    <span>file batch terakhir</span>
                  </div>
                  <div className="footer-actions">
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => setUploadStep(3)}
                    >
                      Kembali Upload Drive
                    </button>
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => setUploadStep(1)}
                    >
                      Pilih Sumber
                    </button>
                  </div>
                </div>
              </section>
            )}
          </section>
        </main>
        ) : activeView === "edit" ? (
          <main className="admin-view">
            <section className="admin-shell edit-admin-shell">
                <section className="admin-content-full">
                    {editUploadStep === 1 && (
                      <section className="step-panel upload-step-panel">
                        <div className="upload-source-stack">
                          <section
                            className={
                              editUploadInputMode === "user"
                                ? "upload-source-card active"
                                : "upload-source-card"
                            }
                            onClick={() => setEditUploadInputMode("user")}
                          >
                            <div className="source-card-header">
                              <div>
                                <strong>User Upload</strong>
                                <span>Tambah file dari komputer untuk diedit</span>
                              </div>
                              {editUploadInputMode === "user" && (
                                <small className="mode-badge">Dipilih</small>
                              )}
                            </div>
                            <div
                              className={isEditDragging ? "drop-zone dragging" : "drop-zone"}
                              onDragOver={(event) => {
                                event.preventDefault();
                                setIsEditDragging(true);
                              }}
                              onDragLeave={() => setIsEditDragging(false)}
                              onDrop={handleEditDropFiles}
                            >
                              <strong>Letakkan file di sini</strong>
                              <span>JPG, JPEG, atau PNG akan masuk ke daftar terpilih</span>
                            </div>
                            <div className="source-button-grid">
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  editFileInputRef.current?.click();
                                }}
                              >
                                Pilih File
                              </button>
                            </div>
                          </section>

                          <section
                            className={
                              editUploadInputMode === "folder"
                                ? "upload-source-card active"
                                : "upload-source-card"
                            }
                            onClick={() => setEditUploadInputMode("folder")}
                          >
                            <div className="source-card-header">
                              <div>
                                <strong>Upload Folder</strong>
                                <span>Kirim seluruh isi folder untuk optimasi massal</span>
                              </div>
                              {editUploadInputMode === "folder" && (
                                <small className="mode-badge">Dipilih</small>
                              )}
                            </div>
                            <div className="drop-zone folder-upload-zone">
                              <strong>Pilih Folder</strong>
                              <span>Semua gambar di dalam folder akan otomatis terpilih</span>
                            </div>
                            <div className="source-button-grid">
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  editFolderInputRef.current?.click();
                                }}
                              >
                                Pilih Folder
                              </button>
                            </div>
                          </section>
                        </div>

                        <div className="picker-actions" style={{ position: 'relative', zIndex: 10 }}>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={(e) => {
                              e.preventDefault();
                              handleEditClearFiles();
                            }}
                            disabled={editSelectedFiles.length === 0}
                          >
                            Kosongkan Pilihan
                          </button>
                          <input
                            ref={editFileInputRef}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png"
                            onChange={handleEditSelectFiles}
                            style={{ display: "none" }}
                          />
                          <input
                            ref={editFolderInputRef}
                            type="file"
                            multiple
                            webkitdirectory="true"
                            directory="true"
                            onChange={handleEditSelectFolderFiles}
                            style={{ display: "none" }}
                          />
                        </div>

                        <div className="list-section-header">
                          <div>
                            <strong>File Terpilih</strong>
                            <span>Dipilih manual atau melalui folder upload</span>
                          </div>
                          <small>{editSelectedFiles.length} file</small>
                        </div>
                        <div className="selected-list">
                          {editSelectedFiles.length === 0 ? (
                            <div className="empty-state">Belum ada file dipilih</div>
                          ) : (
                            editSelectedFiles.map((file, idx) => (
                              <div key={idx} className="selected-file">
                                <span>{file.name}</span>
                                <strong>{Math.ceil(file.size / 1024)} KB</strong>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="step-footer">
                          <div>
                            <strong>{editSelectedFiles.length}</strong>
                            <span>file siap dioptimasi</span>
                          </div>
                          <button
                            type="button"
                            className="upload-button compact"
                            disabled={editSelectedFiles.length === 0}
                            onClick={() => {
                              setEditPreviewIndex(0);
                              setEditUploadStep(2);
                            }}
                          >
                            Lanjut Edit File
                          </button>
                        </div>
                      </section>
                    )}
                  {editUploadStep === 2 && (
                    <>
                      <div className={`admin-grid edit-admin-grid${editFocusMode ? " edit-focus" : ""}`}>
                      <button
                        type="button"
                        className={`edit-side-toggle edit-side-toggle-left${editLeftOpen ? " active" : ""}`}
                        onClick={() => setEditLeftOpen((v) => !v)}
                        aria-label="Pengaturan output"
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{editLeftOpen ? <path d="M15 18l-6-6 6-6"/> : <path d="M9 6l6 6-6 6"/>}</svg>
                        <span>Pengaturan</span>
                      </button>
                      <button
                        type="button"
                        className={`edit-side-toggle ${editRightOpen ? " active" : ""}`}
                        onClick={() => setEditRightOpen((v) => !v)}
                        aria-label="Alat edit"
                      >
                        <span>Edit</span>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{editRightOpen ? <path d="M9 18l6-6-6-6"/> : <path d="M15 6l-6 6 6 6"/>}</svg>
                      </button>
                      <div className={`admin-column admin-column-left${editLeftOpen ? " panel-open" : ""}`}>
                        <section className="admin-card sparse admin-col-left edit-hide-resize">
                          <div className="template-panel-header">
                            <div>
                              <h2>Kualitas Output (Compress)</h2>
                              <span>Atur tingkat kompresi untuk menghemat ruang penyimpanan.</span>
                            </div>
                          </div>
                          <label className="admin-input-field">
                            Kualitas Kompresi
                            <select
                              value={
                                photoboothAdminSettings.outputCompressionEnabled
                                  ? String(photoboothAdminSettings.outputCompressionQuality)
                                  : "normal"
                              }
                              onChange={(event) => {
                                const value = event.target.value;
                                setPhotoboothAdminSettings((current) => ({
                                  ...current,
                                  outputCompressionEnabled: value !== "normal",
                                  outputCompressionQuality:
                                    value === "normal"
                                      ? current.outputCompressionQuality
                                      : normalizeCompressionQuality(value),
                                }));
                              }}
                            >
                              <option value="normal">Normal (Kualitas Tinggi)</option>
                              {OUTPUT_COMPRESSION_QUALITIES.map((quality) => (
                                <option key={quality} value={quality}>
                                  Kompres {quality}%
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="admin-setting-note">
                            <strong>
                              {photoboothAdminSettings.outputCompressionEnabled
                                ? `${photoboothAdminSettings.outputCompressionQuality}%`
                                : "Normal"}
                            </strong>
                            <span>
                              {photoboothAdminSettings.outputCompressionEnabled
                                ? "Kualitas JPEG final akan dikompresi sesuai angka pilihan."
                                : "File disimpan dengan kualitas tertinggi tanpa kompresi."}
                            </span>
                          </div>
                        </section>
                        <section className="admin-card sparse admin-col-left edit-hide-resize">
                          <div className="template-panel-header">
                            <div>
                              <h2>Ukuran Output</h2>
                              <span>Atur dimensi hasil akhir foto.</span>
                            </div>
                          </div>
                          <div className="filter-mode-grid">
                            {PHOTO_RESIZE_MODES.map((mode) => (
                              <button
                                key={mode.id}
                                type="button"
                                className={`filter-chip ${editResizeMode === mode.id ? "active" : ""}`}
                                onClick={() => setEditResizeMode(mode.id)}
                              >
                                {mode.name}
                              </button>
                            ))}
                          </div>
                          <div className="dimension-row">
                            <label className="admin-input-field">
                              Lebar (px)
                              <input
                                type="number"
                                min="1"
                                value={editResizeWidth}
                                placeholder="Auto"
                                onChange={(event) => setEditResizeWidth(event.target.value)}
                              />
                            </label>
                            <label className="admin-input-field">
                              Tinggi (px)
                              <input
                                type="number"
                                min="1"
                                value={editResizeHeight}
                                placeholder="Auto"
                                onChange={(event) => setEditResizeHeight(event.target.value)}
                              />
                            </label>
                          </div>
                          <div className="admin-setting-note">
                            <strong>{getEditOutputSizeInfo()}</strong>
                            <span>
                              {editResizeMode === "keep"
                                ? "Ukuran asli foto dipertahankan."
                                : "Nilai kosong berarti otomatis sesuai rasio."}
                            </span>
                          </div>
                        </section>
                        {watermarkPanel}
                      </div>
                        <div className="admin-column admin-column-right">
                          <section className="admin-card preview-card">
                            <div className="template-panel-header">
                              <div>
                                <h2>Preview Optimasi</h2>
                              </div>
                              {!editFocusMode && (
                              <button
                                type="button"
                                className="secondary-button compact"
                                onClick={() => {
                                  setEditFocusMode(true);
                                  setEditTool(null);
                                }}
                              >
                                Sembunyikan Panel
                              </button>
                              )}
                            </div>
                            <div className="optimasi-preview-container">
                            {editSelectedFiles.length > 0 ? (
                               <>
                                  <div className="edit-toolbar">
                                    {EDIT_TOOLS.map((tool) => (
                                      <button
                                        key={tool.id}
                                        type="button"
                                        className={`edit-tool-btn ${editTool === tool.id ? "active" : ""}`}
                                        title={tool.name}
                                        onClick={() => setEditTool(editTool === tool.id ? null : tool.id)}
                                      >
                                        {tool.icon}
                                      </button>
                                    ))}
                                    {editTool && (
                                      <button type="button" className="edit-tool-btn done" title="Selesai" onClick={() => setEditTool(null)}>
                                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                   <div className="edit-workspace">
                                    <div className="edit-preview-main">
                                 <div
                                   className="optimasi-preview-stage"
onPointerMove={onEditCropPointerMove}
                                    onPointerUp={endEditCropDrag}
                                    onPointerLeave={endEditCropDrag}
                                  >
                                    <div className="edit-preview-wrap" ref={editCropWrapRef} onWheel={onEditPreviewWheel}
                                    onPointerDown={startEditPreviewPan}
                                    onPointerMove={onEditPreviewPanMove}
                                    onPointerUp={endEditPreviewPan}
                                    onPointerLeave={endEditPreviewPan}
                                    >
                                      <canvas
                                        ref={editPreviewCanvasRef}
                                        className={`edit-preview-canvas${editPreviewView.zoom > 1 ? " zoomed" : ""}`}
                                        style={{
                                          transform: `translate(${editPreviewView.pan.x}px, ${editPreviewView.pan.y}px) scale(${editPreviewView.zoom})`,
                                          transformOrigin: "0 0",
                                          filter: `${
                                            (PHOTO_FILTERS.find((filterItem) => filterItem.id === editFilter) || PHOTO_FILTERS[0]).css
                                          } brightness(${editEnhance.brightness}%) contrast(${editEnhance.contrast}%) saturate(${editEnhance.saturation}%)`,
                                        }}
                                     />
                                     {editTool === "crop" && editCrop && (
                                       <div className="edit-crop-overlay">
                                         <div
                                           className="edit-crop-rect"
                                           style={{
                                             left: `${editCropX * 100}%`,
                                             top: `${editCropY * 100}%`,
                                             width: `${editCropW * 100}%`,
                                             height: `${editCropH * 100}%`,
                                           }}
                                           onPointerDown={startEditCropDrag("move")}
                                         >
                                           <div className="edit-crop-grid" />
                                           <div className="crop-handle tl" onPointerDown={startEditCropDrag("tl")} />
                                           <div className="crop-handle tr" onPointerDown={startEditCropDrag("tr")} />
                                           <div className="crop-handle bl" onPointerDown={startEditCropDrag("bl")} />
                                           <div className="crop-handle br" onPointerDown={startEditCropDrag("br")} />
                                         </div>
                                       </div>
                                     )}
                                     {currentWatermarkImageUrl && (
                                       <img
                                         src={currentWatermarkImageUrl}
                                         alt="Watermark Preview"
                                         className="optimasi-watermark-overlay"
                                         style={{
                                           opacity:
                                             currentWatermarkSettings.fit === "frame"
                                               ? 1
                                               : currentWatermarkSettings.opacity / 100,
                                           left: currentWatermarkSettings.position.includes("left")
                                             ? "10%"
                                             : currentWatermarkSettings.position.includes("right")
                                               ? "90%"
                                               : "50%",
                                           top: currentWatermarkSettings.position.includes("top")
                                             ? "10%"
                                             : currentWatermarkSettings.position.includes("bottom")
                                               ? "90%"
                                               : "50%",
                                           width: `${currentWatermarkSettings.scale}%`,
                                           transform: "translate(-50%, -50%)",
                                         }}
                                       />
                                     )}
</div>
                                  </div>
                                     </div>
                                  </div>
                               </>
                              ) : (
                                <div className="optimasi-preview-empty">
                                  <span>Pilih file terlebih dahulu untuk melihat preview.</span>
                                </div>
                             )}
                           </div>
                         </section>
                       </div>
                                     {editSelectedFiles.length > 0 && (
                                       <div className={`edit-tool-sidebar${editRightOpen ? " panel-open" : ""}`}>

                                 {editTool === "crop" && (
                                   <div className="edit-tool-panel">
                                     <div className="edit-tool-panel-header">
                                       <span>Rasio Krop</span>
                                        {editCrop ? (
                                          <button type="button" className="secondary-button compact icon-btn" title="Reset Krop" onClick={() => setEditCrop(null)}>
                                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                              <path d="M3 3v5h5" />
                                            </svg>
                                          </button>
                                        ) : (
                                          <button type="button" className="upload-button compact icon-btn" title="Mulai Krop" onClick={() => setEditCrop({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 })}>
                                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                                              <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                                            </svg>
                                          </button>
                                        )}
                                     </div>
                                     <div className="filter-mode-grid">
                                       {CROP_ASPECTS.map((aspect) => (
                                         <button
                                           key={aspect.id}
                                           type="button"
                                           className={`filter-chip ${editCropAspect === aspect.id ? "active" : ""}`}
                                           onClick={() => applyEditCropAspect(aspect.id)}
                                         >
                                           {aspect.name}
                                         </button>
                                       ))}
                                     </div>
                                     <div className="admin-setting-note">
                                       <strong>Seret kotak untuk memindahkan, seret pojok untuk mengubah ukuran.</strong>
                                     </div>
                                   </div>
                                 )}

                                 {editTool === "rotate" && (
                                   <div className="edit-tool-panel">
                                      <div className="rotate-action-row">
                                        <button type="button" className="secondary-button compact icon-btn" title="Putar Kiri" onClick={handleEditRotateLeft}>
                                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                            <path d="M3 3v5h5" />
                                          </svg>
                                        </button>
                                        <button type="button" className="secondary-button compact icon-btn" title="Putar Kanan" onClick={handleEditRotateRight}>
                                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                                            <path d="M21 3v5h-5" />
                                          </svg>
                                        </button>
                                        <button type="button" className={`secondary-button compact icon-btn ${editFlipH ? "active-tool" : ""}`} title="Flip H" onClick={handleEditFlipH}>
                                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
                                            <path d="M16 3h3a2 2 0 0 1 2 2v14c0 1.1-.9 2-2 2h-3" />
                                            <path d="M12 20v2" />
                                            <path d="M12 14v2" />
                                            <path d="M12 8v2" />
                                            <path d="M12 2v2" />
                                          </svg>
                                        </button>
                                        <button type="button" className={`secondary-button compact icon-btn ${editFlipV ? "active-tool" : ""}`} title="Flip V" onClick={handleEditFlipV}>
                                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" />
                                            <path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
                                            <path d="M4 12H2" />
                                            <path d="M10 12H8" />
                                            <path d="M16 12h-2" />
                                            <path d="M22 12h-2" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          className="secondary-button compact icon-btn"
                                          title="Reset"
                                          onClick={() => {
                                            setEditRotation(0);
                                            setEditFlipH(false);
                                            setEditFlipV(false);
                                          }}
                                        >
                                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                            <path d="M3 3v5h5" />
                                          </svg>
                                        </button>
                                      </div>
                                   </div>
                                 )}

                                 {editTool === "text" && (
                                   <div className="edit-tool-panel">
                                     <label className="admin-input-field">
                                       Teks
                                       <input
                                         type="text"
                                         value={editTextDraft.text}
                                         placeholder="Tulis teks untuk foto..."
                                         onChange={(event) =>
                                           setEditTextDraft((current) => ({ ...current, text: event.target.value }))
                                         }
                                       />
                                     </label>
                                     <div className="dimension-row">
                                       <label className="admin-input-field">
                                         Ukuran (%)
                                         <input
                                           type="number"
                                           min="1"
                                           max="30"
                                           value={editTextDraft.size}
                                           onChange={(event) =>
                                             setEditTextDraft((current) => ({ ...current, size: Number(event.target.value) }))
                                           }
                                         />
                                       </label>
                                       <label className="admin-input-field">
                                         Font
                                         <select
                                           value={editTextDraft.font}
                                           onChange={(event) =>
                                             setEditTextDraft((current) => ({ ...current, font: event.target.value }))
                                           }
                                         >
                                           {TEXT_FONT_OPTIONS.map((font) => (
                                             <option key={font.id} value={font.id}>
                                               {font.name}
                                             </option>
                                           ))}
                                         </select>
                                       </label>
                                     </div>
                                     <div className="dimension-row">
                                       <label className="admin-input-field">
                                         Posisi X (%)
                                         <input
                                           type="number"
                                           min="0"
                                           max="100"
                                           value={editTextDraft.x}
                                           onChange={(event) =>
                                             setEditTextDraft((current) => ({ ...current, x: Number(event.target.value) }))
                                           }
                                         />
                                       </label>
                                       <label className="admin-input-field">
                                         Posisi Y (%)
                                         <input
                                           type="number"
                                           min="0"
                                           max="100"
                                           value={editTextDraft.y}
                                           onChange={(event) =>
                                             setEditTextDraft((current) => ({ ...current, y: Number(event.target.value) }))
                                           }
                                         />
                                       </label>
                                     </div>
                                     <div className="dimension-row">
                                       <label className="admin-input-field color-field">
                                         Warna
                                         <input
                                           type="color"
                                           value={editTextDraft.color}
                                           onChange={(event) =>
                                             setEditTextDraft((current) => ({ ...current, color: event.target.value }))
                                           }
                                         />
                                       </label>
                                       <label className="admin-input-field">
                                         Opacity
                                         <input
                                           type="number"
                                           min="0"
                                           max="100"
                                           value={editTextDraft.opacity}
                                           onChange={(event) =>
                                             setEditTextDraft((current) => ({ ...current, opacity: Number(event.target.value) }))
                                           }
                                         />
                                       </label>
                                     </div>
                                     <div className="dimension-row">
                                       <label className="admin-input-field">
                                         Rata Teks
                                         <select
                                           value={editTextDraft.align}
                                           onChange={(event) =>
                                             setEditTextDraft((current) => ({ ...current, align: event.target.value }))
                                           }
                                         >
                                           <option value="center">Tengah</option>
                                           <option value="left">Kiri</option>
                                           <option value="right">Kanan</option>
                                         </select>
                                       </label>
                                     </div>
                                      <button
                                        type="button"
                                        className="upload-button compact icon-btn"
                                        title="Tambah Teks"
                                        onClick={addEditTextOverlay}
                                        disabled={!editTextDraft.text.trim()}
                                      >
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="4 7 4 4 20 4 20 7" />
                                          <line x1="9" y1="20" x2="15" y2="20" />
                                          <line x1="12" y1="4" x2="12" y2="20" />
                                        </svg>
                                      </button>
                                     {editTextOverlays.length > 0 && (
                                       <div className="edit-text-list">
                                         {editTextOverlays.map((overlay, index) => (
                                           <div
                                             key={index}
                                             className={`edit-text-item ${editSelectedTextIndex === index ? "active" : ""}`}
                                           >
                                             <span style={{ color: overlay.color }}>{overlay.text}</span>
                                             <div>
                                                <button
                                                  type="button"
                                                  title="Edit"
                                                  onClick={() => loadEditTextOverlay(index)}
                                                >
                                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                                  </svg>
                                                </button>
                                                <button type="button" title="Hapus" onClick={() => removeEditTextOverlay(index)}>
                                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                  </svg>
                                                </button>
                                             </div>
                                           </div>
                                         ))}
                                          <button
                                            type="button"
                                            className="secondary-button compact icon-btn"
                                            title="Bersihkan Semua"
                                            onClick={() => setEditTextOverlays([])}
                                          >
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                                              <path d="M22 21H7" />
                                              <path d="m5 11 9 9" />
                                            </svg>
                                          </button>
                                       </div>
                                     )}
                                   </div>
                                 )}

            <section className="admin-card sparse admin-col-left">
                                      <div className="template-panel-header">
                                        <div>
                                          <h2>Pencahayaan & Warna</h2>
                                          <span>Penyempurnaan otomatis sebelum disimpan.</span>
                                        </div>
                                      </div>
                                      {[
                                        { key: "brightness", label: "Kecerahan", min: 0, max: 200, unit: "%" },
                                        { key: "contrast", label: "Kontras", min: 0, max: 200, unit: "%" },
                                        { key: "saturation", label: "Saturasi", min: 0, max: 200, unit: "%" },
                                        { key: "sharpness", label: "Ketajaman", min: -100, max: 100, unit: "" },
                                      ].map((slider) => (
                                        <div key={slider.key} className="enhance-control">
                                          <div className="enhance-label">
                                            <label>{slider.label}</label>
                                            <strong>
                                              {slider.key === "sharpness"
                                                ? `${editEnhance[slider.key] >= 0 ? "+" : ""}${editEnhance[slider.key]}`
                                                : `${editEnhance[slider.key]}${slider.unit}`}
                                            </strong>
                                          </div>
                                          <input
                                            type="range"
                                            min={slider.min}
                                            max={slider.max}
                                            value={editEnhance[slider.key]}
                                            onChange={(event) =>
                                              setEditEnhance((current) => ({
                                                ...current,
                                                [slider.key]: Number(event.target.value),
                                              }))
                                            }
                                          />
                                        </div>
                                      ))}
                                      {[
                                        { key: "temperature", label: "Temperatur", min: -100, max: 100, unit: "" },
                                        { key: "tint", label: "Tint", min: -100, max: 100, unit: "" },
                                      ].map((slider) => (
                                        <div key={slider.key} className="enhance-control">
                                          <div className="enhance-label">
                                            <label>{slider.label}</label>
                                            <strong>
                                              {slider.key === "temperature" ? editTemperature : editTint}
                                            </strong>
                                          </div>
                                          <input
                                            type="range"
                                            min={slider.min}
                                            max={slider.max}
                                            value={slider.key === "temperature" ? editTemperature : editTint}
                                            onChange={(event) =>
                                              (slider.key === "temperature" ? setEditTemperature : setEditTint)(
                                                Number(event.target.value)
                                              )
                                            }
                                          />
                                        </div>
                                      ))}
                                      <button
                                        type="button"
                                        className="secondary-button compact icon-btn"
                                        title="Reset"
                                        onClick={() =>
                                          setEditEnhance({
                                            brightness: 100,
                                            contrast: 100,
                                            saturation: 100,
                                            sharpness: 0,
                                          })
                                        }
                                      >
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                          <path d="M3 3v5h5" />
                                        </svg>
                                      </button>
                                    </section>
                                    <section className="admin-card sparse admin-col-left">
                                      <div className="template-panel-header">
                                        <div>
                                          <h2>Filter & Efek</h2>
                                          <span>Terapkan gaya visual pada semua foto.</span>
                                        </div>
                                      </div>
                                      <div className="filter-mode-grid">
                                        {PHOTO_FILTERS.map((filterItem) => (
                                          <button
                                            key={filterItem.id}
                                            type="button"
                                            className={`filter-chip ${editFilter === filterItem.id ? "active" : ""}`}
                                            onClick={() => setEditFilter(filterItem.id)}
                                          >
                                            {filterItem.name}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="enhance-control">
                                        <div className="enhance-label">
                                          <label>Vignette</label>
                                          <strong>{editVignette}%</strong>
                                        </div>
                                        <input
                                          type="range"
                                          min="0"
                                          max="100"
                                          value={editVignette}
                                          onChange={(event) => setEditVignette(Number(event.target.value))}
                                        />
                                      </div>
                                    </section>
                                                              </div>
                                    )}
                     </div>
                     <div className="step-footer">
                       <div className="footer-left">
                         <button type="button" className="secondary-button compact" onClick={() => setEditUploadStep(1)}>
                           ← Kembali
                         </button>
                       </div>
                       <div className="footer-dock">
                         <div className="optimasi-thumbnail-list">
                           <button
                             type="button"
                             className="dock-nav"
                             aria-label="Gambar sebelumnya"
                             onClick={() => setEditPreviewIndex((i) => Math.max(0, i - 1))}
                             disabled={editPreviewIndex === 0}
                           >
                             <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                               <path d="M15 18l-6-6 6-6"/>
                             </svg>
                           </button>
  <div
                                  className="optimasi-thumb-scroll"
                                  onWheel={(event) => {
                                    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
                                    if (Math.abs(delta) < 1) return;
                                    setEditPreviewIndex((i) =>
                                      Math.max(0, Math.min(editSelectedFiles.length - 1, i + (delta > 0 ? 1 : -1)))
                                    );
                                  }}
                                >
                                  {(() => {
                                    const limit = 5;
                                    const total = editSelectedFiles.length;
                                    let start = 0;
                                    if (total > limit) {
                                      start = Math.min(Math.max(0, editPreviewIndex - 2), total - limit);
                                    }
                                    const step = 64;
                                    return (
                                      <div
                                        className="optimasi-thumb-track"
                                        style={{ transform: `translateX(-${start * step}px)` }}
                                      >
                                        {editSelectedFiles.map((file, gi) => (
                                          <div
                                            key={gi}
                                            className={`optimasi-thumb-item ${editPreviewIndex === gi ? "active" : ""}`}
                                            onClick={() => setEditPreviewIndex(gi)}
                                          >
                                            <img src={editThumbUrls[gi]} alt={file.name} />
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                           <button
                             type="button"
                             className="dock-nav"
                             aria-label="Gambar berikutnya"
                             onClick={() => setEditPreviewIndex((i) => Math.min(editSelectedFiles.length - 1, i + 1))}
                             disabled={editPreviewIndex === editSelectedFiles.length - 1}
                           >
                             <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                               <path d="M9 6l6 6-6 6"/>
                             </svg>
                           </button>
</div>
                          <div className="edit-zoom-controls">
                            <button
                              type="button"
                              aria-label="Perkecil"
                              onClick={() => setEditPreviewZoom(editPreviewView.zoom - 0.1)}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14"/></svg>
                            </button>
                            <span>{Math.round(editPreviewView.zoom * 100)}%</span>
                            <button
                              type="button"
                              aria-label="Perbesar"
                              onClick={() => setEditPreviewZoom(editPreviewView.zoom + 0.1)}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                            </button>
                            <button
                              type="button"
                              className={editPreviewView.zoom === 1 ? "active" : ""}
                              aria-label="Reset zoom"
                              onClick={() => setEditPreviewView({ zoom: 1, pan: { x: 0, y: 0 } })}
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                        <button type="button" className="upload-button compact" onClick={handleEditSaveAndUpload}>
                         Simpan & Upload Sekarang
                       </button>
                     </div>
                    </>
                   )}
                </section>

            </section>
          </main>
        ) : !adminUser ? (
        <main className="admin-view">
          <section className="admin-shell">
            <section className="admin-login-gate">
              <div className="admin-login-card">
                <div className="admin-login-icon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <path d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm0 6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zm0 28.4c-5 0-9.42-2.56-12-6.44.06-3.98 8-6.16 12-6.16s11.94 2.18 12 6.16c-2.58 3.88-7 6.44-12 6.44z" fill="currentColor"/>
                  </svg>
                </div>
                <h2>Login Admin Drive</h2>
                <p>
                  Masuk memakai OAuth Google Drive yang tersimpan di token.pickle.
                </p>
                {adminAuthError && (
                  <div className="auth-error">{adminAuthError}</div>
                )}
                {isVerifyingGoogleToken && (
                  <div className="auth-note">Memverifikasi login...</div>
                )}
                <button
                  type="button"
                  className="upload-button compact admin-local-login"
                  onClick={handleDriveAdminLogin}
                  disabled={!backendReady || isVerifyingGoogleToken}
                >
                  {isVerifyingGoogleToken ? "Memeriksa Token..." : "Masuk dengan Token Drive"}
                </button>
              </div>
            </section>
          </section>
        </main>
      ) : (
        <main className="admin-view">
          <section className="admin-shell">
            <section className="admin-hero">
              <div className="admin-hero-row">
                <div>
                  <span className="start-eyebrow">Administrator</span>
                  <h1>Admin Panel</h1>
                </div>
                <div className="admin-hero-right">
                  <button
                    type="button"
                    className="logout-button"
                    onClick={handleGoogleLogout}
                  >
                    Logout ({adminUser.email})
                  </button>
                </div>
              </div>
            </section>

            <section className="admin-grid">
              <div className="admin-column admin-column-left">

              <section className="admin-card sparse admin-col-left">
                <div className="template-panel-header">
                  <div>
                    <h2>Google Drive Auth</h2>
                    <span>
                      {driveAuthReady
                        ? "Token Drive siap untuk upload dan membuat folder."
                        : "Hubungkan Google Drive sebelum menjalankan upload event."}
                    </span>
                  </div>
                </div>
                {driveAuthError && <div className="auth-error">{driveAuthError}</div>}
                <div className="drive-auth-actions">
                  <button
                    type="button"
                    className="upload-button compact"
                    onClick={handleConnectDriveAuth}
                    disabled={!backendReady || isConnectingDrive}
                  >
                     {isConnectingDrive
                       ? "Menghubungkan..."
                       : driveAuthReady
                         ? "Reconnect Drive"
                         : "Login"}
                     </button>
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={loadDriveAuthStatus}
                    disabled={!backendReady || isConnectingDrive}
                  >
                    Cek Status
                  </button>
                </div>
              </section>

              <section className="admin-card sparse admin-col-left">
                <div className="template-panel-header">
                  <div>
                    <h2>Mode Operasi Photobooth</h2>
                    <span>Pilih opsi pengoperasian: Oto (Otomatis) atau Admin (Manual Operator)</span>
                  </div>
                </div>
                <div className="mode-selector-buttons" style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className={
                      (photoboothAdminSettings.mode || "oto") === "oto"
                        ? "upload-button compact"
                        : "secondary-button compact"
                    }
                    onClick={() =>
                      setPhotoboothAdminSettings((current) => ({
                        ...current,
                        mode: "oto",
                      }))
                    }
                  >
                    Oto (Otomatis)
                  </button>
                  <button
                    type="button"
                    className={
                      photoboothAdminSettings.mode === "admin"
                        ? "upload-button compact"
                        : "secondary-button compact"
                    }
                    onClick={() =>
                      setPhotoboothAdminSettings((current) => ({
                        ...current,
                        mode: "admin",
                      }))
                    }
                  >
                    Admin (Manual)
                  </button>
                </div>
                <div className="admin-setting-note" style={{ marginTop: "10px", marginBottom: 0 }}>
                  {photoboothAdminSettings.mode === "admin"
                    ? "Mode Admin: Pengambilan foto dan navigasi dikontrol manual oleh operator."
                    : "Mode Oto: Pengambilan foto berjalan otomatis menggunakan timer hitung mundur."}
                </div>
              </section>

              <section className="admin-card sparse admin-col-left">
                <div className="template-panel-header">
                  <div>
                    <h2>Edit Strip</h2>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={photoboothAdminSettings.editEnabled}
                      onChange={() => {
                        setPhotoboothAdminSettings((current) => ({
                          ...current,
                          editEnabled: !current.editEnabled,
                        }));
                      }}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="admin-setting-note" style={{ margin: 0 }}>
                  {photoboothAdminSettings.editEnabled
                    ? "Flow: Foto → Edit → Kirim + Cetak"
                    : "Flow: Foto → Kirim + Cetak"}
                </div>
              </section>

              <PhotoboothEditorAdmin settings={editorCatalog} apiUrl={API_URL} onSaved={commitEditorCatalog}
                error={editorCatalogError} onRetry={() => setEditorCatalogReload((value) => value + 1)} />

              <section className="admin-card sparse admin-col-left">
                <div className="template-panel-header">
                  <div>
                    <h2>Drive Awal Photobooth</h2>
                    <span>Folder parent untuk membuat folder sesi photobooth baru</span>
                  </div>
                </div>
                <label className="admin-input-field">
                  Drive Folder ID
                  <input
                    type="text"
                    value={photoboothAdminSettings.initialDriveFolderId}
                    onChange={(event) =>
                      setPhotoboothAdminSettings((current) => ({
                        ...current,
                        initialDriveFolderId: event.target.value.trim(),
                      }))
                    }
                    placeholder="Masukkan Folder ID Google Drive"
                  />
                </label>
                <div className="admin-setting-note">
                  <strong>
                    {photoboothAdminSettings.initialDriveFolderId.trim()
                      ? "Siap"
                      : "Wajib"}
                  </strong>
                  <span>
                    Photobooth baru bisa mulai setelah Drive Folder ID ini terisi.
                  </span>
                </div>
                <div className="admin-action-row">
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={() =>
                      setPhotoboothAdminSettings((current) => ({
                        ...current,
                        initialDriveFolderId: driveFolderId.trim(),
                      }))
                    }
                    disabled={!driveFolderId.trim()}
                  >
                    Pakai Drive Auto Upload
                  </button>
                  <button
                    type="button"
                    className="clear-queue-button compact"
                    onClick={() =>
                      setPhotoboothAdminSettings((current) => ({
                        ...current,
                        initialDriveFolderId: "",
                      }))
                    }
                    disabled={!photoboothAdminSettings.initialDriveFolderId.trim()}
                  >
                    Kosongkan
                  </button>
                </div>
              </section>

              <section className="admin-card admin-col-left">
                <div className="template-panel-header">
                  <div>
                    <h2>Cetak Otomatis</h2>
                    <span>Cetak strip otomatis saat sesi selesai.</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={photoboothAdminSettings.autoPrintEnabled}
                      onChange={() => {
                        setPhotoboothAdminSettings((current) => ({
                          ...current,
                          autoPrintEnabled: !current.autoPrintEnabled,
                        }));
                      }}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                {photoboothAdminSettings.autoPrintEnabled && (
                  <>
                    <label className="admin-input-field">
                      Printer
                      <select
                        value={photoboothAdminSettings.printerName}
                        onChange={(e) =>
                          setPhotoboothAdminSettings((current) => ({
                            ...current,
                            printerName: e.target.value,
                          }))
                        }
                      >
                        <option value="">Pilih printer...</option>
                        {printers.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-input-field">
                      Nama Printer Manual
                      <input
                        type="text"
                        value={photoboothAdminSettings.printerName}
                        onChange={(event) =>
                          setPhotoboothAdminSettings((current) => ({
                            ...current,
                            printerName: event.target.value,
                          }))
                        }
                        placeholder="Contoh: Canon_CP1500"
                      />
                    </label>
                    <div className="admin-action-row">
                      <button
                        type="button"
                        className="secondary-button compact"
                        onClick={loadPrinters}
                        disabled={isLoadingPrinters}
                      >
                        {isLoadingPrinters ? "Memuat..." : "Refresh Printer"}
                      </button>
                    </div>
                    {printError && <div className="auth-error">{printError}</div>}
                  </>
                )}
                {lastStripResultRef.current && (
                  <div>
                    <div className="admin-setting-note" style={{ marginBottom: 8 }}>
                      <strong>Preview Cetak</strong>
                      <span>Strip terakhir — ukuran asli akan disesuaikan ke kertas printer.</span>
                    </div>
                    <div className="admin-print-preview">
                      <img src={lastStripResultRef.current} alt="Photobooth strip" />
                    </div>
                  </div>
                )}
                <div className="admin-setting-note" style={{ marginTop: 8 }}>
                  <strong>
                    {photoboothAdminSettings.autoPrintEnabled ? "Otomatis" : "Nonaktif"}
                  </strong>
                  <span>
                    {photoboothAdminSettings.autoPrintEnabled
                      ? `Cetak ${activePaperSize.toUpperCase()} ke ${photoboothAdminSettings.printerName || "— pilih printer dulu"}.`
                      : "Strip tidak akan dicetak otomatis."}
                  </span>
                </div>
              </section>

              <section className="admin-card sparse admin-col-left">
                <div className="template-panel-header">
                  <div>
                    <h2>Output File</h2>
                    <span>Atur ukuran file photobooth dan auto upload sebelum upload Drive.</span>
                  </div>
                </div>
                <label className="admin-input-field">
                  Kualitas Output
                  <select
                    value={
                      photoboothAdminSettings.outputCompressionEnabled
                        ? String(photoboothAdminSettings.outputCompressionQuality)
                        : "normal"
                    }
                    onChange={(event) => {
                      const value = event.target.value;

                      setPhotoboothAdminSettings((current) => ({
                        ...current,
                        outputCompressionEnabled: value !== "normal",
                        outputCompressionQuality:
                          value === "normal"
                            ? current.outputCompressionQuality
                            : normalizeCompressionQuality(value),
                      }));
                    }}
                  >
                    <option value="normal">Normal</option>
                    {OUTPUT_COMPRESSION_QUALITIES.map((quality) => (
                      <option key={quality} value={quality}>
                        Kompres {quality}%
                      </option>
                    ))}
                  </select>
                </label>
                <div className="admin-setting-note" style={{ margin: 0 }}>
                  <strong>
                    {photoboothAdminSettings.outputCompressionEnabled
                      ? `${photoboothAdminSettings.outputCompressionQuality}%`
                      : "Normal"}
                  </strong>
                  <span>
                    {photoboothAdminSettings.outputCompressionEnabled
                      ? "Kualitas JPEG final untuk photobooth dan auto upload mengikuti angka pilihan."
                      : "JPEG final photobooth dan auto upload disimpan kualitas tinggi."}
                  </span>
                </div>
              </section>
              </div>

              <div className="admin-column admin-column-right">
              <section className="admin-card admin-col-right admin-strip-card">
                <div className="template-panel-header">
                  <div>
                    <h2>Kelola Strip</h2>
                    <span>Tambah strip, unggah template, dan atur pilihan pengguna.</span>
                  </div>
                </div>
                <div className="admin-strip-chip-list" aria-label="Pilih strip yang dikelola">
                  {photoboothStripOptions.map((strip) => (
                    <button
                      key={strip.id}
                      type="button"
                      className={`admin-strip-chip${adminEditingStrip?.id === strip.id ? " active" : ""}${strip.active === false ? " is-inactive" : ""}`}
                      aria-pressed={adminEditingStrip?.id === strip.id}
                      disabled={isUploadingTemplate}
                      onClick={() => setAdminEditingStripId(strip.id)}
                    >
                      <span>{strip.name}</span>
                      <small>{strip.pose_count} pose{strip.active === false ? " · Nonaktif" : ""}{photoboothAdminSettings.defaultStripId === strip.id ? " · Pilihan awal" : ""}</small>
                    </button>
                  ))}
                </div>
                <button type="button" className="admin-strip-add-btn" disabled={isUploadingTemplate}
                  aria-expanded={adminNewStripOpen} onClick={() => setAdminNewStripOpen((open) => !open)}>
                  {adminNewStripOpen ? "Tutup Form Strip Baru" : "+ Tambah Strip Baru"}
                </button>
                {adminNewStripOpen && (
                  <form className="admin-strip-form admin-strip-new-form" onSubmit={async (event) => {
                    event.preventDefault();
                    if (await handleAddNewStrip(adminNewStripName, adminNewStripPoseCount)) {
                      setAdminNewStripOpen(false);
                      setAdminNewStripName("");
                    }
                  }}>
                    <label className="admin-input-field">Nama Strip
                      <input type="text" value={adminNewStripName} required placeholder="Contoh: Strip Anniversary"
                        onChange={(event) => setAdminNewStripName(event.target.value)} />
                    </label>
                    <label className="admin-input-field">Jumlah Pose
                      <input type="number" min="1" max="10" required value={adminNewStripPoseCount}
                        onChange={(event) => setAdminNewStripPoseCount(event.target.value)} />
                    </label>
                    <div className="admin-action-row">
                      <button type="submit" className="upload-button compact" disabled={isUploadingTemplate}>Tambah Strip</button>
                    </div>
                  </form>
                )}
                <div className="admin-strip-tab-bar" role="tablist" aria-label="Panel kelola strip">
                  {[["upload", "Upload Template"], ["edit", "Edit Strip"], ["setting", "Pengaturan"]].map(([id, label]) => (
                    <button key={id} type="button" role="tab" id={`admin-strip-tab-${id}`}
                      aria-selected={adminStripTab === id} aria-controls={`admin-strip-panel-${id}`}
                      className={`admin-strip-tab${adminStripTab === id ? " active" : ""}`}
                      onClick={() => setAdminStripTab(id)}>{label}</button>
                  ))}
                </div>
                {adminEditingStrip && adminStripTab === "upload" && (
                  <div className="admin-strip-tab-panel" role="tabpanel" id="admin-strip-panel-upload" aria-labelledby="admin-strip-tab-upload">
                    <div className="admin-choice-grid" aria-label="Pilih jumlah slot">
                      {adminSlotCounts.map((count) => (
                        <button key={`slot-count-${count}`} type="button"
                          className={`admin-choice-button${adminEditingStrip.slot_count === count ? " active" : ""}`}
                          disabled={isUploadingTemplate}
                          onClick={() => handleUpdateStrip(adminEditingStrip.id, { pose_count: count })}>
                          <strong>{count}</strong><span>Slot</span>
                        </button>
                      ))}
                      <button type="button" className="admin-choice-button admin-strip-new-slot" disabled={isUploadingTemplate}
                        aria-expanded={adminNewSlotOpen} onClick={() => setAdminNewSlotOpen((open) => !open)}>
                        <strong>+</strong><span>Baru</span>
                      </button>
                    </div>
                    {adminNewSlotOpen && (
                      <form className="admin-strip-slot-form" onSubmit={async (event) => {
                        event.preventDefault();
                        if (await handleUpdateStrip(adminEditingStrip.id, { pose_count: Number(adminNewSlotCount) })) setAdminNewSlotOpen(false);
                      }}>
                        <label className="admin-input-field">Jumlah Slot Baru
                          <input type="number" min="1" max="10" required value={adminNewSlotCount}
                            onChange={(event) => setAdminNewSlotCount(event.target.value)} />
                        </label>
                        <button type="submit" className="upload-button compact" disabled={isUploadingTemplate}>Terapkan</button>
                      </form>
                    )}
                    <div className="admin-setting-note">
                      <strong>{adminEditingStrip.slot_count} slot</strong>
                      <span>{adminEditingStrip.image_url ? "Template PNG tersimpan untuk strip ini." : "Menggunakan template default."}</span>
                    </div>
                <div className="admin-asset-grid">
                  <div className="admin-asset-preview">
                    {adminEditingStrip?.image_url ? (
                      <img src={adminEditingStrip.image_url} alt="Template strip" />
                    ) : (
                      <span>Template default</span>
                    )}
                  </div>
                  <div className="admin-asset-preview admin-slot-preview">
                    {adminEditingStrip?.image_url ? (
                      <div className="strip-slot-overlay-preview">
                        <div
                          className="strip-preview-frame"
                          style={adminPreviewStyle}
                        >
                          <img
                            src={adminEditingStrip.image_url}
                            alt="Strip dengan slot"
                          />
                        {adminPreviewSlots.map((slot, index) => (
                          <div
                            key={index}
                            className="slot-outline"
                            style={getAdminPreviewSlotStyle(slot)}
                          >
                            <span>{index + 1}</span>
                          </div>
                        ))}
                        </div>
                      </div>
                    ) : (
                      <div className="strip-slot-overlay-preview">
                        <div
                          className="strip-preview-frame slot-placeholder"
                          style={adminPreviewStyle}
                        >
                          {adminPreviewSlots.map((slot, index) => (
                            <div
                              key={index}
                              className="slot-outline empty"
                              style={getAdminPreviewSlotStyle(slot)}
                            >
                              <span>{index + 1}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                    <div className="admin-action-row">
                      <label className={`template-upload-button${isUploadingTemplate ? " disabled" : ""}`}>
                        {pendingPhotoboothTemplateFile ? "Ganti Strip" : "Pilih Strip"}
                        <input ref={photoboothTemplateInputRef} type="file" accept="image/png,.png"
                          disabled={isUploadingTemplate} onChange={handlePhotoboothTemplateUpload} />
                      </label>
                      <button type="button" className="upload-button compact template-save-button"
                        onClick={handleSavePhotoboothTemplate} disabled={!pendingPhotoboothTemplateFile || isUploadingTemplate}>
                        {isUploadingTemplate ? "Menyimpan..." : "Simpan Strip"}
                      </button>
                      <button type="button" className="clear-queue-button compact" onClick={handlePhotoboothTemplateReset}
                        disabled={!adminEditingStrip.image_url || isUploadingTemplate}>Reset</button>
                      {lastDetectedSlot && <span className="detected-slot-badge">Terdeteksi {lastDetectedSlot} slot</span>}
                      {pendingPhotoboothTemplateFile && <span className="pending-template-name" title={pendingPhotoboothTemplateFile.name}>
                        {pendingPhotoboothTemplateFile.name} siap disimpan
                      </span>}
                    </div>
                  </div>
                )}
                {adminEditingStrip && adminStripTab === "edit" && (
                  <form className="admin-strip-form admin-strip-tab-panel admin-strip-simple-edit" role="tabpanel" id="admin-strip-panel-edit"
                    aria-labelledby="admin-strip-tab-edit" onSubmit={(event) => {
                      event.preventDefault();
                      handleUpdateStrip(adminEditingStrip.id, adminStripDraft);
                    }}>
                    <label className="admin-input-field">Nama strip
                      <input type="text" required value={adminStripDraft.name} disabled={isUploadingTemplate}
                        placeholder="Contoh: Strip Wisuda"
                        onChange={(event) => setAdminStripDraft((draft) => ({ ...draft, name: event.target.value }))} />
                    </label>
                    <label className="admin-input-field">Foto per strip
                      <select value={adminStripDraft.pose_count} disabled={isUploadingTemplate}
                        onChange={(event) => setAdminStripDraft((draft) => ({ ...draft, pose_count: Number(event.target.value) }))}>
                        {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                          <option key={count} value={count}>{count} foto</option>
                        ))}
                      </select>
                    </label>
                    <label className="admin-strip-toggle-row admin-strip-visibility-row">
                      <span>Tampilkan ke pengguna<small>{adminStripDraft.active ? "Muncul di daftar pilihan strip." : "Disembunyikan dari daftar pilihan strip."}</small></span>
                      <input type="checkbox" role="switch" aria-label="Tampilkan ke pengguna" checked={adminStripDraft.active} disabled={isUploadingTemplate}
                        onChange={(event) => setAdminStripDraft((draft) => ({ ...draft, active: event.target.checked }))} />
                    </label>
                    <button type="submit" className="upload-button compact admin-strip-edit-save" disabled={isUploadingTemplate}>Simpan perubahan</button>
                    <details className="admin-strip-extra-options">
                      <summary>Opsi lainnya</summary>
                      <div>
                        <button type="button" className="admin-strip-delete-btn" disabled={photoboothStripOptions.length <= 1 || isUploadingTemplate}
                          onClick={() => handleDeleteStrip(adminEditingStrip.id)}>Hapus strip ini</button>
                        {photoboothStripOptions.length <= 1 && <p className="admin-strip-help">Minimal satu strip harus tersedia.</p>}
                      </div>
                    </details>
                  </form>
                )}
                {adminEditingStrip && adminStripTab === "setting" && (
                  <div className="admin-strip-form admin-strip-tab-panel admin-strip-simple-settings" role="tabpanel" id="admin-strip-panel-setting" aria-labelledby="admin-strip-tab-setting">
                    <fieldset className="admin-strip-setting-group" disabled={isUploadingTemplate}>
                      <legend>Ukuran kertas</legend>
                      <div className="admin-strip-setting-options">
                        {[["3r", "Kecil"], ["4r", "Lebih besar"]].map(([size, label]) => (
                          <label key={size} className="admin-strip-setting-choice">
                            <input type="radio" name={`strip-paper-${adminEditingStrip.id}`} value={size}
                              checked={adminStripPrintSettings.paper_size === size}
                              onChange={() => handleUpdateStripSettings(adminEditingStrip.id, { paper_size: size })} />
                            <span><strong>{size.toUpperCase()}</strong><small>{label}</small></span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="admin-strip-setting-group" disabled={isUploadingTemplate}>
                      <legend>Jumlah strip per kertas</legend>
                      <div className="admin-strip-setting-options">
                        {[1, 2].map((count) => (
                          <label key={count} className="admin-strip-setting-choice">
                            <input type="radio" name={`strip-copies-${adminEditingStrip.id}`} value={count}
                              checked={adminStripPrintSettings.double_strip_enabled === (count === 2)}
                              onChange={() => handleUpdateStripSettings(adminEditingStrip.id, { double_strip_enabled: count === 2 })} />
                            <span><strong>{count} strip</strong><small>{adminEditingStrip.pose_count * count} foto tercetak</small></span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="admin-strip-print-summary" aria-live="polite">
                      <span className="admin-strip-paper-example" aria-hidden="true">
                        {Array.from({ length: adminStripPrintSettings.double_strip_enabled ? 2 : 1 }, (_, index) => <span key={index} />)}
                      </span>
                      <div>
                        <strong>Hasil cetak</strong>
                        <span>1 lembar {adminStripPrintSettings.paper_size.toUpperCase()} berisi {adminStripPrintSettings.double_strip_enabled ? 2 : 1} strip.</span>
                        {adminStripPrintSettings.double_strip_enabled && (
                          <span>Cukup ambil {adminEditingStrip.pose_count} foto untuk kedua strip.{adminEditingStrip.pose_count === 3 ? " Kiri: 1, 2, 3. Kanan: 3, 1, 2." : ""}</span>
                        )}
                      </div>
                    </div>
                    <div className="admin-strip-default-row">
                      <div><strong>Pilihan awal sesi</strong><span>Dipilih otomatis saat pengguna memulai sesi.</span></div>
                      <button type="button"
                        className={`admin-strip-default-button${photoboothAdminSettings.defaultStripId === adminEditingStrip.id ? " is-selected" : ""}`}
                        aria-pressed={photoboothAdminSettings.defaultStripId === adminEditingStrip.id}
                        disabled={adminEditingStrip.active === false || isUploadingTemplate}
                        onClick={() => {
                          if (photoboothAdminSettings.defaultStripId !== adminEditingStrip.id) {
                            handleUpdateStripSettings(adminEditingStrip.id, { isDefault: true });
                          }
                        }}>
                        {photoboothAdminSettings.defaultStripId === adminEditingStrip.id ? "✓ Pilihan awal" : "Jadikan pilihan awal"}
                      </button>
                    </div>
                    {adminEditingStrip.active === false && <p className="admin-strip-help">Aktifkan strip di tab Edit Strip untuk menjadikannya pilihan awal.</p>}
                    <p className="admin-strip-help">Perubahan disimpan otomatis untuk {adminEditingStrip.name}.</p>
                  </div>
                )}
              </section>

              <section className="admin-card admin-col-right">
                <div className="template-panel-header">
                  <div>
                    <h2>Kamera</h2>
                    <span>Pilih kamera dan atur resolusi.</span>
                  </div>
                </div>
                <div className="camera-admin-grid">
                  <div className="camera-device-row">
                    <span>Perangkat</span>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                    >
                      <option value="">Auto — kamera pertama</option>
                      {cameraDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Kamera ${device.deviceId.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="camera-res-row">
                    <label>
                      <span>Lebar</span>
                      <input
                        type="number"
                        value={cameraWidth}
                        onChange={(e) => setCameraWidth(Number(e.target.value) || 1280)}
                        min={320}
                        max={7680}
                        step={10}
                      />
                    </label>
                    <label>
                      <span>Tinggi</span>
                      <input
                        type="number"
                        value={cameraHeight}
                        onChange={(e) => setCameraHeight(Number(e.target.value) || 720)}
                        min={240}
                        max={4320}
                        step={10}
                      />
                    </label>
                    <label>
                      <span>FPS</span>
                      <input
                        type="number"
                        value={cameraFps}
                        onChange={(e) => setCameraFps(Number(e.target.value) || 30)}
                        min={1}
                        max={120}
                      />
                    </label>
                  </div>
                  <details className="camera-advanced-toggle">
                    <summary>Pengaturan lanjutan</summary>
                    <div className="camera-slider-grid">
                      <label>
                        <span>Brightness</span>
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={cameraBrightness}
                          onChange={(e) => setCameraBrightness(Number(e.target.value))}
                        />
                        <span className="slider-val">{cameraBrightness.toFixed(2)}</span>
                      </label>
                      <label>
                        <span>Contrast</span>
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={cameraContrast}
                          onChange={(e) => setCameraContrast(Number(e.target.value))}
                        />
                        <span className="slider-val">{cameraContrast.toFixed(2)}</span>
                      </label>
                      <label>
                        <span>Saturation</span>
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={cameraSaturation}
                          onChange={(e) => setCameraSaturation(Number(e.target.value))}
                        />
                        <span className="slider-val">{cameraSaturation.toFixed(2)}</span>
                      </label>
                      <label>
                        <span>Sharpness</span>
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={cameraSharpness}
                          onChange={(e) => setCameraSharpness(Number(e.target.value))}
                        />
                        <span className="slider-val">{cameraSharpness.toFixed(2)}</span>
                      </label>
                      <label>
                        <span>Exposure Compensation</span>
                        <input
                          type="range"
                          min={-3}
                          max={3}
                          step={0.1}
                          value={cameraExposureComp}
                          onChange={(e) => setCameraExposureComp(Number(e.target.value))}
                        />
                        <span className="slider-val">{cameraExposureComp.toFixed(1)}</span>
                      </label>
                      <label>
                        <span>White Balance Temp (K)</span>
                        <input
                          type="range"
                          min={2500}
                          max={10000}
                          step={100}
                          value={cameraWhiteBalance}
                          onChange={(e) => setCameraWhiteBalance(Number(e.target.value))}
                        />
                        <span className="slider-val">{cameraWhiteBalance}K</span>
                      </label>
                    </div>
                    <div className="admin-action-row" style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className="secondary-button compact"
                        onClick={async () => {
                          if (cameraStreamRef.current) {
                            const track = cameraStreamRef.current.getVideoTracks()[0];
                            if (track) {
                              try {
                                await track.applyConstraints({
                                  advanced: [{
                                    brightness: cameraBrightness === 0 ? undefined : cameraBrightness,
                                    contrast: cameraContrast === 0 ? undefined : cameraContrast,
                                    saturation: cameraSaturation === 0 ? undefined : cameraSaturation,
                                    sharpness: cameraSharpness === 0 ? undefined : cameraSharpness,
                                    exposureCompensation: cameraExposureComp === 0 ? undefined : cameraExposureComp,
                                    colorTemperature: cameraWhiteBalance === 5600 ? undefined : cameraWhiteBalance,
                                   }].filter(c => Object.values(c).some(v => v !== undefined))}
                                 );
                              } catch (e) {
                                console.warn('applyConstraints not supported:', e);
                              }
                            }
                          }
                          try {
                            await fetch(`${API_URL}/camera/settings`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                CAP_PROP_BRIGHTNESS: Math.round((cameraBrightness + 1) * 127),
                                CAP_PROP_CONTRAST: Math.round((cameraContrast + 1) * 127),
                                CAP_PROP_SATURATION: Math.round((cameraSaturation + 1) * 127),
                                CAP_PROP_SHARPNESS: Math.round((cameraSharpness + 1) * 127),
                                CAP_PROP_EXPOSURE: cameraExposureComp,
                                CAP_PROP_WHITE_BALANCE_BLUE_U: cameraWhiteBalance,
                              }),
                            });
                          } catch (e) {
                            console.warn('backend camera settings failed:', e);
                          }
                        }}
                      >
                        Terapkan ke Kamera
                      </button>
                    </div>
                  </details>
                  <div className="admin-action-row">
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => {
                        stopBrowserCamera();
                        setTimeout(() => startBrowserCamera(), 300);
                      }}
                    >
                      Terapkan
                    </button>
                  </div>
                </div>
              </section>
              </div>
            </section>
          </section>
        </main>
      )}

      {draggingStripPhoto?.active &&
        photoboothSlotCaptures[draggingStripPhoto.photoIndex] && (
          <div
            className="strip-drag-preview"
            style={{
              left: draggingStripPhoto.x,
              top: draggingStripPhoto.y,
            }}
          >
            <img
              src={`${photoboothSlotCaptures[draggingStripPhoto.photoIndex].image_url}?v=${streamVersion}`}
              alt=""
            />
          </div>
        )}

      {status && <div className="app-status">{status}</div>}
    </div>
  );
}

export default App;
