import mongoose from 'mongoose';

/**
 * Dev-only fallback if MONGO_URI / MONGODB_URI are unset (not used when NODE_ENV=production).
 * Use Atlas or local Mongo by setting MONGO_URI in .env / Render dashboard.
 */
const DEV_FALLBACK_URI = 'mongodb://127.0.0.1:27017/keygo';

function resolveMongoUri(): string | null {
  const uri = process.env.MONGO_URI?.trim() || process.env.MONGODB_URI?.trim();
  if (uri) return uri;

  if (process.env.NODE_ENV === 'production') {
    console.error('');
    console.error('[KeyGo] MongoDB: MONGO_URI (or MONGODB_URI) is required in production.');
    console.error('[KeyGo] In Render: add MONGO_URI with your Atlas connection string.');
    console.error('[KeyGo] Server will not start without a database URL.');
    console.error('');
    return null;
  }

  console.warn(
    `[KeyGo] MONGO_URI not set — using dev fallback: ${DEV_FALLBACK_URI}. Set MONGO_URI in .env for Atlas or a custom local URI.`
  );
  return DEV_FALLBACK_URI;
}

export const connectDatabase = async (): Promise<void> => {
  const uri = resolveMongoUri();
  if (!uri) {
    throw new Error('Missing MONGO_URI in production');
  }

  const usingEnv = Boolean(process.env.MONGO_URI?.trim() || process.env.MONGODB_URI?.trim());
  if (process.env.NODE_ENV === 'production' || usingEnv) {
    console.log('MongoDB: connecting…');
  } else {
    console.log(`MongoDB: connecting (dev fallback)…`);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('[KeyGo] MongoDB connection failed:', error);
    console.error('[KeyGo] Check: MONGO_URI value, Atlas network access / IP allowlist, VPN, and that MongoDB is running locally if you use the dev fallback.');
    throw error;
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('error', (error: unknown) => {
  console.error('MongoDB runtime error:', error);
});
