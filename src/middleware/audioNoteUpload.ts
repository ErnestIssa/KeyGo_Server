import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';

const chatDir = path.join(process.cwd(), 'uploads', 'chat');
try {
  if (!fs.existsSync(chatDir)) {
    fs.mkdirSync(chatDir, { recursive: true });
  }
} catch {
  /* ignore */
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 12) || '';
    cb(null, `${randomUUID()}${ext}`);
  },
});

/** Voice messages only — same disk layout as chat uploads (`/uploads/chat/...`). */
export const audioNoteUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'application/octet-stream' ||
      /\.(m4a|aac|mp3|wav|webm|ogg)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
  },
});
