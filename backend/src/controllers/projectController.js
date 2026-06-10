const Project = require('../models/Project');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const Integration = require('../models/Integration');
const Company = require('../models/Company');
const microsoftGraphService = require('../services/microsoftGraphService');
const { evaluateProjectPhase, PHASES } = require('../services/phaseService');
const { enforceProjectLimit } = require('../config/planLimits');

exports.getProjects = async (req, res, next) => {
  try {
    const filter = { domain: req.user.domain, isActive: true };
    if (req.user.role !== 'admin') {
      const taskProjectIds = await Task.distinct('project', { assignee: req.user._id, isActive: true, scope: 'project' });
      filter.$or = [
        { members: req.user._id },
        { _id: { $in: taskProjectIds } },
      ];
    }
    const projects = await Project.find(filter)
      .populate('members', 'name email role avatar')
      .populate('tasks')
      .sort({ updatedAt: -1 });
    res.json(projects);
  } catch (error) {
    next(error);
  }
};

exports.getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, domain: req.user.domain, isActive: true })
      .populate('members', 'name email avatar role activityScore status')
      .populate({ path: 'tasks', match: { isActive: true }, populate: { path: 'assignee', select: 'name email avatar role outlookEmail' } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (error) {
    next(error);
  }
};

exports.createProject = async (req, res, next) => {
  try {
    const domain = req.user.domain;
    const company = domain ? await Company.findOne({ domain }) : null;
    if (company) {
      const result = await enforceProjectLimit(company.domain, company.plan);
      if (!result.allowed) {
        return res.status(403).json({ message: result.message });
      }
    }
    const project = await Project.create({ ...req.body, domain, phase: 'discovery' });
    if (req.body.members && req.body.members.length > 0) {
      await updateUserProjects(req.body.members, project._id);
    }
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
};

exports.updateProject = async (req, res, next) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, domain: req.user.domain },
      req.body,
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    await evaluateProjectPhase(req.params.id);
    res.json(project);
  } catch (error) {
    next(error);
  }
};

exports.evaluatePhase = async (req, res, next) => {
  try {
    const { updateProjectProgress } = require('./taskController');
    await updateProjectProgress(req.params.id);
    const phase = await evaluateProjectPhase(req.params.id);
    const project = await Project.findOne({ _id: req.params.id, domain: req.user.domain })
      .populate('members', 'name email avatar role activityScore status')
      .populate({ path: 'tasks', match: { isActive: true }, populate: { path: 'assignee', select: 'name email avatar role' } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ phase: project.phase, project });
  } catch (e) { next(e); }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, domain: req.user.domain },
      { isActive: false },
      { new: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    await Task.updateMany({ project: req.params.id }, { isActive: false });
    res.json({ message: 'Project deactivated' });
  } catch (error) {
    next(error);
  }
};

exports.getProjectAnalytics = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, domain: req.user.domain, isActive: true }).populate('tasks');
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const totalTasks = project.tasks.length;
    const doneTasks = project.tasks.filter((t) => t.status === 'done').length;
    const overdueTasks = project.tasks.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done').length;
    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    res.json({
      totalTasks,
      doneTasks,
      overdueTasks,
      completionRate,
      progress: project.progress,
      status: project.status,
      deadline: project.deadline,
    });
  } catch (error) {
    next(error);
  }
};

async function updateUserProjects(userIds, projectId) {
  const User = require('../models/User');
  for (const userId of userIds) {
    await User.findByIdAndUpdate(userId, { $addToSet: { assignedProjects: projectId } });
  }
}

exports.markLaunched = async (req, res, next) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, domain: req.user.domain },
      { phase: 'launched', status: 'ready_to_test', launchedAt: new Date() },
      { new: true }
    ).populate('members', 'name email avatar role activityScore status')
     .populate({ path: 'tasks', match: { isActive: true }, populate: { path: 'assignee', select: 'name email avatar role' } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const notified = new Set();
    for (const m of project.members) {
      if (notified.has(m._id.toString())) continue;
      notified.add(m._id.toString());
      await Notification.create({
        user: m._id,
        domain: req.user.domain,
        type: 'project_update',
        title: `🚀 Project Launched: ${project.name}`,
        message: `${req.user.name} has launched the project "${project.name}"`,
        link: `/projects/${project._id}`,
      });
    }
    res.json(project);
  } catch (e) { next(e); }
};

exports.markDelivered = async (req, res, next) => {
  try {
    const { deliveryNotes } = req.body;
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, domain: req.user.domain },
      { phase: 'delivered', status: 'completed', deliveredAt: new Date(), deliveryNotes: deliveryNotes || '', progress: 100 },
      { new: true }
    ).populate('members', 'name email avatar role activityScore status')
     .populate({ path: 'tasks', match: { isActive: true }, populate: { path: 'assignee', select: 'name email avatar role' } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const notified = new Set();
    for (const m of project.members) {
      if (notified.has(m._id.toString())) continue;
      notified.add(m._id.toString());
      await Notification.create({
        user: m._id,
        domain: req.user.domain,
        type: 'project_update',
        title: `✅ Project Delivered: ${project.name}`,
        message: `${req.user.name} has delivered the project "${project.name}"`,
        link: `/projects/${project._id}`,
      });
    }
    res.json(project);
  } catch (e) { next(e); }
};

exports.createTeamsChannel = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, domain: req.user.domain });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const integration = await Integration.findOne({ name: 'microsoft_graph' });
    const env = require('../config/env');
    const teamId = integration?.config?.teamsTeamId || env.DEFAULT_TEAMS_TEAM_ID;
    if (!teamId) {
      return res.status(400).json({ message: 'No default Teams team configured. Set it in Admin > Integrations or add DEFAULT_TEAMS_TEAM_ID to .env' });
    }

    const result = await microsoftGraphService.createChannel(teamId, project.name, project.description || `${project.name} channel`);
    if (result.error) {
      return res.status(500).json({ message: 'Failed to create Teams channel', error: result.error });
    }

    project.teamChannel = result.displayName;
    project.teamsTeamId = teamId;
    project.teamsChannelId = result.id;
    await project.save();

    await Activity.create({
      user: req.user._id,
      domain: req.user.domain,
      type: 'project_update', source: 'internal',
      description: `Created Teams channel "${result.displayName}" for project ${project.name}`,
      metadata: { projectId: project._id, projectName: project.name, teamsChannelId: result.id, teamsChannelUrl: result.webUrl },
    });

    res.json({ channelId: result.id, displayName: result.displayName, webUrl: result.webUrl });
  } catch (e) { next(e); }
};
