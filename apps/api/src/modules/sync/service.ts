import { createHash } from 'node:crypto';
import { db, project, projectMember, teamMember, teamRole, revision } from '@repo/db';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { toMemberContext, type MemberRole } from '#modules/members/service';
import { workspaceGrants } from '#modules/workspaces/service';
import { hasPermission, type PermissionResource } from '#shared/permissions';
import { projectAccess, teamAccess } from '#shared/workspace-roles';
import type { TeamStanding } from '#modules/teams/service';

// Content counters come from migration 0070's triggers. Access markers below
// reflect current authority even when another process changes membership.

// A scope kind a client may ask for: the key it maps to in the revision table and
// the resource the caller must be allowed to read to watch it. Project-wide and
// entity scopes use the supplied id. The inbox is per user, so the session user is
// added to its key here; clients never send or see it, and it needs no permission.
export interface ScopeKind {
  key: (id: number, userId: string) => string;
  resource: PermissionResource | null;
}

export const scopeKind: Record<string, ScopeKind> = {
  workspaces: { key: (_id, userId) => `workspaces:${userId}`, resource: null },
  access: { key: (projectId) => `access:${projectId}`, resource: null },
  board: { key: (projectId) => `board:${projectId}`, resource: 'work_items' },
  documents: { key: (projectId) => `documents:${projectId}`, resource: 'documents' },
  issue: { key: (issueId) => `issue:${issueId}`, resource: 'work_items' },
  initiative: {
    key: (initiativeId) => `initiative:${initiativeId}`,
    resource: 'initiatives',
  },
  inbox: { key: (projectId, userId) => `inbox:${projectId}:${userId}`, resource: null },
};

// A scope with no row has never changed; a client treats it the same as any other
// unchanged value, so it reads as "0".
export const NO_REV = '0';

// One scope to read: its key in the revision table and the resource it belongs to.
export interface ScopeRead {
  key: string;
  resource: PermissionResource | null;
}

// The markers a client is watching. A scope of a project the user neither
// belongs to nor reaches through their workspace role returns no row and reads as
// unchanged. A scope whose resource their access may not read is dropped the same way,
// so it also reads as unchanged.
export async function readRevs(
  wanted: ScopeRead[],
  userId: string,
): Promise<Record<string, string>> {
  if (wanted.length === 0) return {};
  const grants = await workspaceGrants(userId);
  const grantedTeams = [...grants.keys()];
  const rows = await db
    .select({
      scope: revision.scope,
      rev: revision.rev,
      teamId: project.teamId,
      role: projectMember.role,
      permissions: teamRole.permissions,
    })
    .from(revision)
    .innerJoin(project, eq(project.id, revision.projectId))
    .leftJoin(
      projectMember,
      and(eq(projectMember.projectId, revision.projectId), eq(projectMember.userId, userId)),
    )
    .leftJoin(teamRole, eq(teamRole.id, projectMember.roleId))
    .where(
      and(
        inArray(
          revision.scope,
          wanted.map((w) => w.key),
        ),
        or(
          isNotNull(projectMember.userId),
          grantedTeams.length > 0 ? inArray(project.teamId, grantedTeams) : undefined,
        ),
      ),
    );

  const resources = new Map(wanted.map((w) => [w.key, w.resource]));
  const out: Record<string, string> = {};
  for (const row of rows) {
    const resource = resources.get(row.scope);
    if (resource) {
      const member = row.role ? toMemberContext(row.role as MemberRole, row.permissions) : null;
      const access = projectAccess(member, grants.get(row.teamId) ?? null);
      if (!access || !hasPermission(access.permissions, resource, 'read')) continue;
    }
    out[row.scope] = String(row.rev);
  }
  // Membership and role writes can come from the central portal without touching
  // content revisions. Hash the current effective authority in the shared poll.
  const accessIds = wanted
    .filter((w) => w.key.startsWith('access:'))
    .map((w) => Number(w.key.split(':')[1]));
  if (accessIds.length > 0) {
    const memberships = await db
      .select({
        id: project.id,
        teamId: project.teamId,
        role: projectMember.role,
        permissions: teamRole.permissions,
        teamStanding: teamMember.role,
      })
      .from(project)
      .leftJoin(
        projectMember,
        and(eq(projectMember.projectId, project.id), eq(projectMember.userId, userId)),
      )
      .leftJoin(teamRole, eq(teamRole.id, projectMember.roleId))
      .leftJoin(
        teamMember,
        and(eq(teamMember.teamId, project.teamId), eq(teamMember.userId, userId)),
      )
      .where(inArray(project.id, accessIds));
    for (const row of memberships) {
      const grant = grants.get(row.teamId) ?? null;
      const member = row.role ? toMemberContext(row.role as MemberRole, row.permissions) : null;
      const access = projectAccess(member, grant);
      // Missing and inaccessible projects have the same marker; no role data leaks.
      if (!access) continue;
      const team = teamAccess(row.teamStanding as TeamStanding | null, grant);
      out[`access:${row.id}`] = createHash('sha256')
        .update(JSON.stringify({ ...access, teamRole: team?.role ?? null }))
        .digest('hex');
    }
  }
  if (wanted.some((w) => w.key === `workspaces:${userId}`)) {
    const memberships = await db.execute(sql`
      SELECT t.workspace_id,t.id,t.name,m.role,m.source FROM team_member m
      JOIN team t ON t.id=m.team_id WHERE m.user_id=${userId} ORDER BY t.id`);
    const managers = await db.execute(sql`
      SELECT w.id,w.name,w.team_creation,m.role FROM workspace_manager m
      JOIN workspace w ON w.id=m.workspace_id WHERE m.user_id=${userId} ORDER BY w.id`);
    out[`workspaces:${userId}`] = createHash('sha256')
      .update(JSON.stringify({ memberships, managers }))
      .digest('hex');
  }
  return out;
}
