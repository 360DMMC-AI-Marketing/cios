const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const Activity = require('../models/Activity');
const TestingItem = require('../models/TestingItem');
const Resource = require('../models/Resource');
const { getDomainProjectIds } = require('../config/planLimits');

exports.getDashboardStats = async (req, res, next) => {
  try {
    const domain = req.user.domain;
    const domainFilter = { domain };
    const projectIds = await getDomainProjectIds(domain);

    const totalUsers = await User.countDocuments({ isActive: true, domain });
    const activeUsers = await User.countDocuments({ status: 'active', domain });
    const idleUsers = await User.countDocuments({ status: 'idle', domain });
    const inactiveUsers = await User.countDocuments({ isActive: true, status: { $in: ['inactive', 'offline'] }, domain });
    const totalProjects = await Project.countDocuments({ isActive: true, domain });
    const completedProjects = await Project.countDocuments({ status: 'completed', domain });
    const inProgressProjects = await Project.countDocuments({ isActive: true, status: { $in: ['on_track', 'ready_to_test'] }, domain });
    const totalTasks = await Task.countDocuments({ isActive: true, project: { $in: projectIds } });
    const completedTasks = await Task.countDocuments({ status: 'done', project: { $in: projectIds } });
    const atRiskProjects = await Project.countDocuments({ status: 'at_risk', domain });
    const delayedProjects = await Project.countDocuments({ status: 'delayed', domain });

    const totalTestingItems = await TestingItem.countDocuments({ isActive: true, project: { $in: projectIds } });
    const passedTesting = await TestingItem.countDocuments({ status: 'passed', isActive: true, project: { $in: projectIds } });
    const failedTesting = await TestingItem.countDocuments({ status: 'failed', isActive: true, project: { $in: projectIds } });
    const blockedTesting = await TestingItem.countDocuments({ status: 'blocked', isActive: true, project: { $in: projectIds } });
    const overdueTesting = await TestingItem.countDocuments({ isActive: true, deadline: { $lt: new Date() }, status: { $nin: ['passed', 'completed'] }, project: { $in: projectIds } });

    const domainUsers = await User.find({ domain }).select('_id');
    const domainUserIds = domainUsers.map(u => u._id);
    const recentActivity = await Activity.find({ user: { $in: domainUserIds } })
      .populate('user', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(20);

    const avgActivityScore = await User.aggregate([
      { $match: { isActive: true, domain } },
      { $group: { _id: null, avg: { $avg: '$activityScore' } } },
    ]);

    const healthScore = calculateHealthScore({
      activeUsers, totalUsers, completedProjects, totalProjects, atRiskProjects,
    });

    res.json({
      healthScore,
      totalUsers, activeUsers, idleUsers, inactiveUsers,
      totalProjects, completedProjects, inProgressProjects,
      totalTasks, completedTasks, atRiskProjects, delayedProjects,
      avgActivityScore: avgActivityScore[0]?.avg || 0,
      testingMetrics: { total: totalTestingItems, passed: passedTesting, failed: failedTesting, blocked: blockedTesting, overdue: overdueTesting },
      recentActivity,
    });
  } catch (error) { next(error); }
};

exports.getProductivityTrends = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));
    const domainUsers = await User.find({ domain: req.user.domain }).select('_id');
    const domainUserIds = domainUsers.map(u => u._id);
    const activities = await Activity.aggregate([
      { $match: { createdAt: { $gte: since }, user: { $in: domainUserIds } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, totalScore: { $sum: '$score' } } },
      { $sort: { _id: 1 } },
    ]);
    res.json(activities);
  } catch (error) { next(error); }
};

