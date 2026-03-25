// Load .env before any other local imports that read process.env (e.g. database config).
import 'dotenv/config';

import express, { Application } from 'express';
import cors from 'cors';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import userRoutes from './routes/userRoutes';
import tripRoutes from './routes/tripRoutes';
import { printListenUrls } from './utils/printListenUrls';

const app: Application = express();

/** Render sets PORT; local default 3000 */
const PORT = Number(process.env.PORT) || 3000;

/** Bind on all interfaces so Render / Docker / LAN can reach the process */
const LISTEN_HOST = '0.0.0.0';

const isProd = process.env.NODE_ENV === 'production';

/**
 * CORS: set CORS_ORIGIN to your frontend origin(s), comma-separated.
 * If unset, we reflect the request Origin (works for many dev setups; set CORS_ORIGIN on Render).
 */
function corsOriginConfig(): string | string[] | boolean {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    if (isProd) {
      console.warn(
        '[KeyGo] CORS_ORIGIN is not set. Reflecting request Origin. Set CORS_ORIGIN to your deployed frontend URL for explicit CORS.'
      );
    }
    return true;
  }
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  if (list.length === 1) return list[0];
  return list;
}

app.use(
  cors({
    origin: isProd ? corsOriginConfig() : true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/users', userRoutes);
app.use('/api/trips', tripRoutes);

app.use(errorHandler);

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    app.listen(PORT, LISTEN_HOST, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Listening on ${LISTEN_HOST}:${PORT}`);

      if (isProd) {
        console.log(`NODE_ENV=production`);
        if (process.env.CORS_ORIGIN?.trim()) {
          console.log(`CORS_ORIGIN=${process.env.CORS_ORIGIN}`);
        }
      } else {
        printListenUrls(PORT, 'API (KeyGo_Server)');
        console.log('CORS (dev): reflecting request Origin');
      }
    });
  } catch (error) {
    console.error('[KeyGo] Failed to start server:', error);
    console.error('[KeyGo] Fix the issue above (often MONGO_URI or MongoDB not running), then try again.');
    process.exit(1);
  }
};

startServer();
