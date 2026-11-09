import { mkdtempSync, writeFileSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { startPortalWorkspaceSocket } from '../../portal-socket';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { setAuthSettings, setOidcSettings } from '@repo/auth';
import { db, account, teamMember, user, workspaceManager } from '@repo/db';
import { and, eq } from 'drizzle-orm';
import { authedApi } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';
import { portalWorkspaceChange, type PortalScope, type PortalScopeRequest } from '../../portal';

async function fixture() {
  process.env.APLYD_CENTRAL_OIDC_ENABLED = 'true';
  process.env.APLYD_ACCOUNTS_ISSUER = 'http://127.0.0.1:49750';
  process.env.APLYD_ACCOUNTS_CLIENT_ID = 'btf-fixture';
  await setOidcSettings({
    enabled: true,
    discoveryUrl: process.env.APLYD_ACCOUNTS_ISSUER + '/.well-known/openid-configuration',
    clientId: 'btf-fixture',
    clientSecret: crypto.randomUUID(),
    pkce: true,
    scopes: ['openid', 'aplyd'],
  });
  const owner = await signUpTestUser();
  const ownerApi = authedApi(owner.cookie);
  const [team] = (await ownerApi.teams.get()).data!;
  await setAuthSettings({ personalWorkspaces: false });
  const target = await signUpTestUser({ team: false });
  for (const [person, subject] of [
    [owner, 'reviewer'],
    [target, 'recipient'],
  ] as const) {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: subject,
      providerId: 'oidc',
      userId: person.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  const cfg: PortalScope = {
    reviewers: [owner.userId],
    workspaces: [owner.workspaceId!],
    teams: { [team!.id]: owner.workspaceId! },
    revision: 'fixture-review',
    current: () => true,
  };
  const request: PortalScopeRequest = {
    operation: 'preview',
    actor: owner.userId,
    target: target.userId,
    issuer: process.env.APLYD_ACCOUNTS_ISSUER!,
    actorSubject: 'reviewer',
    targetSubject: 'recipient',
    kind: 'team',
    resourceId: team!.id,
    choice: 'enroll',
  };
  const apply = async (r: PortalScopeRequest) => {
    const expected = await portalWorkspaceChange(cfg, r);
    return portalWorkspaceChange(cfg, { ...r, operation: 'apply', expected });
  };
  return { owner, target, ownerApi, cfg, request, apply, team: team! };
}

describe('reviewed Portal workspace connector', () => {
  beforeEach(resetDb);
  afterEach(() => {
    delete process.env.APLYD_CENTRAL_OIDC_ENABLED;
    delete process.env.APLYD_ACCOUNTS_ISSUER;
    delete process.env.APLYD_ACCOUNTS_CLIENT_ID;
  });
  it('enrolls, grants, downgrades and removes the exact person with the original session', async () => {
    const f = await fixture();
    const targetApi = authedApi(f.target.cookie);
    const marker = async () =>
      (await targetApi.sync.rev.get({ query: { scopes: 'workspaces:1' } })).data!.revs[
        'workspaces:1'
      ];
    const beforeMarker = await marker();
    const preview = await portalWorkspaceChange(f.cfg, f.request);
    expect(
      await db.select().from(teamMember).where(eq(teamMember.userId, f.target.userId)),
    ).toHaveLength(0);
    await portalWorkspaceChange(f.cfg, { ...f.request, operation: 'apply', expected: preview });
    expect((await targetApi.teams.get()).data!.find((t) => t.id === f.team.id)?.role).toBe(
      'member',
    );
    expect(
      (await targetApi.teams({ teamId: f.team.id }).mcp.patch({ enabled: false })).status,
    ).toBe(403);
    const enrolledMarker = await marker();
    expect(enrolledMarker).not.toBe(beforeMarker);
    await f.apply({ ...f.request, choice: 'manager' });
    expect(await marker()).not.toBe(enrolledMarker);
    expect(
      (await targetApi.teams({ teamId: f.team.id }).mcp.patch({ enabled: false })).status,
    ).toBe(200);
    expect((await targetApi.teams.get()).data!.find((t) => t.id === f.team.id)?.role).toBe(
      'manager',
    );
    await f.apply({ ...f.request, choice: 'member' });
    expect((await targetApi.teams.get()).data!.find((t) => t.id === f.team.id)?.role).toBe(
      'member',
    );
    expect(
      (await targetApi.teams({ teamId: f.team.id }).mcp.patch({ enabled: false })).status,
    ).toBe(403);
    await f.apply({ ...f.request, choice: 'revoke' });
    expect((await targetApi.teams.get()).data!.some((t) => t.id === f.team.id)).toBe(false);
    expect(await db.select().from(user).where(eq(user.id, f.target.userId))).toHaveLength(1);
  });
  it('transfers only after current existing-admin and quota review', async () => {
    const f = await fixture();
    await f.apply(f.request);
    expect(
      (
        await f.ownerApi
          .workspaces({ workspaceId: f.owner.workspaceId! })
          .managers.post({ userId: f.target.userId })
      ).status,
    ).toBe(201);
    const request = {
      ...f.request,
      kind: 'workspace' as const,
      resourceId: f.owner.workspaceId!,
      choice: 'transfer' as const,
    };
    await f.apply(request);
    const owners = await db
      .select()
      .from(workspaceManager)
      .where(
        and(
          eq(workspaceManager.workspaceId, f.owner.workspaceId!),
          eq(workspaceManager.role, 'owner'),
        ),
      );
    expect(owners.map((o) => o.userId)).toEqual([f.target.userId]);
    expect(
      (await authedApi(f.target.cookie).workspaces.get()).data!.find(
        (w) => w.id === f.owner.workspaceId!,
      )?.role,
    ).toBe('owner');
  });
  it('rejects stale plans, incorrect identities and withdrawn operator scope without granting access', async () => {
    const f = await fixture();
    const expected = await portalWorkspaceChange(f.cfg, f.request);
    await db.update(user).set({ active: false }).where(eq(user.id, f.target.userId));
    await expect(
      portalWorkspaceChange(f.cfg, { ...f.request, operation: 'apply', expected }),
    ).rejects.toThrow();
    await db.update(user).set({ active: true }).where(eq(user.id, f.target.userId));
    await expect(
      portalWorkspaceChange(f.cfg, { ...f.request, targetSubject: 'wrong-subject' }),
    ).rejects.toThrow();
    await expect(
      portalWorkspaceChange({ ...f.cfg, current: () => false }, f.request),
    ).rejects.toThrow();
    expect(
      await db.select().from(teamMember).where(eq(teamMember.userId, f.target.userId)),
    ).toHaveLength(0);
  });
  it('private native socket is default-off and validates actual enrolment/readback', async () => {
    delete process.env.APLYD_PORTAL_WORKSPACE_ENABLED;
    expect(startPortalWorkspaceSocket()).toBeUndefined();
    const f = await fixture();
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'btf-scope-')));
    chmodSync(directory, 0o700);
    const config = join(directory, 'scope.json'),
      socket = join(directory, 'native.sock');
    writeFileSync(
      config,
      JSON.stringify({
        reviewers: f.cfg.reviewers,
        workspaces: f.cfg.workspaces,
        teams: f.cfg.teams,
        socket,
      }),
      { mode: 0o600 },
    );
    process.env.APLYD_PORTAL_WORKSPACE_ENABLED = '1';
    process.env.APLYD_PORTAL_WORKSPACE_CONFIG = config;
    const server = startPortalWorkspaceSocket()!;
    const send = (payload: unknown) =>
      new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
        const req = httpRequest(
          { socketPath: socket, path: '/', method: 'POST', timeout: 4000 },
          (res) => {
            let body = '';
            res.on('data', (data) => {
              body += data;
            });
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode!, body: JSON.parse(body) });
              } catch (error) {
                reject(error);
              }
            });
          },
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('bounded test timeout')));
        req.end(JSON.stringify(payload));
      });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('socket readiness deadline')), 3000);
        server.once('listening', () => {
          clearTimeout(timer);
          resolve();
        });
        server.once('error', reject);
      });
      const preview = await send(f.request);
      expect(preview.status).toBe(200);
      const result = await send({ ...f.request, operation: 'apply', expected: preview.body });
      expect(result.status).toBe(200);
      expect(result.body.after).toEqual([
        { user_id: f.target.userId, role: 'member', source: 'invite' },
      ]);
      expect(
        (await send({ ...f.request, operation: 'apply', expected: preview.body })).status,
      ).toBe(409);
      expect((await send({ ...f.request, issuer: 'https://wrong.invalid' })).status).toBe(409);
      chmodSync(config, 0o644);
      expect((await send(f.request)).status).toBe(409);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      delete process.env.APLYD_PORTAL_WORKSPACE_ENABLED;
      delete process.env.APLYD_PORTAL_WORKSPACE_CONFIG;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
