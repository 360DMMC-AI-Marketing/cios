const ProjectMember = require('../models/ProjectMember');
const Project = require('../models/Project');
const User = require('../models/User');
const Notification = require('../models/Notification');
const crypto = require('crypto');
const env = require('../config/env');
const { getDomainProjectIds } = require('../config/planLimits');

const populate = q => q
  .populate('user', 'name email avatar role')
  .populate('invitedBy', 'name email')
  .populate('teamGroup', 'name icon');

exports.getMembers = async (req, res, next) => {
  try {
    const { status } = req.query;
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id.toString() === req.params.projectId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const filter = { project: { $in: projectIds } };
    if (status) filter.status = status;
    const members = await populate(ProjectMember.find(filter).sort({ createdAt: -1 }));
    res.json(members);
  } catch (e) { next(e); }
};

exports.addMember = async (req, res, next) => {
  try {
    const { email, projectRole, teamGroup, message: inviteMessage } = req.body;
    const role = req.body.role || projectRole || 'developer';
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id === req.params.projectId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (teamGroup) {
      const group = await require('../models/TeamGroup').findOne({ _id: teamGroup, project: req.params.projectId });
      if (!group) return res.status(400).json({ message: 'Team group not found' });
    }

    const existingMember = await ProjectMember.findOne({ project: req.params.projectId, email: email.toLowerCase() });
    if (existingMember) return res.status(400).json({ message: 'Already invited or member' });

    let user = await User.findOne({ email: email.toLowerCase() });
    let accountCreated = false;
    let tempPassword = null;

    const project = await Project.findById(req.params.projectId).select('name');

    // Auto-create account if user doesn't exist yet
    if (!user) {
      tempPassword = crypto.randomBytes(8).toString('hex') + 'Aa1!';
      user = await User.create({
        name: email.split('@')[0],
        email: email.toLowerCase(),
        password: tempPassword,
        domain: req.user.domain,
        role: 'developer',
        isActive: true,
        onboardingCompleted: false,
      });
      accountCreated = true;

      // Send email invitation via Graph or SMTP
      try {
        const { sendEmail } = require('../services/emailService');
        const inviterName = req.user.name || req.user.email;
        const projectName = project?.name || 'a project';
        const loginUrl = env.FRONTEND_URL || 'http://localhost:3000';
        const result = await sendEmail({
          to: user.email,
          senderEmail: req.user.email,
          subject: `You've been invited to ${projectName} on CIOS`,
          html: `<p>Hi ${user.name},</p>
<p><strong>${inviterName}</strong> has invited you to join the project <strong>${projectName}</strong> on CIOS.</p>
${inviteMessage ? `<p>Message: ${inviteMessage}</p>` : ''}
<p><strong>Login details:</strong><br>
URL: <a href="${loginUrl}">${loginUrl}</a><br>
Email: ${user.email}<br>
Temporary password: <strong>${tempPassword}</strong></p>
<p>After logging in, you can accept the invitation from your notifications.</p>`,
        });
        if (!result) {
          console.warn(`No email method available — invitation email not sent to ${user.email}`);
        }
      } catch (emailErr) {
        console.error(`Failed to send invitation email to ${user.email}:`, emailErr.message);
      }
    }

    const token = crypto.randomBytes(20).toString('hex');

    const member = await ProjectMember.create({
      project: req.params.projectId,
      domain: req.user.domain,
      user: user._id,
      email: email.toLowerCase(),
      projectRole: role,
      teamGroup: teamGroup || undefined,
      status: 'pending',
      invitedBy: req.user._id,
      invitedAt: new Date(),
      token,
    });

    await Notification.create({
      user: user._id,
      domain: req.user.domain,
      type: 'project_invite',
      title: `Invitation: ${req.user.name} added you to ${project?.name || 'a project'}`,
      message: `You have been invited to join ${project?.name || 'the project'} as ${role}. Click Accept to join or Decline.`,
      link: `/projects/${req.params.projectId}`,
      actions: [
        { label: '✓ Accept', action: 'accept_invite', payload: { token, projectId: req.params.projectId, memberId: member._id } },
        { label: '✕ Decline', action: 'decline_invite', payload: { token, projectId: req.params.projectId, memberId: member._id } },
      ],
    });

    const result = (await populate(ProjectMember.findById(member._id))).toObject();
    result._accountCreated = accountCreated;
    if (accountCreated) result._tempPassword = tempPassword;
    result._emailSent = accountCreated;
    res.status(201).json(result);
  } catch (e) { next(e); }
};

