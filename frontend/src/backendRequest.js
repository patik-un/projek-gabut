// Keep the timeout and parent cancellation active through response-body parsing.
// Racing also bounds test doubles or transports that finish after abort.
export async function requestBackendJson(url, {
  signal,
  timeoutMs = 5000,
  fetchImpl = globalThis.fetch,
  ...options
} = {}) {
  const controller = new AbortController();
  let timer;
  let cancel;
  const cancelled = new Promise((_, reject) => {
    cancel = (reason = signal?.reason) => {
      const error = reason || Object.assign(new Error("Backend request cancelled"), { name: "AbortError" });
      controller.abort(error);
      reject(error);
    };
  });
  const cancelFromParent = () => cancel(signal.reason);
  signal?.addEventListener("abort", cancelFromParent, { once: true });
  if (signal?.aborted) cancelFromParent();
  timer = setTimeout(() => cancel(Object.assign(
    new Error("Permintaan backend terlalu lama. Silakan coba lagi."),
    { name: "TimeoutError" }
  )), timeoutMs);

  try {
    return await Promise.race([
      (async () => {
        if (controller.signal.aborted) throw controller.signal.reason;
        const response = await fetchImpl(url, {
          cache: "no-store",
          ...options,
          signal: controller.signal,
        });
        if (controller.signal.aborted) throw controller.signal.reason;
        const data = await response.json();
        if (controller.signal.aborted) throw controller.signal.reason;
        if (!response.ok) throw Object.assign(
          new Error(data?.message || "Permintaan backend gagal"),
          { status: response.status }
        );
        return data;
      })(),
      cancelled,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancelFromParent);
  }
}
