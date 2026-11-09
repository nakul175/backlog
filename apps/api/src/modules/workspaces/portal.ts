import { createHash } from 'node:crypto';
import { getOidcConfig } from '@repo/auth';
import { db, teamMember, type DbExecutor } from '@repo/db';
import { sql } from 'drizzle-orm';
import { removeTeamMember, setTeamMemberRole } from '#modules/teams/service';
import { getLimits, getOwnedWorkspaceLimit } from '#shared/limits';
import { HttpError } from '#shared/lib';
import { transferWorkspace } from './service';

export interface PortalScope {
  reviewers: string[];
  workspaces: number[];
  teams: Record<string, number>;
  revision: string;
  current: () => boolean;
}
export interface PortalScopeRequest {
  operation: 'preview' | 'apply';
  actor: string;
  target: string;
  issuer: string;
  actorSubject: string;
  targetSubject: string;
  kind: 'workspace' | 'team';
  resourceId: number;
  choice: 'transfer' | 'enroll' | 'member' | 'manager' | 'revoke';
  expected?: Record<string, unknown>;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const held = () => new HttpError(409, 'Native workspace review changed or unavailable');

async function snapshot(tx: DbExecutor, cfg: PortalScope, r: PortalScopeRequest) {
  const oidc = await getOidcConfig();
  if (
    process.env.APLYD_CENTRAL_OIDC_ENABLED !== 'true' ||
    !oidc.enabled ||
    r.issuer !== process.env.APLYD_ACCOUNTS_ISSUER ||
    oidc.discoveryUrl !== r.issuer + '/.well-known/openid-configuration' ||
    oidc.clientId !== process.env.APLYD_ACCOUNTS_CLIENT_ID ||
    !oidc.pkce ||
    oidc.clientSecret.length < 32 ||
    !oidc.scopes.includes('openid') ||
    !oidc.scopes.includes('aplyd')
  )
    throw held();
  if (!cfg.current() || r.actor === r.target || !cfg.reviewers.includes(r.actor)) throw held();
  const workspaceId = r.kind === 'workspace' ? r.resourceId : cfg.teams[String(r.resourceId)];
  if (!workspaceId || !cfg.workspaces.includes(workspaceId)) throw held();
  const people = await tx.execute(
    sql`SELECT id,name,role,active,xmin::text FROM public.user WHERE id IN (${r.actor},${r.target}) ORDER BY id`,
  );
  if (
    people.length !== 2 ||
    people.some((p) => p.active !== true) ||
    people.find((p) => p.id === r.target)?.role !== 'user'
  )
    throw held();
  const identities = await tx.execute(
    sql`SELECT user_id,account_id,xmin::text FROM account WHERE provider_id='oidc' AND (user_id IN (${r.actor},${r.target}) OR account_id IN (${r.actorSubject},${r.targetSubject})) ORDER BY user_id,account_id`,
  );
  if (
    identities.length !== 2 ||
    !identities.some((p) => p.user_id === r.actor && p.account_id === r.actorSubject) ||
    !identities.some((p) => p.user_id === r.target && p.account_id === r.targetSubject)
  )
    throw held();
  if (
    (
      await tx.execute(
        sql`SELECT 1 FROM ai_agent WHERE user_id IN (${r.actor},${r.target}) LIMIT 1`,
      )
    ).length ||
    (
      await tx.execute(
        sql`SELECT 1 FROM scim_user WHERE user_id IN (${r.actor},${r.target}) AND (workspace_id IS NULL OR workspace_id=${workspaceId}) LIMIT 1`,
      )
    ).length
  )
    throw held();
  const spaces = await tx.execute(
    sql`SELECT id,name,xmin::text FROM workspace WHERE id=${workspaceId}`,
  );
  if (spaces.length !== 1) throw held();
  const managers = await tx.execute(
    sql`SELECT workspace_id,user_id,role,xmin::text FROM workspace_manager WHERE workspace_id=${workspaceId} OR user_id=${r.target} ORDER BY workspace_id,user_id`,
  );
  if (
    r.kind === 'team' &&
    managers.some((m) => m.workspace_id === workspaceId && m.user_id === r.target)
  )
    throw held();
  const owners = managers.filter((m) => m.workspace_id === workspaceId && m.role === 'owner');
  if (owners.length !== 1 || owners[0]!.user_id !== r.actor) throw held();
  const teams = await tx.execute(
    sql`SELECT id,name,workspace_id,xmin::text FROM team WHERE workspace_id=${workspaceId} ORDER BY id`,
  );
  if (r.kind === 'team' && !teams.some((t) => t.id === r.resourceId)) throw held();
  const members = await tx.execute(
    sql`SELECT m.team_id,m.user_id,m.role,m.source,m.xmin::text FROM team_member m JOIN team t ON t.id=m.team_id WHERE t.workspace_id=${workspaceId} ORDER BY m.team_id,m.user_id`,
  );
  const targetMembers = members.filter((m) => m.user_id === r.target);
  if (targetMembers.some((m) => m.source !== 'invite' || m.role === 'agent')) throw held();
  const projects = await tx.execute(
    sql`SELECT p.id,p.name,p.team_id,p.xmin::text FROM project p JOIN team t ON t.id=p.team_id WHERE t.workspace_id=${workspaceId} ORDER BY p.id`,
  );
  const grants = await tx.execute(
    sql`SELECT m.project_id,m.user_id,m.role,m.role_id,m.source,m.xmin::text FROM project_member m JOIN project p ON p.id=m.project_id JOIN team t ON t.id=p.team_id WHERE t.workspace_id=${workspaceId} AND m.user_id=${r.target} ORDER BY m.project_id`,
  );
  if (grants.some((g) => g.source !== 'invite')) throw held();
  const invites = await tx.execute(
    sql`SELECT i.id,i.team_id,i.project_id,i.team_role,i.project_role,i.role_id,i.status,i.xmin::text FROM team_invite i JOIN team t ON t.id=i.team_id WHERE t.workspace_id=${workspaceId} AND i.status='pending' ORDER BY i.id`,
  );
  const limits = await getLimits(workspaceId);
  const ownershipLimit = getOwnedWorkspaceLimit();
  const currentRole =
    r.kind === 'workspace'
      ? (managers.find((m) => m.workspace_id === workspaceId && m.user_id === r.target)?.role ??
        'none')
      : (targetMembers.find((m) => m.team_id === r.resourceId)?.role ?? 'none');
  if (r.kind === 'workspace') {
    if (
      r.choice !== 'transfer' ||
      currentRole !== 'admin' ||
      !targetMembers.length ||
      (ownershipLimit > 0 &&
        managers.filter((m) => m.user_id === r.target && m.role === 'owner').length >=
          ownershipLimit)
    )
      throw held();
  } else if (r.choice === 'enroll') {
    if (
      currentRole !== 'none' ||
      grants.some((g) =>
        projects.some((p) => p.team_id === r.resourceId && p.id === g.project_id),
      ) ||
      invites.some((i) => i.team_id === r.resourceId)
    )
      throw held();
    const humans = new Set(members.filter((m) => m.role !== 'agent').map((m) => m.user_id));
    if (limits.maxSeats > 0 && !humans.has(r.target) && humans.size >= limits.maxSeats)
      throw held();
  } else if (
    !['member', 'manager', 'revoke'].includes(r.choice) ||
    !['member', 'manager'].includes(String(currentRole))
  )
    throw held();
  return {
    actor: r.actor,
    target: r.target,
    kind: r.kind,
    resourceId: r.resourceId,
    workspaceId,
    workspaceName: spaces[0]!.name,
    choice: r.choice,
    currentRole,
    projects: projects.map((p) => ({ id: p.id, name: p.name, teamId: p.team_id })),
    revision: digest([
      cfg.revision,
      digest(oidc),
      r.issuer,
      people,
      identities,
      spaces,
      managers,
      teams,
      members,
      projects,
      grants,
      invites,
      limits,
      ownershipLimit,
    ]),
  };
}

async function lockReview(tx: DbExecutor) {
  await tx.execute(sql`SET LOCAL statement_timeout='10000'`);
  await tx.execute(sql`SET LOCAL lock_timeout='3000'`);
  await tx.execute(
    sql`LOCK TABLE workspace_manager,team_member,project_member,team_invite,project_column IN SHARE ROW EXCLUSIVE MODE`,
  );
  await tx.execute(
    sql`LOCK TABLE public.user,workspace,team,project,account,app_secret,ai_agent,scim_user IN SHARE MODE`,
  );
}

export async function portalWorkspaceChange(cfg: PortalScope, r: PortalScopeRequest) {
  if (!['preview', 'apply'].includes(r.operation)) throw held();
  if (r.operation === 'preview') return db.transaction((tx) => snapshot(tx, cfg, r));
  let before: Awaited<ReturnType<typeof snapshot>> | undefined;
  const review = async (tx: DbExecutor) => {
    await lockReview(tx);
    before = await snapshot(tx, cfg, r);
    if (digest(before) !== digest(r.expected) || !cfg.current()) throw held();
  };
  if (r.kind === 'workspace') await transferWorkspace(r.resourceId, r.actor, r.target, review);
  else if (r.choice === 'enroll')
    await db.transaction(async (tx) => {
      await review(tx);
      await tx
        .insert(teamMember)
        .values({ teamId: r.resourceId, userId: r.target, role: 'member', source: 'invite' });
    });
  else if (r.choice === 'revoke') await removeTeamMember(r.resourceId, r.actor, r.target, review);
  else if (r.choice === 'member' || r.choice === 'manager')
    await setTeamMemberRole(
      r.resourceId,
      { userId: r.actor, role: 'owner' },
      r.target,
      r.choice,
      review,
    );
  else throw held();
  if (!before) throw held();
  const rows =
    r.kind === 'workspace'
      ? await db.execute(
          sql`SELECT user_id,role FROM workspace_manager WHERE workspace_id=${r.resourceId} AND user_id IN (${r.actor},${r.target}) ORDER BY user_id`,
        )
      : await db.execute(
          sql`SELECT user_id,role,source FROM team_member WHERE team_id=${r.resourceId} AND user_id=${r.target}`,
        );
  return { before, after: rows };
}
