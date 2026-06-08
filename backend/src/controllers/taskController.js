const Task = require('../models/Task');
const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const { evaluateProjectPhase } = require('../services/phaseService');
const { getDomainProjectIds } = require('../config/planLimits');

exports.getTasks = async (req, res, next) => {
  try {
    const { status, project, assignee, priority, sprint } = req.query;
    const projectIds = await getDomainProjectIds(req.user.domain);
    const filter = { project: { $in: projectIds } };
    if (status) {
      const statuses = status.split(',');
      filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (project) filter.project = project;
    if (priority) filter.priority = priority;
    if (assignee) filter.assignee = assignee;
    if (sprint) filter.sprint = sprint;
    const managerRoles = ['admin', 'team_lead', 'project_manager', 'manager'];
    if (!managerRoles.includes(req.user.role) && !assignee) {
      filter.assignee = req.user._id;
    }

    const tasks = await Task.find(filter)
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name')
      .populate('subtasks.assignee', 'name email')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    next(error);
  }
};

exports.getTaskById = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const task = await Task.findOne({ _id: req.params.id, project: { $in: projectIds } })
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name status')
      .populate('subtasks.assignee', 'name email');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (error) {
    next(error);
  }
};

exports.createTask = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.includes(req.body.projectId)) {
      return res.status(403).json({ message: 'Project not found in your domain' });
    }
    let assigneeId = req.body.assignee;
    if (req.body.assigneeEmail) {
      const outlookUser = await User.findOne({ outlookEmail: req.body.assigneeEmail });
      if (outlookUser) assigneeId = outlookUser._id;
    }

    if (assigneeId) {
      const project = await Project.findById(req.body.projectId).select('members');
      if (project && !project.members.some(m => String(m) === String(assigneeId))) {
        return res.status(400).json({ message: 'Assignee must be a member of this project' });
      }
    }

    const sprintId = req.body.sprint || undefined;

    const task = await Task.create({
      title: req.body.title,
      description: req.body.description || '',
      type: req.body.type || 'task',
      status: req.body.status || 'todo',
      priority: req.body.priority || 'medium',
      assignee: assigneeId || undefined,
      project: req.body.projectId,
      sprint: sprintId,
      deadline: req.body.deadline,
      estimatedHours: req.body.estimatedHours || 0,
      subtasks: req.body.subtasks || [],
    });

    const populated = await Task.findById(task._id)
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name')
      .populate('subtasks.assignee', 'name email');

    if (populated.project) {
      await Project.findByIdAndUpdate(populated.project._id, { $push: { tasks: populated._id } });
    }
    if (sprintId) {
      await Sprint.findByIdAndUpdate(sprintId, { $addToSet: { tasks: populated._id } });
    }
    if (populated.assignee) {
      await Notification.create({
        user: populated.assignee._id,
        domain: req.user.domain,
        type: 'task_assigned',
        title: `New task: ${populated.title}`,
        message: `You have been assigned a new task`,
        link: `/tasks/${populated._id}`,
      });
    }
    await updateProjectProgress(populated.project?._id);

    const finalTask = await Task.findById(populated._id)
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name')
      .populate('subtasks.assignee', 'name email');

    await Activity.create({
      user: req.user._id,
      domain: req.user.domain,
      type: 'task_update',
      source: 'internal',
      description: `Created task: ${finalTask.title}`,
      metadata: { taskId: finalTask._id, projectId: finalTask.project?._id },
    });
    res.status(201).json(finalTask);
  } catch (error) {
    next(error);
  }
};

async function updateProjectProgress(projectId) {
  if (!projectId) return;
  const allTasks = await Task.find({ project: projectId, isActive: true });
  const total = allTasks.length;
  const done = allTasks.filter((t) => t.status === 'done').length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  // Auto-complete sprints where all tasks are done
  const sprints = await Sprint.find({ project: projectId }).populate('tasks');
  for (const sprint of sprints) {
    if (sprint.status === 'completed' || sprint.status === 'cancelled') continue;
    const sprintTasks = sprint.tasks || [];
    const sprintTotal = sprintTasks.length;
    const sprintDone = sprintTasks.filter(t => t.status === 'done').length;
    if (sprintTotal > 0 && sprintDone === sprintTotal) {
      await Sprint.findByIdAndUpdate(sprint._id, { status: 'completed' }, { new: true });
    }
  }

  // Refresh sprints list after updates
  const updatedSprints = await Sprint.find({ project: projectId });
  const allSprintsCompleted = updatedSprints.length === 0 || updatedSprints.every(s => s.status === 'completed' || s.status === 'cancelled');

  let status = 'on_track';
  if (total > 0 && done === total) {
    status = 'ready_to_test';
  } else if (progress === 100) {
    status = 'completed';
  }

  const update = { progress, status };
  await Project.findByIdAndUpdate(projectId, update, { new: true });

  await evaluateProjectPhase(projectId);
}