exports.updateMemberRole = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const updates = {};
    if (req.body.projectRole) updates.projectRole = req.body.projectRole;
    if (req.body.teamGroup !== undefined) updates.teamGroup = req.body.teamGroup || null;
    const member = await populate(ProjectMember.findOneAndUpdate(
      { _id: req.params.memberId, project: { $in: projectIds } },
      updates,
      { new: true, runValidators: true }
    ));
    if (!member) return res.status(404).json({ message: 'Member not found' });
    res.json(member);
  } catch (e) { next(e); }
};

exports.removeMember = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    const member = await ProjectMember.findOne({ _id: req.params.memberId, project: { $in: projectIds } });
    if (!member) return res.status(404).json({ message: 'Member not found' });
    if (member.user) {
      await Project.findByIdAndUpdate(member.project, { $pull: { members: member.user } });
    }
    await ProjectMember.findByIdAndDelete(req.params.memberId);
    res.json({ message: 'Member removed' });
  } catch (e) { next(e); }
};

exports.acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const member = await ProjectMember.findOne({ token, status: 'pending' });
    if (!member) return res.status(404).json({ message: 'Invalid or expired invitation' });

    const user = await User.findOne({ email: member.email });
    if (!user) return res.status(400).json({ message: 'No account found. Please register first.' });

    member.user = user._id;
    member.status = 'active';
    member.acceptedAt = new Date();
    await member.save();

    await Project.findByIdAndUpdate(member.project, { $addToSet: { members: user._id } });

    if (member.invitedBy) {
      await Notification.create({
        user: member.invitedBy,
        domain: req.user.domain,
        type: 'project_update',
        title: `${user.name} accepted the invitation`,
        message: `${user.name} has accepted the invitation to join the project as ${member.projectRole}.`,
        link: `/projects/${member.project}`,
      });
    }

    res.json(await populate(ProjectMember.findById(member._id)));
  } catch (e) { next(e); }
};

exports.declineInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const member = await ProjectMember.findOneAndUpdate({ token, status: 'pending' }, { status: 'declined' }, { new: true });
    if (!member) return res.status(404).json({ message: 'Invalid or expired invitation' });

    if (member.invitedBy) {
      const user = await User.findOne({ email: member.email });
      await Notification.create({
        user: member.invitedBy,
        domain: user ? user.domain : req.user.domain,
        type: 'project_update',
        title: `${user ? user.name : member.email} declined the invitation`,
        message: `${user ? user.name : member.email} has declined the invitation to join the project.`,
        link: `/projects/${member.project}`,
      });
    }

    res.json({ message: 'Invitation declined' });
  } catch (e) { next(e); }
};

exports.getProjectMembersForAssign = async (req, res, next) => {
  try {
    const projectIds = await getDomainProjectIds(req.user.domain);
    if (!projectIds.some(id => id === req.params.projectId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const filter = { project: req.params.projectId, status: 'active' };
    if (req.query.teamGroup) filter.teamGroup = req.query.teamGroup;
    const members = await ProjectMember.find(filter)
      .populate('user', 'name email avatar role')
      .populate('teamGroup', 'name icon')
      .sort({ createdAt: -1 });
    const users = members.filter(m => m.user).map(m => ({
      ...m.user.toObject(),
      teamGroup: m.teamGroup,
      projectRole: m.projectRole,
    }));
    res.json(users);
  } catch (e) { next(e); }
};
