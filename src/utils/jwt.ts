import jwt, { type SignOptions } from 'jsonwebtoken';
import { IUser } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export interface JWTPayload {
  userId: string;
  email: string;
}

export const generateToken = (user: IUser): string => {
  const doc = user as unknown as { id?: string; _id?: { toString(): string } };
  const userId = doc.id ?? doc._id?.toString() ?? '';
  const payload: JWTPayload = {
    userId,
    email: user.email,
  };

  const signOpts = { expiresIn: JWT_EXPIRES_IN } as SignOptions;
  return jwt.sign(payload, JWT_SECRET, signOpts);
};

export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
};

