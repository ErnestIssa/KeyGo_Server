Below is a **complete system design + implementation plan** for adding **audio calls, video calls, and audio notes** to your existing backend (**KeyGo_Server**) while keeping the backend as the “brain” for all logic and control.

I’ll structure it so you can directly feed each section into Cursor AI step-by-step.

---

# 🧠 1. CORE IDEA (IMPORTANT ARCHITECTURE SHIFT)

You are NOT building “calling inside frontend”.

You are building:

> **Backend-controlled real-time communication system (KeyGo_Server is the orchestrator)**

Frontend only:

* shows UI
* sends user actions
* receives events

Backend does:

* call creation
* call routing logic
* authentication
* signaling coordination
* session tracking
* permissions
* message + audio note handling

---

# 🏗️ 2. HIGH LEVEL SYSTEM ARCHITECTURE

You will add 3 new systems into KeyGo_Server:

## 📞 A. Real-time Call System (WebRTC signaling layer)

Handles:

* audio calls
* video calls
* call setup / accept / reject
* ICE candidate exchange

## 🎙️ B. Audio Note System

Handles:

* voice message recording
* upload
* storage
* playback delivery

## 💬 C. Extend existing chat system

Adds:

* call events inside chat
* audio messages inside chat threads

---

# 🧩 3. NEW BACKEND MODULES (KEYGO_SERVER)

You will create:

```
/modules
  /realtime
  /calls
  /audio-notes
  /media
  /signaling
```

---

# 📞 4. CALL SYSTEM (MOST IMPORTANT)

## 🧠 Concept

You are NOT streaming video through backend.

Instead:

* Backend coordinates connection
* Clients connect directly via WebRTC

Backend = “air traffic control”

---

## 🔁 CALL FLOW

### 1. Start call

Frontend → Backend:

```json
POST /calls/start
{
  "fromUserId": "A",
  "toUserId": "B",
  "type": "audio | video"
}
```

Backend:

* checks if user is online
* creates call session
* stores call state
* sends realtime event

---

### 2. Backend emits event

Via WebSocket:

```json
{
  "event": "incoming_call",
  "callId": "123",
  "from": "A",
  "type": "video"
}
```

---

### 3. User accepts call

```json
POST /calls/accept
{
  "callId": "123"
}
```

Backend:

* updates call state → ACTIVE
* notifies caller

---

### 4. WebRTC negotiation (SIGNALING CONTROL)

Backend handles:

* SDP offer
* SDP answer
* ICE candidates

Endpoints:

```
POST /calls/signal/offer
POST /calls/signal/answer
POST /calls/signal/ice
```

Backend responsibility:

* validate sender
* forward to correct user
* store temporary session state

---

## 🧠 CALL STATE MACHINE

```
IDLE
 → CALLING
 → RINGING
 → CONNECTING
 → ACTIVE
 → ENDED
```

Backend MUST enforce transitions.

---

# 📡 5. WEBSOCKET LAYER (REAL-TIME CORE)

Add:

```
/realtime/gateway
```

Events:

### Incoming call

```json
incoming_call
```

### Call accepted

```json
call_accepted
```

### Call rejected

```json
call_rejected
```

### Call ended

```json
call_ended
```

### ICE exchange

```json
webrtc_ice_candidate
```

---

# 🎙️ 6. AUDIO NOTES SYSTEM

This is separate from live calls.

## FLOW:

### 1. User records audio in frontend

→ sends file to backend

```
POST /audio-notes/upload
```

---

### 2. Backend processes:

* validates file
* compresses audio (optional)
* uploads to storage (S3 / Cloudinary / local)

---

### 3. Backend stores:

```json
{
  "id": "audio123",
  "from": "A",
  "to": "B",
  "url": "...",
  "duration": 12,
  "createdAt": "..."
}
```

---

### 4. Send as chat message:

Audio note = message type:

```json
{
  "type": "audio",
  "chatId": "chat123",
  "audioUrl": "...",
  "duration": 12
}
```

---

# 💬 7. INTEGRATION WITH EXISTING CHAT SYSTEM

You MUST extend your chat schema:

## MESSAGE TYPES:

```
text
image
audio_note
call_event
video_call_event
```

---

## CALLS INSIDE CHAT

When call starts:

Backend auto-creates system message:

```json
{
  "type": "call_event",
  "content": "Audio call started",
  "callId": "123"
}
```

When call ends:

```json
{
  "type": "call_event",
  "content": "Call ended (12:33)"
}
```

---

# 🔐 8. AUTH + SECURITY RULES

Backend MUST enforce:

* only participants can join call
* no random ICE exchange
* validate all signaling messages
* block spam call requests
* rate limit calls per user

---

# 🌍 9. MEDIA + INFRASTRUCTURE

