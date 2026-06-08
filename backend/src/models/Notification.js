const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ['task_assigned', 'task_updated', 'mention', 'project_update',
           'status_change', 'meeting_reminder', 'deadline_alert', 'system', 'project_invite'],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  link: { type: String, default: '' },
  read: { type: Boolean, default: false },
  actions: [{
    label: { type: String },
    action: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed },
  }],
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

notificationSchema.post('save', function (doc) {
  try {
    const io = require('../app').io;
    io.to(`user:${doc.user}`).emit('notification', doc.toObject());
  } catch (e) { /* socket not ready */ }
});

module.exports = mongoose.model('Notification', notificationSchema);
