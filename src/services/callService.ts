import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import Conversation from '../models/Conversation';
import User from '../models/User';
import { broadcastToConversation, emitToUser } from '../realtime/chatRealtime';
import { formatChatDisplayName } from '../utils/displayName';
import {
  ChatMessageError,
  createCallLogMessage,
  createCallStartedSystemMessage,
} from './chatMessageService';

export type CallMediaType = 'audio' | 'video';
/** ringing = waiting for callee; active = media session */
export type CallFsmState = 'ringing' | 'active' | 'ended';

export type ActiveCallRecord = {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  type: CallMediaType;
  state: CallFsmState;
  createdAt: number;
  activeAt?: number;
  endedAt?: number;
};

const calls = new Map<string, ActiveCallRecord>();
/** One in-flight call per1:1 conversation */
const conversationToCallId = new Map<string, string>();
const ringTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

const RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS) || 120_000;
const MAX_ACTIVE_MS = Number(process.env.CALL_MAX_DURATION_MS) || 4 * 60 * 60 * 1000;
const START_WINDOW_MS = 60_000;
const START_MAX = Number(process.env.CALL_RATE_LIMIT_PER_MIN) || 15;
const callStartsByUser = new Map<string, number[]>();

function allowStart(userId: string): boolean {
  const now = Date.now();
  let arr = callStartsByUser.get(userId) ?? [];
  arr = arr.filter((t) => now - t < START_WINDOW_MS);
  if (arr.length >= START_MAX) return false;
  arr.push(now);
  callStartsByUser.set(userId, arr);
  return true;
}

function clearTimers(callId: string) {
  const r = ringTimers.get(callId);
  if (r) clearTimeout(r);
  ringTimers.delete(callId);
  const a = activeTimers.get(callId);
  if (a) clearTimeout(a);
  activeTimers.delete(callId);
}

function detachConversation(call: ActiveCallRecord) {
  if (conversationToCallId.get(call.conversationId) === call.id) {
    conversationToCallId.delete(call.conversationId);
  }
}

export function getCall(callId: string): ActiveCallRecord | undefined {
  return calls.get(callId);
}

async function callerDisplayName(userId: Types.ObjectId): Promise<string> {
  const u = await User.findById(userId).select('name firstName lastName').lean();
  if (!u) return 'User';
  return formatChatDisplayName(u.firstName, u.lastName, u.name);
}

export async function startCall(
  userId: Types.ObjectId,
  conversationId: string,
  type: CallMediaType
): Promise<{ call: ActiveCallRecord; startedMessage: Awaited<ReturnType<typeof createCallStartedSystemMessage>>['message'] }> {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatMessageError('Invalid conversationId', 400);
  }
  if (type !== 'audio' && type !== 'video') {
    throw new ChatMessageError('type must be audio or video', 400);
  }
  if (!allowStart(userId.toString())) {
    throw new ChatMessageError('Too many call attempts — try again shortly', 429);
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    throw new ChatMessageError('Conversation not found', 404);
  }
  if (!conv.participants.some((p) => p.equals(userId))) {
    throw new ChatMessageError('Not a participant', 403);
  }
  if ((conv as { isLocked?: boolean }).isLocked) {
    throw new ChatMessageError('This chat is locked', 403);
  }

  const callee = conv.participants.find((p) => !p.equals(userId));
  if (!callee) {
    throw new ChatMessageError('Invalid conversation', 400);
  }

  const existingId = conversationToCallId.get(conversationId);
  if (existingId) {
    const existing = calls.get(existingId);
    if (existing && existing.state !== 'ended') {
      throw new ChatMessageError('A call is already in progress for this chat', 409);
    }
  }

  const id = randomUUID();
  const record: ActiveCallRecord = {
    id,
    conversationId,
    callerId: userId.toString(),
    calleeId: callee.toString(),
    type,
    state: 'ringing',
    createdAt: Date.now(),
  };
  calls.set(id, record);
  conversationToCallId.set(conversationId, id);

  const { message: startedMessage } = await createCallStartedSystemMessage(
    userId,
    conversationId,
    id,
    type === 'audio' ? 'voice' : 'video'
  );
  broadcastToConversation(conversationId, 'new_message', { message: startedMessage });

  const fromName = await callerDisplayName(userId);
  emitToUser(record.calleeId, 'incoming_call', {
    callId: id,
    conversationId,
    type,
    fromUserId: record.callerId,
    fromDisplayName: fromName,
  });

  const t = setTimeout(() => {
    void timeoutRingingAsMissed(id);
  }, RING_TIMEOUT_MS);
  ringTimers.set(id, t);

  return { call: record, startedMessage };
}

