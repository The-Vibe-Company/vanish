import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = readFileSync(new URL('../../src/db/schema.sql', import.meta.url), 'utf8');

type Value = string | number | bigint | null | Uint8Array;

/**
 * Minimal D1Database backed by an in-memory SQLite running the real schema.
 * Covers the subset the worker uses: prepare/bind/first/all/run and batch.
 */
export function createSqliteD1(): { d1: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);

  class Statement {
    args: Value[] = [];

    constructor(readonly sql: string) {}

    bind(...args: unknown[]): Statement {
      this.args = args.map(arg => (arg === undefined ? null : typeof arg === 'boolean' ? Number(arg) : arg) as Value);
      return this;
    }

    async first<T>(column?: string): Promise<T | null> {
      const row = sqlite.prepare(this.sql).get(...this.args) as Record<string, unknown> | undefined;
      if (!row) return null;
      return (column ? row[column] : { ...row }) as T;
    }

    async all<T>(): Promise<{ results: T[]; success: true }> {
      const rows = sqlite.prepare(this.sql).all(...this.args) as Record<string, unknown>[];
      return { results: rows.map(row => ({ ...row })) as T[], success: true };
    }

    async run(): Promise<{ success: true; meta: { changes: number } }> {
      const result = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }

  const d1 = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  };

  return { d1: d1 as unknown as D1Database, sqlite };
}

export { SCHEMA };
