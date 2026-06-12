const Project = require('../models/Project');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const TestCase = require('../models/TestCase');
const TestingItem = require('../models/TestingItem');
const Resource = require('../models/Resource');
const Activity = require('../models/Activity');
const ProjectMember = require('../models/ProjectMember');
const User = require('../models/User');
const Report = require('../models/Report');

function computePhaseDuration(project, phaseList) {
  if (!project.launchedAt && !project.deliveredAt) return 0;
  const start = project.startDate || project.createdAt;
  const end = project.deliveredAt || project.launchedAt || new Date();
  return Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
}

async function buildReportData(projectId, type) {
  const project = await Project.findById(projectId)
    .populate('members', 'name email role avatar')
    .lean();
  if (!project) throw new Error('Project not found');

  const tasks = await Task.find({ project: projectId, isActive: { $ne: false } })
    .populate('assignee', 'name email role')
    .lean();

  const sprints = await Sprint.find({ project: projectId })
    .populate({ path: 'tasks', select: 'title status priority estimatedHours loggedHours' })
    .lean();

  const testCases = await TestCase.find({ project: projectId, isActive: { $ne: false } })
    .populate('assignee', 'name email')
    .lean();

  const testingItems = await TestingItem.find({ project: projectId })
    .populate('assignee', 'name email')
    .lean();

  const resources = await Resource.find({ project: projectId }).lean();

  const activities = await Activity.find({ project: projectId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('user', 'name email')
    .lean();

  const members = await ProjectMember.find({ project: projectId, status: 'active' })
    .populate('user', 'name email role avatar')
    .lean();

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const todoTasks = tasks.filter(t => t.status === 'todo').length;
  const delayedTasks = tasks.filter(t => t.status === 'delayed').length;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const totalEstimated = tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
  const totalLogged = tasks.reduce((s, t) => s + (t.loggedHours || 0), 0);

  const overdueTasks = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done').length;

  const tcTotal = testCases.length;
  const tcPassed = testCases.filter(tc => tc.status === 'passed').length;
  const tcFailed = testCases.filter(tc => tc.status === 'failed').length;
  const tcBlocked = testCases.filter(tc => tc.status === 'blocked').length;
  const tcInProgress = testCases.filter(tc => ['in_progress', 'ready'].includes(tc.status)).length;
  const tcPassRate = tcTotal > 0 ? Math.round((tcPassed / tcTotal) * 100) : 0;

  const tiTotal = testingItems.length;
  const tiPassed = testingItems.filter(ti => ti.status === 'passed').length;

  const activeSprints = sprints.filter(s => s.status === 'active');
  const completedSprints = sprints.filter(s => s.status === 'completed');

  const sprintVelocity = completedSprints.map(s => {
    const sprintTasks = (s.tasks || []).filter(t => t.status === 'done');
    return { name: s.name, done: sprintTasks.length, total: (s.tasks || []).length };
  });

  const taskByPriority = {
    urgent: tasks.filter(t => t.priority === 'urgent' || t.priority === 'critical').length,
    high: tasks.filter(t => t.priority === 'high').length,
    medium: tasks.filter(t => t.priority === 'medium').length,
    low: tasks.filter(t => t.priority === 'low').length,
  };

  const taskByAssignee = {};
  for (const t of tasks) {
    const name = t.assignee?.name || 'Unassigned';
    if (!taskByAssignee[name]) taskByAssignee[name] = { name, total: 0, done: 0, inProgress: 0, estimated: 0, logged: 0 };
    taskByAssignee[name].total++;
    taskByAssignee[name].estimated += t.estimatedHours || 0;
    taskByAssignee[name].logged += t.loggedHours || 0;
    if (t.status === 'done') taskByAssignee[name].done++;
    if (t.status === 'in_progress') taskByAssignee[name].inProgress++;
  }

  const memberList = members.map(m => ({
    name: m.user?.name || 'Unknown',
    email: m.user?.email || '',
    role: m.projectRole || m.user?.role || '',
  }));

  const tcByType = {
    integration: testCases.filter(tc => tc.type === 'integration').length,
    unit: testCases.filter(tc => tc.type === 'unit').length,
    e2e: testCases.filter(tc => tc.type === 'e2e').length,
    manual: testCases.filter(tc => tc.type === 'manual').length,
    security: testCases.filter(tc => tc.type === 'security').length,
    performance: testCases.filter(tc => tc.type === 'performance').length,
  };

  const phaseOrder = getPhaseOrder(project.projectType);
  const currentPhaseIndex = phaseOrder.indexOf(project.phase);
  const totalPhases = phaseOrder.length;
  const phaseProgress = totalPhases > 0 ? Math.round(((currentPhaseIndex + 1) / totalPhases) * 100) : 0;

  const baseData = {
    generatedAt: new Date(),
    project: {
      name: project.name,
      type: project.projectType,
      description: project.description,
      status: project.status,
      phase: project.phase,
      progress: project.progress,
      startDate: project.startDate || project.createdAt,
      deadline: project.deadline,
      launchedAt: project.launchedAt,
      deliveredAt: project.deliveredAt,
      deliveryNotes: project.deliveryNotes || '',
      duration: computePhaseDuration(project, phaseOrder),
    },
    tasks: {
      total: totalTasks,
      done: doneTasks,
      inProgress: inProgressTasks,
      todo: todoTasks,
      delayed: delayedTasks,
      overdue: overdueTasks,
      completionRate,
      estimatedHours: totalEstimated,
      loggedHours: totalLogged,
      byPriority: taskByPriority,
      byAssignee: Object.values(taskByAssignee),
    },
    sprints: {
      total: sprints.length,
      active: activeSprints.length,
      completed: completedSprints.length,
      velocity: sprintVelocity,
    },
    testing: {
      total: tcTotal,
      passed: tcPassed,
      failed: tcFailed,
      blocked: tcBlocked,
      inProgress: tcInProgress,
      passRate: tcPassRate,
      byType: tcByType,
      testingItemsTotal: tiTotal,
      testingItemsPassed: tiPassed,
    },
    team: {
      totalMembers: memberList.length,
      members: memberList,
    },
    resources: resources.map(r => ({
      title: r.title,
      category: r.category,
      type: r.type,
      url: r.url || '',
      description: r.description || '',
    })),
    recentActivity: activities.slice(0, 20).map(a => ({
      user: a.user?.name || 'System',
      type: a.type,
      description: a.description,
      date: a.createdAt,
    })),
  };

  if (type === 'admin') {
    return {
      ...baseData,
      reportType: 'admin',
      title: 'Project Closure Report — Admin',
      sections: [
        'executive-summary',
        'task-completion',
        'sprint-performance',
        'testing-quality',
        'team-performance',
        'effort-tracking',
        'resources',
        'activity-timeline',
        'delivery-notes',
      ],
      phaseProgress,
      allTestCases: testCases.map(tc => ({
        id: tc.testCaseId,
        title: tc.title,
        status: tc.status,
        priority: tc.priority,
        type: tc.type,
        assignee: tc.assignee?.name || '',
      })),
      allSprints: sprints.map(s => ({
        name: s.name,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
        goal: s.goal,
        taskCount: (s.tasks || []).length,
      })),
    };
  }

  return {
    ...baseData,
    reportType: 'client',
    title: 'Project Summary Report — Client',
    sections: [
      'executive-summary',
      'task-completion',
      'testing-quality',
      'team',
      'delivery-notes',
    ],
    clientSummary: `This report summarizes the successful delivery of ${project.name}. The project was completed with a ${completionRate}% task completion rate and a ${tcPassRate}% test pass rate.`,
  };
}

function getPhaseOrder(type) {
  const phases = {
    software: ['discovery', 'planning', 'development', 'testing', 'review', 'launched', 'delivered'],
    design: ['discovery', 'planning', 'designing', 'prototyping', 'testing', 'review', 'launched', 'delivered'],
    business: ['discovery', 'planning', 'business_growth', 'validation', 'testing', 'review', 'launched', 'delivered'],
    content: ['discovery', 'planning', 'content_creation', 'editing', 'testing', 'review', 'launched', 'delivered'],
    research: ['discovery', 'planning', 'research', 'analysis', 'testing', 'review', 'launched', 'delivered'],
  };
  return phases[type] || phases.software;
}

exports.getReportData = async (req, res) => {
  try {
    const { type } = req.query;
    if (!['admin', 'client'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "admin" or "client"' });
    }
    const data = await buildReportData(req.params.id, type);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.generateReport = async (req, res) => {
  try {
    const { type } = req.body;
    if (!['admin', 'client'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "admin" or "client"' });
    }
    const data = await buildReportData(req.params.id, type);
    const report = await Report.findOneAndUpdate(
      { project: req.params.id, type },
      {
        $set: {
          data,
          generatedBy: req.user._id,
          generatedAt: new Date(),
        },
        $setOnInsert: { downloadCount: 0 },
      },
      { upsert: true, new: true }
    );
    res.status(200).json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.listReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('project', 'name projectType phase status')
      .populate('generatedBy', 'name email')
      .sort({ generatedAt: -1 })
      .lean();
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('project', 'name projectType phase status')
      .populate('generatedBy', 'name email')
      .lean();
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteReport = async (req, res) => {
  try {
    await Report.findByIdAndDelete(req.params.id);
    res.json({ message: 'Report deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.countDownload = async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloadCount: 1 } },
      { new: true }
    );
    res.json({ downloadCount: report.downloadCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
