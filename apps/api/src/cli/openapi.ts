/**
 * `npm run openapi`: writes openapi.json from the controllers and DTOs. Uses Nest's preview mode,
 * so no provider is instantiated and no database or Redis is needed. The integration suite
 * checks the committed file is current.
 */
import { writeFile } from 'node:fs/promises';
import { buildOpenApiDocument, OPENAPI_FILE } from '../openapi.js';

const document = await buildOpenApiDocument();
await writeFile(OPENAPI_FILE, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${OPENAPI_FILE}`);
