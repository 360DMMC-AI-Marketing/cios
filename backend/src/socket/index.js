const Notification = require('../models/Notification');

const connectedUsers = new Map();

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const jwt = require('jsonwebtoken');
      const env = require('../config/env');
      const decoded = jwt.verify(token, env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    connectedUsers.set(userId, socket.id);
    console.log(`User connected: ${userId}`);

    socket.join(`user:${userId}`);

    if (socket.userRole === 'admin') {
      socket.join('admin');
    }

    const unreadCount = await Notification.countDocuments({ user: userId, read: false });
    socket.emit('unread_notifications', unreadCount);

    socket.on('join_project', (projectId) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('leave_project', (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('status_update', (data) => {
      io.emit('user_status_changed', { userId, status: data.status });
    });

    socket.on('disconnect', () => {
      connectedUsers.delete(userId);
      console.log(`User disconnected: ${userId}`);
    });
  });

  return io;
}

function getEmitter(io) {
  return {
    notifyUser(userId, notification) {
      io.to(`user:${userId}`).emit('notification', notification);
    },
    notifyProject(projectId, event, data) {
      io.to(`project:${projectId}`).emit(event, data);
    },
    notifyAdmin(event, data) {
      io.to('admin').emit(event, data);
    },
    broadcastActivity(activity) {
      io.emit('new_activity', activity);
    },
    broadcastTaskUpdate(task) {
      io.emit('task_updated', task);
      if (task.project) {
        io.to(`project:${task.project}`).emit('project_task_updated', task);
      }
    },
    broadcastProjectUpdate(project) {
      io.emit('project_updated', project);
      io.to(`project:${project._id}`).emit('project_detail_updated', project);
    },
  };
}

module.exports = { setupSocket, getEmitter, connectedUsers };
