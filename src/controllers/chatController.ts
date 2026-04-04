import { Response } from 'express';
import { Types } from 'mongoose';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Trip from '../models/Trip';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { areUsersMatched, sortedParticipantPair } from '../utils/matchedUsers';
import { formatChatDisplayName } from '../utils/displayName';

function publicUser(u: {
  _id: Types.ObjectId;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
}) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    displayName: formatChatDisplayName(u.firstName, u.lastName, u.name),
  };
}

/** POST /api/conversations — body: { participantId: string } */
export const createConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const me = req.user as { _id: Types.ObjectId };
    const meId = me._id;
    const otherIdRaw = (req.body as { participantId?: string })?.participantId;
    if (!otherIdRaw || typeof otherIdRaw !== 'string') {
      res.status(400).json({ error: 'participantId is required' });
      return;
    }
    if (!Types.ObjectId.isValid(otherIdRaw)) {
      res.status(400).json({ error: 'Invalid participantId' });
      return;
    }
    const otherId = new Types.ObjectId(otherIdRaw);
    if (otherId.equals(meId)) {
      res.status(400).json({ error: 'Cannot chat with yourself' });
      return;
    }

    const matched = await areUsersMatched(meId, otherId);
    if (!matched) {
      res.status(403).json({ error: 'You can only chat with users you have an accepted trip with' });
      return;
    }

    const [a, b] = sortedParticipantPair(meId, otherId);
    let conv = await Conversation.findOne({ participants: [a, b] });
    if (!conv) {
      conv = await Conversation.create({ participants: [a, b] });
    }
    res.status(201).json({
      conversation: {
        id: conv._id.toString(),
        participants: conv.participants.map((p) => p.toString()),
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      },
    });
  } catch (e) {
    console.error('[chat] createConversation', e);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

/**
 * GET /api/conversations — all conversations for the authenticated user.
 * (Spec mentioned GET /conversations/:userId — we use JWT user instead.)
 */
export const listConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const convs = await Conversation.find({ participants: meId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    const out = await Promise.all(
      convs.map(async (c) => {
        const otherId = c.participants.find((p) => !p.equals(meId));
        if (!otherId || otherId.equals(meId)) {
          return null;
        }
        const other = await User.findById(otherId).select('name firstName lastName email avatarUrl').lean();
        const otherUser = other
          ? publicUser(
              other as {
                _id: Types.ObjectId;
                name: string;
                firstName?: string;
                lastName?: string;
                email?: string;
                avatarUrl?: string;
              }
            )
          : { id: otherId.toString(), name: 'User', displayName: 'User' };
        return {
          id: c._id.toString(),
          participants: c.participants.map((p) => p.toString()),
          otherUser,
          otherUserId: otherUser.id,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          lastMessageAt: c.lastMessageAt,
          lastMessagePreview: c.lastMessagePreview,
        };
      })
    );

    res.json({ conversations: out.filter((x): x is NonNullable<typeof x> => x != null) });
  } catch (e) {
    console.error('[chat] listConversations', e);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
};

/** POST /api/messages — body: { conversationId, text } */
export const postMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { conversationId, text } = req.body as { conversationId?: string; text?: string };
    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      res.status(400).json({ error: 'conversationId is required' });
      return;
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const conv = await Conversation.findById(conversationId);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    if (!conv.participants.some((p) => p.equals(meId))) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }

    const msg = await Message.create({
      conversationId: conv._id,
      senderId: meId,
      text: text.trim().slice(0, 4000),
    });

    const preview = msg.text.length > 120 ? `${msg.text.slice(0, 117)}...` : msg.text;
    conv.lastMessageAt = msg.createdAt;
    conv.lastMessagePreview = preview;
    await conv.save();

    const sender = await User.findById(meId).select('name firstName lastName avatarUrl').lean();
    const senderDisplayName = sender
      ? formatChatDisplayName(sender.firstName, sender.lastName, sender.name)
      : 'User';
    const senderName = sender?.name ?? 'User';
    const senderAvatarUrl = sender?.avatarUrl || undefined;

    res.status(201).json({
      message: {
        id: msg._id.toString(),
        conversationId: conv._id.toString(),
        senderId: meId.toString(),
        text: msg.text,
        createdAt: msg.createdAt,
        senderDisplayName,
        senderName,
        senderAvatarUrl,
      },
    });
  } catch (e) {
    console.error('[chat] postMessage', e);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/** GET /api/messages/:conversationId */
export const listMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { conversationId } = req.params;
    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      res.status(400).json({ error: 'Invalid conversationId' });
      return;
    }

    const conv = await Conversation.findById(conversationId);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    if (!conv.participants.some((p) => p.equals(meId))) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }

    const messages = await Message.find({ conversationId: conv._id })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    const senderIds = [...new Set(messages.map((m) => m.senderId.toString()))];
    const senders = await User.find({ _id: { $in: senderIds } })
      .select('name firstName lastName avatarUrl')
      .lean();
    const senderMap = new Map(
      senders.map((u) => {
        const id = (u._id as Types.ObjectId).toString();
        return [
          id,
          {
            displayName: formatChatDisplayName(u.firstName, u.lastName, u.name),
            fullName: u.name,
            avatarUrl: u.avatarUrl || undefined,
          },
        ] as const;
      })
    );

    res.json({
      messages: messages.map((m) => {
        const sid = m.senderId.toString();
        const meta = senderMap.get(sid);
        return {
          id: m._id.toString(),
          conversationId: conv._id.toString(),
          senderId: sid,
          text: m.text,
          createdAt: m.createdAt,
          senderDisplayName: meta?.displayName ?? 'User',
          senderName: meta?.fullName ?? 'User',
          senderAvatarUrl: meta?.avatarUrl,
        };
      }),
    });
  } catch (e) {
    console.error('[chat] listMessages', e);
    res.status(500).json({ error: 'Failed to load messages' });
  }
};

