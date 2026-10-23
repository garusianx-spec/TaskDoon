import fs from 'node:fs';
const file='C:/Users/garus/OneDrive/Desktop/taskin/apps/api/src/modules/broadcasts/broadcasts.service.ts';
let s=fs.readFileSync(file,'utf8');
s=s.replace('function candidate(value:', `async function cacheCommand<T>(command: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(command),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Broadcast cache timed out')), 2_000); timer.unref(); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

function candidate(value:`);
s=s.replace('await this.redis.core.mget(this.cacheKey(), this.generationKey())', 'await cacheCommand(() => this.redis.core.mget(this.cacheKey(), this.generationKey()))');
s=s.replace('await this.redis.core.eval(INVALIDATE, 2, this.generationKey(), this.cacheKey())', 'await cacheCommand(() => this.redis.core.eval(INVALIDATE, 2, this.generationKey(), this.cacheKey()))');
s=s.replace('await this.redis.core.eval(FILL, 2, this.generationKey(), this.cacheKey(), generation, JSON.stringify(rows), CACHE_TTL_SECONDS)', 'await cacheCommand(() => this.redis.core.eval(FILL, 2, this.generationKey(), this.cacheKey(), generation, JSON.stringify(rows), CACHE_TTL_SECONDS))');
fs.writeFileSync(file,s);
