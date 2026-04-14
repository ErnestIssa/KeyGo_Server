import type { Response } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import {
  acceptCall,
  buildIceServersPayload,
  cancelCall,
  endCall,
  rejectCall,
  relayAnswer,
  relayIceCandidate,
  relayOffer,
  startCall,
} from '../services/callService';
import { ChatMessageError } from '../services/chatMessageService';

export const getIceConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json(buildIceServersPayload());
};

export const postStartCall = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { conversationId, type } = req.body as { conversationId?: string; type?: string };
    if (!conversationId || typeof conversationId !== 'string') {
      res.status(400).json({ error: 'conversationId is required' });
      return;
    }
    if (type !== 'audio' && type !== 'video') {
      res.status(400).json({ error: 'type must be audio or video' });
      return;
    }
    const { call, startedMessage } = await startCall(meId, conversationId, type);
    res.status(201).json({
      call: {
        id: call.id,
        conversationId: call.conversationId,
        callerId: call.callerId,
        calleeId: call.calleeId,
        type: call.type,
        state: call.state,
        createdAt: call.createdAt,
      },
      startedMessage,
    });
  } catch (e) {
    if (e instanceof ChatMessageError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[call] start', e);
    res.status(500).json({ error: 'Failed to start call' });
  }
};

export const postAcceptCall = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { callId } = req.body as { callId?: string };
    if (!callId || typeof callId !== 'string') {
      res.status(400).json({ error: 'callId is required' });
      return;
    }
    const { call } = await acceptCall(meId, callId);
    res.json({
      call: {
        id: call.id,
        conversationId: call.conversationId,
        state: call.state,
        activeAt: call.activeAt,
      },
    });
  } catch (e) {
    if (e instanceof ChatMessageError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[call] accept', e);
    res.status(500).json({ error: 'Failed to accept call' });
  }
};

export const postRejectCall = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { callId } = req.body as { callId?: string };
    if (!callId || typeof callId !== 'string') {
      res.status(400).json({ error: 'callId is required' });
      return;
    }
    await rejectCall(meId, callId);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatMessageError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[call] reject', e);
    res.status(500).json({ error: 'Failed to reject call' });
  }
};

export const postCancelCall = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { callId } = req.body as { callId?: string };
    if (!callId || typeof callId !== 'string') {
      res.status(400).json({ error: 'callId is required' });
      return;
    }
    await cancelCall(meId, callId);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatMessageError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[call] cancel', e);
    res.status(500).json({ error: 'Failed to cancel call' });
  }
};

export const postEndCall = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { callId, durationSec } = req.body as { callId?: string; durationSec?: number };
    if (!callId || typeof callId !== 'string') {
      res.status(400).json({ error: 'callId is required' });
      return;
    }
    await endCall(meId, callId, durationSec);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatMessageError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[call] end', e);
    res.status(500).json({ error: 'Failed to end call' });
  }
};

export const postSignalOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { callId, sdp } = req.body as { callId?: string; sdp?: unknown };
    if (!callId || sdp === undefined) {
      res.status(400).json({ error: 'callId and sdp required' });
      return;
    }
    relayOffer(meId, callId, sdp);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatMessageError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[call] offer', e);
    res.status(500).json({ error: 'Failed to relay offer' });
  }
};

export const postSignalAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { callId, sdp } = req.body as { callId?: string; sdp?: unknown };
    if (!callId || sdp === undefined) {
      res.status(400).json({ error: 'callId and sdp required' });
      return;
    }
    relayAnswer(meId, callId, sdp);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatMessageError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[call] answer', e);
    res.status(500).json({ error: 'Failed to relay answer' });
  }
};

export const postSignalIce = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meId = (req.user as { _id: Types.ObjectId })._id;
    const { callId, candidate } = req.body as { callId?: string; candidate?: unknown };
    if (!callId || candidate === undefined) {
      res.status(400).json({ error: 'callId and candidate required' });
      return;
    }
    relayIceCandidate(meId, callId, candidate);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatMessageError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[call] ice', e);
    res.status(500).json({ error: 'Failed to relay ICE candidate' });
  }
};
