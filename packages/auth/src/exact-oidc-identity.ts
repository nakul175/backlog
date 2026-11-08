import type { db } from '@repo/db';
import * as schema from '@repo/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { ExactIdentity } from './exact-oidc';

export async function lookupExactOidcIdentity(
  database: Pick<typeof db, 'select'>,
  subject: string,
): Promise<ExactIdentity | null> {
  const rows = await database
    .select({
      id: schema.user.id,
      active: schema.user.active,
      agentId: schema.aiAgent.id,
      revision: sql<string>`concat(${schema.account.id}, ':', ${schema.account}.xmin::text, ':', ${schema.user}.xmin::text)`,
    })
    .from(schema.account)
    .innerJoin(schema.user, eq(schema.user.id, schema.account.userId))
    .leftJoin(schema.aiAgent, eq(schema.aiAgent.userId, schema.user.id))
    .where(and(eq(schema.account.providerId, 'oidc'), eq(schema.account.accountId, subject)))
    .limit(2);
  return rows.length === 1 && rows[0]!.active !== false && rows[0]!.agentId === null
    ? { id: rows[0]!.id, revision: rows[0]!.revision }
    : null;
}
