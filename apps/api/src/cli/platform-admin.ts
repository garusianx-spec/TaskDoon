/**
 * `npm run platform-admin -- grant|revoke <phone>` and `npm run platform-admin -- list`: who is a
 * platform super admin. No API route can change this, by design: it takes a database connection
 * as the table owner (DATABASE_MIGRATOR_URL), i.e. an operator on the servers. Taking the flag
 * away works at once (the admin guard reads it on every request). Both changes are audited.
 */
import pg from 'pg';
import { toIranMobileE164 } from '../modules/auth/otp.service.js';

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) {
  console.error('DATABASE_MIGRATOR_URL is required (a connection as taskin_migrator).');
  process.exit(78);
}
const [command, rawPhone] = process.argv.slice(2);
const usage = 'usage: platform-admin grant <phone> | revoke <phone> | list';

const client = new pg.Client({ connectionString: url, application_name: 'taskin-cli:platform-admin' });
await client.connect();
try {
  if (command === 'list') {
    const { rows } = await client.query<{ phone: string; full_name: string; status: string }>(
      'select phone, full_name, status from users where is_platform_admin order by full_name',
    );
    for (const row of rows) console.log(`${row.phone}\t${row.full_name}\t${row.status}`);
    if (rows.length === 0) console.log('no platform admins');
  } else if ((command === 'grant' || command === 'revoke') && rawPhone) {
    const phone = toIranMobileE164(rawPhone);
    if (!phone) throw new Error(`not an Iranian mobile number: ${rawPhone}`);
    const flag = command === 'grant';
    await client.query('begin');
    const { rows } = await client.query<{ id: string; full_name: string }>(
      'update users set is_platform_admin = $2 where phone = $1 and deleted_at is null returning id, full_name',
      [phone, flag],
    );
    const user = rows[0];
    if (!user) throw new Error(`no account with ${phone}: the person signs up first`);
    await client.query(
      `insert into audit_logs (action, resource_type, resource_id, changes) values ($1, 'user', $2, $3)`,
      [flag ? 'platform.admin.grant' : 'platform.admin.revoke', user.id, JSON.stringify({ via: 'cli', osUser: process.env.USER ?? null })],
    );
    await client.query('commit');
    console.log(`${user.full_name} (${phone}) ${flag ? 'is now' : 'is no longer'} a platform admin`);
  } else {
    console.error(usage);
    process.exitCode = 64;
  }
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
