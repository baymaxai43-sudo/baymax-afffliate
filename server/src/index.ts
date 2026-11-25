/** Standalone entry — for local dev / Docker / Render deployment. */
import { buildApp } from './app';
import { config } from './config';
import { startWorker } from './services/pipeline';
import { startKeepAlive } from './services/keepAlive';

async function main() {
  const app = buildApp();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Baymax-Shoppey API listening on :${config.port}`);
    // Background loops (long-running host only — not the Vercel serverless fallback)
    startWorker();
    startKeepAlive();
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }
}

main();
