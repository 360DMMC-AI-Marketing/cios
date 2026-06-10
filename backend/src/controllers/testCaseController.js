const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Sprint = require('../models/Sprint');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const { getDomainProjectIds } = require('../config/planLimits');
const { evaluateProjectPhase } = require('../services/phaseService');
const { notifyAdmins } = require('../services/notificationService');

function getIO() {
  return require('../app').io;
}

const MANAGER_ROLES = ['admin', 'project_manager', 'team_lead', 'qa_tester'];
const STATUS_FLOW = {
  'auto-draft': ['ready'],
  draft: ['ready'],
  ready: ['in_progress'],
  in_progress: ['passed', 'failed', 'blocked', 'skipped'],
  passed: [],
  failed: [],
  blocked: [],
  skipped: [],
};

async function isUserProjectMember(projectId, userId) {
  const proj = await Project.findById(projectId).select('members');
  if (proj && proj.members.some(m => String(m) === String(userId))) return true;
  const pm = await ProjectMember.findOne({ project: projectId, user: userId, status: 'active' });
  if (pm) {
    await Project.findByIdAndUpdate(projectId, { $addToSet: { members: userId } });
    return true;
  }
  return false;
}

const populate = q => q
  .populate('assignee', 'name email avatar role')
  .populate('project', 'name')
  .populate('sprint', 'name')
  .populate('linkedTask', 'title status')
  .populate('linkedBug', 'title status')
  .populate('createdBy', 'name')
  .populate('executedBy', 'name');

exports.getTestCases = async (req, res, next) => {
  try {
    const { project, sprint, status, type, assignee } = req.query;
    const projectIds = await getDomainProjectIds(req.user.domain);
    const filter = { isActive: true, project: { $in: projectIds } };
    if (project) filter.project = project;
    if (sprint) filter.sprint = sprint;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (assignee) filter.assignee = assignee;
    const items = await populate(TestCase.find(filter).sort({ createdAt: -1 }));
    res.json(items);
  } catch (e) { next(e); }
};

exports.getTestCaseById = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await populate(TestCase.findOne({ _id: req.params.id, project: { $in: projectIds } }));
    if (!item) return res.status(404).json({ message: 'Test case not found' });
    res.json(item);
  } catch (e) { next(e); }
};

exports.createTestCase = async (req, res, next) => {
  try {
    const { title, description, feature, type, priority, precondition, steps, project, sprint, assignee, linkedTask, tags } = req.body;
    if (!title || !project) return res.status(400).json({ message: 'Title and project are required' });

    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id.toString() === project)) {
      return res.status(403).json({ message: 'Project does not belong to your domain' });
    }

    if (assignee) {
      const isMember = await isUserProjectMember(project, assignee);
      if (!isMember) {
        return res.status(400).json({ message: 'Assignee must be a member of this project' });
      }
    }

    const item = await TestCase.create({
      title, description, feature, type: type || 'manual', priority: priority || 'medium',
      precondition: precondition || '', steps: steps || [{ order: 1, description: title, expectedResult: description || '' }],
      project, sprint: sprint || undefined, assignee: assignee || undefined,
      linkedTask: linkedTask || undefined, createdBy: req.user._id, tags: tags || [],
    });

    const populated = await populate(TestCase.findById(item._id));

    await Activity.create({
      user: req.user._id, domain: req.user.domain, type: 'task_update', source: 'internal',
      description: `Created test case ${populated.testCaseId}: ${populated.title}`,
      metadata: { testCaseId: populated._id, projectId: project },
    });

    if (populated.assignee) {
      await Notification.create({
        user: populated.assignee._id, domain: req.user.domain, type: 'task_assigned',
        title: `New test case: ${populated.testCaseId} — ${populated.title}`,
        message: `You have been assigned a test case of type ${populated.type}`,
        link: `/projects/${project}`,
      });
    }

    await evaluateProjectPhase(project);
    const { updateProjectProgress } = require('./taskController');
    await updateProjectProgress(project);

    try { getIO().to(`project:${project}`).emit('test_case_created', populated); } catch (e) {}

    notifyAdmins(req.user.domain, 'task_assigned',
      `New test case: ${populated.testCaseId} — ${populated.title}`,
      `${req.user.name} created test case ${populated.testCaseId} (${populated.type})`,
      `/projects/${project}`, { testCaseId: populated._id, projectId: project });

    res.status(201).json(populated);
  } catch (e) { next(e); }
};

