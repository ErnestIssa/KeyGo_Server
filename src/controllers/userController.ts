import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User, { type IUser } from '../models/User';
import { generateToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';

const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function toPublicUser(user: {
  _id: unknown;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
  ratingAverage?: number | null;
}) {
  const raRaw = user.ratingAverage;
  const ratingAverage =
    typeof raRaw === 'number' && !Number.isNaN(raRaw)
      ? Math.min(5, Math.max(0, Math.round(raRaw * 10) / 10))
      : 5;
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl || undefined,
    ratingAverage,
  };
}

function authPayload(user: IUser) {
  return {
    token: generateToken(user),
    user: toPublicUser(user),
  };
}

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, role } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      role?: string;
    };

    if (!email?.trim() || !password || !name?.trim()) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    if (role !== 'owner' && role !== 'driver') {
      res.status(400).json({ error: 'Role must be owner or driver' });
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: email.toLowerCase().trim(),
      password: hashed,
      name: name.trim(),
      role,
      driverApproved: true,
    });

    res.status(201).json(authPayload(user));
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.body as { email?: unknown; password?: unknown };
    const email = typeof raw.email === 'string' ? raw.email.trim() : '';
    const password = typeof raw.password === 'string' ? raw.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    res.json(authPayload(user));
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
};

/** One-click test users (fixed emails, password demo123) */
export const demoLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role } = req.body as { role?: string };
    if (role !== 'owner' && role !== 'driver') {
      res.status(400).json({ error: 'role must be owner or driver' });
      return;
    }

    const config =
      role === 'owner'
        ? { email: 'demo-owner@keygo.local', name: 'Demo Owner', userRole: 'owner' as const }
        : { email: 'demo-driver@keygo.local', name: 'Demo Driver', userRole: 'driver' as const };

    const password = 'demo123';

    let user = await User.findOne({ email: config.email });
    if (!user) {
      const hashed = await bcrypt.hash(password, 10);
      user = await User.create({
        email: config.email,
        password: hashed,
        name: config.name,
        role: config.userRole,
        driverApproved: true,
      });
    }

    res.json(authPayload(user));
  } catch (error) {
    res.status(500).json({ error: 'Demo login failed' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
};

export const uploadAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const raw = (req.body as { image?: unknown })?.image;
    if (typeof raw !== 'string' || !raw.trim()) {
      res.status(400).json({ error: 'image is required as a base64 data URL (data:image/...;base64,...)' });
      return;
    }

    const m = /^data:(image\/[\w+.+-]+);base64,([\s\S]+)$/i.exec(raw.trim());
    if (!m) {
      res.status(400).json({ error: 'Invalid image format. Use a data URL: data:image/jpeg;base64,...' });
      return;
    }

    const mime = m[1].toLowerCase();
    const ext = ALLOWED_MIME[mime];
    if (!ext) {
      res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are allowed' });
      return;
    }

    const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
    if (buf.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'Image too large (max 2MB)' });
      return;
    }
    if (buf.length < 80) {
      res.status(400).json({ error: 'Image data is too small' });
      return;
    }

    const userId = String(req.user!._id);
    if (!fs.existsSync(AVATAR_DIR)) {
      fs.mkdirSync(AVATAR_DIR, { recursive: true });
    }

    const relPath = `/uploads/avatars/${userId}.${ext}`;
    const absPath = path.join(AVATAR_DIR, `${userId}.${ext}`);

    for (const e of ['jpg', 'png', 'webp']) {
      const p = path.join(AVATAR_DIR, `${userId}.${e}`);
      if (fs.existsSync(p) && p !== absPath) {
        fs.unlinkSync(p);
      }
    }

    fs.writeFileSync(absPath, buf);

    const updated = await User.findByIdAndUpdate(userId, { avatarUrl: relPath }, { new: true }).select(
      '-password'
    );
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: toPublicUser(updated) });
  } catch (error) {
    res.status(500).json({ error: 'Avatar upload failed' });
  }
};
