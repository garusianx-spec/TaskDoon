import { createApp } from './bootstrap.js';
import { InvalidConfigError, loadEnv } from './config/env.js';

try {
  const env = loadEnv();
  const app = await createApp(env);
  await app.listen(env.PORT, '0.0.0.0');
} catch (error) {
  if (error instanceof InvalidConfigError) {
    console.error(error.message);
    process.exit(78); // EX_CONFIG
  }
  throw error;
}
