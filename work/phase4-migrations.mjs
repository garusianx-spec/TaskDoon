import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
const root='C:/Users/garus/OneDrive/Desktop/taskin';
const work='C:/Users/garus/Documents/Codex/2026-10-07/taskdoon/work';
const require=createRequire(root+'/package.json');
const pg=require('pg');
const { drizzle }=require('drizzle-orm/node-postgres');
const { migrate }=require('drizzle-orm/node-postgres/migrator');
const { runMigrations }=await import(pathToFileURL(root+'/apps/api/dist/platform/db/migrate.js'));
const { schemaSnapshot }=await import(pathToFileURL(root+'/apps/api/dist/platform/db/schema-snapshot.js'));
const folder=root+'/apps/api/db/migrations';
const head=JSON.parse(fs.readFileSync(work+'/head-migration-journal.json','utf8'));
const current=JSON.parse(fs.readFileSync(folder+'/meta/_journal.json','utf8'));
if(JSON.stringify(current.entries.slice(0,head.entries.length))!==JSON.stringify(head.entries))throw new Error('Original migration journal changed');
const fingerprints=JSON.parse(fs.readFileSync(work+'/baseline/migrations-before.json','utf8'));
let verified=0;
for(const item of fingerprints){if(item.Path.endsWith('_journal.json'))continue;const hash=createHash('sha256').update(fs.readFileSync(item.Path)).digest('hex').toUpperCase();if(hash!==item.Hash)throw new Error('Original migration modified: '+item.Path);verified++;}
const oldFolder=work+'/phase4-upgrade-migrations';fs.mkdirSync(oldFolder+'/meta',{recursive:true});fs.writeFileSync(oldFolder+'/meta/_journal.json',JSON.stringify(head));for(const item of head.entries)fs.copyFileSync(folder+'/'+item.tag+'.sql',oldFolder+'/'+item.tag+'.sql');
const suffix=randomBytes(4).toString('hex');const names=['phase4_fresh_'+suffix,'phase4_upgrade_'+suffix];
const admin=new pg.Client({connectionString:'postgres://postgres:postgres@127.0.0.1:5432/postgres'});await admin.connect();
const url=(name,role='taskin_migrator')=>'postgres://'+role+':'+role+'@127.0.0.1:5432/'+name;
let result;
try{
  for(const name of names){if(!/^phase4_(fresh|upgrade)_[a-f0-9]{8}$/.test(name))throw new Error('Invalid isolated DB');await admin.query(`create database ${name} owner taskin_migrator`);await admin.query(`revoke all on database ${name} from public`);await admin.query(`grant connect, temporary on database ${name} to taskin_app`);await admin.query(`grant connect on database ${name} to taskin_platform_admin`);}
  await runMigrations(url(names[0]));
  const oldPool=new pg.Pool({connectionString:url(names[1]),max:1});try{await migrate(drizzle({client:oldPool}),{migrationsFolder:oldFolder});await oldPool.query("insert into users(phone, full_name, phone_verified_at) values ('+989120000001', 'Phase 4 upgrade sentinel', now())");}finally{await oldPool.end();}
  await runMigrations(url(names[1]));
  const fresh=await schemaSnapshot(url(names[0]));const upgraded=await schemaSnapshot(url(names[1]));if(fresh!==upgraded)throw new Error('Fresh and upgraded schemas differ');
  const check=new pg.Client({connectionString:url(names[1])});await check.connect();let rows;try{({rows}=await check.query("select (select count(*) from drizzle.__drizzle_migrations) as migrations, (select count(*) from users where full_name = 'Phase 4 upgrade sentinel') as preserved_users"));}finally{await check.end();}
  if(Number(rows[0].migrations)!==23||Number(rows[0].preserved_users)!==1)throw new Error('Upgrade preservation failed');
  fs.writeFileSync(root+'/apps/api/db/schema.snapshot.txt',fresh);
  result={oldMigrationAndMetadataFilesUnchanged:verified,migrationJournalPrefixUnchanged:true,migrationsApplied:23,freshAndUpgradeSchemasMatch:true,existingUserPreserved:true,snapshotRegenerated:true};
}finally{for(const name of names)await admin.query(`drop database if exists ${name} with (force)`);await admin.end();}
fs.writeFileSync(work+'/phase4-migration-verification.json',JSON.stringify({...result,isolatedDatabasesRemoved:true},null,2)+'\n');console.log(JSON.stringify({...result,isolatedDatabasesRemoved:true}));