import { useCallback, useEffect, useRef, useState } from "react";
import { googleLogout } from "@react-oauth/google";
import { invoke } from "@tauri-apps/api/core";
import cameraReadyWhiteLogo from "./assets/camera-ready-white.png";
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
  scale: 126,
  x: 0,
  y: 0,
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
const PHOTOBOOTH_SLOT_COUNTS = [1, 2, 3];
const OUTPUT_COMPRESSION_QUALITIES = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const DEFAULT_PHOTOBOOTH_ADMIN_SETTINGS = {
  stripPhotoCount: 1,
  editEnabled: true,
  autoPrintEnabled: true,
  outputCompressionEnabled: false,
  outputCompressionQuality: 70,
  printerName: "",
  paperSize: "4r",
  doubleStripEnabled: false,
  initialDriveFolderId: "",
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
const buildCenteredStripSlots = (slotCount = 3, paperSize = "4r") => {
  const normalizedSlotCount = clampNumber(Number(slotCount) || 3, 1, 3);
  const stripBaseSize = getStripBaseSize(normalizedSlotCount, paperSize);
  const slotWidth = STRIP_SLOT_WIDTH_BY_COUNT[normalizedSlotCount] || 78;
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
const createEmptyStripMap = () => STRIP_SLOTS.map(() => null);
const addUrlCacheBust = (url) =>
  url
    ? `${url}${url.includes("?") ? "&" : "?"}preview_v=${Date.now()}`
    : url;
const createEmptyPhotoboothTemplate = (slotCount) => ({
  active: false,
  image_url: null,
  slot_count: slotCount,
  slots: [],
  width: null,
  height: null,
});
const getPreferredStripTemplateMode = (template) =>
  template?.active && template.image_url ? "uploaded" : "default";
const normalizePhotoboothTemplates = (data = {}) =>
  PHOTOBOOTH_SLOT_COUNTS.reduce((templates, slotCount) => {
    const template = data.templates?.[slotCount] || data.templates?.[String(slotCount)];

    templates[String(slotCount)] = {
      ...createEmptyPhotoboothTemplate(slotCount),
      ...(template || {}),
      slot_count: slotCount,
      slots: Array.isArray(template?.slots) ? template.slots : [],
    };

    return templates;
  }, {});
const createQrCodeUrl = (value) =>
  value
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(value)}`
    : null;
const normalizeCompressionQuality = (value) => {
  const quality = Number(value);

  return OUTPUT_COMPRESSION_QUALITIES.includes(quality) ? quality : 70;
};
const renderJpegBase64 = (canvas, compressionQuality = null) => {
  const jpegQuality =
    compressionQuality === null
      ? 0.98
      : normalizeCompressionQuality(compressionQuality) / 100;

  return canvas.toDataURL("image/jpeg", jpegQuality).split(",")[1];
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
      stripPhotoCount: PHOTOBOOTH_SLOT_COUNTS.includes(stripPhotoCount)
        ? stripPhotoCount
        : 1,
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
  const photoboothTemplateInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraStartIdRef = useRef(0);
  const retryTimer = useRef(null);
  const backendReadyRef = useRef(false);
  const stripGestureRef = useRef(null);
  const stripDragRef = useRef(null);
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
  const autoPrintTriggeredRef = useRef(false);
  const photoboothAutoUploadKeyRef = useRef("");
  const photoboothFinalBase64Ref = useRef(null);
  const lastPrintedStripRef = useRef(null);

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
  const [printers, setPrinters] = useState([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isPrintingStrip, setIsPrintingStrip] = useState(false);
  const [printError, setPrintError] = useState("");
  const [activeView, setActiveView] = useState("photobooth");
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
  const [photoboothTemplateOverlayUrl, setPhotoboothTemplateOverlayUrl] =
    useState(null);
  const [stripTemplateMode, setStripTemplateMode] = useState("default");
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
  const [isRenderingPhotoboothPreview, setIsRenderingPhotoboothPreview] = useState(false);
  const [photoboothAdminSettings, setPhotoboothAdminSettings] = useState(
    loadPhotoboothAdminSettings
  );
  const [selectedTemplateSlot, setSelectedTemplateSlot] = useState(0);
  const [templatePhotoAdjustments, setTemplatePhotoAdjustments] = useState(
    DEFAULT_TEMPLATE_SLOTS.map(() => ({ ...DEFAULT_SLOT_ADJUSTMENT }))
  );
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
    return isNaN(v) ? 5600 : v;
  });
  const [watermarkSettings, setWatermarkSettings] = useState(
    DEFAULT_WATERMARK_PROFILES
  );
  const [watermarkOrientation, setWatermarkOrientation] = useState("landscape");
  const [previewOrientation, setPreviewOrientation] = useState("landscape");
  const [queue, setQueue] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadInputMode, setUploadInputMode] = useState("user");
  const [autoPreviewUrl, setAutoPreviewUrl] = useState(null);
  const [autoPreviewInfo, setAutoPreviewInfo] = useState(null);
  const [autoPreviewFiles, setAutoPreviewFiles] = useState([]);
  const [uploadStep, setUploadStep] = useState(1);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [watchFolderPath, setWatchFolderPath] = useState("");
  const [activeWatchFolder, setActiveWatchFolder] = useState(null);
  const [isSavingWatchFolder, setIsSavingWatchFolder] = useState(false);
  const [isStoppingWatchFolder, setIsStoppingWatchFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    total: 0,
    queueIds: [],
    files: [],
    source: null,
  });
  const photoboothPhotoCount = photoboothAdminSettings.stripPhotoCount || 1;
  const photoboothInitialDriveFolderId =
    photoboothAdminSettings.initialDriveFolderId.trim();
  const photoboothDriveConfigured = Boolean(photoboothInitialDriveFolderId);
  const driveAuthReady = Boolean(
    driveAuthStatus?.configured &&
      driveAuthStatus?.token_exists &&
      driveAuthStatus?.has_required_scopes &&
      (driveAuthStatus?.valid || driveAuthStatus?.has_refresh_token)
  );
  const hasBlockingStartupIssue = startupChecks.some(
    (check) => check.status === "error" && check.required
  );
  const activePaperSize = photoboothAdminSettings.paperSize || "4r";
  const activePaperConfig = getStripPaperConfig(activePaperSize);
  const doubleStripAvailable = photoboothPhotoCount >= 2;
  const doubleStripEnabled =
    doubleStripAvailable && photoboothAdminSettings.doubleStripEnabled;
  const photoboothCaptureCount = doubleStripEnabled
    ? photoboothPhotoCount * 2
    : photoboothPhotoCount;
  const capturePreviewGroupOffset = doubleStripEnabled
    ? Math.min(
        Math.floor(
          Math.min(captures.length, Math.max(photoboothCaptureCount - 1, 0)) /
            photoboothPhotoCount
        ) * photoboothPhotoCount,
        photoboothCaptureCount - photoboothPhotoCount
      )
    : 0;
  const captureUpcomingSlotIndex =
    captures.length >= photoboothCaptureCount
      ? Math.max(0, photoboothPhotoCount - 1)
      : captures.length % photoboothPhotoCount;
  const activeStripSlots = getStripSlots(photoboothPhotoCount, activePaperSize);
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
  const activePhotoboothTemplate =
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
    !doubleStripEnabled &&
    stripTemplateMode === "uploaded";
  const activePhotoboothTemplateSlots = photoboothPreviewUsesUploadedTemplate
    ? activePhotoboothTemplate.slots
    : activeStripSlots;
  const viewportHeight =
    typeof window === "undefined" ? 720 : window.innerHeight;
  const capturePhotoboothPreviewStyle = activeStripPreviewStyle;
  const editPhotoboothPreviewStyle = photoboothPreviewUsesUploadedTemplate
    ? getPreviewFrameStyle(
        activePhotoboothTemplate.width,
        activePhotoboothTemplate.height,
        920,
        Math.max(360, viewportHeight * 0.7)
      )
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
    activePhotoboothTemplate?.active && activePhotoboothTemplate.slots?.length
      ? activePhotoboothTemplate.slots.slice(0, photoboothPhotoCount)
      : activeStripSlots;
  const adminPreviewStyle =
    activePhotoboothTemplate?.active &&
      activePhotoboothTemplate.width &&
      activePhotoboothTemplate.height
      ? getPreviewFrameStyle(
          activePhotoboothTemplate.width,
          activePhotoboothTemplate.height
        )
      : getPreviewFrameStyle(activeStripBaseWidth, activeStripBaseHeight);
  const getAdminPreviewSlotStyle = (slot) =>
    activePhotoboothTemplate?.active && activePhotoboothTemplate.slots?.length
      ? {
          left: `${slot.left}%`,
          top: `${slot.top}%`,
          width: `${slot.width}%`,
          height: `${slot.height}%`,
        }
      : getActiveStripSlotStyle(slot);

  useEffect(() => {
    let cancelled = false;
    let sourceObjectUrl = null;
    let overlayObjectUrl = null;

    setPhotoboothTemplateOverlayUrl(null);

    if (!activePhotoboothTemplate?.active || !activePhotoboothTemplate.image_url) {
      return undefined;
    }

    const buildTransparentTemplateOverlay = async () => {
      try {
        const response = await fetch(activePhotoboothTemplate.image_url, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Gagal membaca template");
        }

        const blob = await response.blob();
        sourceObjectUrl = URL.createObjectURL(blob);

        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = sourceObjectUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext("2d");

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;

        for (let index = 0; index < data.length; index += 4) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const alpha = data[index + 3];

          if (alpha > 0 && red >= 245 && green >= 245 && blue >= 245) {
            data[index + 3] = 0;
          }
        }

        context.putImageData(imageData, 0, 0);

        const overlayBlob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );

        if (!overlayBlob || cancelled) {
          return;
        }

        overlayObjectUrl = URL.createObjectURL(overlayBlob);
        setPhotoboothTemplateOverlayUrl(overlayObjectUrl);
      } catch (error) {
        console.warn("Template overlay preview gagal dibuat", error);
      } finally {
        if (sourceObjectUrl) {
          URL.revokeObjectURL(sourceObjectUrl);
          sourceObjectUrl = null;
        }
      }
    };

    buildTransparentTemplateOverlay();

    return () => {
      cancelled = true;

      if (sourceObjectUrl) {
        URL.revokeObjectURL(sourceObjectUrl);
      }

      if (overlayObjectUrl) {
        URL.revokeObjectURL(overlayObjectUrl);
      }
    };
  }, [activePhotoboothTemplate?.active, activePhotoboothTemplate?.image_url]);

  const loadCaptures = async () => {
    const response = await fetch(`${API_URL}/captures`, {
      cache: "no-store",
    });

    if (response.ok) {
      setCaptures(await response.json());
    }
  };

  const loadQueue = async () => {
    const response = await fetch(`${API_URL}/queue?source=auto_upload`, {
      cache: "no-store",
    });

    if (response.ok) {
      setQueue(await response.json());
    }
  };

  const loadPhotoQueue = async () => {
    const response = await fetch(`${API_URL}/queue?source=photobooth`, {
      cache: "no-store",
    });

    if (response.ok) {
      setPhotoQueue(await response.json());
    }
  };

  const loadAutoWatchFolder = async () => {
    const response = await fetch(`${API_URL}/auto-watch-folder`, {
      cache: "no-store",
    });

    if (response.ok) {
      const data = await response.json();

      setActiveWatchFolder(data);

      if (data.folder_path) {
        setWatchFolderPath(data.folder_path);
      }

      if (data.drive_folder_id) {
        setDriveFolderId(data.drive_folder_id);
      }
    }
  };

  const loadWatermark = async () => {
    const response = await fetch(`${API_URL}/watermark`, {
      cache: "no-store",
    });

    if (response.ok) {
      const data = await response.json();

      setWatermark((current) => mergeWatermarkData(current, data));
      setWatermarkSettings(normalizeWatermarkSettings(data.settings));
    }
  };

  const saveOutputSettings = async (settings) => {
    const response = await fetch(`${API_URL}/output-settings`, {
      method: "POST",
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

    if (!response.ok) {
      throw new Error("Gagal menyimpan setting output");
    }
  };

  const loadOutputSettings = async () => {
    const response = await fetch(`${API_URL}/output-settings`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const settings = data.settings || {};

    if (settings.configured) {
      setPhotoboothAdminSettings((current) => ({
        ...current,
        ...normalizeOutputSettingsFromBackend(settings),
      }));
    } else {
      await saveOutputSettings(photoboothAdminSettings);
    }

    outputSettingsLoadedRef.current = true;
  };

  const loadPhotoboothTemplate = async () => {
    const response = await fetch(`${API_URL}/photobooth/template`, {
      cache: "no-store",
    });

    if (response.ok) {
      const data = await response.json();
      const templates = normalizePhotoboothTemplates(data);
      const selectedTemplate =
        templates[String(photoboothPhotoCount)] ||
        createEmptyPhotoboothTemplate(photoboothPhotoCount);

      setPhotoboothTemplates(templates);
      setPhotoboothTemplate(selectedTemplate);
      setStripTemplateMode(getPreferredStripTemplateMode(selectedTemplate));

      setLastDetectedSlot(null);
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

    const checkBackend = async () => {
      try {
        const response = await fetch(`${API_URL}/`, {
          cache: "no-store",
        });

        if (!isMounted) {
          return;
        }

        if (response.ok) {
          if (!backendReadyRef.current) {
            setStreamVersion(Date.now());
            loadCaptures();
            loadQueue();
            loadPhotoQueue();
            loadAutoWatchFolder();
            loadWatermark();
            loadOutputSettings();
            loadPhotoboothTemplate();
            loadDriveAuthStatus();
            loadPrinters();
          }

          backendReadyRef.current = true;
          setBackendReady(true);
          setStatus((current) =>
            current === "Menunggu kamera..." ? "" : current
          );
        } else {
          backendReadyRef.current = false;
          setBackendReady(false);
          setStatus("Menunggu kamera...");
        }
      } catch {
        if (isMounted) {
          backendReadyRef.current = false;
          setBackendReady(false);
          setStatus("Menunggu kamera...");
        }
      }
    };

    checkBackend();
    const healthInterval = window.setInterval(checkBackend, 1200);
    const dataInterval = window.setInterval(() => {
      if (backendReadyRef.current) {
        loadCaptures();
        loadQueue();
        loadPhotoQueue();
        loadAutoWatchFolder();
      }
    }, 3000);

    return () => {
      isMounted = false;
      window.clearInterval(healthInterval);
      window.clearInterval(dataInterval);
      window.clearTimeout(retryTimer.current);
      clearAutoCaptureTimers();
      window.clearTimeout(watermarkSettingsSaveRef.current.timer);
    };
  }, []);

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
    if (!photoboothAdminSettings.editEnabled && photoboothStep === 3) {
      setPhotoboothStep(4);
    }
  }, [photoboothAdminSettings.editEnabled, photoboothStep]);

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
    const selectedTemplate =
      photoboothTemplates[String(photoboothPhotoCount)] ||
      createEmptyPhotoboothTemplate(photoboothPhotoCount);

    setPhotoboothTemplate(selectedTemplate);
    setStripTemplateMode(getPreferredStripTemplateMode(selectedTemplate));
  }, [photoboothPhotoCount, photoboothTemplates]);

  useEffect(() => {
    setSelectedTemplateSlot((current) =>
      Math.min(current, Math.max(0, photoboothPhotoCount - 1))
    );
  }, [photoboothPhotoCount]);

  useEffect(() => {
    if (activeView === "photobooth" && photoboothStep <= 2) {
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
  }, [activeView, photoboothStep, selectedCameraId]);

  useEffect(() => {
    if (activeView !== "photobooth" || photoboothStep !== 2 || !backendReady) {
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
  }, [activeView, backendReady, photoboothStep]);

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
    const selectedTemplate =
      photoboothTemplates[String(photoboothPhotoCount)] ||
      createEmptyPhotoboothTemplate(photoboothPhotoCount);

    setPhotoboothTemplate((currentTemplate) => {
      const currentKey = `${currentTemplate?.slot_count || ""}:${currentTemplate?.active || false}:${currentTemplate?.image_url || ""}:${currentTemplate?.slots?.length || 0}`;
      const selectedKey = `${selectedTemplate.slot_count}:${selectedTemplate.active}:${selectedTemplate.image_url || ""}:${selectedTemplate.slots?.length || 0}`;

      return currentKey === selectedKey ? currentTemplate : selectedTemplate;
    });
  }, [photoboothPhotoCount, photoboothTemplates]);

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
    const sessionTemplate =
      photoboothTemplates[String(photoboothPhotoCount)] ||
      photoboothTemplate ||
      createEmptyPhotoboothTemplate(photoboothPhotoCount);
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
    setSlotPhotoMap(createEmptyStripMap());
    setPhotoboothTemplate(sessionTemplate);
    setStripTemplateMode(getPreferredStripTemplateMode(sessionTemplate));
    setSelectedTemplateSlot(0);
    setTemplatePhotoAdjustments(
      sessionSlots.map(() => ({ ...DEFAULT_SLOT_ADJUSTMENT }))
    );
    setPhotoboothEmail("");
    setPhotoboothDriveResult(null);
    setPhotoboothFinalPreviewUrl(null);
    photoboothFinalBase64Ref.current = null;
    photoboothAutoUploadKeyRef.current = "";
    setIsRenderingPhotoboothPreview(false);
    setDraggingStripPhoto(null);
    stripDragRef.current = null;
    stripGestureRef.current = null;
    setStreamVersion(Date.now());
  };

  const handleStartPhotoboothSession = async () => {
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
      setSlotPhotoMap(createEmptyStripMap());
      setPhotoboothTemplate(sessionTemplate);
      setStripTemplateMode(getPreferredStripTemplateMode(sessionTemplate));
      setTemplatePhotoAdjustments(
        sessionSlots.map(() => ({ ...DEFAULT_SLOT_ADJUSTMENT }))
      );
      setPhotoboothDriveResult(null);
      setPhotoboothFinalPreviewUrl(null);
      photoboothFinalBase64Ref.current = null;
      photoboothAutoUploadKeyRef.current = "";
      setIsRenderingPhotoboothPreview(false);
      setCaptures([]);
      setPhotoboothStep(2);
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
        setSlotPhotoMap(
          STRIP_SLOTS.map((_, index) =>
            index < photoboothPhotoCount ? index : null
          )
        );
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

    setSlotPhotoMap(
      STRIP_SLOTS.map((_, index) =>
        index < Math.min(captures.length, photoboothPhotoCount) ? index : null
      )
    );
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
    if (activeView !== "photobooth" || photoboothStep !== 2) {
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
      setSlotPhotoMap(
        STRIP_SLOTS.map((_, index) =>
          index < photoboothPhotoCount ? index : null
        )
      );
      setPhotoboothEditMode("strip");

      const nextStepTimer = window.setTimeout(() => {
        if (photoboothAdminSettings.editEnabled) {
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

  const handlePhotoboothTemplateUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!backendReady) {
      setStatus("Backend belum siap");
      return;
    }

    setIsUploadingTemplate(true);
    setStatus("Mengupload template...");

    try {
      const dataBase64 = await readFileAsBase64(file);
      const response = await fetch(`${API_URL}/photobooth/template`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          data_base64: dataBase64,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal upload template");
      }

      const detected = Math.min(
        Math.max(Number(data.slot_count) || 1, 1),
        PHOTOBOOTH_SLOT_COUNTS.length
      );
      const templates = normalizePhotoboothTemplates(data);
      const uploadedTemplate = {
        ...(templates[String(detected)] || {
          active: true,
          image_url: data.image_url,
          slot_count: detected,
        }),
        active: true,
        image_url: addUrlCacheBust(
          templates[String(detected)]?.image_url || data.image_url
        ),
        slot_count: detected,
        slots: templates[String(detected)]?.slots || data.slots || [],
        width: templates[String(detected)]?.width || data.width || null,
        height: templates[String(detected)]?.height || data.height || null,
      };

      templates[String(detected)] = uploadedTemplate;

      setPhotoboothTemplates(templates);
      setPhotoboothTemplate(uploadedTemplate);
      setPhotoboothAdminSettings((current) => ({
        ...current,
        stripPhotoCount: detected,
      }));
      setStripTemplateMode("uploaded");
      setLastDetectedSlot(detected);
      setStatus(`Template ${detected} slot aktif`);
    } catch (error) {
      setStatus(error.message || "Gagal upload template");
    } finally {
      setIsUploadingTemplate(false);
      if (photoboothTemplateInputRef.current) {
        photoboothTemplateInputRef.current.value = "";
      }
      window.setTimeout(() => setStatus(""), 2500);
    }
  };

  const handlePhotoboothTemplateReset = async () => {
    if (!backendReady || !photoboothTemplate?.active) {
      return;
    }

    setStatus(`Menghapus template ${photoboothPhotoCount} slot...`);

    try {
      const response = await fetch(
        `${API_URL}/photobooth/template/${photoboothPhotoCount}`,
        {
          method: "DELETE",
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal reset template");
      }

      const templates = normalizePhotoboothTemplates(data);
      const selectedTemplate =
        templates[String(photoboothPhotoCount)] ||
        createEmptyPhotoboothTemplate(photoboothPhotoCount);

      setPhotoboothTemplates(templates);
      setPhotoboothTemplate(selectedTemplate);
      setStripTemplateMode("default");
      setLastDetectedSlot(null);
      setStatus(`Template ${photoboothPhotoCount} slot direset`);
    } catch (error) {
      setStatus(error.message || "Gagal reset template");
    } finally {
      window.setTimeout(() => setStatus(""), 2500);
    }
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
    const response = await fetch(`${API_URL}/auto-watch-folder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        folder_path: folderPath.trim(),
        drive_folder_id: driveFolderId.trim() || null,
      }),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Gagal mengaktifkan folder watcher");
    }

    return data.watch;
  };

  const handlePickWatchFolder = async () => {
    setUploadInputMode("folder");

    try {
      const folderPath = await invoke("pick_folder_path");

      if (folderPath) {
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

  const failedQueueCount = queue.filter((item) => item.status === "failed").length;
  const photoFailedQueueCount = photoQueue.filter(
    (item) => item.status === "failed"
  ).length;
  const latestCapture = captures[0];
  const photoboothSlotCaptures = captures
    .slice(0, photoboothCaptureCount)
    .reverse();
  const getPhotoboothEffect = (effectId) =>
    PHOTOBOOTH_EFFECTS.find((effect) => effect.id === effectId) ||
    PHOTOBOOTH_EFFECTS[0];
  const selectedEditCapture =
    photoboothSlotCaptures[selectedEditPhotoIndex] || null;
  const draftEffect = getPhotoboothEffect(draftPhotoEffect);
  const selectedSlotAdjustment =
    templatePhotoAdjustments[selectedTemplateSlot] || DEFAULT_SLOT_ADJUSTMENT;
  const filledStripSlotCount = slotPhotoMap
    .slice(0, photoboothPhotoCount)
    .filter((photoIndex) => photoboothSlotCaptures[photoIndex]).length;
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

  const drawTemplateOverlay = (context, image, width, height) => {
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    const overlayContext = overlayCanvas.getContext("2d");

    overlayContext.drawImage(image, 0, 0, width, height);

    const imageData = overlayContext.getImageData(0, 0, width, height);
    const { data } = imageData;

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];

      if (alpha > 0 && red >= 245 && green >= 245 && blue >= 245) {
        data[index + 3] = 0;
      }
    }

    overlayContext.putImageData(imageData, 0, 0);
    context.drawImage(overlayCanvas, 0, 0);
  };

  const renderPhotoboothStrip = async () => {
    if (photoboothSlotCaptures.length < photoboothCaptureCount) {
      throw new Error(`Ambil ${photoboothCaptureCount} foto dulu sebelum upload`);
    }

    const usingUploadedTemplate =
      stripTemplateMode === "uploaded" &&
      !doubleStripEnabled &&
      activePhotoboothTemplate?.active &&
      activePhotoboothTemplate.image_url;
    const renderDoubleStrip =
      !usingUploadedTemplate && doubleStripEnabled;
    const renderSlots =
      usingUploadedTemplate && photoboothTemplate.slots?.length
        ? photoboothTemplate.slots.slice(0, photoboothPhotoCount)
        : activeStripSlots;

    if (filledStripSlotCount < renderSlots.length) {
      throw new Error("Isi semua kotak strip dulu dengan drag and drop foto");
    }

    const loadedImages = new Map();
    let loadedTemplate = null;

    const getMappedPhotoIndex = (slotIndex, photoOffset = 0) => {
      const mappedPhotoIndex = slotPhotoMap[slotIndex];

      if (mappedPhotoIndex === null || mappedPhotoIndex === undefined) {
        return null;
      }

      const basePhotoIndex = renderDoubleStrip
        ? mappedPhotoIndex % photoboothPhotoCount
        : mappedPhotoIndex;

      return basePhotoIndex + photoOffset;
    };

    const loadCaptureImage = async (photoIndex) => {
      if (photoIndex === null || photoIndex === undefined) {
        return null;
      }

      const capture = photoboothSlotCaptures[photoIndex];

      if (!capture) {
        return null;
      }

      if (!loadedImages.has(photoIndex)) {
        loadedImages.set(
          photoIndex,
          await loadImage(`${capture.image_url}?v=${streamVersion}`)
        );
      }

      return loadedImages.get(photoIndex);
    };

    for (let index = 0; index < renderSlots.length; index += 1) {
      await loadCaptureImage(getMappedPhotoIndex(index, 0));

      if (renderDoubleStrip) {
        await loadCaptureImage(getMappedPhotoIndex(index, photoboothPhotoCount));
      }
    }

    if (usingUploadedTemplate) {
      loadedTemplate = await loadImage(activePhotoboothTemplate.image_url);
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
      (renderDoubleStrip ? activePaperConfig.width : baseWidth) *
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

    drawContext.fillStyle = "#f7f7f2";
    drawContext.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

    const drawStripSide = async (photoOffset = 0) => {
      drawContext.fillStyle = "#f7f7f2";
      drawContext.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

      for (let index = 0; index < renderSlots.length; index += 1) {
        const slot = renderSlots[index];
        const photoIndex = getMappedPhotoIndex(index, photoOffset);
        const capture = photoboothSlotCaptures[photoIndex];
        const adjustment = templatePhotoAdjustments[index] || DEFAULT_SLOT_ADJUSTMENT;
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
        const drawWidth = width * (adjustment.scale / 100);
        const drawHeight = drawWidth * (image.height / image.width);
        const offsetX = (adjustment.x / 100) * width;
        const offsetY = (adjustment.y / 100) * height;

        drawContext.save();
        drawContext.beginPath();
        drawContext.rect(x, y, width, height);
        drawContext.clip();
        drawContext.filter = savedEffect.filter;
        drawContext.drawImage(
          image,
          x + (width - drawWidth) / 2 + offsetX,
          y + (height - drawHeight) / 2 + offsetY,
          drawWidth,
          drawHeight
        );
        drawContext.restore();
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
      context.fillStyle = "#f7f7f2";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(drawCanvas, 0, 0);
      await drawStripSide(photoboothPhotoCount);
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

    loadedImages.forEach((loadedImage) => {
      if (loadedImage) {
        URL.revokeObjectURL(loadedImage.objectUrl);
      }
    });
    if (loadedTemplate) {
      URL.revokeObjectURL(loadedTemplate.objectUrl);
    }

    return renderJpegBase64(
      canvas,
      photoboothAdminSettings.outputCompressionEnabled
        ? photoboothAdminSettings.outputCompressionQuality
        : null
    );
  };

  useEffect(() => {
    let cancelled = false;

    if (
      activeView !== "photobooth" ||
      photoboothStep !== 4 ||
      captures.length < photoboothCaptureCount ||
      filledStripSlotCount < activeStripSlots.length
    ) {
      setPhotoboothFinalPreviewUrl(null);
      setIsRenderingPhotoboothPreview(false);
      return undefined;
    }

    setIsRenderingPhotoboothPreview(true);
    renderPhotoboothStrip()
      .then(async (dataBase64) => {
        if (!cancelled) {
          const url = `data:image/jpeg;base64,${dataBase64}`;
          setPhotoboothFinalPreviewUrl(url);
          photoboothFinalBase64Ref.current = dataBase64;
          lastStripResultRef.current = url;
          const uploadKey = photoboothSlotCaptures
            .slice(0, photoboothCaptureCount)
            .map((capture) => capture?.file || capture?.filename || "")
            .join("|");
          if (photoboothAutoUploadKeyRef.current === uploadKey) {
            return;
          }
          photoboothAutoUploadKeyRef.current = uploadKey;
          const now = new Date();
          const hours = String(now.getHours()).padStart(2, "0");
          let jobId = 1;
          try {
            const res = await fetch(`${API_URL}/photobooth/next-job-id`);
            const data = await res.json();
            if (data.success) jobId = data.job_id;
          } catch {}
          const folderName = `Job - ${jobId} - ${hours}`;
          handlePhotoboothDriveUpload(folderName, dataBase64);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPhotoboothFinalPreviewUrl(null);
          setStatus(error.message || "Gagal membuat preview hasil photobooth");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRenderingPhotoboothPreview(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeView,
    captures.length,
    filledStripSlotCount,
    photoEffectMap,
    photoboothCaptureCount,
    photoboothStep,
    photoboothTemplate,
    photoboothTemplates,
    photoboothAdminSettings,
    slotPhotoMap,
    streamVersion,
    stripTemplateMode,
    templatePhotoAdjustments,
  ]);

  useEffect(() => {
    if (photoboothStep !== 4) {
      autoPrintTriggeredRef.current = false;
      return;
    }

    if (
      !photoboothFinalPreviewUrl ||
      !photoboothAdminSettings.autoPrintEnabled ||
      autoPrintTriggeredRef.current
    ) {
      return;
    }

    autoPrintTriggeredRef.current = true;
    const parts = photoboothFinalPreviewUrl.split(",");
    const dataBase64 = parts.length > 1 ? parts[1] : null;
    if (dataBase64) {
      printPhotoboothStrip(dataBase64, { automatic: true });
    }
  }, [
    photoboothStep,
    photoboothFinalPreviewUrl,
    photoboothAdminSettings.autoPrintEnabled,
  ]);

  const handlePhotoboothDriveUpload = async (customFolderName, renderedDataBase64 = null) => {
    if (!backendReady || isUploadingPhotoboothDrive) {
      return;
    }

    setIsUploadingPhotoboothDrive(true);
    setStatus("Membuat strip dan folder Google Drive...");

    try {
      const dataBase64 =
        renderedDataBase64 ||
        photoboothFinalBase64Ref.current ||
        await renderPhotoboothStrip();
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
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal upload photobooth");
      }

      setPhotoboothDriveResult(data);
      setStatus(`Folder ${data.folder_name} dibuat`);
      await loadPhotoQueue();
    } catch (error) {
      photoboothAutoUploadKeyRef.current = "";
      setStatus(error.message || "Gagal upload photobooth");
    } finally {
      setIsUploadingPhotoboothDrive(false);
      window.setTimeout(() => setStatus(""), 3500);
    }
  };

  const loadPrinters = async () => {
    if (!backendReadyRef.current && !backendReady) {
      return;
    }

    setIsLoadingPrinters(true);

    try {
      const response = await fetch(`${API_URL}/printers`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
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
      setPrintError(error.message || "Gagal membaca printer");
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  const printPhotoboothStrip = async (dataBase64, { automatic = false } = {}) => {
    const printerName = photoboothAdminSettings.printerName.trim();
    const paperSize = photoboothAdminSettings.paperSize || "4r";

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

  const loadDriveAuthStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/auth/drive/status`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setDriveAuthStatus(data.drive);
        setDriveAuthError("");
        return data.drive;
      }
    } catch {
      setDriveAuthStatus(null);
    }

    return null;
  };

  const handleConnectDriveAuth = async () => {
    if (!backendReady || isConnectingDrive) {
      return;
    }

    setIsConnectingDrive(true);
    setDriveAuthError("");
    setStatus("Membuka login Google Drive...");

    try {
      const response = await fetch(`${API_URL}/auth/drive/connect`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gagal menghubungkan Google Drive");
      }

      setDriveAuthStatus(data.drive);
      if (data.user) {
        setAdminUser(data.user);
      }
      setStatus("Google Drive siap dipakai");
    } catch (error) {
      setDriveAuthError(error.message || "Gagal menghubungkan Google Drive");
      setStatus(error.message || "Gagal menghubungkan Google Drive");
    } finally {
      setIsConnectingDrive(false);
      window.setTimeout(() => setStatus(""), 3500);
    }
  };

  const handleGoogleLogout = () => {
    setAdminUser(null);
    setStartupComplete(false);
    setStartupError("");
    setStartupAttempted(false);
    setStartupChecks([]);
    setAdminAuthError("");
    googleLogout();
  };

  const handleDriveAdminLogin = async () => {
    setAdminAuthError("");
    setIsVerifyingGoogleToken(true);

    try {
      const response = await fetch(`${API_URL}/auth/drive/connect`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Login token Drive gagal");
      }

      setDriveAuthStatus(data.drive);
      setAdminUser(
        data.user || {
          email: "drive-token@event-booth.local",
          name: "Drive Token",
        }
      );
    } catch (error) {
      setAdminAuthError(error.message || "Login token Drive gagal");
    } finally {
      setIsVerifyingGoogleToken(false);
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
  const photoboothStepItems = [
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
            <span className="start-eyebrow">Event Booth Studio</span>
            <h2>Login Aplikasi</h2>
            <p>
              Masuk dulu sebelum photobooth, auto upload, dan admin panel dibuka.
            </p>
            <div className={backendReady ? "auth-note" : "auth-error"}>
              {backendReady
                ? "Backend siap, login bisa dimulai."
                : "Menunggu backend siap..."}
            </div>
            {adminAuthError && <div className="auth-error">{adminAuthError}</div>}
            {isVerifyingGoogleToken && (
              <div className="auth-note">Memverifikasi token Drive...</div>
            )}
            <button
              type="button"
              className="upload-button compact admin-local-login"
              onClick={handleDriveAdminLogin}
              disabled={!backendReady || isVerifyingGoogleToken}
            >
              {isVerifyingGoogleToken ? "Memeriksa Token..." : "Masuk dengan Token Drive"}
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
          <section className="startup-card">
            <div className="template-panel-header">
              <div className="startup-brand">
                <img src={sisikitaCompanyLogo} alt="Sisikita Creative" />
                <span className="start-eyebrow">Startup Check</span>
                <h2>Menyiapkan aplikasi</h2>
                <span>Memastikan service, file, dan perangkat siap sebelum masuk.</span>
              </div>
              <button
                type="button"
                className="secondary-button compact"
                onClick={handleGoogleLogout}
                disabled={isRunningStartup}
              >
                Logout
              </button>
            </div>
            <div className="splash-loader">
              <div className="splash-loader-bar" />
            </div>
            <div className="startup-check-list">
              {startupChecks.map((check) => (
                <div className={`startup-check ${check.status}`} key={check.id}>
                  <strong>{check.name}</strong>
                  <span>{check.message}</span>
                  {check.repair && check.status !== "ok" && (
                    <small>{check.repair}</small>
                  )}
                </div>
              ))}
            </div>
            {startupError && <div className="auth-error">{startupError}</div>}
            <div className="admin-action-row">
              <button
                type="button"
                className="upload-button compact"
                onClick={runStartupChecks}
                disabled={!backendReady || isRunningStartup}
              >
                {isRunningStartup ? "Memeriksa..." : "Cek Ulang"}
              </button>
              <button
                type="button"
                className="secondary-button compact"
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
            className={activeView === "admin" ? "tab active" : "tab"}
            onClick={() => setActiveView("admin")}
          >
            Admin
          </button>
        </div>
        <div
          className={[
            "system-state",
            "camera-menu-indicator",
            cameraPreviewReady ? "online" : "",
          ].join(" ")}
          aria-label={
            cameraPreviewReady ? "Kamera ready" : "Kamera belum ready"
          }
          title={cameraPreviewReady ? "Kamera ready" : "Kamera belum ready"}
        >
          <img src={cameraReadyWhiteLogo} alt="" />
        </div>
      </header>

      {activeView === "photobooth" ? (
        <main className="photobooth-view">
          <section className="photobooth-wizard">
            <div className="photobooth-session-bar">
              <div className="photobooth-step-track">
                {photoboothStepItems.map((item, index) => (
                  <div
                    className={
                      [
                        "photobooth-step-chip",
                        index < photoboothCurrentStepIndex ? "done" : "",
                        index === photoboothCurrentStepIndex ? "active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                    key={`photobooth-step-${item.step}`}
                  >
                    <strong>{index + 1}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="photobooth-session-summary">
                <strong>{photoboothModeSummary}</strong>
                <span>{photoboothDriveConfigured ? "Drive siap" : "Drive belum diatur"}</span>
              </div>
            </div>

            {photoboothStep === 1 && (
              <section className="step-panel photobooth-start-panel">
                <div className="start-card">
                  <div className="start-copy">
                    <h1>Mulai Photobooth</h1>
                    <p>Sesi akan berjalan otomatis. Pastikan user sudah siap di depan kamera.</p>
                  </div>
                  <div className="start-photo-count">
                    <div>
                      <span>Jumlah foto</span>
                      <strong>{photoboothCaptureCount}x</strong>
                    </div>
                  </div>
                  <div className="start-session-meta">
                    <span>{activePaperConfig.label}</span>
                    <span>{doubleStripEnabled ? "2 strip" : "1 strip"}</span>
                    <span>{photoboothAdminSettings.autoPrintEnabled ? "Auto print" : "Tanpa print"}</span>
                  </div>
                  <button
                    type="button"
                    className="upload-button compact start-session-button"
                    onClick={handleStartPhotoboothSession}
                    disabled={!backendReady || !photoboothDriveConfigured}
                  >
                    {photoboothDriveConfigured ? "Mulai Sesi" : "Isi Drive ID di Admin"}
                  </button>
                </div>
              </section>
            )}

            {photoboothStep === 2 && (
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
                        {(doubleStripEnabled ? [0, photoboothPhotoCount] : [0]).map(
                          (photoOffset, sideIndex) => (
                            <div
                              className={
                                doubleStripEnabled
                                  ? "double-strip-preview-side"
                                  : "capture-single-ghost-side"
                              }
                              key={`capture-strip-mini-${sideIndex}`}
                            >
                              {activePhotoboothTemplateSlots.slice(0, photoboothPhotoCount).map((slot, index) => {
                                const mappedPhotoIndex = slotPhotoMap[index];
                                const photoIndex =
                                  mappedPhotoIndex === null || mappedPhotoIndex === undefined
                                    ? null
                                    : doubleStripEnabled
                                      ? (mappedPhotoIndex % photoboothPhotoCount) + photoOffset
                                      : mappedPhotoIndex;
                                const capture = photoboothSlotCaptures[photoIndex];
                                const adjustment =
                                  templatePhotoAdjustments[index] ||
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
                                        style={{
                                          width: `${adjustment.scale}%`,
                                          filter: savedEffect.filter,
                                          left: `calc(50% + ${adjustment.x}%)`,
                                          top: `calc(50% + ${adjustment.y}%)`,
                                          transform: "translate(-50%, -50%)",
                                        }}
                                      />
                                    ) : (
                                      <span>{photoIndex !== null ? photoIndex + 1 : index + 1}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )
                        )}
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
                      onClick={() => setPhotoboothStep(1)}
                    >
                      Kembali Start
                    </button>
                    <button
                      type="button"
                      className="upload-button compact"
                      onClick={() => {
                        setPhotoboothEditMode("strip");
                        setPhotoboothStep(photoboothAdminSettings.editEnabled ? 3 : 4);
                      }}
                      disabled={captures.length < photoboothCaptureCount}
                    >
                      Lanjut Kirim
                    </button>
                  </div>
                </div>
              </section>
            )}

            {photoboothStep === 3 && (
              <section className="step-panel photobooth-edit-panel">
                <div className="photobooth-edit-tabs" aria-label="Mode edit photobooth">
                  <button
                    type="button"
                    className={
                      photoboothEditMode === "photo"
                        ? "edit-mode-button active"
                        : "edit-mode-button"
                    }
                    onClick={() => setPhotoboothEditMode("photo")}
                  >
                    Edit Foto
                  </button>
                  <button
                    type="button"
                    className={
                      photoboothEditMode === "strip"
                        ? "edit-mode-button active"
                        : "edit-mode-button"
                    }
                    onClick={() => setPhotoboothEditMode("strip")}
                  >
                    Edit Strip
                  </button>
                </div>
                <div className="photo-edit-layout">
                  <div className="photo-edit-sidebar">
                    {photoboothEditMode === "photo" ? (
                      <div className="photobooth-template-panel">
                        <div className="template-panel-header">
                          <div>
                            <h2>Edit Foto</h2>
                            <span>Pilih foto, preview efek, lalu simpan efeknya.</span>
                          </div>
                        </div>
                        <div className="photo-picker-grid">
                          {photoboothSlotCaptures.map((capture, index) => (
                            <button
                              type="button"
                              key={`edit-photo-${capture.file}`}
                              className={
                                selectedEditPhotoIndex === index
                                  ? "photo-picker-button active"
                                  : "photo-picker-button"
                              }
                              onClick={() => selectEditPhoto(index)}
                            >
                              <img
                                src={`${capture.image_url}?v=${streamVersion}`}
                                alt={capture.filename}
                                style={{
                                  filter: getPhotoboothEffect(photoEffectMap[index]).filter,
                                }}
                              />
                              <span>Foto {index + 1}</span>
                            </button>
                          ))}
                        </div>
                        <div className="control-heading">Pilih Efek</div>
                        <div className="effect-grid">
                          {PHOTOBOOTH_EFFECTS.map((effect) => (
                            <button
                              key={effect.id}
                              type="button"
                              className={
                                draftPhotoEffect === effect.id
                                  ? "effect-button active"
                                  : "effect-button"
                              }
                              onClick={() => setDraftPhotoEffect(effect.id)}
                            >
                              {effect.name}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="upload-button compact"
                          onClick={saveSelectedPhotoEffect}
                          disabled={!selectedEditCapture}
                        >
                          Save Efek Foto
                        </button>
                      </div>
                    ) : (
                      <div className="photobooth-template-panel">
                        <div className="template-panel-header">
                          <div>
                            <h2>Edit Strip</h2>
                            <span>Drag foto ke kotak strip, lalu geser atau scroll di kotaknya.</span>
                          </div>
                        </div>
                          <div className="watermark-controls">
                          <div className="control-heading">Mode Strip</div>
                          <div className="strip-template-controls">
                            <div className="fit-toggle">
                              <button
                                type="button"
                                className={
                                  stripTemplateMode === "default"
                                    ? "fit-button active"
                                    : "fit-button"
                                }
                                onClick={() => setStripTemplateMode("default")}
                              >
                                Template
                              </button>
                              <button
                                type="button"
                                className={
                                  stripTemplateMode === "uploaded"
                                    ? "fit-button active"
                                    : "fit-button"
                                }
                                onClick={() => setStripTemplateMode("uploaded")}
                                disabled={!photoboothTemplate?.active}
                              >
                                Upload
                              </button>
                            </div>
                              <span>
                                {stripTemplateMode === "uploaded" &&
                                photoboothTemplate?.active
                                  ? "Preview memakai strip upload."
                                  : "Preview memakai strip template bawaan."}
                              </span>
                          </div>

                            <div className="control-heading">Foto Sumber</div>
                          <div className="strip-source-grid">
                            {photoboothSlotCaptures.map((capture, index) => (
                              <button
                                type="button"
                                key={`strip-source-${capture.file}`}
                                className="strip-source-photo"
                                draggable={false}
                                onDragStart={(event) =>
                                  handleStripPhotoDragStart(event, index)
                                }
                                onPointerDown={(event) =>
                                  handleStripSourcePointerDown(event, index)
                                }
                              >
                                <img
                                  src={`${capture.image_url}?v=${streamVersion}`}
                                  alt={capture.filename}
                                  style={{
                                    filter: getPhotoboothEffect(photoEffectMap[index]).filter,
                                  }}
                                />
                                Foto {index + 1}
                              </button>
                            ))}
                          </div>

                          <div className="strip-gesture-note">
                            Kotak {selectedTemplateSlot + 1}: drag foto sumber ke kotak,
                            drag isi kotak untuk geser, scroll untuk zoom.
                          </div>
                          <label className="range-control">
                            Zoom
                            <span>{selectedSlotAdjustment.scale}%</span>
                            <input
                              type="range"
                              min="50"
                              max="240"
                              value={selectedSlotAdjustment.scale}
                              onChange={(event) =>
                                updateTemplateSlotAdjustment({
                                  scale: Number(event.target.value),
                                })
                              }
                              disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}
                            />
                          </label>
                          <label className="range-control">
                            X
                            <span>{selectedSlotAdjustment.x}%</span>
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              value={selectedSlotAdjustment.x}
                              onChange={(event) =>
                                updateTemplateSlotAdjustment({
                                  x: Number(event.target.value),
                                })
                              }
                              disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}
                            />
                          </label>
                          <label className="range-control">
                            Y
                            <span>{selectedSlotAdjustment.y}%</span>
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              value={selectedSlotAdjustment.y}
                              onChange={(event) =>
                                updateTemplateSlotAdjustment({
                                  y: Number(event.target.value),
                                })
                              }
                              disabled={!photoboothSlotCaptures[slotPhotoMap[selectedTemplateSlot]]}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="photo-edit-preview">
                    <div className="auto-preview-header">
                      <div>
                        <h2>
                          {photoboothEditMode === "photo"
                            ? "Preview Foto"
                            : "Preview Strip"}
                        </h2>
                        <p>
                          {photoboothEditMode === "photo"
                            ? "Pilih efek yang paling cocok sebelum masuk ke strip."
                            : doubleStripEnabled
                              ? `Strip final berisi ${photoboothCaptureCount} foto berbeda dalam 2 strip.`
                              : `Strip final berisi ${photoboothPhotoCount} foto sesuai pilihan admin.`}
                        </p>
                      </div>
                    </div>
                    {photoboothEditMode === "photo" ? (
                      <div className="photo-effect-preview">
                        {selectedEditCapture ? (
                          <img
                            src={`${selectedEditCapture.image_url}?v=${streamVersion}`}
                            alt={selectedEditCapture.filename}
                            style={{ filter: draftEffect.filter }}
                          />
                        ) : (
                          <span>{`Ambil ${photoboothCaptureCount} foto dulu untuk mulai edit.`}</span>
                        )}
                      </div>
                    ) : (
                      <div
                        className={
                          [
                            "photobooth-template-preview",
                            photoboothPreviewUsesUploadedTemplate ? "uploaded-template-preview" : "",
                            doubleStripEnabled ? "double-strip-edit-preview" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")
                        }
                        style={editPhotoboothPreviewStyle}
                      >
                        {doubleStripEnabled
                          ? [0, photoboothPhotoCount].map((photoOffset, sideIndex) => (
                              <div
                                className="double-strip-preview-side"
                                key={`double-preview-side-${sideIndex}`}
                              >
                                {activePhotoboothTemplateSlots.slice(0, photoboothPhotoCount).map((slot, index) => {
                                  const mappedPhotoIndex = slotPhotoMap[index];
                                  const photoIndex =
                                    mappedPhotoIndex === null || mappedPhotoIndex === undefined
                                      ? null
                                      : (mappedPhotoIndex % photoboothPhotoCount) + photoOffset;
                                  const capture = photoboothSlotCaptures[photoIndex];
                                  const adjustment =
                                    templatePhotoAdjustments[index] ||
                                    DEFAULT_SLOT_ADJUSTMENT;
                                  const savedEffect = getPhotoboothEffect(photoEffectMap[photoIndex]);
                                  const isEditableSide = sideIndex === 0;

                                  return (
                                    <div
                                      data-strip-slot={isEditableSide ? index : undefined}
                                      className={
                                        [
                                          "template-photo-slot",
                                          isEditableSide && selectedTemplateSlot === index ? "active" : "",
                                          capture ? "filled" : "empty",
                                        ]
                                          .filter(Boolean)
                                          .join(" ")
                                      }
                                      key={`double-slot-${sideIndex}-${index}`}
                                      onClick={isEditableSide ? () => setSelectedTemplateSlot(index) : undefined}
                                      onDragOver={isEditableSide ? (event) => event.preventDefault() : undefined}
                                      onDrop={isEditableSide ? (event) => handleStripSlotDrop(event, index) : undefined}
                                      onPointerDown={isEditableSide ? (event) =>
                                        handleStripSlotPointerDown(event, index) : undefined
                                      }
                                      onPointerMove={isEditableSide ? (event) =>
                                        handleStripSlotPointerMove(event, index) : undefined
                                      }
                                      onPointerUp={isEditableSide ? handleStripSlotPointerUp : undefined}
                                      onPointerCancel={isEditableSide ? handleStripSlotPointerUp : undefined}
                                      onWheel={isEditableSide ? (event) => handleStripSlotWheel(event, index) : undefined}
                                      style={getPhotoboothTemplateSlotStyle(slot)}
                                    >
                                      {capture ? (
                                        <img
                                          src={`${capture.image_url}?v=${streamVersion}`}
                                          alt={capture.filename}
                                          style={{
                                            width: `${adjustment.scale}%`,
                                            filter: savedEffect.filter,
                                            left: `calc(50% + ${adjustment.x}%)`,
                                            top: `calc(50% + ${adjustment.y}%)`,
                                            transform: "translate(-50%, -50%)",
                                          }}
                                          draggable={false}
                                        />
                                      ) : (
                                        <span>Foto {photoIndex !== null ? photoIndex + 1 : index + 1}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ))
                          : activePhotoboothTemplateSlots.slice(0, photoboothPhotoCount).map((slot, index) => {
                              const photoIndex = slotPhotoMap[index];
                              const capture = photoboothSlotCaptures[photoIndex];
                              const adjustment =
                                templatePhotoAdjustments[index] ||
                                DEFAULT_SLOT_ADJUSTMENT;
                              const savedEffect = getPhotoboothEffect(photoEffectMap[photoIndex]);

                              return (
                                  <div
                                    data-strip-slot={index}
                                    className={
                                      [
                                      "template-photo-slot",
                                      selectedTemplateSlot === index ? "active" : "",
                                      capture ? "filled" : "empty",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")
                                  }
                                  key={`slot-${index}`}
                                  onClick={() => setSelectedTemplateSlot(index)}
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
                                      style={{
                                        width: `${adjustment.scale}%`,
                                        filter: savedEffect.filter,
                                        left: `calc(50% + ${adjustment.x}%)`,
                                        top: `calc(50% + ${adjustment.y}%)`,
                                        transform: "translate(-50%, -50%)",
                                      }}
                                      draggable={false}
                                    />
                                  ) : (
                                    <span>Kotak {index + 1}</span>
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
                              alt="Template strip upload"
                              className="template-overlay"
                              draggable={false}
                            />
                          )}
                        </div>
                    )}
                  </div>
                </div>
                <div className="step-footer">
                  <div>
                    <strong>{filledStripSlotCount}/{activeStripSlots.length}</strong>
                    <span>slot strip terisi</span>
                  </div>
                  <div className="footer-actions">
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => setPhotoboothStep(2)}
                    >
                      Kembali Capture
                    </button>
                    <button
                      type="button"
                      className="upload-button compact"
                      onClick={() => setPhotoboothStep(4)}
                      disabled={
                        captures.length < photoboothCaptureCount ||
                        filledStripSlotCount < activeStripSlots.length
                      }
                    >
                      Lanjut Kirim
                    </button>
                  </div>
                </div>
              </section>
            )}

            {photoboothStep === 4 && (
              <section className="step-panel photobooth-drive-panel">
                <section className="photobooth-final-preview">
                  <div className="template-panel-header">
                    <div>
                      <h2>Hasil Photobooth</h2>
                      <span>Hasil ini akan masuk ke Google Drive dan printer.</span>
                    </div>
                  </div>
                  <div className="final-strip-render">
                    {photoboothFinalPreviewUrl ? (
                      <img
                        src={photoboothFinalPreviewUrl}
                        alt="Preview hasil photobooth"
                      />
                    ) : (
                      <span>
                        {isRenderingPhotoboothPreview
                          ? "Membuat preview hasil..."
                          : `Preview hasil akan muncul setelah ${photoboothCaptureCount} foto siap.`}
                      </span>
                    )}
                  </div>
                </section>
                <section className="photobooth-drive-card">
                  <div className="template-panel-header">
                    <div>
                      <h2>Upload ke Google Drive</h2>
                      <span>{photoboothDriveResult ? "Folder siap untuk user." : "Sedang menyiapkan folder user."}</span>
                    </div>
                  </div>
                  {isUploadingPhotoboothDrive ? (
                    <span className="upload-status-text">Membuat folder dan mengupload strip...</span>
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
                    <span className="upload-status-text">Menyiapkan upload...</span>
                  )}
                </section>
                <div className="step-footer">
                  {photoboothAdminSettings.editEnabled && (
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => setPhotoboothStep(3)}
                    >
                      Kembali Edit
                    </button>
                  )}
                    <button
                      type="button"
                      className="upload-button compact finish-button"
                      onClick={handleFinishPhotoboothSession}
                      disabled={isUploadingPhotoboothDrive}
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
            <div className="step-tabs" aria-label="Tahapan auto upload">
              <button
                type="button"
                className={uploadStep === 1 ? "step-tab active" : "step-tab"}
                onClick={() => setUploadStep(1)}
              >
                <strong>1</strong>
                Pilih Sumber
              </button>
              <button
                type="button"
                className={uploadStep === 2 ? "step-tab active" : "step-tab"}
                onClick={() => selectedUploadCount > 0 && setUploadStep(2)}
                disabled={selectedUploadCount === 0}
              >
                <strong>2</strong>
                Edit Tampilan
              </button>
              <button
                type="button"
                className={uploadStep === 3 ? "step-tab active" : "step-tab"}
                onClick={() =>
                  (selectedUploadCount > 0 ||
                    uploadProgress.total > 0 ||
                    queue.length > 0) &&
                  setUploadStep(3)
                }
                disabled={
                  selectedUploadCount === 0 &&
                  uploadProgress.total === 0 &&
                  queue.length === 0
                }
              >
                <strong>3</strong>
                Upload Drive
              </button>
              <button
                type="button"
                className={uploadStep === 4 ? "step-tab active" : "step-tab"}
                onClick={() => setUploadStep(4)}
              >
                <strong>4</strong>
                Preview Upload
              </button>
            </div>

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
                        onChange={(event) => setDriveFolderId(event.target.value)}
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
                    onChange={(event) => setDriveFolderId(event.target.value)}
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
                        : "Connect Drive"}
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
                      ? `Cetak ${String(photoboothAdminSettings.paperSize || "4r").toUpperCase()} ke ${photoboothAdminSettings.printerName || "— pilih printer dulu"}.`
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
                    <h2>Isi Strip</h2>
                    <span>Pilih isi strip; template tersimpan per jumlah slot.</span>
                  </div>
                </div>
                <div className="admin-choice-grid" aria-label="Pilih jumlah slot">
                  {PHOTOBOOTH_SLOT_COUNTS.map((count) => (
                    <button
                      key={`slot-count-${count}`}
                      type="button"
                      className={
                        photoboothPhotoCount === count
                          ? "admin-choice-button active"
                          : "admin-choice-button"
                      }
                      onClick={() => {
                        setPhotoboothAdminSettings((current) => ({
                          ...current,
                          stripPhotoCount: count,
                          doubleStripEnabled:
                            count >= 2 &&
                            current.doubleStripEnabled,
                        }));
                      }}
                    >
                      <strong>{count}</strong>
                      <span>{count === 1 ? "Slot" : "Slot"}</span>
                    </button>
                  ))}
                </div>
                <div className="admin-setting-note">
                  <strong>{photoboothPhotoCount}</strong>
                  <span>
                    {photoboothTemplate?.active
                      ? `Template ${photoboothPhotoCount} slot tersimpan.`
                      : `Template default — ${photoboothPhotoCount} slot.`}
                  </span>
                </div>
                <label className="admin-input-field">
                  Ukuran Kertas
                  <select
                    value={photoboothAdminSettings.paperSize}
                    onChange={(event) =>
                      setPhotoboothAdminSettings((current) => ({
                        ...current,
                        paperSize: event.target.value,
                        doubleStripEnabled:
                          current.stripPhotoCount >= 2 && current.doubleStripEnabled,
                      }))
                    }
                  >
                    <option value="3r">3R</option>
                    <option value="4r">4R</option>
                  </select>
                </label>
                <div className="admin-setting-note">
                  <strong>{activePaperConfig.label}</strong>
                  <span>
                    Default strip {activeStripBaseWidth} x {activeStripBaseHeight}px,
                    rasio {photoboothPhotoCount === 1
                      ? `landscape ${activePaperConfig.ratioLabel.split(":").reverse().join(":")}`
                      : activePaperConfig.ratioLabel}.
                  </span>
                </div>
                <label className="admin-input-field print-option-row">
                  <span>Dua strip dalam 1 kertas</span>
                  <input
                    type="checkbox"
                    checked={photoboothAdminSettings.doubleStripEnabled}
                    onChange={() =>
                      setPhotoboothAdminSettings((current) => ({
                        ...current,
                        doubleStripEnabled: !current.doubleStripEnabled,
                        stripPhotoCount:
                          current.doubleStripEnabled
                            ? current.stripPhotoCount
                            : Math.max(2, current.stripPhotoCount || 2),
                      }))
                    }
                    disabled={!doubleStripAvailable && !photoboothAdminSettings.doubleStripEnabled}
                  />
                </label>
                <div className="admin-setting-note">
                  <strong>
                    {doubleStripEnabled ? `${photoboothPhotoCount * 2} foto` : "Normal"}
                  </strong>
                  <span>
                    {doubleStripEnabled
                      ? `1 kertas ${activePaperConfig.label} berisi 2 strip, masing-masing ${photoboothPhotoCount} foto, dengan garis belah tengah.`
                      : "Mode dua strip tersedia untuk 3R dan 4R mulai dari 2 foto."}
                  </span>
                </div>
                <div className="admin-asset-grid">
                  <div className="admin-asset-preview">
                    {activePhotoboothTemplate?.active && activePhotoboothTemplate.image_url ? (
                      <img src={activePhotoboothTemplate.image_url} alt="Template strip" />
                    ) : (
                      <span>Template default</span>
                    )}
                  </div>
                  <div className="admin-asset-preview admin-slot-preview">
                    {activePhotoboothTemplate?.active && activePhotoboothTemplate.image_url ? (
                      <div className="strip-slot-overlay-preview">
                        <div
                          className="strip-preview-frame"
                          style={adminPreviewStyle}
                        >
                          <img
                            src={activePhotoboothTemplate.image_url}
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
                <div className="admin-action-row" style={{ marginTop: 8 }}>
                  <label
                    className={
                      !backendReady || isUploadingTemplate
                        ? "template-upload-button disabled"
                        : "template-upload-button"
                    }
                  >
                    {isUploadingTemplate ? "Upload..." : "Upload Strip"}
                    <input
                      ref={photoboothTemplateInputRef}
                      type="file"
                      accept="image/*"
                      disabled={!backendReady || isUploadingTemplate}
                      onChange={handlePhotoboothTemplateUpload}
                    />
                  </label>
                  <button
                    type="button"
                    className="clear-queue-button compact"
                    onClick={handlePhotoboothTemplateReset}
                    disabled={!photoboothTemplate?.active}
                  >
                    Reset
                  </button>
                  {lastDetectedSlot && (
                    <span className="detected-slot-badge">
                      Terdeteksi {lastDetectedSlot} slot
                    </span>
                  )}
                </div>
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
