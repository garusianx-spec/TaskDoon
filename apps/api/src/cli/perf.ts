/**
 * The M2 performance check (RFC §15): on 50 workspaces, 1M tasks and 5M subtasks, the board,
 * "my tasks", "due soon" and search read models must run on index scans with p95 under 50 ms.
 *
 *   PERF_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
 *     node dist/cli/perf.js --seed      # creates and fills the taskin_perf database (minutes)
 *     node dist/cli/perf.js --measure   # EXPLAIN (ANALYZE, BUFFERS) and p95 of each read model
 *
 * Seeding runs as taskin_migrator (bulk SQL); measuring runs the API's own query builders as
 * taskin_app with the tenant settings, row-level security included, exactly as requests do.
 */
import { performance } from 'node:perf_hooks';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { DEFAULT_PERMISSION_MATRIX, grantedCells, SYSTEM_ROLES } from '@taskin/contracts';
import { normaliseForSearch } from '@taskin/text';
import { cell } from '../modules/rbac/ability.js';
import { boardHeaderQuery, boardTasksQuery, detailQuery, listQuery, searchPattern } from '../modules/work/task-queries.js';
import { runMigrations } from '../platform/db/migrate.js';
import type { MembershipContext } from '../platform/http/request.js';

const DATABASE = 'taskin_perf';
const WORKSPACES = 50;
const MEMBERS = 25;
const PROJECTS = 20;
const TASKS_PER_PROJECT = 1000;
const SUBTASKS_PER_TASK = 5;
const SAMPLES = 200;
const P95_BUDGET_MS = 50;
/** Tables whose sequential scan would make a read model grow with the data. */
const BIG_TABLES = new Set(['tasks', 'subtasks', 'task_assignees', 'task_labels', 'task_comments', 'task_attachments', 'task_stars', 'project_members']);

const WORDS = [
  'گزارش', 'مالی', 'قرارداد', 'مشتری', 'سرور', 'طراحی', 'بازاریابی', 'جلسه', 'پرداخت', 'فاکتور', 'استخدام', 'آموزش',
  'پشتیبانی', 'انتشار', 'نسخه', 'امنیت', 'پایگاه', 'داده', 'رابط', 'کاربری', 'بودجه', 'فصلی', 'تحلیل', 'رقبا',
  'سئو', 'کمپین', 'تبلیغات', 'حسابرسی', 'مالیات', 'انبار', 'لجستیک', 'تامین', 'کیفیت', 'آزمون', 'خودکار', 'مستندات',
];

function url(base: string, database: string, role?: 'migrator' | 'app'): string {
  const parsed = new URL(base);
  parsed.pathname = `/${database}`;
  if (role) {
    parsed.username = role === 'app' ? 'taskin_app' : 'taskin_migrator';
    parsed.password = role === 'app' ? 'taskin_app' : 'taskin_migrator';
  }
  return parsed.toString();
}

