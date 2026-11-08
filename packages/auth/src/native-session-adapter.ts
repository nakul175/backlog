import type { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nativeLogoutEnabled, nativeSessionActive } from './native-session-status';

export function withNativeLogout(
  factory: ReturnType<typeof drizzleAdapter>,
): ReturnType<typeof drizzleAdapter> {
  return (options) => {
    const adapter = factory(options);
    return {
      ...adapter,
      async findOne<T>(query: Parameters<typeof adapter.findOne>[0]): Promise<T | null> {
        const result = await adapter.findOne<T>(query);
        if (!result || query.model !== 'session' || !nativeLogoutEnabled()) return result;
        // A projected result cannot prove the original session's identity or birth time.
        const session = query.select
          ? await adapter.findOne<{ userId: string; createdAt: Date }>({
              ...query,
              select: undefined,
            })
          : (result as { userId?: unknown; createdAt?: unknown });
        if (!session || typeof session.userId !== 'string' || !(session.createdAt instanceof Date))
          return null;
        return (await nativeSessionActive(session.userId, session.createdAt)) ? result : null;
      },
    };
  };
}
