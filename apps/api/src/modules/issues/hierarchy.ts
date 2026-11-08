import { db, type DbExecutor } from '@repo/db';
import { sql } from 'drizzle-orm';

export async function issueTreeIds(ids: number[], executor: DbExecutor = db): Promise<number[]> {
  if (ids.length === 0) return [];
  const roots = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await executor.execute<{ id: number }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM issue WHERE id IN (${roots})
      UNION
      SELECT child.id FROM issue child JOIN tree ON child.parent_id = tree.id
    ) SELECT id FROM tree
  `);
  return rows.map((row) => row.id);
}
