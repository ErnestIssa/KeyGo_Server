import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { setupChatSocket } from './socket/chatSocket';

// Routes
import userRoutes from './routes/userRoutes';
import carRequestRoutes from './routes/carRequestRoutes';
import agreementRoutes from './routes/agreementRoutes';
import chatRoutes from './routes/chatRoutes';
import ratingRoutes from './routes/ratingRoutes';

dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/car-requests', carRequestRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ratings', ratingRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Setup Socket.io for real-time chat
setupChatSocket(io);

// Start server
const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