exports.updateTestCase = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const old = await TestCase.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!old) return res.status(404).json({ message: 'Test case not found' });

    const allowed = ['title', 'description', 'feature', 'type', 'priority', 'precondition', 'steps', 'sprint', 'assignee', 'linkedTask', 'tags', 'failureReason'];
    const changes = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) changes[f] = req.body[f]; });

    if (req.body.assignee !== undefined) {
      const isAssigneeSelf = String(old.assignee || '') === String(req.user._id) || String(req.body.assignee) === String(req.user._id);
      if (!MANAGER_ROLES.includes(req.user.role) && !isAssigneeSelf) {
        return res.status(403).json({ message: 'Only managers or the assigned person can change assignee' });
      }
      if (req.body.assignee) {
        const isMember = await isUserProjectMember(old.project, req.body.assignee);
        if (!isMember) {
          return res.status(400).json({ message: 'Assignee must be a member of this project' });
        }
      }
    }

    if (req.body.status && (MANAGER_ROLES.includes(req.user.role) || STATUS_FLOW[old.status]?.includes(req.body.status))) {
      changes.status = req.body.status;
      if (req.body.status === 'in_progress') {
        changes.executedBy = req.user._id;
      }
      if (['passed', 'failed', 'blocked', 'skipped'].includes(req.body.status)) {
        changes.executedAt = new Date();
        changes.executedBy = req.user._id;
      }
    }

    const item = await TestCase.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, changes, { new: true, runValidators: true });
    const populated = await populate(TestCase.findById(item._id));

    // Auto-create bug task on failure
    if (req.body.status === 'failed' && !populated.linkedBug) {
      const failedStep = (populated.steps || []).find(s => s.status === 'fail');
      const bug = await Task.create({
        title: `[From ${populated.testCaseId}] ${populated.title}${failedStep ? ` - Step ${failedStep.order} Failed` : ''}`,
        description: failedStep
          ? `Expected: ${failedStep.expectedResult}\nActual: ${failedStep.actualResult}`
          : `Test case ${populated.testCaseId} failed`,
        type: 'bug', status: 'todo', priority: populated.priority,
        project: populated.project, assignee: populated.assignee,
      });
      populated.linkedBug = bug._id;
      await populated.save();
      const repopulated = await populate(TestCase.findById(populated._id));

      await Activity.create({
        user: req.user._id, domain: req.user.domain, type: 'task_update', source: 'internal',
        description: `Auto-created bug from failed test case ${repopulated.testCaseId}`,
        metadata: { testCaseId: repopulated._id, projectId: repopulated.project?._id, bugId: bug._id },
      });

      return res.json(repopulated);
    }

    await evaluateProjectPhase(populated.project?._id || populated.project);
    const { updateProjectProgress } = require('./taskController');
    await updateProjectProgress(populated.project?._id || populated.project);
    try { getIO().to(`project:${populated.project?._id || populated.project}`).emit('test_case_updated', populated); } catch (e) {}

    if (req.body.status) {
      notifyAdmins(req.user.domain, 'status_change',
        `${populated.testCaseId} — ${req.body.status}`,
        `${req.user.name} changed test case ${populated.testCaseId} to ${req.body.status}`,
        `/projects/${populated.project?._id || populated.project}`, { testCaseId: populated._id, projectId: populated.project?._id || populated.project });
    }

    res.json(populated);
  } catch (e) { next(e); }
};

exports.deleteTestCase = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await TestCase.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, { isActive: false }, { new: true });
    if (!item) return res.status(404).json({ message: 'Test case not found' });
    await evaluateProjectPhase(item.project);
    const { updateProjectProgress } = require('./taskController');
    await updateProjectProgress(item.project);
    try { getIO().to(`project:${item.project}`).emit('test_case_deleted', { id: req.params.id, project: item.project }); } catch (e) {}

    notifyAdmins(req.user.domain, 'project_update',
      `Test case deleted: ${item.testCaseId}`,
      `${req.user.name} deleted test case ${item.testCaseId}`,
      `/projects/${item.project}`, { testCaseId: item._id, projectId: item.project });

    res.json({ message: 'Test case deleted' });
  } catch (e) { next(e); }
};

exports.updateStepStatus = async (req, res, next) => {
  try {
    const { stepId, status, actualResult, evidence } = req.body;
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await TestCase.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!item) return res.status(404).json({ message: 'Test case not found' });

    const step = item.steps.id(stepId);
    if (!step) return res.status(404).json({ message: 'Step not found' });

    if (status) step.status = status;
    if (actualResult !== undefined) step.actualResult = actualResult;
    if (evidence !== undefined) step.evidence = evidence;
    await item.save();

    const populated = await populate(TestCase.findById(item._id));
    await evaluateProjectPhase(populated.project?._id || populated.project);
    try { getIO().to(`project:${populated.project?._id || populated.project}`).emit('test_case_updated', populated); } catch (e) {}
    res.json(populated);
  } catch (e) { next(e); }
};

