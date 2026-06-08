const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role: {
    type: String,
    enum: ['admin', 'team_lead', 'project_manager', 'manager', 'qa_tester', 'developer', 'intern', 'other'],
    default: 'developer',
  },
  status: { type: String, enum: ['active', 'idle', 'in_meeting', 'inactive', 'offline'], default: 'offline' },
  activityScore: { type: Number, default: 0, min: 0, max: 100 },
  avatar: { type: String, default: '' },
  domain: { type: String, default: '' },
  assignedProjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  githubUsername: { type: String, default: '' },
  clickupId: { type: String, default: '' },
  teamsId: { type: String, default: '' },
  outlookEmail: { type: String, default: '' },
  figmaUsername: { type: String, default: '' },
  lovableUsername: { type: String, default: '' },
  lastActive: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  onboardingCompleted: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};
module.exports = mongoose.model('User', userSchema);
