import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { authenticate } from '../middleware/auth';
import { verifyToken } from '../utils/jwt';
import User from '../models/User';

export const setupChatSocket = (io: SocketIOServer): void => {
  // Socket.io authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.data.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.data.user.email}`);

    // Join room for a specific car request
    socket.on('join_car_request', (carRequestId: string) => {
      socket.join(`car_request_${carRequestId}`);
      console.log(`User ${socket.data.user.email} joined car request ${carRequestId}`);
    });

    // Leave room
    socket.on('leave_car_request', (carRequestId: string) => {
      socket.leave(`car_request_${carRequestId}`);
    });

    // Handle new message (placeholder)
    socket.on('send_message', (data) => {
      // TODO: Implement message handling logic
      // For now, just broadcast to the room
      io.to(`car_request_${data.carRequestId}`).emit('new_message', {
        ...data,
        sender: socket.data.user.email,
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.data.user.email}`);
    });
  });
};

