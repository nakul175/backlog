export function nativeLogoutEnabled(): boolean {
  return process.env.APLYD_NATIVE_LOGOUT_ENABLED === 'true';
}

export function nativeEnforcementRequired(localId: string): boolean {
  return nativeLogoutEnabled() || localId.startsWith('portal_btf_');
}

export async function nativeSessionActive(localId: string, createdAt: Date): Promise<boolean> {
  if (!nativeEnforcementRequired(localId)) return true;
  try {
    const issuedAt = createdAt.getTime();
    const issuer = process.env.APLYD_ACCOUNTS_ISSUER;
    const secret = process.env.APLYD_ACCOUNTS_CLIENT_SECRET;
    const clientId = process.env.APLYD_ACCOUNTS_CLIENT_ID ?? 'backlog';
    const url = new URL(issuer ?? '');
    const isolated =
      process.env.NODE_ENV !== 'production' &&
      process.env.APLYD_NATIVE_LOGOUT_LOOPBACK_TEST === 'true' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname) &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/';
    if (
      !localId ||
      localId.length > 200 ||
      !Number.isSafeInteger(issuedAt) ||
      issuedAt <= 0 ||
      issuedAt > Date.now() ||
      (issuer !== 'https://accounts.aplyd.org' && !isolated) ||
      !['backlog', 'backlog-staging'].includes(clientId) ||
      !secret ||
      secret.length < 32
    )
      return false;
    const response = await fetch(`${issuer}/internal/native-session/status`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: secret,
        local_id: localId,
        mode: 'check',
        issued_at_ms: issuedAt,
      }),
    });
    if (!response.ok) return false;
    const value: unknown = await response.json();
    if (typeof value !== 'object' || value === null) return false;
    const proof = value as Record<string, unknown>;
    return (
      proof.local_id === localId &&
      proof.active === true &&
      typeof proof.managed === 'boolean' &&
      (proof.managed
        ? typeof proof.generation === 'number' &&
          Number.isSafeInteger(proof.generation) &&
          proof.generation >= 0
        : !localId.startsWith('portal_btf_') && proof.generation === null)
    );
  } catch {
    return false;
  }
}
