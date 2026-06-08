const TestingItem = require('../models/TestingItem');
const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const { getDomainProjectIds } = require('../config/planLimits');

const QA_STATUSES = ['todo', 'in_progress', 'in_review', 'passed', 'failed', 'blocked', 'on_hold', 'completed'];
const MANAGER_ROLES = ['admin', 'project_manager', 'team_lead'];
const ALLOWED_CREATORS = ['admin', 'project_manager', 'team_lead'];
const ALLOWED_UPDATERS = ['admin', 'project_manager', 'team_lead', 'qa_tester'];

const populate = (q) =>
  q
    .populate('assignee', 'name email avatar role')
    .populate('project', 'name status')
    .populate('sprint', 'name')
    .populate('linkedTask', 'title status')
    .populate('createdBy', 'name')
    .populate('comments.user', 'name avatar role')
    .populate('attachments.uploadedBy', 'name');

exports.getTestingItems = async (req, res, next) => {
  try {
    const { project, sprint, status, assignee, type } = req.query;
    const projectIds = await getDomainProjectIds(req.user.domain);
    const filter = { isActive: true, project: { $in: projectIds } };
    if (project) filter.project = project;
    if (sprint) filter.sprint = sprint;
    if (status) filter.status = status;
    if (assignee) filter.assignee = assignee;
    if (type) filter.type = type;
    const items = await populate(TestingItem.find(filter).sort({ createdAt: -1 }));
    res.json(items);
  } catch (error) {
    next(error);
  }
};

exports.getTestingItemById = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await populate(TestingItem.findOne({ _id: req.params.id, project: { $in: projectIds } }));
    if (!item) return res.status(404).json({ message: 'Testing item not found' });
    res.json(item);
  } catch (error) {
    next(error);
  }
};

exports.createTestingItem = async (req, res, next) => {
  try {
    if (!ALLOWED_CREATORS.includes(req.user.role)) {
      return res.status(403).json({ message: 'Only Admins, PMs, and Team Leads can create testing items' });
    }
    if (!req.body.title || !req.body.project) {
      return res.status(400).json({ message: 'Title and project are required' });
    }
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.includes(req.body.project)) {
      return res.status(403).json({ message: 'Project not in your domain' });
    }

    const item = await TestingItem.create({
      title: req.body.title,
      description: req.body.description || '',
      stepsToReproduce: req.body.stepsToReproduce || '',
      expectedResult: req.body.expectedResult || '',
      priority: req.body.priority || 'medium',
      type: req.body.type || 'test_case',
      assignee: req.body.assignee || undefined,
      project: req.body.project,
      sprint: req.body.sprint || undefined,
      linkedTask: req.body.linkedTask || undefined,
      deadline: req.body.deadline || undefined,
      createdBy: req.user._id,
    });

    const populated = await populate(TestingItem.findById(item._id));

    if (req.body.sprint) {
      await Sprint.findByIdAndUpdate(req.body.sprint, { $addToSet: { testingItems: populated._id } });
    }

    if (populated.assignee) {
      await Notification.create({
        user: populated.assignee._id,
        domain: req.user.domain,
        type: 'task_assigned',
        title: `New testing item: ${populated.title}`,
        message: `You have been assigned a new testing item`,
        link: `/projects/${populated.project?._id}`,
      });
    }

    await Activity.create({
      user: req.user._id,
      domain: req.user.domain,
      type: 'task_update',
      source: 'internal',
      description: `Created testing item: ${populated.title}`,
      metadata: { testingItemId: populated._id, projectId: req.body.project },
    });

    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
};

exports.updateTestingItem = async (req, res, next) => {
  try {
    if (!ALLOWED_UPDATERS.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const projectIds = await getDomainProjectIds(req.user.domain);
    const old = await TestingItem.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!old) return res.status(404).json({ message: 'Testing item not found' });

    const changes = {};
    const allowedFields = ['title', 'description', 'stepsToReproduce', 'expectedResult', 'priority', 'deadline', 'sprint', 'linkedTask'];
    allowedFields.forEach((f) => {
      if (req.body[f] !== undefined) changes[f] = req.body[f];
    });

    if (req.body.status && QA_STATUSES.includes(req.body.status)) {
      changes.status = req.body.status;
    }

    if (req.body.assignee !== undefined) {
      if (!MANAGER_ROLES.includes(req.user.role) && String(req.user._id) !== String(old.assignee)) {
        return res.status(403).json({ message: 'Only managers can reassign testing items' });
      }
      changes.assignee = req.body.assignee || null;
    }

    const auditEntries = [];
    Object.entries(changes).forEach(([field, newVal]) => {
      const oldVal = old[field];
      if (String(oldVal || '') !== String(newVal || '')) {
        auditEntries.push({
          action: 'update',
          user: req.user._id,
          field,
          oldValue: String(oldVal || ''),
          newValue: String(newVal || ''),
        });
      }
    });

    if (req.body.comment) {
      old.comments.push({ text: req.body.comment, user: req.user._id });
      await old.save();
    }

    const item = await TestingItem.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, { ...changes, $push: { auditLog: { $each: auditEntries } } }, { new: true, runValidators: true });
    const populated = await populate(TestingItem.findById(item._id));

    if (changes.sprint !== undefined) {
      if (old.sprint && String(old.sprint) !== String(changes.sprint)) {
        await Sprint.findByIdAndUpdate(old.sprint, { $pull: { testingItems: req.params.id } });
      }
      if (changes.sprint) {
        await Sprint.findByIdAndUpdate(changes.sprint, { $addToSet: { testingItems: req.params.id } });
      }
    }

    res.json(populated);
  } catch (error) {
    next(error);
  }
};

exports.deleteTestingItem = async (req, res, next) => {
  try {
    if (!MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Only managers can delete testing items' });
    }
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await TestingItem.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, { isActive: false }, { new: true });
    if (!item) return res.status(404).json({ message: 'Testing item not found' });
    if (item.sprint) {
      await Sprint.findByIdAndUpdate(item.sprint, { $pull: { testingItems: item._id } });
    }
    res.json({ message: 'Testing item deactivated' });
  } catch (error) {
    next(error);
  }
};

exports.addAttachment = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await TestingItem.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!item) return res.status(404).json({ message: 'Testing item not found' });
    if (!req.file) return res.status(400).json({ message: 'No file provided' });
    item.attachments.push({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
    });
    await item.save();
    const populated = await populate(TestingItem.findById(item._id));
    res.json(populated);
  } catch (error) {
    next(error);
  }
};

exports.addComment = async (req, res, next) => {
  try {
    if (!req.body.text) return res.status(400).json({ message: 'Comment text is required' });
    const projectIds = await getDomainProjectIds(req.user.domain);
    const item = await TestingItem.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!item) return res.status(404).json({ message: 'Testing item not found' });
    item.comments.push({ text: req.body.text, user: req.user._id });
    await item.save();
    const populated = await populate(TestingItem.findById(item._id));
    res.json(populated);
  } catch (error) {
    next(error);
  }
};
