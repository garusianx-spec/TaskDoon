import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const repo='C:/Users/garus/OneDrive/Desktop/taskin';
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${repo}`,...args],{cwd:repo,encoding:'utf8'});
const paths=git('ls-tree','-r','--name-only','7f9c984','apps/api/test','apps/web/e2e').trim().split('\n').filter(p=>/\.(ts|mjs)$/.test(p));
const changed=[];
for(const p of paths){const before=git('show',`7f9c984:${p}`).replace(/\r\n/g,'\n');const after=fs.readFileSync(repo+'/'+p,'utf8').replace(/\r\n/g,'\n');if(before!==after)changed.push(p);}
if(changed.length!==1||changed[0]!=='apps/api/test/integration/observability.test.ts')throw new Error('Unexpected existing test modification');
const diff=git('diff','7f9c984','--',changed[0]);if(diff.split('\n').some(line=>line.startsWith('-')&&!line.startsWith('---')))throw new Error('Removed or changed old test code');
const assertionLines=source=>source.split('\n').filter(line=>/\b(?:expect|check|assert)\b/.test(line));
const beforeAssertions=assertionLines(git('show',`7f9c984:${changed[0]}`));const afterAssertions=assertionLines(fs.readFileSync(repo+'/'+changed[0],'utf8'));
if(JSON.stringify(beforeAssertions)!==JSON.stringify(afterAssertions))throw new Error('Existing assertions changed');
const result={existingTestFilesChecked:paths.length,onlyChangedExistingTest:changed[0],change:'additive create/patch/archive traced fixture calls for new routes',existingAssertionLinesPreserved:beforeAssertions.length,allExistingTestAssertionsUnchanged:true};
fs.writeFileSync(new URL('./phase4-existing-tests-verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
