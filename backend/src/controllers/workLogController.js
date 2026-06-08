const WorkLog = require('../models/WorkLog');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { getDomainProjectIds } = require('../config/planLimits');

exports.create = async (req, res, next) => {
  try {
    const { date, project, task, taskTitle, hours, category, description, notes, mood } = req.body;
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.includes(project)) {
      return res.status(403).json({ message: 'Project not in your domain' });
    }
    const doc = await WorkLog.create({
      user: req.user._id, date, project, task, taskTitle, hours,
      category: category || 'development', description: description || '',
      notes: notes || '', mood: mood || 'good',
    });
    const populated = await WorkLog.findById(doc._id)
      .populate('project', 'name')
      .populate('task', 'title');
    res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Duplicate entry: you already logged this task today' });
    }
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { hours, category, description, notes, mood } = req.body;
    const existing = await WorkLog.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Work log not found' });
    if (!existing.user.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.includes(existing.project.toString())) {
      return res.status(403).json({ message: 'Project not in your domain' });
    }
    const doc = await WorkLog.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { hours, category, description, notes, mood },
      { new: true, runValidators: true }
    ).populate('project', 'name').populate('task', 'title');
    res.json(doc);
  } catch (error) {
    next(error);
  }
};

exports.getMyLogs = async (req, res, next) => {
  try {
    const { date } = req.query;
    const projectIds = await getDomainProjectIds(req.user.domain);
    const filter = { user: req.user._id, project: { $in: projectIds } };
    if (date) filter.date = date;
    const docs = await WorkLog.find(filter)
      .populate('project', 'name')
      .populate('task', 'title')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (error) {
    next(error);
  }
};

exports.getTeamLogs = async (req, res, next) => {
  try {
    if (!['admin', 'project_manager', 'team_lead', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const projectIds = await getDomainProjectIds(req.user.domain);
    const { date } = req.query;
    const filter = { project: { $in: projectIds } };
    if (date) filter.date = date;
    else {
      const today = new Date().toISOString().slice(0, 10);
      filter.date = today;
    }
    const docs = await WorkLog.find(filter)
      .populate('user', 'name email avatar role')
      .populate('project', 'name')
      .populate('task', 'title')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (error) {
    next(error);
  }
};

exports.getHistory = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.user._id;
    const days = 14;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().slice(0, 10);
    const projectIds = await getDomainProjectIds(req.user.domain);
    const docs = await WorkLog.find({
      user: userId,
      project: { $in: projectIds },
      date: { $gte: startStr },
    }).populate('project', 'name').populate('task', 'title').sort({ date: -1, createdAt: -1 });
    res.json(docs);
  } catch (error) {
    next(error);
  }
};

exports.getUserProjectsAndTasks = async (req, res, next) => {
  try {
    const domainProjectIds = await getDomainProjectIds(req.user.domain);
    const taskProjectIds = await Task.distinct('project', { assignee: req.user._id, isActive: true, project: { $in: domainProjectIds } });
    const projectIds = taskProjectIds.filter(id => domainProjectIds.includes(id.toString()));
    const projects = await Project.find({ _id: { $in: projectIds }, isActive: true }).select('name');
    const tasks = await Task.find({ assignee: req.user._id, isActive: true, project: { $in: domainProjectIds } }).select('title project').populate('project', 'name');
    res.json({ projects, tasks });
  } catch (error) {
    next(error);
  }
};
