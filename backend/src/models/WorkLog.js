const mongoose = require('mongoose');

const workLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  taskTitle: { type: String, default: '' },
  hours: { type: Number, required: true, min: 0.5, max: 24 },
  category: {
    type: String,
    enum: ['development', 'meeting', 'review', 'testing', 'deployment', 'other'],
    default: 'development',
  },
  description: { type: String, default: '' },
  notes: { type: String, default: '' },
  mood: { type: String, enum: ['great', 'good', 'okay', 'difficult'], default: 'good' },
}, { timestamps: true });

workLogSchema.index({ user: 1, date: 1 });
workLogSchema.index({ user: 1, date: 1, task: 1 }, { unique: true });

module.exports = mongoose.model('WorkLog', workLogSchema);
