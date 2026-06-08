const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ['github_commit', 'github_pr', 'github_issue', 'clickup_update',
           'teams_message', 'teams_meeting', 'outlook_email', 'outlook_calendar',
           'login', 'task_update', 'project_update'],
    required: true,
  },
  source: { type: String, enum: ['github', 'clickup', 'teams', 'outlook', 'internal'], required: true },
  description: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  score: { type: Number, default: 1 },
}, { timestamps: true });

activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);
