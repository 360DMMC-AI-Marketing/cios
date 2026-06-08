const User = require('../models/User');
const Activity = require('../models/Activity');

const WEIGHTS = {
  github_commit: 10,
  github_pr: 8,
  github_issue: 5,
  clickup_update: 6,
  teams_message: 4,
  teams_meeting: 7,
  outlook_email: 3,
  outlook_calendar: 5,
  login: 2,
  task_update: 6,
  project_update: 4,
};

const IDLE_THRESHOLD_MINUTES = 30;
const INACTIVE_THRESHOLD_HOURS = 24;

exports.calculateActivityScore = async (userId) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const activities = await Activity.find({
    user: userId,
    createdAt: { $gte: sevenDaysAgo },
  });

  let totalScore = 0;
  activities.forEach((a) => {
    totalScore += (WEIGHTS[a.type] || 1) * a.score;
  });

  const score = Math.min(100, Math.round(totalScore / 10));
  return score;
};

exports.determineStatus = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return 'offline';

  const now = new Date();
  const lastActive = user.lastActive || now;
  const diffMinutes = (now - lastActive) / (1000 * 60);
  const diffHours = diffMinutes / 60;

  if (diffHours > INACTIVE_THRESHOLD_HOURS) return 'inactive';
  if (diffMinutes > IDLE_THRESHOLD_MINUTES) return 'idle';

  const recentActivities = await Activity.find({
    user: userId,
    createdAt: { $gte: new Date(now - 30 * 60 * 1000) },
  }).sort({ createdAt: -1 }).limit(1);

  if (recentActivities.length === 0) return 'idle';

  const lastType = recentActivities[0].type;
  if (lastType === 'teams_meeting' || lastType === 'outlook_calendar') {
    return 'in_meeting';
  }

  return 'active';
};

exports.updateUserStatusAndScore = async (userId) => {
  const status = await exports.determineStatus(userId);
  const activityScore = await exports.calculateActivityScore(userId);

  await User.findByIdAndUpdate(userId, {
    status,
    activityScore,
    lastActive: new Date(),
  });

  return { status, activityScore };
};

exports.runStatusEngine = async () => {
  const users = await User.find({ isActive: true });
  for (const user of users) {
    await exports.updateUserStatusAndScore(user._id);
  }
};
