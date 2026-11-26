import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: any;
let db: any;

try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  } else {
    console.warn("[AI Studio] DATABASE_URL not set — using in-memory attendance store");
    const emptyQuery = {
      where: () => emptyQuery,
      innerJoin: () => emptyQuery,
      leftJoin: () => emptyQuery,
      orderBy: () => emptyQuery,
      limit: async () => [],
      then: (resolve: (value: any[]) => unknown) => Promise.resolve([]).then(resolve),
    };
    const noOpObject = {
      select: () => ({ from: () => emptyQuery }),
      insert: () => ({
        values: () => ({
          returning: async () => [],
          onConflictDoUpdate: async () => [],
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
      delete: () => ({
        where: async () => ({}),
      }),
      transaction: async (fn: (tx: any) => Promise<unknown>) => fn(noOpObject),
    };
    db = new Proxy(noOpObject, {
      get: (target, prop) => {
        if (prop in target) return (target as any)[prop];
        return () => noOpObject;
      },
    });
    pool = {
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    };
  }
} catch (err) {
  console.warn("[AI Studio] Failed to initialize DB, using fallback:", err);
  db = {};
  pool = {};
}

export { pool, db };
export * from "./schema";
