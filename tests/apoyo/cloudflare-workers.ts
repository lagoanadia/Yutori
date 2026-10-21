// Sustituto de `cloudflare:workers` para los tests: `env.DB` imita la interfaz de D1 que usa el proyecto,
// sobre una base SQLite en memoria con todas las migraciones aplicadas.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const carpeta = fileURLToPath(new URL('../../migrations/', import.meta.url));

type Valor = string | number | null;
const aValores = (p: unknown[]): Valor[] => p.map((v) => (v === undefined ? null : (v as Valor)));

class Sentencia {
  parametros: Valor[] = [];
  constructor(private base: DatabaseSync, readonly sql: string) {}
  bind(...p: unknown[]) {
    this.parametros = aValores(p);
    return this;
  }
  async first<T = unknown>(): Promise<T | null> {
    return ((this.base.prepare(this.sql).all(...this.parametros)[0] as T | undefined) ?? null);
  }
  async all<T = unknown>() {
    return { results: this.base.prepare(this.sql).all(...this.parametros) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.base.prepare(this.sql).run(...this.parametros);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

class D1Simulada {
  base = new DatabaseSync(':memory:');
  constructor() {
    this.base.exec('PRAGMA foreign_keys = ON');
    for (const f of readdirSync(carpeta).filter((n) => n.endsWith('.sql')).sort()) {
      this.base.exec(readFileSync(carpeta + f, 'utf8'));
    }
  }
  prepare(sql: string) {
    return new Sentencia(this.base, sql);
  }
  async batch(sentencias: Sentencia[]) {
    const r = [];
    for (const s of sentencias) r.push(await s.run());
    return r;
  }
  /** Para los tests: ejecuta SQL suelto (inserciones de preparación). */
  exec(sql: string) {
    this.base.exec(sql);
  }
}

export const env: Record<string, unknown> & { DB: D1Simulada } = { DB: new D1Simulada() };

/** Base limpia (migraciones aplicadas, con los datos iniciales de las migraciones) para cada test. */
export function reiniciarBase() {
  env.DB = new D1Simulada();
  return env.DB;
}

export const waitUntil = (_tarea: Promise<unknown>) => {};
