# Keygo Server

Backend API for Keygo - A platform connecting private individuals who want their car relocated with private drivers.

## Tech Stack

- Node.js
- Express
- TypeScript
- MongoDB (Mongoose)
- JWT Authentication
- Socket.io (for real-time chat)

## Project Structure

```
src/
├── config/          # Configuration files (database, etc.)
├── controllers/     # Request handlers
├── middleware/      # Express middleware (auth, error handling)
├── models/          # Mongoose schemas
├── routes/          # API route definitions
├── socket/          # Socket.io handlers
├── types/           # TypeScript type definitions
├── utils/           # Utility functions (JWT, etc.)
└── server.ts        # Application entry point
```

## Core Entities

- **User**: Platform users (can be requester, driver, or both)
- **CarRequest**: Car relocation requests posted by users
- **AgreementLog**: Explicit consent logging for liability acknowledgements
- **ChatMessage**: Messages between users regarding car requests
- **Rating**: User ratings after completed relocations

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Start MongoDB (if running locally)

4. Run in development mode:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/users/register` - Register new user
- `POST /api/users/login` - Login user
- `GET /api/users/profile` - Get current user profile (protected)
- `PUT /api/users/profile` - Update user profile (protected)

### Car Requests
- `POST /api/car-requests` - Create new car request (protected)
- `GET /api/car-requests` - Get all car requests (protected)
- `GET /api/car-requests/:id` - Get single car request (protected)
- `PUT /api/car-requests/:id` - Update car request (protected)
- `DELETE /api/car-requests/:id` - Delete car request (protected)
- `POST /api/car-requests/:id/interest` - Express interest as driver (protected)

### Agreements
- `POST /api/agreements` - Log agreement/consent (protected)
- `GET /api/agreements/car-request/:carRequestId` - Get agreements for car request (protected)

### Chat
- `POST /api/chat` - Send message (protected)
- `GET /api/chat/car-request/:carRequestId` - Get messages for car request (protected)
- `PUT /api/chat/:messageId/read` - Mark message as read (protected)

### Ratings
- `POST /api/ratings` - Create rating (protected)
- `GET /api/ratings/user/:userId` - Get ratings for user (protected)
- `PUT /api/ratings/:id` - Update rating (protected)

## Important Notes

- All endpoints marked as "protected" require JWT authentication via `Authorization: Bearer <token>` header
- The platform is designed as a neutral intermediary - no driver assignment, no payments, no guarantees
- All consent/agreement actions are logged with timestamps and metadata for legal compliance
- Socket.io is used for real-time chat functionality

## Development Status

⚠️ **Note**: All endpoints currently return placeholder responses (501 Not Implemented). Implementation logic needs to be added to controllers.

