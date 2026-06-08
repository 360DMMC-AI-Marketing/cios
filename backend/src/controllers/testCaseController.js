const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const { getDomainProjectIds } = require('../config/planLimits');
const { evaluateProjectPhase } = require('../services/phaseService');

function getIO() {
  return require('../app').io;
}

const MANAGER_ROLES = ['admin', 'project_manager', 'team_lead'];
const STATUS_FLOW = {
  draft: ['ready'],
  ready: ['in_progress'],
  in_progress: ['passed', 'failed', 'blocked', 'skipped'],
  passed: [],
  failed: [],
  blocked: [],
  skipped: [],
};

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
      const proj = await Project.findById(project).select('members');
      if (proj && !proj.members.some(m => String(m) === String(assignee))) {
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

    try { getIO().to(`project:${project}`).emit('test_case_created', populated); } catch (e) {}

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

    if (req.body.assignee) {
      const proj = await Project.findById(old.project).select('members');
      if (proj && !proj.members.some(m => String(m) === String(req.body.assignee))) {
        return res.status(400).json({ message: 'Assignee must be a member of this project' });
      }
    }

    if (req.body.status && STATUS_FLOW[old.status]?.includes(req.body.status)) {
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
    try { getIO().to(`project:${populated.project?._id || populated.project}`).emit('test_case_updated', populated); } catch (e) {}
    res.json(populated);
  } catch (e) { next(e); }
};

exports.deleteTestCase = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await TestCase.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, { isActive: false }, { new: true });
    if (!item) return res.status(404).json({ message: 'Test case not found' });
    await evaluateProjectPhase(item.project);
    try { getIO().to(`project:${item.project}`).emit('test_case_deleted', { id: req.params.id, project: item.project }); } catch (e) {}
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