const bounded = (value, min, max, fallback) => {
  const number = typeof value === 'number' ? value : Number(value);
  return value !== null && value !== '' && typeof value !== 'boolean' && Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
export function normalizeCaptureReview(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  return { enabled: value.enabled !== false, seconds: bounded(value.seconds, 2, 30, 5),
    allowRetake: value.allowRetake !== false, maxRetakes: bounded(value.maxRetakes, 1, 5, 1) };
}
export function advanceCaptureReview(remaining, elapsed, paused) {
  return paused ? remaining : Math.max(0, remaining - Math.max(0, elapsed));
}