async function timeoutRingingAsMissed(callId: string) {
  const call = calls.get(callId);
  if (!call || call.state !== 'ringing') return;
  call.state = 'ended';
  call.endedAt = Date.now();
  clearTimers(callId);
  detachConversation(call);
  calls.delete(callId);

  try {
    const { message } = await createCallLogMessage(new Types.ObjectId(call.callerId), call.conversationId, {
      callKind: call.type === 'audio' ? 'voice' : 'video',
      status: 'missed',
      callId,
    });
    broadcastToConversation(call.conversationId, 'new_message', { message });
  } catch (e) {
    console.error('[call] timeoutRingingAsMissed log', e);
  }

  emitToUser(call.callerId, 'call_ended', { callId, reason: 'missed' });
  emitToUser(call.calleeId, 'call_ended', { callId, reason: 'missed' });
}

export async function acceptCall(
  userId: Types.ObjectId,
  callId: string
): Promise<{ call: ActiveCallRecord }> {
  const call = calls.get(callId);
  if (!call || call.state === 'ended') {
    throw new ChatMessageError('Call not found', 404);
  }
  if (call.calleeId !== userId.toString()) {
    throw new ChatMessageError('Only the callee can accept', 403);
  }
  if (call.state !== 'ringing') {
    throw new ChatMessageError('Call is not ringing', 409);
  }

  call.state = 'active';
  call.activeAt = Date.now();
  clearTimers(callId);

  const maxT = setTimeout(() => {
    void forceEndMaxDuration(callId);
  }, MAX_ACTIVE_MS);
  activeTimers.set(callId, maxT);

  emitToUser(call.callerId, 'call_accepted', {
    callId,
    conversationId: call.conversationId,
    type: call.type,
  });

  return { call };
}

async function forceEndMaxDuration(callId: string) {
  const call = calls.get(callId);
  if (!call || call.state !== 'active') return;
  await endCallInternal(call, new Types.ObjectId(call.callerId), 'completed', Math.floor((Date.now() - (call.activeAt ?? call.createdAt)) / 1000));
}

export async function rejectCall(userId: Types.ObjectId, callId: string): Promise<void> {
  const call = calls.get(callId);
  if (!call || call.state === 'ended') {
    throw new ChatMessageError('Call not found', 404);
  }
  if (call.state !== 'ringing') {
    throw new ChatMessageError('Call cannot be rejected now', 409);
  }
  if (call.calleeId !== userId.toString()) {
    throw new ChatMessageError('Only the callee can reject', 403);
  }

  call.state = 'ended';
  call.endedAt = Date.now();
  clearTimers(callId);
  detachConversation(call);
  calls.delete(callId);

  const { message } = await createCallLogMessage(userId, call.conversationId, {
    callKind: call.type === 'audio' ? 'voice' : 'video',
    status: 'declined',
    callId,
  });
  broadcastToConversation(call.conversationId, 'new_message', { message });

  emitToUser(call.callerId, 'call_rejected', { callId, reason: 'declined' });
  emitToUser(call.calleeId, 'call_ended', { callId, reason: 'declined' });
}

/** Caller cancels before answer */
export async function cancelCall(userId: Types.ObjectId, callId: string): Promise<void> {
  const call = calls.get(callId);
  if (!call || call.state === 'ended') {
    throw new ChatMessageError('Call not found', 404);
  }
  if (call.state !== 'ringing') {
    throw new ChatMessageError('Use end for active calls', 409);
  }
  if (call.callerId !== userId.toString()) {
    throw new ChatMessageError('Only the caller can cancel', 403);
  }

  call.state = 'ended';
  call.endedAt = Date.now();
  clearTimers(callId);
  detachConversation(call);
  calls.delete(callId);

  try {
    const { message } = await createCallLogMessage(userId, call.conversationId, {
      callKind: call.type === 'audio' ? 'voice' : 'video',
      status: 'missed',
      callId,
    });
    broadcastToConversation(call.conversationId, 'new_message', { message });
  } catch (e) {
    console.error('[call] cancelCall log', e);
  }

  emitToUser(call.callerId, 'call_ended', { callId, reason: 'cancelled' });
  emitToUser(call.calleeId, 'call_ended', { callId, reason: 'cancelled' });
}

