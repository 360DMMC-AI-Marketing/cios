const User = require('../models/User');
const Company = require('../models/Company');
const Activity = require('../models/Activity');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { enforceUserLimit } = require('../config/planLimits');

exports.getUsers = async (req, res, next) => {
  try {
    const { role, status, search, hasOutlook } = req.query;
    const filter = { domain: req.user.domain };
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (hasOutlook === 'true') filter.outlookEmail = { $ne: '' };

    const users = await User.find(filter).populate('assignedProjects');
    res.json(users);
  } catch (error) {
    next(error);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, domain: req.user.domain }).populate('assignedProjects');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, outlookEmail, githubUsername, clickupId, teamsId } = req.body;
    const domain = req.user.domain || email.split('@')[1]?.toLowerCase() || '';
    const company = await Company.findOne({ domain });
    if (company) {
      const result = await enforceUserLimit(company.domain, company.plan);
      if (!result.allowed) {
        return res.status(403).json({ message: result.message });
      }
    }
    const user = await User.create({
      name, email, password, domain,
      role: role || 'developer',
      outlookEmail: outlookEmail || '',
      githubUsername: githubUsername || '',
      clickupId: clickupId || '',
      teamsId: teamsId || '',
    });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const allowed = ['name', 'email', 'role', 'status', 'isActive', 'assignedProjects',
                     'githubUsername', 'clickupId', 'teamsId', 'outlookEmail'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const target = await User.findOne({ _id: req.params.id, domain: req.user.domain });
    if (!target) return res.status(404).json({ message: 'User not found' });

    // Role change restrictions
    if (updates.role && updates.role !== target.role) {
      // Cannot demote an admin
      if (target.role === 'admin') {
        return res.status(403).json({ message: 'Admin role cannot be changed' });
      }
      // Only admins can promote someone to admin
      if (updates.role === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can assign the admin role' });
      }
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, domain: req.user.domain },
      updates,
      { new: true, runValidators: true }
    );
    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, domain: req.user.domain },
      { isActive: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
};

exports.getUserActivity = async (req, res, next) => {
  try {
    const target = await User.findOne({ _id: req.params.id, domain: req.user.domain });
    if (!target) return res.status(404).json({ message: 'User not found' });

    const { days = 7 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const activities = await Activity.find({
      user: req.params.id,
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 }).limit(100);
    res.json(activities);
  } catch (error) {
    next(error);
  }
};

exports.getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, domain: req.user.domain }).populate('assignedProjects', 'name status');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [activities, openTasks, completedCount] = await Promise.all([
      Activity.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(50).lean(),
      Task.find({ assignee: req.params.id, status: { $ne: 'done' }, isActive: true })
        .select('title status priority project deadline')
        .populate('project', 'name')
        .sort({ createdAt: -1 })
        .lean(),
      Task.countDocuments({ assignee: req.params.id, status: 'done', isActive: true }),
    ]);

    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);
    const completedThisWeek = await Task.countDocuments({
      assignee: req.params.id, status: 'done', isActive: true,
      updatedAt: { $gte: thisWeekStart },
    });

    res.json({ user, activities, openTasks, completedCount, completedThisWeek });
  } catch (error) {
    next(error);
  }
};
