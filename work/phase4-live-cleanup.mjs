import fs from 'node:fs';
import { createRequire } from 'node:module';
const root='C:/Users/garus/OneDrive/Desktop/taskin';
const require=createRequire(root+'/package.json');
const {Client}=require('pg');
const Redis=require('ioredis').Redis;
const {S3Client,ListObjectsV2Command,DeleteObjectsCommand}=require('@aws-sdk/client-s3');
const state=JSON.parse(fs.readFileSync(new URL('./phase4-live-state.json',import.meta.url)));
const db=state.database;
if(!/^phase4_live_[a-f0-9]{10}$/.test(db))throw new Error('Refusing unexpected database');
try {await fetch('http://127.0.0.1:4000/health/ready',{signal:AbortSignal.timeout(1000)});throw new Error('Stop the owned live API before cleanup');}
catch(e){if(e.message==='Stop the owned live API before cleanup')throw e;}
const client=new Client({connectionString:'postgres://postgres:postgres@127.0.0.1:5432/'+db});
await client.connect();
let workspaceIds;
try {await client.query('begin read only');workspaceIds=(await client.query('select id from public.workspaces')).rows.map(r=>r.id);await client.query('rollback');}
finally {await client.end();}
if(workspaceIds.some(id=>!/^\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)))throw new Error('Unexpected workspace ID');
const storage=new S3Client({endpoint:'http://127.0.0.1:8333',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'taskin',secretAccessKey:'taskin-dev-secret'},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:2});
let objectsDeleted=0;
try {for(const id of workspaceIds){const prefix=`ws/${id}/`;let token;do{const page=await storage.send(new ListObjectsV2Command({Bucket:'taskin-files',Prefix:prefix,ContinuationToken:token}));const objects=(page.Contents??[]).flatMap(o=>o.Key?[{Key:o.Key}]:[]);if(objects.some(o=>!o.Key.startsWith(prefix)))throw new Error('Object escaped owned prefix');if(objects.length){const result=await storage.send(new DeleteObjectsCommand({Bucket:'taskin-files',Delete:{Objects:objects,Quiet:true}}));if(result.Errors?.length)throw new Error('Failed to remove owned objects');objectsDeleted+=objects.length;}token=page.IsTruncated?page.NextContinuationToken:undefined;}while(token);}}finally{storage.destroy();}
let redisKeysDeleted=0;
for(const port of [16379,16380]){const redis=new Redis(`redis://127.0.0.1:${port}`,{maxRetriesPerRequest:1,connectTimeout:2000});try{let cursor='0';do{const [next,keys]=await redis.scan(cursor,'MATCH',`${db}:*`,'COUNT',500);if(keys.some(key=>!key.startsWith(db+':')))throw new Error('Redis key escaped owned prefix');if(keys.length)redisKeysDeleted+=await redis.unlink(...keys);cursor=next;}while(cursor!=='0');}finally{await redis.quit();}}
const admin=new Client({connectionString:'postgres://postgres:postgres@127.0.0.1:5432/postgres'});await admin.connect();try{await admin.query(`drop database "${db}" with (force)`);}finally{await admin.end();}
const result={databaseRemoved:db,ownedWorkspacePrefixesChecked:workspaceIds.length,objectsDeleted,redisKeysDeleted,apiStopped:true,cleanupAt:new Date().toISOString()};fs.writeFileSync(new URL('./phase4-cleanup.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