exports.updateProjectProgress = updateProjectProgress;

exports.updateTask = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (req.body.assigneeEmail) {
      const outlookUser = await User.findOne({ outlookEmail: req.body.assigneeEmail });
      if (outlookUser) req.body.assignee = outlookUser._id;
      delete req.body.assigneeEmail;
    }

    if (req.body.assignee) {
      const existing = await Task.findOne({ _id: req.params.id, project: { $in: projectIds } }).select('project');
      if (existing) {
        const project = await Project.findById(existing.project).select('members');
        if (project && !project.members.some(m => String(m) === String(req.body.assignee))) {
          return res.status(400).json({ message: 'Assignee must be a member of this project' });
        }
      }
    }

    if (req.body.sprint !== undefined) {
      const oldTask = await Task.findOne({ _id: req.params.id, project: { $in: projectIds } }).select('sprint');
      if (oldTask && oldTask.sprint && String(oldTask.sprint) !== String(req.body.sprint)) {
        await Sprint.findByIdAndUpdate(oldTask.sprint, { $pull: { tasks: req.params.id } });
      }
      if (req.body.sprint) {
        await Sprint.findByIdAndUpdate(req.body.sprint, { $addToSet: { tasks: req.params.id } });
      }
    }

    const existing = await Task.findOne({ _id: req.params.id, project: { $in: projectIds } }).select('assignee status');
    if (!existing) return res.status(404).json({ message: 'Task not found' });

    if (req.body.status && req.body.status !== existing.status) {
      const MANAGER_ROLES = ['admin', 'project_manager', 'team_lead', 'manager'];
      const isManager = MANAGER_ROLES.includes(req.user.role);
      const isAssignee = existing.assignee && String(existing.assignee) === String(req.user._id);
      if (!isManager && !isAssignee) {
        return res.status(403).json({ message: 'Only the assignee, project manager, team lead, or admin can change task status' });
      }
    }

    const task = await Task.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, req.body, { new: true, runValidators: true })
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name')
      .populate('subtasks.assignee', 'name email');
    if (!task) return res.status(404).json({ message: 'Task not found' });

    await updateProjectProgress(task.project);

    const updated = await Task.findById(task._id)
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name')
      .populate('subtasks.assignee', 'name email');
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const task = await Task.findOneAndUpdate({ _id: req.params.id, project: { $in: projectIds } }, { isActive: false }, { new: true });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.project) {
      await Project.findByIdAndUpdate(task.project, { $pull: { tasks: task._id } });
      await updateProjectProgress(task.project);
    }
    if (task.sprint) {
      await Sprint.findByIdAndUpdate(task.sprint, { $pull: { tasks: task._id } });
    }
    res.json({ message: 'Task deactivated' });
  } catch (error) {
    next(error);
  }
};

exports.addSubtask = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const task = await Task.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    task.subtasks.push(req.body);
    await task.save();
    const populated = await Task.findById(task._id)
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name')
      .populate('subtasks.assignee', 'name email');
    res.json(populated);
  } catch (error) {
    next(error);
  }
};

exports.updateSubtask = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const task = await Task.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const sub = task.subtasks.id(req.params.subtaskId);
    if (!sub) return res.status(404).json({ message: 'Subtask not found' });
    Object.assign(sub, req.body);
    await task.save();
    const populated = await Task.findById(task._id)
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name')
      .populate('subtasks.assignee', 'name email');
    res.json(populated);
  } catch (error) {
    next(error);
  }
};

exports.deleteSubtask = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const task = await Task.findOne({ _id: req.params.id, project: { $in: projectIds } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    task.subtasks.pull(req.params.subtaskId);
    await task.save();
    const populated = await Task.findById(task._id)
      .populate('assignee', 'name email avatar role outlookEmail')
      .populate('project', 'name')
      .populate('subtasks.assignee', 'name email');
    res.json(populated);
  } catch (error) {
    next(error);
  }
};
