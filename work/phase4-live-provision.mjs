import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
const root='C:/Users/garus/OneDrive/Desktop/taskin';
const pg=createRequire(root+'/package.json')('pg');
const {runMigrations}=await import(pathToFileURL(root+'/apps/api/dist/platform/db/migrate.js'));
const database='phase4_live_'+randomBytes(5).toString('hex');
const admin=new pg.Client({connectionString:'postgres://postgres:postgres@127.0.0.1:5432/postgres'});await admin.connect();
try{await admin.query(`create database ${database} owner taskin_migrator`);await admin.query(`revoke all on database ${database} from public`);await admin.query(`grant connect, temporary on database ${database} to taskin_app`);await admin.query(`grant connect on database ${database} to taskin_platform_admin`);}finally{await admin.end();}
await runMigrations('postgres://taskin_migrator:taskin_migrator@127.0.0.1:5432/'+database);
fs.writeFileSync('C:/Users/garus/Documents/Codex/2026-10-07/taskdoon/work/phase4-live-state.json',JSON.stringify({database,apiLog:'C:/Users/garus/Documents/Codex/2026-10-07/taskdoon/work/'+database+'-api.log'},null,2)+'\n');console.log(JSON.stringify({database,migrated:true}));