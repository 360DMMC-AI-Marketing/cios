const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  path: String,
  mimeType: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
});

const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

const testingItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  stepsToReproduce: { type: String, default: '' },
  expectedResult: { type: String, default: '' },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'in_review', 'passed', 'failed', 'blocked', 'on_hold', 'completed'],
    default: 'todo',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent', 'blocker', 'critical'],
    default: 'medium',
  },
  type: {
    type: String,
    enum: ['test_case', 'bug', 'test_run'],
    default: 'test_case',
  },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  sprint: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint' },
  linkedTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  deadline: { type: Date },
  attachments: [attachmentSchema],
  comments: [commentSchema],
  auditLog: [
    {
      action: String,
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      field: String,
      oldValue: String,
      newValue: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('TestingItem', testingItemSchema);
