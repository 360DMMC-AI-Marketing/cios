const mongoose = require('mongoose');
const sprintSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['planning', 'active', 'completed', 'cancelled'], default: 'planning' },
  goal: { type: String, default: '' },
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  testingItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestingItem' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedAt: { type: Date },
}, { timestamps: true });
module.exports = mongoose.model('Sprint', sprintSchema);