async function seed(admin: string): Promise<void> {
  const root = new pg.Client({ connectionString: admin });
  await root.connect();
  await root.query(`drop database if exists ${DATABASE} with (force)`);
  await root.query(`create database ${DATABASE} owner taskin_migrator`);
  await root.query(`grant connect, temporary on database ${DATABASE} to taskin_app`);
  await root.end();
  await runMigrations(url(admin, DATABASE, 'migrator'));

  const db = new pg.Client({ connectionString: url(admin, DATABASE, 'migrator') });
  await db.connect();
  const step = async (label: string, statement: string, params: unknown[] = []) => {
    const started = performance.now();
    const result = await db.query(statement, params);
    console.log(`${label.padEnd(28)} ${String(result.rowCount ?? 0).padStart(9)} rows  ${((performance.now() - started) / 1000).toFixed(1)} s`);
  };
  const grants = SYSTEM_ROLES.filter((role) => !role.locked).flatMap((role) =>
    grantedCells(DEFAULT_PERMISSION_MATRIX[role.id]).map(({ module, action }) => `('${role.id}', '${module}', '${action}')`),
  );
  await db.query(`select setseed(0.42)`);
  await step('users', `
    insert into users (phone, phone_verified_at, full_name)
    select '+98935' || lpad(g::text, 7, '0'), now(), 'کاربر ' || g from generate_series(0, ${WORKSPACES * MEMBERS - 1}) g`);
  await db.query(`create temp table perf_users as select id, (substr(phone, 7))::int as n from users where phone like '+98935%'`);
  await step('workspaces', `
    insert into workspaces (slug, name, initials, tone, owner_user_id)
    select 'perf-' || w, 'فضای ' || w, 'فض', 'brand', (select id from perf_users where n = w * ${MEMBERS})
    from generate_series(0, ${WORKSPACES - 1}) w`);
  await db.query(`create temp table perf_ws as select id, (substr(slug, 6))::int as w from workspaces where slug like 'perf-%'`);
  await step('roles', `
    insert into roles (workspace_id, key, rank, is_system, is_locked)
    select ws.id, r.key, r.rank, true, r.key = 'owner' from perf_ws ws
    cross join (values ${SYSTEM_ROLES.map((role) => `('${role.id}', ${role.rank})`).join(', ')}) as r(key, rank)`);
  await step('role_permissions', `
    insert into role_permissions (workspace_id, role_id, module, action)
    select r.workspace_id, r.id, g.module::permission_module, g.action::permission_action
    from roles r join (values ${grants.join(', ')}) as g(key, module, action) on g.key = r.key
    where r.workspace_id in (select id from perf_ws)`);
  await step('members', `
    insert into workspace_members (workspace_id, user_id, role_id)
    select ws.id, u.id, r.id from perf_ws ws
    join perf_users u on u.n / ${MEMBERS} = ws.w
    join roles r on r.workspace_id = ws.id and r.key = case
      when u.n % ${MEMBERS} = 0 then 'owner' when u.n % ${MEMBERS} <= 2 then 'admin' when u.n % ${MEMBERS} <= 5 then 'manager'
      when u.n % ${MEMBERS} <= 20 then 'member' else 'guest' end`);
  await step('workflows', `insert into workflows (workspace_id, name) select id, 'پیش‌فرض' from perf_ws`);
  await step('board_columns', `
    insert into board_columns (workspace_id, workflow_id, title, status, is_builtin, position)
    select f.workspace_id, f.id, c.title, c.status::task_status, true, c.position from workflows f
    cross join (values ('برای انجام', 'todo', 'a0'), ('در حال انجام', 'in-progress', 'a1'), ('منتظر تایید', 'review', 'a2'), ('انجام شد', 'done', 'a3'))
      as c(title, status, position)
    where f.workspace_id in (select id from perf_ws)`);
  await step('projects', `
    insert into projects (workspace_id, key, name, visibility, workflow_id, created_by, task_seq)
    select ws.id, 'P' || p, 'پروژه ' || p, case when p < 2 then 'private' else 'workspace' end::project_visibility, f.id, w.owner_user_id, ${TASKS_PER_PROJECT}
    from perf_ws ws join workspaces w on w.id = ws.id join workflows f on f.workspace_id = ws.id
    cross join generate_series(0, ${PROJECTS - 1}) p`);
  await step('project_members', `
    insert into project_members (workspace_id, project_id, user_id, role)
    select pr.workspace_id, pr.id, m.user_id, case when u.n % ${MEMBERS} = 0 then 'lead' when u.n % ${MEMBERS} > 20 then 'viewer' else 'contributor' end::project_role
    from projects pr
    join workspace_members m on m.workspace_id = pr.workspace_id
    join perf_users u on u.id = m.user_id
    where pr.workspace_id in (select id from perf_ws)
      and ((pr.visibility = 'private' and u.n % ${MEMBERS} in (0, 6, 7, 8, 9, 10))
        or (pr.key = 'P2' and u.n % ${MEMBERS} > 20))`);
  await db.query(`create temp table perf_words as select array[${WORDS.map((word) => `'${word}'`).join(', ')}] as words`);
  await step('tasks', `
    insert into tasks (workspace_id, project_id, number, title, column_id, status, position, priority, start_date, due_date,
                       completed_at, created_by, search_text, created_at)
    select pr.workspace_id, pr.id, n, t.title,
      c.id, c.status, 'a' || lpad(to_hex(n), 5, '0'),
      (array['urgent', 'high', 'medium', 'low'])[1 + (n % 4)]::task_priority,
      t.start_date, t.start_date + (n * 7 % 45),
      case when c.status = 'done' then now() - make_interval(days => n % 200) end,
      pr.created_by, lower(pr.key || '-' || n || ' ' || t.title),
      now() - make_interval(days => (n * 13) % 365, secs => n)
    from projects pr
    cross join generate_series(1, ${TASKS_PER_PROJECT}) n
    cross join lateral (select
      (select words[1 + ((n * 7 + pr.task_seq) % ${WORDS.length})] || ' ' || words[1 + ((n * 11) % ${WORDS.length})] || ' ' || words[1 + ((n * 17 + 3) % ${WORDS.length})] from perf_words) as title,
      date '2026-01-01' + ((n * 37) % 330) as start_date) t
    join board_columns c on c.workflow_id = pr.workflow_id and c.position = 'a' || (n % 4)
    where pr.workspace_id in (select id from perf_ws)`);
  // One assignee per task, a second on every third task (members 1–20: admins, managers, members).
  await step('task_assignees', `
    insert into task_assignees (workspace_id, task_id, user_id)
    select t.workspace_id, t.id, u.id from tasks t
    join perf_ws ws on ws.id = t.workspace_id
    join perf_users u on u.n = ws.w * ${MEMBERS} + 1 + (t.number % 20)
    union all
    select t.workspace_id, t.id, u.id from tasks t
    join perf_ws ws on ws.id = t.workspace_id
    join perf_users u on u.n = ws.w * ${MEMBERS} + 1 + ((t.number + 7) % 20)
    where t.number % 3 = 0`);
  await step('subtasks', `
    insert into subtasks (workspace_id, task_id, title, done, position)
    select t.workspace_id, t.id, 'گام ' || s, s <= t.number % ${SUBTASKS_PER_TASK + 1}, 'a' || s
    from tasks t cross join generate_series(1, ${SUBTASKS_PER_TASK}) s`);
  await step('task_stars', `
    insert into task_stars (user_id, workspace_id, task_id)
    select a.user_id, a.workspace_id, a.task_id from task_assignees a where a.task_id::text like '%0'`);
  for (const table of ['users', 'workspaces', 'workspace_members', 'projects', 'project_members', 'tasks', 'task_assignees', 'subtasks', 'task_stars']) {
    await db.query(`vacuum analyze ${table}`);
  }
  await db.end();
  console.log(`seeded ${DATABASE}; check the search text is normalised: ${normaliseForSearch('كتاب') === 'کتاب'}`);
}

