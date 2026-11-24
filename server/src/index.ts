/** Standalone entry — for local dev / Docker / Render deployment. */
import { buildApp } from './app';
import { config } from './config';

async function main() {
  const app = buildApp();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Baymax-Shoppey API listening on :${config.port}`);
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }
}

main();
