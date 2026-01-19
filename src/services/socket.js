import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

let io;

/**
 * Initialize Socket.IO server
 */
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token missing'));
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return next(new Error('Invalid token'));
      }

      // For impersonation tokens, use superAdminId; for regular tokens, use userId
      const userId = decoded.isImpersonating ? decoded.superAdminId : decoded.userId;
      const user = await User.findById(userId);
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id.toString();
      socket.organizationId = decoded.isImpersonating 
        ? decoded.targetOrganizationId.toString() 
        : user.organizationId?.toString();
      
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`✅ Socket connected: ${socket.id} (User: ${socket.userId})`);

    // Join user-specific room
    socket.join(`user-${socket.userId}`);

    // Join organization-specific room
    if (socket.organizationId) {
      socket.join(`org-${socket.organizationId}`);
    }

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });

    // Handle task updates
    socket.on('task-update', (data) => {
      if (socket.organizationId) {
        // Broadcast to all users in the organization
        socket.to(`org-${socket.organizationId}`).emit('task-updated', data);
      }
    });
  });

  console.log('✅ Socket.IO initialized');
  return io;
};

/**
 * Get Socket.IO instance
 */
export const getIO = () => {
  if (!io) {
    console.warn('⚠️  Socket.IO not initialized - notifications will not be sent in real-time');
    return null;
  }
  return io;
};

/**
 * Emit event to specific user
 */
export const emitToUser = (userId, event, data) => {
  try {
    if (io) {
      const room = `user-${userId}`;
      io.to(room).emit(event, data);
      console.log(`📤 Emitted '${event}' to ${room}`);
    } else {
      console.warn('⚠️  Socket.IO not available - event not sent:', event);
    }
  } catch (error) {
    console.error('❌ Error emitting to user:', error.message);
  }
};

/**
 * Emit event to organization
 */
export const emitToOrganization = (organizationId, event, data) => {
  try {
    if (io) {
      const room = `org-${organizationId}`;
      io.to(room).emit(event, data);
      console.log(`📤 Emitted '${event}' to ${room}`);
    } else {
      console.warn('⚠️  Socket.IO not available - event not sent:', event);
    }
  } catch (error) {
    console.error('❌ Error emitting to organization:', error.message);
  }
};

export default { initSocket, getIO, emitToUser, emitToOrganization };
