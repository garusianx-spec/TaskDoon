const fs = require('node:fs');
const root = 'C:/Users/garus/OneDrive/Desktop/taskin/node_modules/';
for (const file of ['bullmq/dist/esm/classes/queue-getters.js', 'bullmq/dist/esm/classes/queue-base.d.ts', 'pg/lib/client.js']) {
  const source = fs.readFileSync(root + file, 'utf8');
  console.log(file);
  console.log(file.endsWith('queue-getters.js') ? source.slice(0, 7500) : source.split(/\r?\n/).filter(line => /toKey|client:|query_timeout/.test(line)).join('\n'));
}
