// Copies docs/openapi.yaml + docs/index.html into public/api-docs so Swagger UI
// is served at /api-docs on the deployed frontend. Runs automatically before build.
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('public/api-docs', { recursive: true });
for (const f of ['openapi.yaml', 'index.html']) copyFileSync(`docs/${f}`, `public/api-docs/${f}`);
console.log('api-docs synced → public/api-docs');
