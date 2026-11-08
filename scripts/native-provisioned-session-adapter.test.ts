import { afterEach, expect, test } from 'bun:test';
import { withNativeLogout } from '../packages/auth/src/native-session-adapter';
const environment = { ...process.env };
const fetchBefore = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchBefore;
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
});
function adapter(projected: boolean, id: string) {
  const full = { id: 'session', userId: id, createdAt: new Date(1) };
  const factory = (() => ({
    findOne: async (q: { select?: string[] }) => (q.select ? { id: 'session' } : full),
  })) as unknown as Parameters<typeof withNativeLogout>[0];
  return {
    instance: withNativeLogout(factory)({}),
    query: {
      model: 'session',
      where: [{ field: 'id', value: 'session' }],
      ...(projected ? { select: ['id'] } : {}),
    },
  };
}
for (const projected of [false, true]) {
  test(`provisioned session fails closed without receiver configuration; projected=${projected}`, async () => {
    delete process.env.APLYD_NATIVE_LOGOUT_ENABLED;
    delete process.env.APLYD_ACCOUNTS_ISSUER;
    const a = adapter(projected, 'portal_btf_10000000-0000-4000-8000-000000000001');
    expect(await a.instance.findOne(a.query)).toBeNull();
  });
  test(`legacy session remains usable with enforcement off; projected=${projected}`, async () => {
    delete process.env.APLYD_NATIVE_LOGOUT_ENABLED;
    globalThis.fetch = (() => {
      throw Error('Unexpected network');
    }) as unknown as typeof fetch;
    const a = adapter(projected, 'legacy');
    expect(await a.instance.findOne(a.query)).not.toBeNull();
  });
}