export async function endCall(
  userId: Types.ObjectId,
  callId: string,
  durationSec?: number
): Promise<void> {
  const call = calls.get(callId);
  if (!call || call.state === 'ended') {
    throw new ChatMessageError('Call not found', 404);
  }
  const isCaller = call.callerId === userId.toString();
  const isCallee = call.calleeId === userId.toString();
  if (!isCaller && !isCallee) {
    throw new ChatMessageError('Not a participant', 403);
  }

  if (call.state === 'ringing') {
    if (isCaller) {
      await cancelCall(userId, callId);
      return;
    }
    await rejectCall(userId, callId);
    return;
  }

  const sec =
    durationSec != null && Number.isFinite(durationSec)
      ? Math.max(0, Math.floor(durationSec))
      : Math.max(0, Math.floor((Date.now() - (call.activeAt ?? call.createdAt)) / 1000));

  await endCallInternal(call, userId, 'completed', sec);
}

async function endCallInternal(
  call: ActiveCallRecord,
  endedBy: Types.ObjectId,
  status: 'completed',
  durationSec: number
) {
  if (call.state === 'ended') return;
  call.state = 'ended';
  call.endedAt = Date.now();
  clearTimers(call.id);
  detachConversation(call);
  calls.delete(call.id);

  const { message } = await createCallLogMessage(endedBy, call.conversationId, {
    callKind: call.type === 'audio' ? 'voice' : 'video',
    status,
    durationSec,
    callId: call.id,
  });
  broadcastToConversation(call.conversationId, 'new_message', { message });

  emitToUser(call.callerId, 'call_ended', { callId: call.id, reason: 'completed', durationSec });
  emitToUser(call.calleeId, 'call_ended', { callId: call.id, reason: 'completed', durationSec });
}

function assertParticipant(call: ActiveCallRecord, userId: Types.ObjectId) {
  const s = userId.toString();
  if (call.callerId !== s && call.calleeId !== s) {
    throw new ChatMessageError('Not a participant', 403);
  }
}

export function relayOffer(userId: Types.ObjectId, callId: string, sdp: unknown): void {
  const call = calls.get(callId);
  if (!call || call.state === 'ended') {
    throw new ChatMessageError('Call not found', 404);
  }
  assertParticipant(call, userId);
  if (call.state !== 'ringing' && call.state !== 'active') {
    throw new ChatMessageError('Invalid call state', 409);
  }
  const peer = userId.toString() === call.callerId ? call.calleeId : call.callerId;
  emitToUser(peer, 'webrtc_offer', { callId, sdp, fromUserId: userId.toString() });
}

export function relayAnswer(userId: Types.ObjectId, callId: string, sdp: unknown): void {
  const call = calls.get(callId);
  if (!call || call.state === 'ended') {
    throw new ChatMessageError('Call not found', 404);
  }
  assertParticipant(call, userId);
  const peer = userId.toString() === call.callerId ? call.calleeId : call.callerId;
  emitToUser(peer, 'webrtc_answer', { callId, sdp, fromUserId: userId.toString() });
}

export function relayIceCandidate(userId: Types.ObjectId, callId: string, candidate: unknown): void {
  const call = calls.get(callId);
  if (!call || call.state === 'ended') {
    throw new ChatMessageError('Call not found', 404);
  }
  assertParticipant(call, userId);
  if (call.state !== 'ringing' && call.state !== 'active') {
    throw new ChatMessageError('Invalid call state', 409);
  }
  const peer = userId.toString() === call.callerId ? call.calleeId : call.callerId;
  emitToUser(peer, 'webrtc_ice_candidate', { callId, candidate, fromUserId: userId.toString() });
}

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export function buildIceServersPayload(): { iceServers: IceServerConfig[] } {
  const raw = process.env.WEBRTC_ICE_SERVERS_JSON?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { iceServers?: IceServerConfig[] };
      if (parsed && Array.isArray(parsed.iceServers)) {
        return { iceServers: parsed.iceServers };
      }
    } catch {
      console.warn('[call] WEBRTC_ICE_SERVERS_JSON invalid JSON');
    }
  }

  const servers: IceServerConfig[] = [];

  const stun = process.env.WEBRTC_STUN_URLS?.trim();
  if (stun) {
    for (const u of stun.split(',').map((s) => s.trim()).filter(Boolean)) {
      servers.push({ urls: u });
    }
  } else {
    servers.push({ urls: 'stun:stun.l.google.com:19302' });
  }

  const turnUrl = process.env.WEBRTC_TURN_URL?.trim();
  const turnUser = process.env.WEBRTC_TURN_USERNAME?.trim();
  const turnCred = process.env.WEBRTC_TURN_CREDENTIAL?.trim();
  if (turnUrl && turnUser && turnCred) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnCred,
    });
  }

  return { iceServers: servers };
}
