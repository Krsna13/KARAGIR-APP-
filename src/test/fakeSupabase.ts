/**
 * In-memory stand-in for the Supabase client, used ONLY by tests.
 *
 * MOCK BOUNDARY: this replaces `supabase` from src/lib/supabase/client.ts.
 * It implements the subset of the query builder our services use
 * (select/insert/update/delete, eq, order, single, maybeSingle) plus
 * storage upload/remove/getPublicUrl and auth.getUser.
 *
 * It does NOT run Postgres: no RLS, no triggers, no real indexes. Tests that
 * need the DB constraints (max 5 images, one cover per product) opt in via
 * `invariants`, which is a JS re-statement of those rules, not the SQL itself.
 */
type Row = Record<string, any>;
type Result = { data: any; error: { message: string } | null };

export interface FakeCall {
  kind: 'select' | 'insert' | 'update' | 'delete' | 'upload' | 'remove';
  target: string; // table or bucket
  payload?: unknown;
  filters?: Array<[string, unknown]>;
}

class Query implements PromiseLike<Result> {
  private filters: Array<[string, unknown]> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private returning = false;
  private fake: FakeSupabase;
  private table: string;
  private op: 'select' | 'insert' | 'update' | 'delete';
  private payload?: Row;

  constructor(
    fake: FakeSupabase,
    table: string,
    op: 'select' | 'insert' | 'update' | 'delete',
    payload?: Row
  ) {
    this.fake = fake;
    this.table = table;
    this.op = op;
    this.payload = payload;
  }

  select(_columns?: string) {
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push([col, value]);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: opts.ascending !== false };
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve()
      .then(() => this.fake.hooks.beforeQuery?.(this.table, this.op))
      .then(() => this.exec())
      .then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every(([col, value]) => row[col] === value);
  }

  private shape(rows: Row[]): Result {
    const copies = rows.map((r) => ({ ...r }));
    if (this.mode === 'many') return { data: copies, error: null };
    if (copies.length === 0) {
      return this.mode === 'maybe'
        ? { data: null, error: null }
        : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    return { data: copies[0], error: null };
  }

  private exec(): Result {
    const fake = this.fake;
    fake.calls.push({ kind: this.op, target: this.table, payload: this.payload, filters: [...this.filters] });

    const failure = fake.takeFailure(this.table, this.op);
    if (failure) return { data: null, error: { message: failure } };

    const table = (fake.tables[this.table] ??= []);

    if (this.op === 'select') {
      let rows = table.filter((r) => this.matches(r));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      return this.shape(rows);
    }

    const snapshot = fake.snapshot();
    let affected: Row[] = [];

    if (this.op === 'insert') {
      const row = { created_at: new Date().toISOString(), ...this.payload };
      table.push(row);
      affected = [row];
    } else if (this.op === 'update') {
      affected = table.filter((r) => this.matches(r));
      affected.forEach((r) => Object.assign(r, this.payload));
    } else {
      affected = table.filter((r) => this.matches(r));
      fake.tables[this.table] = table.filter((r) => !this.matches(r));
      fake.hooks.onDelete?.(this.table, affected);
    }

    const violation = fake.invariants?.(fake.tables);
    if (violation) {
      fake.tables = snapshot;
      return { data: null, error: { message: violation } };
    }

    return this.returning ? this.shape(affected) : { data: null, error: null };
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  storage: Map<string, Blob> = new Map(); // key: `${bucket}/${path}`
  calls: FakeCall[] = [];
  invariants: ((tables: Record<string, Row[]>) => string | null) | null = null;
  hooks: {
    beforeQuery?: (table: string, op: string) => void | Promise<void>;
    onDelete?: (table: string, rows: Row[]) => void;
  } = {};
  authUserId: string | null = null;
  /**
   * Edge Function boundary (supabase.functions.invoke). Tests assign a vi.fn();
   * unset -> every invoke fails, so no test can reach a real function by accident.
   */
  functionsInvoke: ((name: string, options?: { body?: unknown }) => Promise<{ data: unknown; error: unknown }>) | null =
    null;
  private failures: Array<{ target: string; op: string; message: string }> = [];

  reset(tables: Record<string, Row[]> = {}) {
    this.tables = JSON.parse(JSON.stringify(tables));
    this.storage = new Map();
    this.calls = [];
    this.invariants = null;
    this.hooks = {};
    this.authUserId = null;
    this.functionsInvoke = null;
    this.failures = [];
  }

  /** Makes the next matching operation return `{ error: { message } }`. */
  failNext(target: string, op: FakeCall['kind'], message: string) {
    this.failures.push({ target, op, message });
  }

  takeFailure(target: string, op: string): string | null {
    const idx = this.failures.findIndex((f) => f.target === target && f.op === op);
    if (idx === -1) return null;
    return this.failures.splice(idx, 1)[0].message;
  }

  snapshot(): Record<string, Row[]> {
    return Object.fromEntries(Object.entries(this.tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  readonly client = {
    from: (table: string) => ({
      select: (columns?: string) => new Query(this, table, 'select').select(columns),
      insert: (payload: Row) => new Query(this, table, 'insert', payload),
      update: (payload: Row) => new Query(this, table, 'update', payload),
      delete: () => new Query(this, table, 'delete'),
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, blob: Blob, _opts?: unknown) => {
          this.calls.push({ kind: 'upload', target: bucket, payload: path });
          const failure = this.takeFailure(bucket, 'upload');
          if (failure) return { data: null, error: { message: failure } };
          this.storage.set(`${bucket}/${path}`, blob);
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          this.calls.push({ kind: 'remove', target: bucket, payload: [...paths] });
          const failure = this.takeFailure(bucket, 'remove');
          if (failure) return { data: null, error: { message: failure } };
          paths.forEach((p) => this.storage.delete(`${bucket}/${p}`));
          return { data: [], error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://fake.storage/${bucket}/${path}` },
        }),
      }),
    },
    auth: {
      getUser: async () => ({ data: { user: this.authUserId ? { id: this.authUserId } : null }, error: null }),
    },
    functions: {
      invoke: async (name: string, options?: { body?: unknown }) => {
        if (!this.functionsInvoke) {
          return { data: null, error: new Error(`fakeSupabase: no functionsInvoke handler for '${name}'`) };
        }
        return this.functionsInvoke(name, options);
      },
    },
  };
}

/**
 * Shape of the error supabase-js returns for a non-2xx Edge Function
 * response (FunctionsHttpError): `context` is the Response.
 */
export function fakeFunctionsHttpError(status: number, body: Record<string, unknown>) {
  const error = new Error('Edge Function returned a non-2xx status code') as Error & {
    context: { status: number; json: () => Promise<Record<string, unknown>> };
  };
  error.context = { status, json: async () => body };
  return error;
}

/** JS re-statement of the product_images DB rules (trigger + partial unique index) for tests. */
export function productImageInvariants(tables: Record<string, Row[]>): string | null {
  const byProduct = new Map<string, Row[]>();
  for (const row of tables.product_images ?? []) {
    byProduct.set(row.product_id, [...(byProduct.get(row.product_id) ?? []), row]);
  }
  for (const [productId, rows] of byProduct) {
    if (rows.length > 5) return `product_images limit exceeded: product ${productId} already has 5 images`;
    if (rows.filter((r) => r.is_cover).length > 1) {
      return 'duplicate key value violates unique constraint "product_images_one_cover_per_product"';
    }
  }
  return null;
}

/** Shared instance: vi.mock factories and test bodies import the same object. */
export const fakeSupabase = new FakeSupabase();
