/**
 * LOCAL_STORE=1 → file-backed JSON database with the subset of the
 * supabase-js query builder this app uses. Lets the whole app run
 * offline (local dev / preview) without a Supabase service key.
 *
 * Production (Vercel) never sets LOCAL_STORE and uses real Supabase.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

const FILE = join(process.cwd(), '.local-store', 'db.json');
const TABLES = ['settings', 'products', 'content', 'events', 'connections', 'chat_messages', 'pipeline_jobs'] as const;
type Table = (typeof TABLES)[number];

type Row = Record<string, any>;

interface DbShape {
  [table: string]: Row[];
}

function load(): DbShape {
  try {
    if (existsSync(FILE)) {
      const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
      for (const t of TABLES) if (!Array.isArray(parsed[t])) parsed[t] = [];
      return parsed;
    }
  } catch {
    /* corrupted file → start fresh */
  }
  const fresh: DbShape = {};
  for (const t of TABLES) fresh[t] = [];
  return fresh;
}

function save(db: DbShape): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, FILE);
}

// Always read fresh from disk: the Next route bundle and the Fastify
// bridge are separate module instances sharing this one file.
function getDb(): DbShape {
  return load();
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function err(message: string, code?: string) {
  return { message, code, details: '', hint: '' };
}

function ilike(rowVal: unknown, pattern: string): boolean {
  const needle = pattern.replace(/%/g, '').toLowerCase();
  return String(rowVal ?? '')
    .toLowerCase()
    .includes(needle);
}

class LocalQuery {
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private returning = false;
  private expect: 'single' | 'maybe' | null = null;
  private countOnly = false;
  private filters: ((row: Row) => boolean)[] = [];
  private orGroup: ((row: Row) => boolean) | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private embedProducts = false;

  constructor(private table: Table) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode === 'select') {
      if (cols && cols.includes('products:product_id')) this.embedProducts = true;
      if (opts?.count === 'exact' && opts?.head) this.countOnly = true;
    } else {
      this.returning = true;
      if (cols && cols.includes('products:product_id')) this.embedProducts = true;
    }
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.payload = rows;
    return this;
  }

  update(patch: Row) {
    this.mode = 'update';
    this.payload = patch;
    return this;
  }

  upsert(row: Row, opts?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.payload = row;
    (this as any)._onConflict = opts?.onConflict;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }

  in(col: string, vals: unknown[]) {
    const set = new Set(vals);
    this.filters.push((r) => set.has(r[col]));
    return this;
  }

  gte(col: string, val: unknown) {
    this.filters.push((r) => String(r[col] ?? '') >= String(val));
    return this;
  }

  lte(col: string, val: unknown) {
    this.filters.push((r) => String(r[col] ?? '') <= String(val));
    return this;
  }

  /** e.g. "title.ilike.%foo%,description.ilike.%foo%" — OR across clauses */
  or(expr: string) {
    const clauses = expr.split(',').map((part) => {
      const [col, op, ...rest] = part.split('.');
      const value = rest.join('.');
      return (r: Row) => {
        if (op === 'ilike') return ilike(r[col], value);
        if (op === 'like') return String(r[col] ?? '').includes(value.replace(/%/g, ''));
        if (op === 'eq') return r[col] === value;
        if (op === 'neq') return r[col] !== value;
        if (op === 'gt') return String(r[col] ?? '') > value;
        if (op === 'lt') return String(r[col] ?? '') < value;
        return false;
      };
    });
    const prev = this.orGroup;
    this.orGroup = (r) => clauses.some((c) => c(r)) || (prev ? prev(r) : false);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  single() {
    this.expect = 'single';
    return this;
  }

  maybeSingle() {
    this.expect = 'maybe';
    return this;
  }

  /* ------------------------------ execution ----------------------------- */

  private match(rows: Row[]): Row[] {
    let out = rows.filter((r) => this.filters.every((f) => f(r)) && (!this.orGroup || this.orGroup(r)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => {
        const av = a[col] ?? '';
        const bv = b[col] ?? '';
        return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }

  private embed(rows: Row[]): Row[] {
    if (!this.embedProducts) return rows;
    const products = getDb().products;
    return rows.map((r) => ({
      ...r,
      products: r.product_id ? (products.find((p) => p.id === r.product_id) ?? null) : null,
    }));
  }

  private run(): { data: any; error: any; count: number | null } {
    const db = getDb();
    const table = db[this.table] ?? (db[this.table] = []);

    if (this.mode === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted: Row[] = [];
      for (const raw of rows) {
        const now = new Date().toISOString();
        const row: Row = { id: uuid(), created_at: now, ...raw };
        // Mirror Postgres column defaults
        if (this.table === 'events' && !row.occurred_at) row.occurred_at = now;
        if (!row.updated_at && ['settings', 'connections', 'content', 'products', 'pipeline_jobs'].includes(this.table)) {
          row.updated_at = now;
        }
        // unique short_code
        if (row.short_code && table.some((t) => t.short_code === row.short_code)) {
          return { data: null, error: err('duplicate short_code', '23505'), count: null };
        }
        table.push(row);
        inserted.push(row);
      }
      save(db);
      if (!this.returning) return { data: null, error: null, count: null };
      const data = this.embed(inserted);
      return { data: this.expect === 'single' ? data[0] ?? null : data, error: null, count: null };
    }

    if (this.mode === 'upsert') {
      const row = this.payload;
      const cols = String((this as any)._onConflict ?? 'id').split(',');
      const idx = table.findIndex((t) => cols.every((c: string) => t[c] === row[c]));
      if (idx >= 0) {
        table[idx] = { ...table[idx], ...row, updated_at: new Date().toISOString() };
      } else {
        table.push({ id: uuid(), created_at: new Date().toISOString(), ...row });
      }
      save(db);
      return { data: null, error: null, count: null };
    }

    if (this.mode === 'update') {
      const targets = this.match(table);
      for (const t of targets) Object.assign(t, this.payload);
      save(db);
      return { data: null, error: null, count: null };
    }

    if (this.mode === 'delete') {
      const targets = new Set(this.match(table));
      db[this.table] = table.filter((t) => !targets.has(t));
      save(db);
      return { data: null, error: null, count: null };
    }

    // select
    const matched = this.match(table);
    if (this.countOnly) return { data: null, error: null, count: matched.length };
    const data = this.embed(matched);
    if (this.expect === 'single') {
      if (!data.length) return { data: null, error: err('no rows returned', 'PGRST116'), count: null };
      return { data: data[0], error: null, count: null };
    }
    if (this.expect === 'maybe') return { data: data[0] ?? null, error: null, count: null };
    return { data, error: null, count: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled as any, onrejected as any);
    } catch (e) {
      return Promise.reject(e).then(onfulfilled as any, onrejected as any);
    }
  }
}

export function createLocalClient() {
  return {
    from(table: string) {
      return new LocalQuery(table as Table);
    },
    rpc() {
      return { then: (res: any) => Promise.resolve({ data: null, error: null }).then(res) };
    },
  } as any;
}