/** GET /api/chat/matches — distinct trip partners + optional conversation id */
export const listMatches = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const trips = await Trip.find({
      status: { $in: ['accepted', 'completed'] },
      $or: [{ owner: meId }, { driver: meId }],
      driver: { $exists: true, $ne: null },
    })
      .populate('owner', 'name firstName lastName email avatarUrl')
      .populate('driver', 'name firstName lastName email avatarUrl')
      .lean();

    const peerMap = new Map<
      string,
      {
        _id: Types.ObjectId;
        name: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        avatarUrl?: string;
      }
    >();

    for (const t of trips) {
      const owner = t.owner as unknown;
      const driver = t.driver as unknown;
      if (
        !owner ||
        !driver ||
        typeof owner !== 'object' ||
        typeof driver !== 'object' ||
        !('_id' in owner) ||
        !('_id' in driver)
      ) {
        continue;
      }
      const o = owner as {
        _id: Types.ObjectId;
        name: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        avatarUrl?: string;
      };
      const d = driver as {
        _id: Types.ObjectId;
        name: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        avatarUrl?: string;
      };
      const ownerS = o._id.toString();
      const driverS = d._id.toString();
      const meS = meId.toString();
      if (ownerS === driverS) {
        continue;
      }
      if (ownerS === meS) {
        peerMap.set(driverS, d);
      } else if (driverS === meS) {
        peerMap.set(ownerS, o);
      }
    }

    const matches = await Promise.all(
      [...peerMap.entries()].map(async ([peerIdStr, peer]) => {
        const peerOid = new Types.ObjectId(peerIdStr);
        const [a, b] = sortedParticipantPair(meId, peerOid);
        const conv = await Conversation.findOne({ participants: [a, b] }).select('_id').lean();
        return {
          user: publicUser(peer),
          conversationId: conv ? conv._id.toString() : null,
        };
      })
    );

    res.json({ matches });
  } catch (e) {
    console.error('[chat] listMatches', e);
    res.status(500).json({ error: 'Failed to load matches' });
  }
};

/** GET /api/chat/recent-trips — lightweight trip feed for chat hub */
export const recentTripsForChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const trips = await Trip.find({
      $or: [{ owner: meId }, { driver: meId }],
    })
      .sort({ updatedAt: -1 })
      .limit(12)
      .select('owner driver status pickupLocation dropoffLocation updatedAt createdAt paymentAmount')
      .populate('owner', 'name')
      .populate('driver', 'name')
      .lean();

    res.json({
      trips: trips.map((t) => ({
        id: (t._id as Types.ObjectId).toString(),
        status: t.status,
        pickupLocation: t.pickupLocation,
        dropoffLocation: t.dropoffLocation,
        updatedAt: t.updatedAt,
        createdAt: t.createdAt,
        paymentAmount: t.paymentAmount,
        owner: t.owner ? { name: (t.owner as { name?: string }).name } : undefined,
        driver: t.driver ? { name: (t.driver as { name?: string }).name } : undefined,
      })),
    });
  } catch (e) {
    console.error('[chat] recentTripsForChat', e);
    res.status(500).json({ error: 'Failed to load recent trips' });
  }
};

/** POST /api/conversations/:conversationId/read — mark inbound messages read for the current user */
export const markConversationRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { conversationId } = req.params;
    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      res.status(400).json({ error: 'Invalid conversationId' });
      return;
    }
    const conv = await Conversation.findById(conversationId);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    if (!conv.participants.some((p) => p.equals(meId))) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }
    const now = new Date();
    const receipts = [...(conv.readReceipts ?? [])];
    const idx = receipts.findIndex((r) => r.user.equals(meId));
    if (idx >= 0) {
      receipts[idx].lastReadAt = now;
    } else {
      receipts.push({ user: meId, lastReadAt: now });
    }
    conv.readReceipts = receipts;
    await conv.save();
    res.json({ ok: true });
  } catch (e) {
    console.error('[chat] markConversationRead', e);
    res.status(500).json({ error: 'Failed to mark read' });
  }
};

/** GET /api/chat/unread-count — total inbound messages after your last read per conversation */
export const getUnreadChatCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const convs = await Conversation.find({ participants: meId }).select('_id readReceipts').lean();
    let total = 0;
    for (const c of convs) {
      const cid = c._id as Types.ObjectId;
      const receipts = (c.readReceipts ?? []) as { user: Types.ObjectId; lastReadAt: Date }[];
      const receipt = receipts.find((r) => r.user.equals(meId));
      const since = receipt?.lastReadAt ?? new Date(0);
      const n = await Message.countDocuments({
        conversationId: cid,
        senderId: { $ne: meId },
        createdAt: { $gt: since },
      });
      total += n;
    }
    res.json({ total });
  } catch (e) {
    console.error('[chat] getUnreadChatCount', e);
    res.status(500).json({ error: 'Failed to count unread' });
  }
};
