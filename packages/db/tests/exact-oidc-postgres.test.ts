import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/schema';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { lookupExactOidcIdentity } from '../../auth/src/exact-oidc-identity';

// A separate empty throwaway DB is required. Never uses the application DB by default.
const enabled = process.env.APLYD_EXACT_OIDC_TEST === 'true';
describe.skipIf(!enabled)('exact OIDC native database identity', () => {
  let client: ReturnType<typeof postgres>;
  let database: typeof import('@repo/db').db;
  let sql: typeof import('drizzle-orm').sql;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!/^\/btf_exact_oidc_test_[a-f0-9]+$/.test(url.pathname))
      throw new Error('Dedicated disposable database required.');
    const ca = process.env.APLYD_EXACT_OIDC_TEST_CA;
    client = postgres(url.toString(), {
      prepare: false,
      connect_timeout: 5,
      idle_timeout: 2,
      ...(ca
        ? { ssl: { ca: readFileSync(ca, 'utf8'), servername: 'db', rejectUnauthorized: true } }
        : {}),
    });
    database = drizzle(client, { schema });
    ({ sql } = await import('drizzle-orm'));
    await database.execute(
      sql.raw(`CREATE TABLE public.user(id text PRIMARY KEY, active boolean);
      CREATE TABLE account(id text PRIMARY KEY, user_id text REFERENCES public.user(id), provider_id text, account_id text);
      CREATE TABLE ai_agent(id serial PRIMARY KEY, user_id text);
      INSERT INTO public.user VALUES('person',true),('other',true),('bot',true);
      INSERT INTO account VALUES('link','person','oidc','exact-subject');`),
    );
  });
  afterAll(async () => {
    try {
      if (database) await database.execute(sql.raw('DROP TABLE ai_agent, account, public.user'));
    } finally {
      await client?.end({ timeout: 2 });
    }
  });
  it('resolves the exact existing account and never uses an email lookup', async () => {
    expect((await lookupExactOidcIdentity(database, 'exact-subject'))?.id).toBe('person');
    expect(await lookupExactOidcIdentity(database, 'absent')).toBeNull();
  });
  it('rejects inactive accounts and changes the revision on native mutation', async () => {
    const before = await lookupExactOidcIdentity(database, 'exact-subject');
    await database.execute(sql`UPDATE public.user SET active=false WHERE id='person'`);
    expect(await lookupExactOidcIdentity(database, 'exact-subject')).toBeNull();
    await database.execute(sql`UPDATE public.user SET active=true WHERE id='person'`);
    expect((await lookupExactOidcIdentity(database, 'exact-subject'))?.revision).not.toBe(
      before?.revision,
    );
  });
  it('rejects ambiguous subjects even when one duplicate is an agent', async () => {
    await database.execute(sql`INSERT INTO ai_agent(user_id) VALUES('bot')`);
    await database.execute(
      sql`INSERT INTO account VALUES('duplicate','bot','oidc','exact-subject')`,
    );
    expect(await lookupExactOidcIdentity(database, 'exact-subject')).toBeNull();
    await database.execute(sql`DELETE FROM account WHERE id='duplicate'`);
    await database.execute(sql`UPDATE account SET user_id='bot' WHERE id='link'`);
    expect(await lookupExactOidcIdentity(database, 'exact-subject')).toBeNull();
  });
});
