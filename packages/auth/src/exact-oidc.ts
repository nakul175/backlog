/** Central OIDC admission requires an existing exact subject link, never an email match. */
export type ExactIdentity = { id: string; revision: string };
export type ExactOidcPolicy = { issuer: string; clientId: string; clientSecret: string };
type Config = { discoveryUrl: string; clientId: string; clientSecret: string };

export function exactOidcPolicy(config: Config): ExactOidcPolicy | undefined {
  if (process.env.APLYD_CENTRAL_OIDC_ENABLED !== 'true') return undefined;
  const issuer = process.env.APLYD_ACCOUNTS_ISSUER ?? '';
  const url = new URL(issuer);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    issuer.endsWith('/') ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && loopback && process.env.NODE_ENV !== 'production')) ||
    config.discoveryUrl !== issuer + '/.well-known/openid-configuration' ||
    config.clientId !== process.env.APLYD_ACCOUNTS_CLIENT_ID ||
    config.clientSecret.length < 32
  )
    throw new Error('Central OIDC configuration is not pinned.');
  return { issuer, clientId: config.clientId, clientSecret: config.clientSecret };
}

type Profile = { data: unknown };
type Tokens = { idToken?: string };
type Dependencies<T extends Tokens, P extends Profile> = {
  original: (tokens: T) => Promise<P | null>;
  lookup: (subject: string) => Promise<ExactIdentity | null>;
  current: () => Promise<boolean>;
  fetch?: typeof fetch;
};

export function exactOidcUserInfo<T extends Tokens, P extends Profile>(
  policy: ExactOidcPolicy,
  dependencies: Dependencies<T, P>,
): (tokens: T) => Promise<P | null> {
  return async (tokens) => {
    try {
      // The original genericOAuth method verifies signature, audience and nonce.
      // Require an ID token rather than falling back to OAuth userinfo/email.
      if (!tokens.idToken || !(await dependencies.current())) return null;
      const result = await dependencies.original(tokens);
      if (!result || typeof result.data !== 'object' || result.data === null) return null;
      const claims = result.data as Record<string, unknown>;
      const { sub, aplyd_session_uid: uid } = claims;
      if (
        claims.iss !== policy.issuer ||
        claims.email_verified !== true ||
        typeof sub !== 'string' ||
        !sub ||
        sub.length > 200 ||
        typeof uid !== 'string' ||
        !uid ||
        uid.length > 200
      )
        return null;
      const before = await dependencies.lookup(sub);
      if (!before) return null;
      const response = await (dependencies.fetch ?? fetch)(
        policy.issuer + '/internal/session/status',
        {
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: policy.clientId,
            client_secret: policy.clientSecret,
            sub,
            uid,
          }),
        },
      );
      if (!response.ok) return null;
      const proof: unknown = await response.json();
      if (typeof proof !== 'object' || proof === null) return null;
      const p = proof as Record<string, unknown>;
      if (p.active !== true || p.sub !== sub || p.local_id !== before.id) return null;
      const after = await dependencies.lookup(sub);
      if (
        !after ||
        after.id !== before.id ||
        after.revision !== before.revision ||
        !(await dependencies.current())
      )
        return null;
      return result;
    } catch {
      // No token, profile, email, client configuration or response body in logs.
      return null;
    }
  };
}
