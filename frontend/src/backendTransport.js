export function createBackendFetch({ fetchImpl, getToken, sessionId }) {
  return async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, 'http://localhost');
    if (url.origin !== 'http://127.0.0.1:8000') return fetchImpl(input, options);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options?.headers).forEach((value, key) => headers.set(key, value));
    const token = await getToken();
    if (token) headers.set('x-event-booth-token', token);
    if (sessionId) headers.set('x-event-booth-session', sessionId);
    return fetchImpl(input, { ...options, headers });
  };
}