interface Sample {
  readonly member: MembershipContext;
  readonly projectId: string;
  readonly taskId: string;
  readonly code: string;
  readonly word: string;
}

function memberContext(workspaceId: string, userId: string, roleKey: 'member' | 'guest' | 'manager'): MembershipContext {
  return {
    workspaceId,
    userId,
    roleId: 'n/a',
    roleKey,
    rank: SYSTEM_ROLES.find((role) => role.id === roleKey)?.rank ?? 3,
    isOwner: false,
    ownerUserId: 'n/a',
    grants: grantedCells(DEFAULT_PERMISSION_MATRIX[roleKey]).map(({ module, action }) => cell(module, action)),
    rbacVersion: 1,
  };
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

function scans(node: PlanNode, into: string[] = []): string[] {
  if (node['Relation Name']) into.push(`${node['Node Type']} ${node['Relation Name']}${node['Index Name'] ? ` (${node['Index Name']})` : ''}`);
  else if (node['Index Name']) into.push(`${node['Node Type']} (${node['Index Name']})`);
  for (const child of node.Plans ?? []) scans(child, into);
  return into;
}

async function measure(admin: string): Promise<void> {
  const setup = new pg.Client({ connectionString: url(admin, DATABASE, 'migrator') });
  await setup.connect();
  const people = await setup.query<{ workspace_id: string; user_id: string; role: 'member' | 'guest' | 'manager' }>(`
    select m.workspace_id, m.user_id, r.key as role from workspace_members m join roles r on r.id = m.role_id
    where r.key in ('member', 'manager', 'guest')`);
  const projects = await setup.query<{ workspace_id: string; id: string; visibility: string }>(`select workspace_id, id, visibility from projects`);
  const tasks = await setup.query<{ workspace_id: string; project_id: string; id: string; code: string }>(`
    select t.workspace_id, t.project_id, t.id, p.key || '-' || t.number as code
    from tasks t tablesample bernoulli (2) join projects p on p.id = t.project_id where t.status <> 'done'`);
  await setup.end();

  const dialect = new PgDialect();
  const pool = new pg.Pool({ connectionString: url(admin, DATABASE, 'app'), max: 4 });
  const run = async (member: MembershipContext, query: SQL, explain = false) => {
    const { sql: text, params } = dialect.sqlToQuery(query);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true)`, [member.workspaceId, member.userId]);
      const started = performance.now();
      const result = await client.query(explain ? `explain (analyze, buffers, format json) ${text}` : text, params);
      const elapsed = performance.now() - started;
      await client.query('commit');
      return { elapsed, result };
    } finally {
      client.release();
    }
  };

  const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
  const samples: Sample[] = Array.from({ length: SAMPLES }, () => {
    const person = pick(people.rows.filter((row) => row.role !== 'guest'));
    const project = pick(projects.rows.filter((row) => row.workspace_id === person.workspace_id && row.visibility === 'workspace'));
    // Row sampling (not page sampling) leaves every project a few dozen tasks to open.
    const task = pick(tasks.rows.filter((row) => row.project_id === project.id)) ?? pick(tasks.rows.filter((row) => row.workspace_id === person.workspace_id));
    return {
      member: memberContext(person.workspace_id, person.user_id, person.role as 'member' | 'manager'),
      projectId: project.id,
      taskId: task.id,
      code: task.code,
      word: pick(WORDS),
    };
  });
  const now = new Date();
  const models: Record<string, (sample: Sample) => SQL> = {
    'board (tasks)': (s) => boardTasksQuery(s.member, s.projectId),
    'board (columns)': (s) => boardHeaderQuery(s.member, s.projectId),
    'my tasks': (s) => listQuery(s.member, { smart: 'my-tasks', limit: 50, now }),
    'due soon': (s) => listQuery(s.member, { smart: 'due-soon', limit: 50, now }),
    // A seeded word is in ~8% of titles: the planner rightly reads the visible projects' tasks.
    'search (common word)': (s) => listQuery(s.member, { smart: 'all', q: s.word, limit: 50, now }),
    // A task code is selective: the trigram index finds it.
    'search (task code)': (s) => listQuery(s.member, { smart: 'all', q: s.code, limit: 50, now }),
    'task detail': (s) => detailQuery(s.member, s.taskId),
  };

  const counts = new pg.Client({ connectionString: url(admin, DATABASE, 'migrator') });
  await counts.connect();
  const sizes = (await counts.query<{ tasks: string; subtasks: string; workspaces: string }>(
    `select (select count(*) from tasks) as tasks, (select count(*) from subtasks) as subtasks, (select count(*) from workspaces) as workspaces`,
  )).rows[0];
  await counts.end();
  console.log(`\n${sizes?.workspaces} workspaces, ${sizes?.tasks} tasks, ${sizes?.subtasks} subtasks; ${SAMPLES} samples per read model\n`);
  console.log('| Read model | p50 ms | p95 ms | max ms | min rows | Scans |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  let failed = false;
  for (const [name, build] of Object.entries(models)) {
    // Warm the cache the way a running API is warm, then time every sample.
    for (const sample of samples.slice(0, 20)) await run(sample.member, build(sample));
    const timings: number[] = [];
    let rows = Number.POSITIVE_INFINITY;
    for (const sample of samples) {
      const { elapsed, result } = await run(sample.member, build(sample));
      timings.push(elapsed);
      rows = Math.min(rows, result.rowCount ?? 0);
    }
    timings.sort((a, b) => a - b);
    const quantile = (q: number) => timings[Math.min(timings.length - 1, Math.floor(q * timings.length))] ?? 0;
    const first = samples[0] as Sample;
    const plan = (await run(first.member, build(first), true)).result.rows[0]?.['QUERY PLAN'] as { Plan: PlanNode }[];
    const nodes = plan?.[0] ? scans(plan[0].Plan) : [];
    const seq = nodes.filter((node) => node.startsWith('Seq Scan') && BIG_TABLES.has(node.split(' ')[2] ?? ''));
    // An empty result would time a miss, not the read model.
    const ok = seq.length === 0 && quantile(0.95) < P95_BUDGET_MS && rows > 0;
    failed ||= !ok;
    console.log(
      `| ${name} | ${quantile(0.5).toFixed(1)} | ${quantile(0.95).toFixed(1)} | ${(timings.at(-1) ?? 0).toFixed(1)} | ${rows} | ${[...new Set(nodes)].join('; ')} ${ok ? '' : '**FAIL**'} |`,
    );
  }
  await pool.end();

  // app.search_task_ids runs its lookup as the table owner, out of EXPLAIN's sight from the
  // caller: explain the same statement as the owner, for a selective and a common pattern.
  const owner = new pg.Client({ connectionString: url(admin, DATABASE, 'migrator') });
  await owner.connect();
  const first = samples[0] as Sample;
  console.log('\n| Search lookup (app.search_task_ids) | Pattern | ms | Rows | Scans |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const [name, q] of [['task code', first.code], ['common word', first.word]] as const) {
    const pattern = searchPattern(q) ?? '';
    const lookup = 'SELECT t.id FROM public.tasks t WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.search_text LIKE $2';
    const explained = await owner.query(`explain (analyze, format json) ${lookup}`, [first.member.workspaceId, pattern]);
    const [plan] = explained.rows[0]?.['QUERY PLAN'] as { Plan: PlanNode & { 'Actual Rows'?: number }; 'Execution Time': number }[];
    const nodes = plan ? scans(plan.Plan) : [];
    const ok = nodes.some((node) => node.includes('tasks_search_idx'));
    failed ||= !ok;
    console.log(`| ${name} | \`${pattern}\` | ${plan?.['Execution Time'].toFixed(1)} | ${plan?.Plan['Actual Rows'] ?? 0} | ${nodes.join('; ')} ${ok ? '' : '**FAIL**'} |`);
  }
  await owner.end();

  if (failed) {
    console.error(`\nA read model scanned a large table sequentially, returned nothing, missed the ${P95_BUDGET_MS} ms p95 budget, or search missed its trigram index.`);
    process.exit(1);
  }
  console.log(`\nEvery read model uses indexes and stays under ${P95_BUDGET_MS} ms at p95.`);
}

const admin = process.env.PERF_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
if (process.argv.includes('--seed')) await seed(admin);
if (process.argv.includes('--measure')) await measure(admin);
if (!process.argv.includes('--seed') && !process.argv.includes('--measure')) {
  console.error('usage: perf.js --seed | --measure');
  process.exit(64);
}
