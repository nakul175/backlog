export function nativeLogoutEnabled(): boolean {
  return process.env.APLYD_NATIVE_LOGOUT_ENABLED === 'true';
}

export async function nativeSessionActive(localId: string, createdAt: Date): Promise<boolean> {
  if (!nativeLogoutEnabled()) return true;
  try {
    const issuedAt = createdAt.getTime();
    const issuer = process.env.APLYD_ACCOUNTS_ISSUER;
    const secret = process.env.APLYD_ACCOUNTS_CLIENT_SECRET;
    if (
      !localId ||
      localId.length > 200 ||
      !Number.isSafeInteger(issuedAt) ||
      issuedAt <= 0 ||
      issuedAt > Date.now() ||
      issuer !== 'https://accounts.aplyd.org' ||
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
        client_id: 'backlog',
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
        : proof.generation === null)
    );
  } catch {
    return false;
  }
}
