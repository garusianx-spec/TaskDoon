import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const SNAPSHOT_FILE = fileURLToPath(new URL('../../../db/schema.snapshot.txt', import.meta.url));

/**
 * A text rendering of the migrated schema, read from the catalog: tables and columns, constraints,
 * indexes, row-level security, policies, triggers, functions and grants for `taskin_app`.
 * Committed next to the migrations and compared in CI, so a migration that changes more (or less)
 * than intended shows up as a diff. Function bodies are left out; their signatures are kept.
 */
export async function schemaSnapshot(url: string): Promise<string> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const sections: [string, string][] = [
      [
        'columns',
        `select c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                || case when a.attnotnull then ' not null' else '' end
                || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
                || case when a.attidentity <> '' then ' identity' else '' end
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
         where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
           and c.relname not like 'audit_logs\\_%'
         order by 1`,
      ],
      [
        'constraints',
        `select c.relname || ' ' || con.conname || ': ' || pg_get_constraintdef(con.oid)
         from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname not like 'audit_logs\\_%' order by 1`,
      ],
      [
        'indexes',
        `select tablename || ' ' || indexdef from pg_indexes
         where schemaname = 'public' and tablename not like 'audit_logs\\_%' order by 1`,
      ],
      [
        'row level security',
        `select c.relname || ' enabled=' || c.relrowsecurity || ' forced=' || c.relforcerowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not like 'audit_logs\\_%' order by 1`,
      ],
      [
        'policies',
        `select tablename || ' ' || policyname || ' ' || cmd || ' using(' || coalesce(qual, '') || ') check(' || coalesce(with_check, '') || ')'
         from pg_policies where schemaname = 'public' order by 1`,
      ],
      [
        'triggers',
        `select c.relname || ' ' || t.tgname || ' -> ' || p.proname
         from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and not t.tgisinternal order by 1`,
      ],
      [
        'functions',
        `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') '
                || case when p.prosecdef then 'security definer' else 'invoker' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' order by 1`,
      ],
      [
        'grants to taskin_app',
        `select table_name || ' ' || string_agg(privilege_type, ',' order by privilege_type)
         from information_schema.role_table_grants
         where grantee = 'taskin_app' and table_schema = 'public' and table_name not like 'audit_logs\\_%'
         group by table_name order by 1`,
      ],
    ];
    const parts: string[] = [];
    for (const [title, query] of sections) {
      const { rows } = await client.query<{ '?column?': string }>(query);
      parts.push(`## ${title}`, ...rows.map((row) => Object.values(row)[0] as string), '');
    }
    return parts.join('\n');
  } finally {
    await client.end();
  }
}