## You need:

### Storage

* S3 / Cloudinary / local storage

### TURN server (IMPORTANT)

* Coturn server
* fallback when WebRTC fails

### WebSocket server

* Node.js (Socket.IO or native ws)

---

# ⚙️ 10. BACKEND RESPONSIBILITIES (VERY IMPORTANT)

KeyGo_Server is responsible for:

### ✔ Call orchestration

* create call session
* manage call state
* handle accept/reject/end

### ✔ Signaling relay

* SDP exchange
* ICE candidate forwarding

### ✔ Authentication

* ensure user identity

### ✔ Chat integration

* insert call messages into chat

### ✔ Audio notes

* upload + storage + message creation

### ❌ Backend does NOT:

* stream video/audio
* process real-time media

---

# 🚀 11. IMPLEMENTATION ORDER (FOR CURSOR AI)

Use this exact sequence:

---

## STEP 1 — Add WebSocket Gateway

* real-time connection layer
* user presence tracking

---

## STEP 2 — Create Call Module

* call state model
* start/accept/reject/end endpoints

---

## STEP 3 — Implement Signaling

* offer/answer/ICE relay system

---

## STEP 4 — Integrate WebRTC flow

* backend only forwards data

---

## STEP 5 — Add Audio Notes Module

* upload endpoint
* storage
* chat integration

---

## STEP 6 — Extend Chat System

* add call messages
* add audio message type

---

## STEP 7 — Add TURN/STUN config support

* environment variables
* connection fallback rules

---

## STEP 8 — Add scaling protections

* rate limits
* max call duration
* spam prevention

---

# 🧠 12. FINAL MENTAL MODEL (IMPORTANT)

Think of it like this:

### KeyGo_Server = CONTROL TOWER

* decides who can talk
* sets up connections
* tracks everything

### WebRTC = PHONE NETWORK

* carries audio/video
* runs directly between users

### WebSocket = WALKIE TALKIE SYSTEM

* coordinates everything in real-time

---

## 13. Implementation status (KeyGo_Server backend)

Implemented in this repo (orchestration + signaling relay + chat integration):

| Step | Status |
|------|--------|
| 1 WebSocket gateway / user rooms | Done — each socket joins `user:<userId>` for direct call events |
| 2 Call module (start / accept / reject / cancel / end) | Done — `POST /api/calls/*` |
| 3 Signaling relay | Done — `POST /api/calls/signal/offer|answer|ice` + Socket.IO events to peer |
| 4 WebRTC flow | Clients use `GET /api/calls/ice-config` + relayed SDP/ICE only |
| 5 Audio notes | Done — `POST /api/audio-notes/upload` (audio-only multer); existing `POST /api/messages/upload` with `kind=audio` still works |
| 6 Chat extensions | Done — `kind: system` “call started” + `kind: call` summary logs; optional `callId` on `Message` |
| 7 TURN/STUN env | Done — `.env.example` documents `WEBRTC_*` |
| 8 Scaling protections | Partial — rate limit on starts, max ring time, max active duration; horizontal scaling needs Redis-backed call store later |

### REST (authenticated, `Authorization: Bearer …`)

- `GET /api/calls/ice-config` — `{ iceServers: [...] }`
- `POST /api/calls/start` — `{ conversationId, type: "audio" | "video" }`
- `POST /api/calls/accept` — `{ callId }`
- `POST /api/calls/reject` — `{ callId }` (callee, ringing)
- `POST /api/calls/cancel` — `{ callId }` (caller, ringing)
- `POST /api/calls/end` — `{ callId, durationSec? }` (active call)
- `POST /api/calls/signal/offer` — `{ callId, sdp }`
- `POST /api/calls/signal/answer` — `{ callId, sdp }`
- `POST /api/calls/signal/ice` — `{ callId, candidate }`
- `POST /api/audio-notes/upload` — multipart: `file`, `conversationId`, optional `caption`, `durationSec`

### Socket.IO events (same auth as chat)

**To client (listen):** `incoming_call`, `call_accepted`, `call_rejected`, `call_ended`, `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`

**Chat:** `new_message` includes system line when a call starts and `call` kind when a call ends / is missed / declined (same as before, now with optional `callId` on payloads).

### What you must provide manually

1. **TURN server** (e.g. Coturn) for reliable video/voice on cellular/symmetric NAT — set `WEBRTC_TURN_*` or `WEBRTC_ICE_SERVERS_JSON`.
2. **Client apps** — WebRTC UI (getUserMedia, RTCPeerConnection), wire REST + Socket.IO handlers above.
3. **Production scaling** — current call state is in-memory per process; multiple server instances need a shared store (e.g. Redis) for calls + optional adapter for Socket.IO.

---

