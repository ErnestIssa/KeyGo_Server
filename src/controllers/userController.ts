import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import User, { type IUser } from '../models/User';
import Trip from '../models/Trip';
import {
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
  patchAppSettings,
  type AppSettingsShape,
} from '../models/userSettings';
import { generateToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';
import { formatChatDisplayName } from '../utils/displayName';

const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function serializeAddress(u: IUser) {
  const a = u.address;
  if (!a || typeof a !== 'object') {
    return {
      line1: '',
      line2: '',
      city: '',
      region: '',
      postalCode: '',
      country: '',
    };
  }
  return {
    line1: typeof a.line1 === 'string' ? a.line1 : '',
    line2: typeof a.line2 === 'string' ? a.line2 : '',
    city: typeof a.city === 'string' ? a.city : '',
    region: typeof a.region === 'string' ? a.region : '',
    postalCode: typeof a.postalCode === 'string' ? a.postalCode : '',
    country: typeof a.country === 'string' ? a.country : '',
  };
}

export function toPublicUser(user: IUser) {
  const raRaw = user.ratingAverage;
  const ratingAverage =
    typeof raRaw === 'number' && !Number.isNaN(raRaw)
      ? Math.min(5, Math.max(0, Math.round(raRaw * 10) / 10))
      : 5;
  const fn = user.firstName?.trim();
  const ln = user.lastName?.trim();
  const ph = typeof user.phone === 'string' && user.phone.trim() ? user.phone.trim() : undefined;
  const accountKind = user.accountKind === 'organization' ? 'organization' : 'individual';
  const appSettings = mergeAppSettings(user.appSettings as unknown);
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    ...(fn ? { firstName: fn } : {}),
    ...(ln ? { lastName: ln } : {}),
    displayName: formatChatDisplayName(user.firstName, user.lastName, user.name),
    role: user.role,
    avatarUrl: user.avatarUrl || undefined,
    ratingAverage,
    ...(ph ? { phone: ph } : {}),
    accountKind,
    ...(user.organizationName ? { organizationName: user.organizationName } : {}),
    ...(user.organizationType ? { organizationType: user.organizationType } : {}),
    address: serializeAddress(user),
    appSettings,
  };
}

function authPayload(user: IUser) {
  return {
    token: generateToken(user),
    user: toPublicUser(user),
  };
}

function parseFirstLastFromBody(body: {
  firstName?: string;
  lastName?: string;
  name?: string;
}): { firstName: string; lastName: string } | null {
  let fn = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  let ln = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  if (!fn || !ln) {
    const legacy = typeof body.name === 'string' ? body.name.trim() : '';
    if (legacy) {
      const parts = legacy.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        fn = parts[0];
        ln = parts.slice(1).join(' ');
      }
    }
  }
  if (!fn || !ln) {
    return null;
  }
  return { firstName: fn, lastName: ln };
}

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      email?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      role?: string;
      phone?: string;
      accountKind?: string;
      organizationName?: string;
      organizationType?: string;
    };
    const { email, password, role } = body;

    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const parsed = parseFirstLastFromBody(body);
    if (!parsed) {
      res.status(400).json({
        error: 'First name and last name are required (add last name, or use a full name with at least two words)',
      });
      return;
    }
    const { firstName: fn, lastName: ln } = parsed;
    const fullName = `${fn} ${ln}`;

    const accountKind = body.accountKind === 'organization' ? 'organization' : 'individual';
    let displayName = fullName;
    let organizationName: string | undefined;
    if (accountKind === 'organization') {
      organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';
      if (!organizationName) {
        res.status(400).json({ error: 'Organization name is required for business accounts' });
        return;
      }
      displayName = organizationName;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    if (role !== 'owner' && role !== 'driver') {
      res.status(400).json({ error: 'Role must be owner or driver' });
      return;
    }

    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const phoneDigits = rawPhone.replace(/\D/g, '');
    if (!rawPhone || phoneDigits.length < 7 || phoneDigits.length > 15) {
      res.status(400).json({ error: 'A valid phone number is required (7–15 digits)' });
      return;
    }
    const phoneNormalized = rawPhone.startsWith('+') ? `+${phoneDigits}` : phoneDigits;

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);

    const orgType =
      accountKind === 'organization' && typeof body.organizationType === 'string' && body.organizationType.trim()
        ? body.organizationType.trim().slice(0, 120)
        : undefined;

    const user = await User.create({
      email: email.toLowerCase().trim(),
      password: hashed,
      name: displayName,
      firstName: fn,
      lastName: ln,
      role,
      driverApproved: true,
      phone: phoneNormalized,
      accountKind,
      organizationName: accountKind === 'organization' ? organizationName : undefined,
      organizationType: orgType,
      appSettings: DEFAULT_APP_SETTINGS,
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
        ? {
            email: 'demo-owner@keygo.local',
            name: 'Demo Owner',
            firstName: 'Demo',
            lastName: 'Owner',
            userRole: 'owner' as const,
          }
        : {
            email: 'demo-driver@keygo.local',
            name: 'Demo Driver',
            firstName: 'Demo',
            lastName: 'Driver',
            userRole: 'driver' as const,
          };

    const password = 'demo123';

    let user = await User.findOne({ email: config.email });
    if (!user) {
      const hashed = await bcrypt.hash(password, 10);
      user = await User.create({
        email: config.email,
        password: hashed,
        name: config.name,
        firstName: config.firstName,
        lastName: config.lastName,
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

/** POST /api/users/push-token — register Expo push token and notification preference. */
export const registerPushToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const current = req.user as IUser | undefined;
    if (!current) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const { expoPushToken, notificationsEnabled } = req.body as {
      expoPushToken?: string;
      notificationsEnabled?: boolean;
    };
    const update: { expoPushToken?: string; notificationsEnabled?: boolean } = {};
    if (typeof expoPushToken === 'string') {
      const t = expoPushToken.trim();
      update.expoPushToken = t.length > 0 ? t : undefined;
    }
    if (typeof notificationsEnabled === 'boolean') {
      update.notificationsEnabled = notificationsEnabled;
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'expoPushToken or notificationsEnabled required' });
      return;
    }
    await User.findByIdAndUpdate(current._id, update);
    res.json({ ok: true });
  } catch (e) {
    console.error('[users] registerPushToken', e);
    res.status(500).json({ error: 'Failed to save push settings' });
  }
};

/** GET /api/users/public/:userId — read-only profile for chat / discovery (no email). */
export const getPublicProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const viewer = req.user as IUser | undefined;
    if (viewer && String(viewer._id) === userId) {
      res.json({ user: toPublicUser(viewer) });
      return;
    }

    const u = await User.findById(userId).select('name firstName lastName avatarUrl role ratingAverage').lean();
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const raRaw = u.ratingAverage;
    const ratingAverage =
      typeof raRaw === 'number' && !Number.isNaN(raRaw)
        ? Math.min(5, Math.max(0, Math.round(raRaw * 10) / 10))
        : 5;
    res.json({
      user: {
        id: String(u._id),
        name: u.name,
        displayName: formatChatDisplayName(u.firstName, u.lastName, u.name),
        role: u.role,
        avatarUrl: u.avatarUrl || undefined,
        ratingAverage,
      },
    });
  } catch (e) {
    console.error('[users] getPublicProfile', e);
    res.status(500).json({ error: 'Failed to load profile' });
  }
};

