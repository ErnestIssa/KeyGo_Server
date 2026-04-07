import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import InboxMessage, { type IInboxMessage } from '../models/InboxMessage';

function serialize(m: IInboxMessage | Record<string, unknown>) {
  const o = typeof (m as IInboxMessage).toObject === 'function' ? (m as IInboxMessage).toObject() : m;
  return {
    id: String((o as { _id: unknown })._id),
    channel: (o as { channel: 'notifications' | 'support' }).channel,
    title: (o as { title: string }).title ?? '',
    body: (o as { body: string }).body,
    read: Boolean((o as { read: boolean }).read),
    fromSupport: Boolean((o as { fromSupport: boolean }).fromSupport),
    createdAt:
      (o as { createdAt?: Date }).createdAt instanceof Date
        ? (o as { createdAt: Date }).createdAt.toISOString()
        : String((o as { createdAt: unknown }).createdAt ?? ''),
  };
}

/** GET /api/users/inbox — notifications + support threads. */
export const listInbox = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user?._id;
    if (!uid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const rows = await InboxMessage.find({ userId: uid }).sort({ createdAt: -1 }).lean();
    const notifications = rows.filter((r) => r.channel === 'notifications').map((r) => serialize(r));
    const support = rows.filter((r) => r.channel === 'support').map((r) => serialize(r));
    res.json({ notifications, support });
  } catch (e) {
    console.error('[users] listInbox', e);
    res.status(500).json({ error: 'Failed to load inbox' });
  }
};

/** POST /api/users/inbox/support — send a message to support (no category required). */
export const postSupportMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user?._id;
    if (!uid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const raw = req.body as { body?: unknown };
    const body = typeof raw.body === 'string' ? raw.body.trim() : '';
    if (!body || body.length > 8000) {
      res.status(400).json({ error: 'Message body is required (max 8000 characters)' });
      return;
    }
    const doc = await InboxMessage.create({
      userId: uid,
      channel: 'support',
      title: 'Message to support',
      body,
      read: true,
      fromSupport: false,
    });
    res.status(201).json({ message: serialize(doc) });
  } catch (e) {
    console.error('[users] postSupportMessage', e);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/** PATCH /api/users/inbox/:id/read */
export const markInboxRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user?._id;
    if (!uid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const id = req.params.id;
    const updated = await InboxMessage.findOneAndUpdate(
      { _id: id, userId: uid },
      { read: true },
      { new: true }
    ).lean();
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ message: serialize(updated) });
  } catch (e) {
    console.error('[users] markInboxRead', e);
    res.status(500).json({ error: 'Failed to update' });
  }
};
