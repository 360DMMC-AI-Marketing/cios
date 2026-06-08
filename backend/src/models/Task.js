const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  completed: { type: Boolean, default: false },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'review', 'done', 'delayed'],
    default: 'todo',
  },
  type: { type: String, enum: ['task', 'bug', 'test_case'], default: 'task' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent', 'blocker', 'critical'], default: 'medium' },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  sprint: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint' },
  deadline: { type: Date },
  clickupTaskId: { type: String, default: '' },
  linkedPRs: [{ type: String }],
  linkedCommits: [{ type: String }],
  estimatedHours: { type: Number, default: 0 },
  loggedHours: { type: Number, default: 0 },
  subtasks: [subtaskSchema],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
