const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const TestingItem = require('../models/TestingItem');
const { updateProjectProgress } = require('./taskController');
const { evaluateProjectPhase } = require('../services/phaseService');
const { getDomainProjectIds } = require('../config/planLimits');

const populate = q => q
  .populate('project', 'name status')
  .populate('createdBy', 'name')
  .populate({ path: 'tasks', populate: { path: 'assignee', select: 'name avatar role' } })
  .populate({ path: 'testingItems', populate: { path: 'assignee', select: 'name avatar role' } });

exports.getSprints = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const filter = { project: { $in: projectIds } };
    if (req.query.project) filter.project = req.query.project;
    if (req.query.status) filter.status = req.query.status;
    const sprints = await populate(Sprint.find(filter).sort({ startDate: -1 }));
    res.json(sprints);
  } catch (e) { next(e); }
};

exports.getSprintById = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const sprint = await populate(Sprint.findOne({ _id: req.params.id, project: { $in: projectIds } }));
    if (!sprint) return res.status(404).json({ message: 'Sprint not found' });
    res.json(sprint);
  } catch (e) { next(e); }
};

exports.createSprint = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (req.body.project && !projectIds.includes(req.body.project)) {
      return res.status(403).json({ message: 'Project not in your domain' });
    }
    let tasks = req.body.tasks || [];
    if ((!tasks || tasks.length === 0) && req.body.project) {
      const projectTasks = await Task.find({ project: req.body.project, isActive: true }).select('_id');
      tasks = projectTasks.map(t => t._id);
    }
    const sprint = await Sprint.create({ ...req.body, tasks, createdBy: req.user._id });
    if (req.body.project) await evaluateProjectPhase(req.body.project);
    res.status(201).json(await populate(Sprint.findById(sprint._id)));
  } catch (e) { next(e); }
};

exports.updateSprint = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const allowed = ['name', 'goal', 'startDate', 'endDate', 'status', 'completedAt'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    let isReopen = false;
    if (req.body.status === 'completed') {
      const sprint = await Sprint.findOne({ _id: req.params.id, project: { $in: projectIds } }).select('createdBy status');
      if (!sprint) return res.status(404).json({ message: 'Sprint not found' });
      const MANAGER_ROLES = ['admin', 'project_manager', 'team_lead'];
      const isManager = MANAGER_ROLES.includes(req.user.role);
      const isCreator = sprint.createdBy && String(sprint.createdBy) === String(req.user._id);
      if (!isManager && !isCreator) {
        return res.status(403).json({ message: 'Only the sprint creator, project manager, team lead, or admin can mark a sprint as completed' });
      }
      updates.completedAt = new Date();
    } else if (req.body.status === 'active') {
      const prev = await Sprint.findOne({ _id: req.params.id, project: { $in: projectIds } }).select('status');
      if (prev && prev.status === 'completed') isReopen = true;
      updates.completedAt = null;
    }
    const sprint = await populate(Sprint.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, updates, { new: true }));
    if (!sprint) return res.status(404).json({ message: 'Sprint not found' });
    if (sprint.project && !isReopen) { updateProjectProgress(sprint.project); await evaluateProjectPhase(sprint.project); }
    res.json(sprint);
  } catch (e) { next(e); }
};

exports.addTaskToSprint = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const sprint = await populate(Sprint.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, { $addToSet: { tasks: req.body.taskId } }, { new: true }));
    if (!sprint) return res.status(404).json({ message: 'Sprint not found' });
    res.json(sprint);
  } catch (e) { next(e); }
};

exports.removeTaskFromSprint = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const sprint = await populate(Sprint.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, { $pull: { tasks: req.params.taskId } }, { new: true }));
    res.json(sprint);
  } catch (e) { next(e); }
};

exports.deleteSprint = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const sprint = await Sprint.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!sprint) return res.status(404).json({ message: 'Sprint not found' });
    const projectId = sprint?.project;
    await Sprint.findOneAndDelete({ _id: req.params.id, project: { $in: projectIds } });
    if (projectId) { updateProjectProgress(projectId); await evaluateProjectPhase(projectId); }
    res.json({ message: 'Sprint deleted' });
  } catch (e) { next(e); }
};
