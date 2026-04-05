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

export const chatMediaUpload = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024 },
});
