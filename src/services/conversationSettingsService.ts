import { Types } from 'mongoose';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import type { IParticipantSettings } from '../models/Conversation';

export type ParticipantSettingsPublic = {
  archived: boolean;
  muted: boolean;
  favorite: boolean;
  listTag: string | null;
  manualUnread: boolean;
};

const defaults: ParticipantSettingsPublic = {
  archived: false,
  muted: false,
  favorite: false,
  listTag: null,
  manualUnread: false,
};

export function getParticipantSettings(
  settings: IParticipantSettings[] | undefined,
  userId: Types.ObjectId
): ParticipantSettingsPublic {
  const row = settings?.find((s) => s.user.equals(userId));
  if (!row) return { ...defaults };
  return {
    archived: Boolean(row.archived),
    muted: Boolean(row.muted),
    favorite: Boolean(row.favorite),
    listTag: row.listTag ?? null,
    manualUnread: Boolean(row.manualUnread),
  };
}

function ensureSettingsArray(conv: {
  participantSettings?: IParticipantSettings[];
}): IParticipantSettings[] {
  if (!conv.participantSettings) conv.participantSettings = [];
  return conv.participantSettings;
}

export async function patchParticipantSettings(
  userId: Types.ObjectId,
  conversationId: string,
  patch: Partial<{
    archived: boolean;
    muted: boolean;
    favorite: boolean;
    listTag: string | null;
    manualUnread: boolean;
  }>
): Promise<{ ok: true; settings: ParticipantSettingsPublic } | { ok: false; error: string }> {
  if (!Types.ObjectId.isValid(conversationId)) {
    return { ok: false, error: 'Invalid conversationId' };
  }
  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    return { ok: false, error: 'Conversation not found' };
  }
  if (!conv.participants.some((p) => p.equals(userId))) {
    return { ok: false, error: 'Not a participant' };
  }

  const arr = ensureSettingsArray(conv);
  let idx = arr.findIndex((s) => s.user.equals(userId));
  if (idx < 0) {
    arr.push({
      user: userId,
      archived: false,
      muted: false,
      favorite: false,
      listTag: null,
      manualUnread: false,
    });
    idx = arr.length - 1;
  }

  const row = arr[idx];
  if (patch.archived !== undefined) row.archived = patch.archived;
  if (patch.muted !== undefined) row.muted = patch.muted;
  if (patch.favorite !== undefined) row.favorite = patch.favorite;
  if (patch.listTag !== undefined) row.listTag = patch.listTag;
  if (patch.manualUnread !== undefined) row.manualUnread = patch.manualUnread;

  await conv.save();
  return { ok: true, settings: getParticipantSettings(arr, userId) };
}

export async function clearConversationMessages(
  userId: Types.ObjectId,
  conversationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Types.ObjectId.isValid(conversationId)) {
    return { ok: false, error: 'Invalid conversationId' };
  }
  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    return { ok: false, error: 'Conversation not found' };
  }
  if (!conv.participants.some((p) => p.equals(userId))) {
    return { ok: false, error: 'Not a participant' };
  }

  await Message.deleteMany({ conversationId: conv._id });
  conv.lastMessageAt = undefined;
  conv.lastMessagePreview = undefined;
  conv.lastMessageSenderId = undefined;
  const receipts = [...(conv.readReceipts ?? [])];
  for (const r of receipts) {
    r.lastReadAt = new Date();
  }
  conv.readReceipts = receipts;
  await conv.save();
  return { ok: true };
}

export async function setConversationLocked(
  userId: Types.ObjectId,
  conversationId: string,
  locked: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Types.ObjectId.isValid(conversationId)) {
    return { ok: false, error: 'Invalid conversationId' };
  }
  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    return { ok: false, error: 'Conversation not found' };
  }
  if (!conv.participants.some((p) => p.equals(userId))) {
    return { ok: false, error: 'Not a participant' };
  }
  conv.isLocked = locked;
  await conv.save();
  return { ok: true };
}