exports.getProjectTestStats = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id.toString() === req.params.projectId)) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const filter = { project: req.params.projectId, isActive: true };
    const all = await TestCase.find(filter);
    const total = all.length;
    const counts = { draft: 0, ready: 0, in_progress: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };
    all.forEach(tc => { if (counts[tc.status] !== undefined) counts[tc.status]++; });
    const passRate = total > 0 ? Math.round((counts.passed / total) * 100) : 0;
    const coverage = total > 0 ? Math.round((all.filter(tc => tc.status !== 'draft').length / total) * 100) : 0;

    const byType = {};
    all.forEach(tc => { byType[tc.type] = (byType[tc.type] || 0) + 1; });

    res.json({ total, ...counts, passRate, coverage, byType });
  } catch (e) { next(e); }
};

exports.bulkGenerate = async (req, res, next) => {
  try {
    const { project, templates } = req.body;
    if (!project || !templates?.length) return res.status(400).json({ message: 'Project and templates array required' });

    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id.toString() === project)) {
      return res.status(403).json({ message: 'Project does not belong to your domain' });
    }

    const created = [];
    for (const t of templates) {
      const item = await TestCase.create({
        ...t, project, status: 'draft', createdBy: req.user._id,
        steps: t.steps || [{ order: 1, description: t.title, expectedResult: t.description || '' }],
      });
      created.push(await populate(TestCase.findById(item._id)));
    }

    await Activity.create({
      user: req.user._id, domain: req.user.domain, type: 'task_update', source: 'internal',
      description: `Auto-generated ${created.length} test cases from templates`,
      metadata: { projectId: project, count: created.length },
    });

    await evaluateProjectPhase(project);
    try { getIO().to(`project:${project}`).emit('test_cases_bulk_created', created); } catch (e) {}
    res.status(201).json(created);
  } catch (e) { next(e); }
};

exports.addAttachment = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await TestCase.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!item) return res.status(404).json({ message: 'Test case not found' });
    if (!req.file) return res.status(400).json({ message: 'No file provided' });
    item.attachments.push({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
    });
    await item.save();
    const populated = await populate(TestCase.findById(item._id));
    try { getIO().to(`project:${populated.project?._id || populated.project}`).emit('test_case_updated', populated); } catch (e) {}
    res.json(populated);
  } catch (e) { next(e); }
};

async function generateTestsFromTasks(project, sprint, tasks, userId, domain) {
  const TaskModel = require('../models/Task');
  let sourceTasks = tasks;
  if (!sourceTasks && sprint) {
    const Sprint = require('../models/Sprint');
    const s = await Sprint.findById(sprint).populate('tasks');
    sourceTasks = s?.tasks || [];
  } else if (!sourceTasks && !sprint) {
    sourceTasks = await TaskModel.find({ project, isActive: true }).limit(20);
  }
  if (!sourceTasks?.length) return [];

  const created = [];
  for (const task of sourceTasks) {
    const taskId = task._id || task;
    const taskDoc = typeof task === 'object' ? task : await TaskModel.findById(taskId);
    if (!taskDoc) continue;
    const taskTitle = taskDoc.title || 'Untitled Task';
    const taskDesc = taskDoc.description || '';
    const exists = await TestCase.findOne({ linkedTask: taskId, project, isActive: true });
    if (exists) continue;
    const feature = taskDoc.feature || taskTitle.split(' ').slice(0, 3).join('_').toLowerCase();
    const steps = [
      { order: 1, description: `Navigate to "${feature}" section`, expectedResult: `Page loads successfully` },
      { order: 2, description: `Verify ${taskTitle}`, expectedResult: taskDesc || 'Feature works as expected' },
      { order: 3, description: `Validate error handling`, expectedResult: 'No unexpected errors' },
    ];
    const taskAssignee = taskDoc.assignee || undefined;
    const tc = await TestCase.create({
      title: `[Auto] ${taskTitle}`,
      description: `Auto-generated from task: ${taskTitle}\n${taskDesc}`,
      feature, type: 'manual', priority: 'medium', status: 'auto-draft',
      precondition: 'User is logged in with appropriate permissions',
      steps, project, sprint: sprint || undefined, linkedTask: taskId,
      assignee: taskAssignee,
      createdBy: userId,
      tags: ['auto-generated', feature],
      autoGenerated: true,
      interestMatchScore: 50, interestMatchStatus: 'low',
    });
    created.push(await populate(TestCase.findById(tc._id)));
  }

  if (created.length > 0) {
    await Activity.create({
      user: userId, domain, type: 'task_update', source: 'internal',
      description: `Auto-generated ${created.length} test cases from tasks`,
      metadata: { projectId: project, sprintId: sprint, count: created.length },
    });
    try {
      const io = getIO();
      if (io) io.to(`project:${project}`).emit('test_cases_auto_generated', created);
    } catch (e) {}
  }

  return created;
}
exports.generateTestsFromTasks = generateTestsFromTasks;

