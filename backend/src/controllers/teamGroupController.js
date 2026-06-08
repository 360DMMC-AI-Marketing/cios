const TeamGroup = require('../models/TeamGroup');
const { getDomainProjectIds } = require('../config/planLimits');

exports.getGroups = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id === req.params.projectId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const groups = await TeamGroup.find({ project: req.params.projectId, isArchived: false })
      .sort({ order: 1 });
    res.json(groups);
  } catch (e) { next(e); }
};

exports.createGroup = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id === req.params.projectId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const count = await TeamGroup.countDocuments({ project: req.params.projectId });
    const group = await TeamGroup.create({
      project: req.params.projectId,
      domain: req.user.domain,
      name: req.body.name,
      icon: req.body.icon || '👥',
      roles: req.body.roles || [],
      order: count,
    });
    res.status(201).json(group);
  } catch (e) { next(e); }
};

exports.updateGroup = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const allowed = ['name', 'icon', 'roles', 'order'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const group = await TeamGroup.findOneAndUpdate(
      { _id: req.params.groupId, project: { $in: projectIds } },
      updates,
      { new: true, runValidators: true }
    );
    if (!group) return res.status(404).json({ message: 'Group not found' });
    res.json(group);
  } catch (e) { next(e); }
};

exports.archiveGroup = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const group = await TeamGroup.findOneAndUpdate(
      { _id: req.params.groupId, project: { $in: projectIds } },
      { isArchived: true },
      { new: true }
    );
    if (!group) return res.status(404).json({ message: 'Group not found' });
    const ProjectMember = require('../models/ProjectMember');
    await ProjectMember.updateMany(
      { teamGroup: req.params.groupId, project: { $in: projectIds } },
      { $unset: { teamGroup: '' } }
    );
    res.json({ message: 'Group archived' });
  } catch (e) { next(e); }
};

exports.getAllDomainGrouped = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const ProjectMember = require('../models/ProjectMember');

    const mongoose = require('mongoose');
    const projectObjectIds = projectIds.map(id => new mongoose.Types.ObjectId(id));
    const mergedGroups = await TeamGroup.aggregate([
      { $match: { project: { $in: projectObjectIds }, isArchived: false } },
      { $group: { _id: '$name', icon: { $first: '$icon' }, order: { $first: '$order' }, roles: { $first: '$roles' }, groupIds: { $addToSet: '$_id' }, projects: { $addToSet: '$project' } } },
      { $sort: { order: 1 } },
    ]);

    const allGroupIds = mergedGroups.flatMap(g => g.groupIds);
    const members = await ProjectMember.find({ teamGroup: { $in: allGroupIds } })
      .populate('user', 'name email avatar role')
      .populate('invitedBy', 'name email')
      .populate('project', 'name')
      .sort({ createdAt: -1 }).lean();

    const grouped = mergedGroups.map(g => {
      const groupMembers = members.filter(m => m.teamGroup && g.groupIds.some(gid => String(gid) === String(m.teamGroup._id || m.teamGroup)));
      const byUser = {};
      groupMembers.forEach(m => {
        const uid = m.user?._id ? String(m.user._id) : m.email;
        if (!byUser[uid]) {
          byUser[uid] = {
            user: m.user || { email: m.email },
            memberships: [],
          };
        }
        byUser[uid].memberships.push({
          project: m.project || null,
          projectRole: m.projectRole,
          status: m.status,
          memberId: m._id,
        });
      });
      return {
        name: g._id,
        icon: g.icon,
        order: g.order,
        roles: g.roles,
        groupIds: g.groupIds,
        projects: g.projects,
        members: Object.values(byUser),
      };
    });

    const usedIds = new Set(mergedGroups.flatMap(g => g.groupIds.map(id => String(id))));
    const ungrouped = members.filter(m => !m.teamGroup || !usedIds.has(String(m.teamGroup._id || m.teamGroup)));
    res.json({ groups: grouped, ungrouped });
  } catch (e) { next(e); }
};

exports.getGroupedMembers = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id === req.params.projectId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const ProjectMember = require('../models/ProjectMember');
    const { status } = req.query;
    const filter = { project: req.params.projectId };
    if (status) filter.status = status;
    const members = await ProjectMember.find(filter)
      .populate('user', 'name email avatar role')
      .populate('invitedBy', 'name email')
      .populate('teamGroup', 'name icon')
      .sort({ createdAt: -1 });
    const groups = await TeamGroup.find({ project: req.params.projectId, isArchived: false })
      .sort({ order: 1 });
    const grouped = groups.map(g => ({
      ...g.toObject(),
      members: members.filter(m => m.teamGroup && String(m.teamGroup._id || m.teamGroup) === String(g._id)),
    }));
    const ungrouped = members.filter(m => !m.teamGroup);
    res.json({ groups: grouped, ungrouped });
  } catch (e) { next(e); }
};