/**
 * Switch active app role (owner ↔ driver) for the authenticated account.
 * JWT does not embed role; middleware reloads the user each request. A fresh token is still returned for clients that re-store session on login-shaped responses.
 */
export const updateRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const current = req.user as IUser | undefined;
    if (!current) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (current.role === 'admin') {
      res.status(403).json({ error: 'Admin accounts cannot switch app role from the mobile or web app' });
      return;
    }

    const { role } = req.body as { role?: string };
    if (role !== 'owner' && role !== 'driver') {
      res.status(400).json({ error: 'role must be owner or driver' });
      return;
    }

    if (current.role === role) {
      res.json({ user: toPublicUser(current), token: generateToken(current) });
      return;
    }

    /** Active relocation: assigned driver must stay in driver mode until the trip is completed (server-enforced). */
    if (role === 'owner' && current.role === 'driver') {
      const blocking = await Trip.findOne({
        driver: current._id,
        status: 'accepted',
      })
        .select('_id')
        .lean();
      if (blocking) {
        res.status(409).json({
          error:
            'You have an active relocation as the driver. Complete the trip (owner confirms delivery) before switching to owner mode.',
        });
        return;
      }
    }

    const updated = await User.findByIdAndUpdate(current._id, { role }, { new: true }).select('-password');
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: toPublicUser(updated), token: generateToken(updated) });
  } catch (error) {
    res.status(500).json({ error: 'Could not update role' });
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

/** PATCH /api/users/settings — merge partial app settings (privacy, accessibility, …). */
export const patchUserSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const current = req.user as IUser | undefined;
    if (!current) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const patch = req.body as Partial<AppSettingsShape>;
    const merged = mergeAppSettings(current.appSettings);
    const next = patchAppSettings(merged, patch);
    const updated = await User.findByIdAndUpdate(current._id, { appSettings: next }, { new: true }).select(
      '-password'
    );
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: toPublicUser(updated) });
  } catch (e) {
    console.error('[users] patchUserSettings', e);
    res.status(500).json({ error: 'Failed to save settings' });
  }
};

/** PATCH /api/users/address — save mailing / handoff address fields. */
export const patchUserAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const current = req.user as IUser | undefined;
    if (!current) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const patch = req.body as Partial<{
      line1: string;
      line2: string;
      city: string;
      region: string;
      postalCode: string;
      country: string;
    }>;
    const prev = serializeAddress(current);
    const merged = {
      line1: patch.line1 !== undefined ? String(patch.line1).trim() : prev.line1,
      line2: patch.line2 !== undefined ? String(patch.line2).trim() : prev.line2,
      city: patch.city !== undefined ? String(patch.city).trim() : prev.city,
      region: patch.region !== undefined ? String(patch.region).trim() : prev.region,
      postalCode: patch.postalCode !== undefined ? String(patch.postalCode).trim() : prev.postalCode,
      country: patch.country !== undefined ? String(patch.country).trim() : prev.country,
    };
    const updated = await User.findByIdAndUpdate(current._id, { address: merged }, { new: true }).select(
      '-password'
    );
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: toPublicUser(updated) });
  } catch (e) {
    console.error('[users] patchUserAddress', e);
    res.status(500).json({ error: 'Failed to save address' });
  }
};
