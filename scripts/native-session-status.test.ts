import { afterEach, expect, test } from 'bun:test';
import { nativeSessionActive } from '../packages/auth/src/native-session-status';

const environment = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const name of Object.keys(process.env)) if (!(name in environment)) delete process.env[name];
  Object.assign(process.env, environment);
});
function enable() {
  process.env.APLYD_NATIVE_LOGOUT_ENABLED = 'true';
  process.env.APLYD_ACCOUNTS_ISSUER = 'https://accounts.aplyd.org';
  process.env.APLYD_ACCOUNTS_CLIENT_SECRET = 'synthetic-test-client-secret-at-least-32';
}
function respond(proof: unknown) {
  globalThis.fetch = (async () => Response.json(proof)) as unknown as typeof fetch;
}
test('disabled enforcement preserves native sessions without a new network call', async () => {
  delete process.env.APLYD_NATIVE_LOGOUT_ENABLED;
  globalThis.fetch = (() => {
    throw Error('unexpected network');
  }) as unknown as typeof fetch;
  expect(await nativeSessionActive('native', new Date(1))).toBe(true);
});
test('checks the exact native identity and original database session timestamp', async () => {
  enable();
  let request: { url: unknown; options?: RequestInit } | undefined;
  globalThis.fetch = (async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    request = { url, options };
    return Response.json({ active: true, managed: true, local_id: 'native', generation: 0 });
  }) as unknown as typeof fetch;
  expect(await nativeSessionActive('native', new Date(123456789))).toBe(true);
  expect(request?.url).toBe('https://accounts.aplyd.org/internal/native-session/status');
  expect(request?.options?.redirect).toBe('error');
  expect(request?.options?.cache).toBe('no-store');
  const body = JSON.parse(String(request?.options?.body));
  expect(body.client_id).toBe('backlog');
  expect(body.local_id).toBe('native');
  expect(body.issued_at_ms).toBe(123456789);
});
test('rejects revoked, mismatched and malformed proofs', async () => {
  enable();
  for (const proof of [
    { active: false, managed: true, local_id: 'native', generation: 1 },
    { active: true, managed: true, local_id: 'different', generation: 0 },
    { active: true, managed: 'true', local_id: 'native', generation: 0 },
    { active: true, managed: true, local_id: 'native', generation: '0' },
    { active: true, managed: false, local_id: 'native', generation: 0 },
    null,
  ]) {
    respond(proof);
    expect(await nativeSessionActive('native', new Date(1))).toBe(false);
  }
});
test('unknown native users retain their existing native authorization', async () => {
  enable();
  respond({ active: true, managed: false, local_id: 'native', generation: null });
  expect(await nativeSessionActive('native', new Date(1))).toBe(true);
});
test('invalid issuance, untrusted issuer and missing secret fail closed before requests', async () => {
  enable();
  globalThis.fetch = (() => {
    throw Error('unexpected network');
  }) as unknown as typeof fetch;
  for (const date of [new Date(NaN), new Date(0), new Date(Date.now() + 60000)]) {
    expect(await nativeSessionActive('native', date)).toBe(false);
  }
  process.env.APLYD_ACCOUNTS_ISSUER = 'https://untrusted.invalid';
  expect(await nativeSessionActive('native', new Date(1))).toBe(false);
  process.env.APLYD_ACCOUNTS_ISSUER = 'https://accounts.aplyd.org';
  delete process.env.APLYD_ACCOUNTS_CLIENT_SECRET;
  expect(await nativeSessionActive('native', new Date(1))).toBe(false);
});
test('network failures and non-success responses cannot authorize a session', async () => {
  enable();
  globalThis.fetch = (async () => {
    throw Error('offline');
  }) as unknown as typeof fetch;
  expect(await nativeSessionActive('native', new Date(1))).toBe(false);
  globalThis.fetch = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
  expect(await nativeSessionActive('native', new Date(1))).toBe(false);
});
