import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackendFetch } from './backendTransport.js';

test('instance credentials only go to the local backend and preserve request options', async () => {
  const calls = [];
  const transport = createBackendFetch({ fetchImpl: async (...args) => calls.push(args), getToken: async () => 'secret', sessionId: 'tab-a' });
  await transport('http://127.0.0.1:8000/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(calls[0][1].headers.get('x-event-booth-token'), 'secret');
  assert.equal(calls[0][1].headers.get('x-event-booth-session'), 'tab-a');
  assert.equal(calls[0][1].headers.get('content-type'), 'application/json');
  assert.equal(calls[0][1].body, '{}');
  await transport('https://example.com', { method: 'POST' });
  assert.equal(calls[1][1].headers, undefined);
});
