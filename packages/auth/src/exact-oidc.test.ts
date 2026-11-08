import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { genericOAuth } from 'better-auth/plugins';
import type { BetterAuthPlugin } from 'better-auth';
type PluginContext = Parameters<NonNullable<BetterAuthPlugin['init']>>[0];
type Provider = PluginContext['socialProviders'][number];
import { exactOidcPolicy, exactOidcUserInfo } from './exact-oidc';

const saved = { ...process.env };
afterEach(() => {
  for (const key of [
    'APLYD_CENTRAL_OIDC_ENABLED',
    'APLYD_ACCOUNTS_ISSUER',
    'APLYD_ACCOUNTS_CLIENT_ID',
    'NODE_ENV',
  ]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('central OIDC exact admission', () => {
  let server: ReturnType<typeof Bun.serve>;
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let issuer: string;
  let original: Provider['getUserInfo'];
  let status: Record<string, unknown>;
  let pending: (() => void) | undefined;
  const secret = 'synthetic-only-client-secret-for-local-tests';
  beforeAll(async () => {
    keys = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'isolated', alg: 'RS256', use: 'sig' };
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/.well-known/openid-configuration')
          return Response.json({
            issuer,
            authorization_endpoint: issuer + '/auth',
            token_endpoint: issuer + '/token',
            jwks_uri: issuer + '/jwks',
            id_token_signing_alg_values_supported: ['RS256'],
          });
        if (url.pathname === '/jwks') return Response.json({ keys: [jwk] });
        if (url.pathname === '/internal/session/status') {
          const body = (await request.json()) as Record<string, unknown>;
          if (
            body.client_id !== 'backlog-staging' ||
            body.client_secret !== secret ||
            body.uid !== 'session-one'
          )
            return new Response(null, { status: 401 });
          pending?.();
          return Response.json(status);
        }
        return new Response(null, { status: 404 });
      },
    });
    issuer = `http://127.0.0.1:${server.port}`;
    const plugin = genericOAuth({
      config: [
        {
          providerId: 'oidc',
          clientId: 'backlog-staging',
          clientSecret: secret,
          discoveryUrl: issuer + '/.well-known/openid-configuration',
          requireIdTokenVerification: true,
        },
      ],
    });
    const result = await plugin.init!({
      logger: { error() {} },
      socialProviders: [],
    } as unknown as PluginContext);
    original = result!.context!.socialProviders![0]!.getUserInfo;
  });
  afterAll(() => server.stop(true));

  async function fixture() {
    status = { active: true, sub: 'subject-one', local_id: 'native-one' };
    pending = undefined;
    let identity: { id: string; revision: string } | null = {
      id: 'native-one',
      revision: 'account-1:user-1',
    };
    let current = true;
    const guard = exactOidcUserInfo(
      { issuer, clientId: 'backlog-staging', clientSecret: secret },
      {
        original,
        lookup: async (subject) => (subject === 'subject-one' ? identity : null),
        current: async () => current,
      },
    );
    const token = (overrides: Record<string, unknown> = {}, audience = 'backlog-staging') =>
      new SignJWT({
        sub: 'subject-one',
        email: 'existing@example.test',
        email_verified: true,
        aplyd_session_uid: 'session-one',
        nonce: 'nonce-one',
        ...overrides,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'isolated' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime('1m')
        .sign(keys.privateKey);
    return {
      guard,
      token,
      identity: (value: typeof identity) => {
        identity = value;
      },
      current: () => {
        current = false;
      },
    };
  }

  it('accepts an existing exact subject only after actual signature/nonce and current Accounts proof', async () => {
    const f = await fixture();
    expect(
      (await f.guard({ idToken: await f.token(), expectedIdTokenNonce: 'nonce-one' }))?.data,
    ).toMatchObject({ sub: 'subject-one' });
  });
  it('never links an email collision or creates an absent subject', async () => {
    const f = await fixture();
    f.identity(null);
    expect(
      await f.guard({ idToken: await f.token(), expectedIdTokenNonce: 'nonce-one' }),
    ).toBeNull();
    expect(
      await f.guard({
        idToken: await f.token({ sub: 'different-same-email' }),
        expectedIdTokenNonce: 'nonce-one',
      }),
    ).toBeNull();
  });
  it('rejects wrong audience, nonce, unverified email and missing central session', async () => {
    const f = await fixture();
    for (const idToken of [
      await f.token({}, 'another-client'),
      await f.token({ nonce: 'wrong' }),
      await f.token({ email_verified: false }),
      await f.token({ aplyd_session_uid: undefined }),
    ]) {
      expect(await f.guard({ idToken, expectedIdTokenNonce: 'nonce-one' })).toBeNull();
    }
    expect(await f.guard({})).toBeNull();
    expect(await f.guard({ idToken: 'invalid' })).toBeNull();
  });
  it('rejects revoked or wrong native Accounts links', async () => {
    const f = await fixture();
    for (const proof of [
      { active: false },
      { active: true, sub: 'subject-one', local_id: 'other' },
      { active: true, sub: 'other', local_id: 'native-one' },
    ]) {
      status = proof;
      expect(
        await f.guard({ idToken: await f.token(), expectedIdTokenNonce: 'nonce-one' }),
      ).toBeNull();
    }
  });
  it('rejects native disable/relink or configuration changes during authority I/O', async () => {
    for (const change of ['disabled', 'revision', 'config']) {
      const f = await fixture();
      pending = () =>
        change === 'config'
          ? f.current()
          : f.identity(
              change === 'disabled' ? null : { id: 'native-one', revision: 'account-2:user-1' },
            );
      expect(
        await f.guard({ idToken: await f.token(), expectedIdTokenNonce: 'nonce-one' }),
      ).toBeNull();
    }
  });
  it('leaves existing generic sign-in unchanged when the new gate is off', () => {
    delete process.env.APLYD_CENTRAL_OIDC_ENABLED;
    expect(
      exactOidcPolicy({
        discoveryUrl: '',
        clientId: '',
        clientSecret: '',
        scopes: [],
        pkce: false,
      }),
    ).toBeUndefined();
  });
  it('pins discovery/client and permits HTTP only for nonproduction loopback', () => {
    process.env.APLYD_CENTRAL_OIDC_ENABLED = 'true';
    process.env.APLYD_ACCOUNTS_ISSUER = issuer;
    process.env.APLYD_ACCOUNTS_CLIENT_ID = 'backlog-staging';
    process.env.NODE_ENV = 'test';
    const config = {
      scopes: ['openid', 'aplyd'],
      pkce: true,
      discoveryUrl: issuer + '/.well-known/openid-configuration',
      clientId: 'backlog-staging',
      clientSecret: secret,
    };
    expect(exactOidcPolicy(config)?.issuer).toBe(issuer);
    expect(() => exactOidcPolicy({ ...config, scopes: ['openid'] })).toThrow();
    expect(() => exactOidcPolicy({ ...config, pkce: false })).toThrow();
    expect(() => exactOidcPolicy({ ...config, clientId: 'wrong' })).toThrow();
    expect(() =>
      exactOidcPolicy({ ...config, discoveryUrl: 'https://wrong.example/discovery' }),
    ).toThrow();
    process.env.NODE_ENV = 'production';
    expect(() => exactOidcPolicy(config)).toThrow();
  });
});
