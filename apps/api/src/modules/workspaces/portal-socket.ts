import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, isAbsolute } from 'node:path';
import { portalWorkspaceChange, type PortalScope, type PortalScopeRequest } from './portal';

function privateFile(path: string) {
  if (!isAbsolute(path) || realpathSync(path) !== path)
    throw new Error('Private Portal scope file required');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 16384 || stat.mode & 0o077 || stat.uid !== process.getuid?.())
    throw new Error('Private Portal scope file required');
  return readFileSync(path);
}
function scope(path: string): PortalScope & { socket: string } {
  const bytes = privateFile(path),
    raw = JSON.parse(bytes.toString('utf8'));
  const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
  if (
    !raw ||
    Object.keys(raw).sort().join(',') !== 'reviewers,socket,teams,workspaces' ||
    !Array.isArray(raw.reviewers) ||
    !raw.reviewers.length ||
    raw.reviewers.some((x: unknown) => typeof x !== 'string' || !x || x.length > 200) ||
    !Array.isArray(raw.workspaces) ||
    !raw.workspaces.length ||
    raw.workspaces.some((x: unknown) => !positive(x)) ||
    !raw.teams ||
    typeof raw.teams !== 'object' ||
    Array.isArray(raw.teams) ||
    Object.entries(raw.teams).some(
      ([id, w]) =>
        !positive(Number(id)) || String(Number(id)) !== id || !raw.workspaces.includes(w),
    ) ||
    typeof raw.socket !== 'string' ||
    !isAbsolute(raw.socket) ||
    raw.socket.length > 100
  )
    throw new Error('Reviewed Portal scope required');
  const revision = createHash('sha256').update(bytes).digest('hex');
  return {
    ...raw,
    revision,
    current: () => {
      try {
        return createHash('sha256').update(privateFile(path)).digest('hex') === revision;
      } catch {
        return false;
      }
    },
  };
}
function request(value: unknown): PortalScopeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid request');
  const r = value as PortalScopeRequest;
  if (
    !['preview', 'apply'].includes(r.operation) ||
    !['team', 'workspace'].includes(r.kind) ||
    !['transfer', 'enroll', 'member', 'manager', 'revoke'].includes(r.choice) ||
    !Number.isSafeInteger(r.resourceId) ||
    r.resourceId < 1 ||
    [r.actor, r.target, r.actorSubject, r.targetSubject, r.issuer].some(
      (v) => typeof v !== 'string' || !v || v.length > 200,
    ) ||
    (r.operation === 'apply' &&
      (!r.expected || typeof r.expected !== 'object' || Array.isArray(r.expected)))
  )
    throw new Error('Invalid request');
  return r;
}

export function startPortalWorkspaceSocket() {
  if (process.env.APLYD_PORTAL_WORKSPACE_ENABLED !== '1') return;
  const path = process.env.APLYD_PORTAL_WORKSPACE_CONFIG;
  if (!path) throw new Error('Portal scope file missing');
  const initial = scope(path),
    directory = dirname(initial.socket),
    stat = lstatSync(directory);
  if (
    !stat.isDirectory() ||
    realpathSync(directory) !== directory ||
    stat.mode & 0o077 ||
    stat.uid !== process.getuid?.() ||
    existsSync(initial.socket)
  )
    throw new Error('Private unused Portal socket path required');
  const server = createServer(async (req, res) => {
    const deadline = setTimeout(() => {
      req.destroy();
      res.destroy();
    }, 15000);
    res.once('close', () => clearTimeout(deadline));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== 'POST' || req.url !== '/') throw new Error('Unsupported operation');
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32768) throw new Error('Request too large');
        chunks.push(Buffer.from(chunk));
      }
      const cfg = scope(path);
      if (cfg.socket !== initial.socket) throw new Error('Scope changed');
      const result = await portalWorkspaceChange(
        cfg,
        request(JSON.parse(Buffer.concat(chunks).toString('utf8'))),
      );
      if (!cfg.current()) throw new Error('Scope changed');
      res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 409;
      res.end(
        JSON.stringify({ error: 'Native workspace change unavailable; reconcile before retry' }),
      );
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 5000;
  server.setTimeout(15000, (socket) => socket.destroy());
  server.listen(initial.socket, () => chmodSync(initial.socket, 0o600));
  return server;
}