exports.autoGenerateTests = async (req, res, next) => {
  try {
    const { project, sprint, tasks } = req.body;
    if (!project) return res.status(400).json({ message: 'Project required' });
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id.toString() === project)) {
      return res.status(403).json({ message: 'Project does not belong to your domain' });
    }
    const created = await generateTestsFromTasks(project, sprint, tasks, req.user._id, req.user.domain);
    if (!created.length) return res.status(400).json({ message: 'No tasks found or all already have test cases' });
    res.status(201).json(created);
  } catch (e) { next(e); }
};

exports.executeTest = async (req, res, next) => {
  try {
    const { stepResults, overallResult, failureReason, screenshot } = req.body;
    const projectIds = await getDomainProjectIds(req.user.domain);
    const tc = await TestCase.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!tc) return res.status(404).json({ message: 'Test case not found' });
    if (!['ready', 'in_progress', 'retesting'].includes(tc.status)) {
      return res.status(400).json({ message: `Cannot execute test in status ${tc.status}` });
    }

    if (stepResults) {
      for (const sr of stepResults) {
        const step = tc.steps.id(sr.stepId);
        if (step) {
          if (sr.status) step.status = sr.status;
          if (sr.actualResult !== undefined) step.actualResult = sr.actualResult;
          if (sr.evidence !== undefined) step.evidence = sr.evidence;
        }
      }
    }

    tc.status = overallResult || 'passed';
    tc.executedBy = req.user._id;
    tc.executedAt = new Date();
    tc.lastRunAt = new Date();
    if (failureReason) tc.failureReason = failureReason;
    if (screenshot && tc.attachments) {
      tc.attachments.push({
        filename: 'screenshot_' + Date.now() + '.png',
        originalName: 'screenshot.png',
        path: screenshot,
        mimeType: 'image/png',
        uploadedBy: req.user._id,
      });
    }

    await tc.save();

    if (tc.status === 'failed') {
      const bugController = require('./bugController');
      await bugController.autoCreateBugFromTestFailure(tc._id, req.user._id);
    }

    const populated = await populate(TestCase.findById(tc._id));
    await evaluateProjectPhase(tc.project);
    try {
      getIO().to(`project:${tc.project}`).emit('test_case_executed', populated);
      getIO().to(`project:${tc.project}`).emit('test_case_updated', populated);
    } catch (e) {}

    notifyAdmins(req.user.domain, 'status_change',
      `${populated.testCaseId} — executed (${populated.status})`,
      `${req.user.name} executed test case ${populated.testCaseId} — result: ${populated.status}`,
      `/projects/${tc.project}`, { testCaseId: populated._id, projectId: tc.project });

    res.json(populated);
  } catch (e) { next(e); }
};

exports.retestTest = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const tc = await TestCase.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!tc) return res.status(404).json({ message: 'Test case not found' });
    if (tc.status !== 'failed' && tc.status !== 'retesting') {
      return res.status(400).json({ message: 'Only failed tests can be retested' });
    }

    for (const step of tc.steps) {
      step.status = 'pending';
      step.actualResult = undefined;
      step.evidence = undefined;
    }
    tc.status = 'retesting';
    tc.failureReason = '';
    await tc.save();

    const populated = await populate(TestCase.findById(tc._id));
    try { getIO().to(`project:${tc.project}`).emit('test_case_updated', populated); } catch (e) {}
    res.json(populated);
  } catch (e) { next(e); }
};

exports.getAutoGeneratedTests = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const filter = { project: { $in: projectIds }, autoGenerated: true, isActive: true };
    if (req.params.projectId) filter.project = req.params.projectId;
    if (req.query.status) filter.status = req.query.status;
    const items = await populate(TestCase.find(filter).sort({ createdAt: -1 }));
    res.json(items);
  } catch (e) { next(e); }
};

exports.generateForCompletedSprints = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const projectFilter = req.query.projectId ? { project: req.query.projectId } : { project: { $in: projectIds } };
    const sprints = await Sprint.find({ status: 'completed', ...projectFilter }).populate('tasks');

    let totalCreated = 0;
    for (const sprint of sprints) {
      const created = await generateTestsFromTasks(sprint.project, sprint._id, null, req.user._id, req.user.domain);
      totalCreated += created.length;
    }
    res.json({ message: `Generated ${totalCreated} test cases from ${sprints.length} completed sprints`, count: totalCreated, sprintsProcessed: sprints.length });
  } catch (e) { next(e); }
};