import 'dotenv/config';
import { app } from './app';
import { env, warnOnMissingIntegrations } from './env';
import { closeEventBus } from './events/eventBus';
import { logger } from './logger';

warnOnMissingIntegrations();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down API`);
  server.close(async (err) => {
    if (err) logger.error({ err }, 'Error while closing HTTP server');
    await closeEventBus();
    process.exit(err ? 1 : 0);
  });
  // Force-exit if in-flight requests never drain (e.g. a hung SSE connection).
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
