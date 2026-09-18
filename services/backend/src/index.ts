import http from 'http';
import express from 'express';
import cors from 'cors';
import { BackendDatabase } from './db';
import { AuthService } from './auth';
import { createApiRouter } from './routes';
import { RelayServer } from './relay';
import { createLogger } from '@remotedev/shared-utils';

const logger = createLogger('BackendApp');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const HOST = process.env.HOST || '0.0.0.0';

export function startBackendServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const db = new BackendDatabase();
  const authService = new AuthService(db.getRawDb());

  const apiRouter = createApiRouter(db.getRawDb(), authService);
  app.use('/api/v1', apiRouter);

  const server = http.createServer(app);
  const relay = new RelayServer(server, db.getRawDb(), authService);

  server.listen(PORT, HOST, () => {
    logger.info(`RemoteDev Cloud Backend running on http://${HOST}:${PORT}`);
    logger.info(`WebSocket Relay available at ws://${HOST}:${PORT}/ws`);
  });

  return { server, db, authService, relay };
}

if (require.main === module) {
  startBackendServer();
}
