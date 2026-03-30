// Load .env before any other local imports that read process.env (e.g. database config).
import 'dotenv/config';

import express, { Application } from 'express';
import cors, { type CorsOptions } from 'cors';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import userRoutes from './routes/userRoutes';
import authRoutes from './routes/authRoutes';
import tripRoutes from './routes/tripRoutes';
import { listAvailableTrips } from './controllers/tripController';
import { authenticate } from './middleware/auth';
import { printListenUrls } from './utils/printListenUrls';

const app: Application = express();

/** Render sets PORT; local default 3000 */
const PORT = Number(process.env.PORT) || 3000;

/** Bind on all interfaces so Render / Docker / LAN can reach the process */
const LISTEN_HOST = '0.0.0.0';

const isProd = process.env.NODE_ENV === 'production';

/** Vite dev / preview — allow API calls from local browsers when CORS_ORIGIN is an explicit list. */
const LOCALHOST_FRONTEND_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
] as const;

/** Normalize env origins so `host.com`, `https://host.com/`, and `https://host.com` all match the browser's Origin. */
function normalizeOriginForAllowList(value: string): string {
  let s = value.trim().replace(/\/$/, '');
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  return s.replace(/\/$/, '');
}

/**
 * CORS: set CORS_ORIGIN to your deployed frontend origin(s), comma-separated.
 * If unset in production, we reflect the request Origin (works but is broad — prefer setting CORS_ORIGIN).
 * Set CORS_INCLUDE_LOCALHOST=true to also allow local Vite/preview when CORS_ORIGIN is set.
 */
function buildCorsOptions(): CorsOptions {
  const raw = process.env.CORS_ORIGIN?.trim();
  const mergeLocal =
    process.env.CORS_INCLUDE_LOCALHOST === 'true' || process.env.CORS_INCLUDE_LOCALHOST === '1';

  const allowed = new Set<string>();
  if (raw) {
    for (const part of raw.split(',')) {
      const n = normalizeOriginForAllowList(part);
      if (n) allowed.add(n);
    }
  }
  if (mergeLocal) {
    for (const o of LOCALHOST_FRONTEND_ORIGINS) {
      allowed.add(o);
    }
  }

  if (isProd && allowed.size === 0) {
    console.warn(
      '[KeyGo] CORS_ORIGIN is not set. Reflecting request Origin. Set CORS_ORIGIN to your deployed frontend URL for explicit CORS.'
    );
  }

  return {
    origin: (requestOrigin, callback) => {
      if (!isProd) {
        callback(null, true);
        return;
      }

      // Tools / server-side requests may omit Origin — allow through
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      const incoming = requestOrigin.trim().replace(/\/$/, '');

      if (allowed.size === 0) {
        callback(null, incoming);
        return;
      }

      if (allowed.has(incoming)) {
        callback(null, incoming);
        return;
      }

      console.warn(
        `[KeyGo] CORS rejected Origin "${incoming}". Allowed: ${[...allowed].join(', ')}. Fix CORS_ORIGIN on Render (include https://, no trailing slash).`
      );
      callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

app.use(cors(buildCorsOptions()));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
/** Mobile / alias: same as GET /api/trips/available (requires driver JWT). */
app.get('/api/jobs', authenticate, listAvailableTrips);

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