exports.getWorkloadBalance = async (req, res, next) => {
  try {
    const domain = req.user.domain;
    const projectIds = await getDomainProjectIds(domain);
    const users = await User.find({ isActive: true, domain }).populate('assignedProjects');
    const workload = users.map((u) => ({
      userId: u._id, name: u.name, role: u.role, activityScore: u.activityScore,
      projectCount: u.assignedProjects?.length || 0, taskCount: 0, status: u.status,
    }));
    const tasks = await Task.find({ assignee: { $in: users.map((u) => u._id) }, isActive: true, status: { $ne: 'done' }, project: { $in: projectIds } });
    const taskCounts = {};
    tasks.forEach((t) => { const id = t.assignee.toString(); taskCounts[id] = (taskCounts[id] || 0) + 1; });
    workload.forEach((w) => { w.taskCount = taskCounts[w.userId.toString()] || 0; });
    const avgScore = workload.reduce((s, w) => s + w.activityScore, 0) / (workload.length || 1);
    const overloaded = workload.filter((w) => w.activityScore > avgScore * 1.5 || w.taskCount > 10);
    res.json({ workload, overloaded, avgActivityScore: avgScore });
  } catch (error) { next(error); }
};

exports.getProjectPredictions = async (req, res, next) => {
  try {
    const projects = await Project.find({ isActive: true, domain: req.user.domain }).populate('tasks');
    const predictions = projects.map((p) => {
      const total = p.tasks.length;
      const done = p.tasks.filter((t) => t.status === 'done').length;
      const overdue = p.tasks.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done').length;
      const inProgress = p.tasks.filter((t) => t.status === 'in_progress').length;
      const completionRate = total > 0 ? (done / total) * 100 : 0;
      const daysSinceStart = p.startDate ? Math.floor((new Date() - new Date(p.startDate)) / (1000 * 60 * 60 * 24)) : 0;
      const daysUntilDeadline = p.deadline ? Math.ceil((new Date(p.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
      let risk = 'low';
      if (overdue > 0 || (daysUntilDeadline !== null && daysUntilDeadline < 7 && completionRate < 80)) risk = 'high';
      else if (overdue === 0 && (daysUntilDeadline !== null && daysUntilDeadline < 14)) risk = 'medium';
      return { projectId: p._id, name: p.name, completionRate: Math.round(completionRate), overdue, inProgress, total, done, daysSinceStart, daysUntilDeadline, risk, status: p.status };
    });
    res.json(predictions);
  } catch (error) { next(error); }
};

exports.getCompanyAnalytics = async (req, res, next) => {
  try {
    const domain = req.user.domain;
    const projectIds = await getDomainProjectIds(domain);
    // ── Company Overview ──
    const allProjects = await Project.find({ domain }).lean();
    const totalProjects = allProjects.length;
    const activeOnly = allProjects.filter(p => p.isActive !== false);
    const activeProjects = activeOnly.filter(p => ['on_track','at_risk','ready_to_test'].includes(p.status)).length;
    const completedProjects = allProjects.filter(p => p.status === 'completed').length;
    const atRiskProjects = activeOnly.filter(p => p.status === 'at_risk').length;
    const blockedProjects = activeOnly.filter(p => p.status === 'blocked').length;
    const delayedProjects = activeOnly.filter(p => p.status === 'delayed').length;
    const archivedProjects = allProjects.filter(p => p.isActive === false).length;
    const completionRate = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;
    const avgDuration = allProjects.reduce((s, p) => {
      if (p.startDate && p.deadline) return s + (new Date(p.deadline) - new Date(p.startDate));
      return s;
    }, 0);
    const avgDurationDays = totalProjects > 0 ? Math.round(avgDuration / totalProjects / 86400000) : 0;
    const projectsByPriority = { urgent: 0, high: 0, medium: 0, low: 0 };
    allProjects.forEach(p => { const pri = p.settings?.priority; if (pri && projectsByPriority[pri] !== undefined) projectsByPriority[pri]++; });

    // ── Employees ──
    const users = await User.find({ isActive: true, domain }).populate('assignedProjects').lean();
    const allTasks = await Task.find({ isActive: true, project: { $in: projectIds } }).lean();
    const allSprints = await Sprint.find({ project: { $in: projectIds } }).populate('tasks').lean();
    const domainUserIds = users.map(u => u._id);
    const activities = await Activity.find({ user: { $in: domainUserIds } }).sort({ createdAt: -1 }).limit(500).lean();

    const userTaskMap = {}; const userSprintMap = {};
    allTasks.forEach(t => {
      const id = t.assignee?.toString();
      if (!id) return;
      if (!userTaskMap[id]) userTaskMap[id] = { total: 0, done: 0, overdue: 0 };
      userTaskMap[id].total++;
      if (t.status === 'done') userTaskMap[id].done++;
      if (t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done') userTaskMap[id].overdue++;
    });
    allSprints.forEach(s => {
      (s.tasks || []).filter(Boolean).forEach(t => {
        const assigneeId = t.assignee?._id?.toString() || t.assignee?.toString();
        if (assigneeId) {
          if (!userSprintMap[assigneeId]) userSprintMap[assigneeId] = { assigned: 0, completed: 0 };
          userSprintMap[assigneeId].assigned++;
          if (t.status === 'done') userSprintMap[assigneeId].completed++;
        }
      });
    });
    const userActivityMap = {};
    activities.forEach(a => {
      const id = a.user?.toString();
      if (!id) return;
      if (!userActivityMap[id]) userActivityMap[id] = { count: 0, last: null };
      userActivityMap[id].count++;
      if (!userActivityMap[id].last || new Date(a.createdAt) > new Date(userActivityMap[id].last)) userActivityMap[id].last = a.createdAt;
    });

    const employeePerformance = users.map(u => {
      const uid = u._id.toString();
      const tasks = userTaskMap[uid] || { total: 0, done: 0, overdue: 0 };
      const sprints = userSprintMap[uid] || { assigned: 0, completed: 0 };
      const act = userActivityMap[uid] || { count: 0, last: null };
      const deadlineRate = tasks.total > 0 ? Math.round(((tasks.total - tasks.overdue) / tasks.total) * 100) : 100;
      const taskCompletion = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;
      const sprintCompletion = sprints.assigned > 0 ? Math.round((sprints.completed / sprints.assigned) * 100) : 0;
      const activityLevel = Math.min(100, Math.round((act.count / 20) * 100));
      const participationScore = Math.min(100, Math.round(
        taskCompletion * 0.3 + sprintCompletion * 0.2 + (u.activityScore || 50) * 0.2 + deadlineRate * 0.15 + activityLevel * 0.15
      ));
      return {
        userId: uid, name: u.name, email: u.email, role: u.role, avatar: u.avatar,
        activityScore: u.activityScore || 0, status: u.status,
        assignedProjects: u.assignedProjects?.length || 0,
        assignedTasks: tasks.total, completedTasks: tasks.done, overdueTasks: tasks.overdue,
        assignedSprints: sprints.assigned, completedSprints: sprints.completed,
        lastActivity: act.last,
        participationScore,
        taskCompletion, sprintCompletion, deadlineRate, activityLevel,
      };
    });
    employeePerformance.sort((a, b) => b.participationScore - a.participationScore);

    // ── Sprint Analytics ──
    const totalSprints = allSprints.length;
    const activeSprints = allSprints.filter(s => s.status === 'active').length;
    const completedSprints = allSprints.filter(s => s.status === 'completed').length;
    const sprintCompletionRate = totalSprints > 0 ? Math.round((completedSprints / totalSprints) * 100) : 0;
    let totalStoryPoints = 0; let completedStoryPoints = 0;
    allSprints.forEach(s => {
      (s.tasks || []).filter(Boolean).forEach(t => {
        const pts = t.estimatedHours || 1;
        totalStoryPoints += pts;
        if (t.status === 'done') completedStoryPoints += pts;
      });
    });

    // ── Risk Dashboard ──
    const today = new Date();
    const nearDeadline = allProjects.filter(p => p.deadline && new Date(p.deadline) > today && (new Date(p.deadline) - today) / 86400000 <= 7).length;
    const overdueTasks = allTasks.filter(t => t.deadline && new Date(t.deadline) < today && t.status !== 'done').length;
    const urgentProjects = allProjects.filter(p => p.settings?.priority === 'urgent').length;
    const unassignedTasks = allTasks.filter(t => !t.assignee).length;
    const membersPopulated = await User.find({ _id: { $in: allProjects.flatMap(p => p.members || []) } }).lean();
    const pmUserIds = new Set(membersPopulated.filter(u => u.role === 'project_manager').map(u => u._id.toString()));
    const projectsWithoutPM = allProjects.filter(p => !(p.members || []).some(m => pmUserIds.has(m.toString()))).length;

    // ── Resource Analytics ──
    const allResources = await Resource.find({ project: { $in: projectIds } }).lean();
    const totalResources = allResources.length;
    const documents = allResources.filter(r => r.type === 'pdf' || r.type === 'docx' || r.type === 'document').length;
    const repoLinks = allResources.filter(r => r.type === 'github' || r.type === 'gitlab').length;
    const externalUrls = allResources.filter(r => r.type === 'link').length;

    // ── Per-project participation ──
    const projectParticipation = await Promise.all(allProjects.map(async (p) => {
      const pTasks = allTasks.filter(t => t.project?.toString() === p._id.toString() || t.projectId?.toString() === p._id.toString());
      const total = pTasks.length;
      const done = pTasks.filter(t => t.status === 'done').length;
      const taskCompletionRate = total > 0 ? Math.round((done / total) * 100) : 0;

      const memberParticipation = {};
      pTasks.forEach(t => {
        const assigneeId = t.assignee?.toString();
        if (!assigneeId) return;
        if (!memberParticipation[assigneeId]) memberParticipation[assigneeId] = { assigned: 0, done: 0, sprintContribution: 0 };
        memberParticipation[assigneeId].assigned++;
        if (t.status === 'done') memberParticipation[assigneeId].done++;
      });
      const totalDone = pTasks.filter(t => t.status === 'done').length;
      const members = await User.find({ _id: { $in: Object.keys(memberParticipation) } }).lean();
      const memberList = members.map(m => {
        const mp = memberParticipation[m._id.toString()] || { assigned: 0, done: 0 };
        const score = totalDone > 0 ? Math.round((mp.done / totalDone) * 100) : 0;
        return { name: m.name, userId: m._id, participation: score, tasksAssigned: mp.assigned, tasksDone: mp.done };
      });
      memberList.sort((a, b) => b.participation - a.participation);

      return {
        projectId: p._id, name: p.name,
        taskCompletionRate, totalTasks: total, doneTasks: done,
        members: memberList,
      };
    }));

    // ── Activity Timeline ──
    const recentActions = await Activity.find({ user: { $in: domainUserIds } })
      .populate('user', 'name email avatar')
      .sort({ createdAt: -1 }).limit(30).lean();

    const mostActiveUsers = employeePerformance.slice(0, 5).map(e => ({
      name: e.name, activityScore: e.activityScore, participationScore: e.participationScore,
    }));

    // ── AI Insights ──
    const insights = [];
    const atRiskCount = allProjects.filter(p => p.status === 'at_risk').length;
    const delayedCount = allProjects.filter(p => p.status === 'delayed').length;
    if (atRiskCount > 0) insights.push(`${atRiskCount} project(s) are at risk of missing deadlines.`);
    if (delayedCount > 0) insights.push(`${delayedCount} project(s) are currently delayed.`);
    if (overdueTasks > 0) insights.push(`${overdueTasks} critical task(s) remain incomplete.`);
    const blockedNearDeadline = allProjects.filter(p => p.status === 'blocked' && p.deadline && new Date(p.deadline) < today).length;
    if (blockedNearDeadline > 0) insights.push(`${blockedNearDeadline} project(s) have been blocked past their deadline.`);
    const avgParticipation = employeePerformance.length > 0 ? Math.round(employeePerformance.reduce((s, e) => s + e.participationScore, 0) / employeePerformance.length) : 0;
    if (avgParticipation < 60) insights.push(`Team participation is low (${avgParticipation}% avg). Consider team engagement initiatives.`);
    else insights.push(`Team participation is healthy at ${avgParticipation}% average.`);
    const lowParticipation = employeePerformance.filter(e => e.participationScore < 40).length;
    if (lowParticipation > 0) insights.push(`${lowParticipation} team member(s) have low participation scores (<40%).`);
    if (unassignedTasks > 0) insights.push(`${unassignedTasks} task(s) are unassigned and need attention.`);
    if (projectsWithoutPM > 0) insights.push(`${projectsWithoutPM} project(s) have no project manager assigned.`);

    // ── Company Health Score ──
    const healthScore = calculateHealthScore({
      activeUsers: users.filter(u => u.status === 'active').length,
      totalUsers: users.length,
      completedProjects, totalProjects, atRiskProjects,
    });
    const taskCompletionRateAll = allTasks.length > 0 ? Math.round((allTasks.filter(t => t.status === 'done').length / allTasks.length) * 100) : 0;

    res.json({
      company: {
        totalProjects, activeProjects, completedProjects, blockedProjects, delayedProjects, archivedProjects,
        completionRate, avgDurationDays, projectsByPriority,
      },
      employeePerformance,
      projectParticipation,
      sprints: {
        total: totalSprints, active: activeSprints, completed: completedSprints,
        completionRate: sprintCompletionRate, totalStoryPoints, completedStoryPoints,
        remainingStoryPoints: totalStoryPoints - completedStoryPoints,
        velocity: activeSprints > 0 ? Math.round(completedStoryPoints / Math.max(1, totalSprints)) : 0,
      },
      risks: {
        overdueProjects: delayedProjects, blockedProjects, nearDeadline,
        overdueTasks, urgentProjects, unassignedTasks, projectsWithoutPM,
      },
      resources: {
        total: totalResources, documents, repoLinks, externalUrls,
      },
      activity: { recentActions, mostActiveUsers },
      healthScore,
      taskCompletionRateAll,
      insights,
    });
  } catch (error) { next(error); }
};

exports.getProjectTeamAnalytics = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id === projectId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const TeamGroup = require('../models/TeamGroup');
    const ProjectMember = require('../models/ProjectMember');
    const groups = await TeamGroup.find({ project: projectId, isArchived: false }).sort({ order: 1 });
    const result = [];
    for (const g of groups) {
      const memberIds = await ProjectMember.find({ project: projectId, teamGroup: g._id, status: 'active' })
        .populate('user', 'name email avatar role')
        .then(members => members.filter(m => m.user));
      const userIds = memberIds.map(m => m.user._id);
      const totalTasks = await Task.countDocuments({ project: projectId, assignee: { $in: userIds }, isActive: true });
      const doneTasks = await Task.countDocuments({ project: projectId, assignee: { $in: userIds }, status: 'done', isActive: true });
      result.push({
        groupId: g._id,
        name: g.name,
        icon: g.icon,
        memberCount: memberIds.length,
        members: memberIds.map(m => ({ _id: m.user._id, name: m.user.name, email: m.user.email, role: m.projectRole })),
        totalTasks,
        doneTasks,
        completionRate: totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0,
      });
    }
    const totalAll = result.reduce((s, g) => s + g.totalTasks, 0);
    const withPct = result.map(g => ({
      ...g,
      contributionPct: totalAll > 0 ? Math.round(g.doneTasks / totalAll * 100) : 0,
    }));
    res.json(withPct);
  } catch (e) { next(e); }
};

function calculateHealthScore(data) {
  const activeRatio = data.totalUsers > 0 ? data.activeUsers / data.totalUsers : 0;
  const completionRatio = data.totalProjects > 0 ? data.completedProjects / data.totalProjects : 0;
  const projectHealthRatio = data.totalProjects > 0 ? (data.totalProjects - data.atRiskProjects) / data.totalProjects : 0;
  const score = Math.round((activeRatio * 0.25 + completionRatio * 0.4 + projectHealthRatio * 0.35) * 100);
  return Math.min(100, Math.max(0, score));
}
