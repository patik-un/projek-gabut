const integer = (value, min, max, fallback) => {
  const n = typeof value === 'boolean' || value === null || value === '' ? NaN : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
export function normalizeBoothOperations(settings = {}) {
  const timing = settings.timing || {};
  return {
    printCopies: integer(settings.printCopies, 1, 10, 1),
    printOrientation: settings.printOrientation === 'landscape' ? 'landscape' : 'portrait',
    printFit: settings.printFit === 'fill' ? 'fill' : 'fit',
    timing: {
      initialCountdown: integer(timing.initialCountdown, 1, 30, 3),
      nextCountdown: integer(timing.nextCountdown, 1, 30, 3),
      sessionSeconds: integer(timing.sessionSeconds, 0, 3600, 0),
      selectionSeconds: integer(timing.selectionSeconds, 0, 600, 0),
      editSeconds: integer(timing.editSeconds, 0, 600, 0),
    },
  };
}
export function resolveBoothTimerStage(mode, step) {
  if (mode !== 'admin' && step === 2) return 'selection';
  const capture = mode === 'admin' ? 2 : 3;
  return step === capture ? 'capture' : step === capture + 1 ? 'editing' : step >= capture + 2 ? 'results' : 'idle';
}
export function createBoothClock(timing = {}) {
  const normalized = normalizeBoothOperations({ timing }).timing;
  return { timing: normalized, stage: 'idle', sessionRemaining: normalized.sessionSeconds * 1000 || null,
    stageRemaining: null, remainingByStage: {}, expired: null };
}
export function setBoothClockStage(clock, stage) {
  if (clock.stage === stage) return clock;
  const limit = stage === 'selection' ? clock.timing.selectionSeconds : stage === 'editing' ? clock.timing.editSeconds : 0;
  return { ...clock, stage, stageRemaining: clock.remainingByStage[stage] ?? (limit * 1000 || null),
    expired: clock.expired === 'session' ? 'session' : null };
}
export function advanceBoothClock(clock, elapsed, paused) {
  if (paused || clock.expired || !Number.isFinite(elapsed) || elapsed <= 0 || !['selection', 'capture', 'editing'].includes(clock.stage)) return clock;
  const session = clock.stage === 'selection' ? null : clock.sessionRemaining;
  const stage = clock.stageRemaining;
  const expired = session !== null && elapsed >= session && (stage === null || session <= stage) ? 'session'
    : stage !== null && elapsed >= stage ? clock.stage : null;
  const stageRemaining = stage === null ? null : Math.max(0, stage - elapsed);
  return { ...clock, sessionRemaining: session === null ? clock.sessionRemaining : Math.max(0, session - elapsed),
    stageRemaining, remainingByStage: { ...clock.remainingByStage, [clock.stage]: stageRemaining }, expired };
}
export function formatBoothTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function createPrintTestImage(paper = '4r', orientation = 'portrait') {
  const canvas = document.createElement('canvas');
  const ratio = paper === '3r' ? 127 / 88.9 : 1.5;
  canvas.width = orientation === 'landscape' ? Math.round(800 * ratio) : 800;
  canvas.height = orientation === 'landscape' ? 800 : Math.round(800 * ratio);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.strokeRect(35, 35, canvas.width - 70, canvas.height - 70);
  ctx.fillStyle = '#111'; ctx.font = 'bold 36px Arial'; ctx.fillText('Event Booth Studio', 70, 110);
  ctx.font = '26px Arial'; ctx.fillText(`Tes cetak ${paper.toUpperCase()} • ${orientation}`, 70, 165);
  ctx.font = '22px Arial'; ctx.fillText('Periksa orientasi, warna, dan batas kertas.', 70, 210);
  ['#ef4444', '#22c55e', '#3b82f6', '#111111'].forEach((color, index) => {
    ctx.fillStyle = color; ctx.fillRect(70 + index * 150, 270, 130, 160);
  });
  return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
}
