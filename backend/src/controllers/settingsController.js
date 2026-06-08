const Project = require('../models/Project');
const Activity = require('../models/Activity');
const { getDomainProjectIds } = require('../config/planLimits');

exports.getSettings = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, domain: req.user.domain })
      .select('name description status phase progress deadline startDate client settings techStack members teamChannel teamsTeamId teamsChannelId')
      .populate('members', 'name email role avatar');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const data = project.toObject();
    data.teamsChannel = data.teamChannel || '';
    res.json(data);
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const { general, development, sprints, tasks, notifications, permissions, health, archive } = req.body;

    const updateFields = {};
    if (general) {
      if (general.name !== undefined) updateFields.name = general.name;
      if (general.description !== undefined) updateFields.description = general.description;
      if (general.status !== undefined) updateFields.status = general.status;
      if (general.phase !== undefined) updateFields.phase = general.phase;
      if (general.progress !== undefined) updateFields.progress = general.progress;
      if (general.startDate !== undefined) updateFields.startDate = general.startDate;
      if (general.deadline !== undefined) updateFields.deadline = general.deadline;
      if (general.client !== undefined) updateFields.client = general.client;
    }

    const settingsUpdate = {};
    if (general) {
      if (general.priority !== undefined) settingsUpdate['settings.priority'] = general.priority;
      if (general.color !== undefined) settingsUpdate['settings.color'] = general.color;
      if (general.clientName !== undefined) settingsUpdate['settings.clientName'] = general.clientName;
    }
    if (development) {
      if (development.techStack !== undefined) updateFields.techStack = development.techStack;
      if (development.frontendRepo !== undefined) settingsUpdate['settings.frontendRepo'] = development.frontendRepo;
      if (development.backendRepo !== undefined) settingsUpdate['settings.backendRepo'] = development.backendRepo;
      if (development.databaseRepo !== undefined) settingsUpdate['settings.databaseRepo'] = development.databaseRepo;
      if (development.mobileRepo !== undefined) settingsUpdate['settings.mobileRepo'] = development.mobileRepo;
      if (development.apiDocsUrl !== undefined) settingsUpdate['settings.apiDocsUrl'] = development.apiDocsUrl;
      if (development.stagingUrl !== undefined) settingsUpdate['settings.stagingUrl'] = development.stagingUrl;
      if (development.productionUrl !== undefined) settingsUpdate['settings.productionUrl'] = development.productionUrl;
      if (development.teamsChannel !== undefined) updateFields.teamChannel = development.teamsChannel;
      if (development.teamsTeamId !== undefined) updateFields.teamsTeamId = development.teamsTeamId;
      if (development.teamsChannelId !== undefined) updateFields.teamsChannelId = development.teamsChannelId;
    }
    if (sprints) {
      if (sprints.sprintDuration !== undefined) settingsUpdate['settings.sprintDuration'] = sprints.sprintDuration;
      if (sprints.sprintNamingConvention !== undefined) settingsUpdate['settings.sprintNamingConvention'] = sprints.sprintNamingConvention;
      if (sprints.storyPointsEnabled !== undefined) settingsUpdate['settings.storyPointsEnabled'] = sprints.storyPointsEnabled;
    }
    if (tasks) {
      if (tasks.statuses !== undefined) settingsUpdate['settings.taskStatuses'] = tasks.statuses;
      if (tasks.priorityLevels !== undefined) settingsUpdate['settings.taskPriorityLevels'] = tasks.priorityLevels;
    }
    if (notifications) {
      if (notifications.notifyTaskAssignment !== undefined) settingsUpdate['settings.notifyTaskAssignment'] = notifications.notifyTaskAssignment;
      if (notifications.notifySprintChanges !== undefined) settingsUpdate['settings.notifySprintChanges'] = notifications.notifySprintChanges;
      if (notifications.notifyProjectUpdates !== undefined) settingsUpdate['settings.notifyProjectUpdates'] = notifications.notifyProjectUpdates;
      if (notifications.emailNotifications !== undefined) settingsUpdate['settings.emailNotifications'] = notifications.emailNotifications;
      if (notifications.inAppNotifications !== undefined) settingsUpdate['settings.inAppNotifications'] = notifications.inAppNotifications;
    }
    if (permissions) {
      if (permissions.canCreateTasks !== undefined) settingsUpdate['settings.canCreateTasks'] = permissions.canCreateTasks;
      if (permissions.canCreateSprints !== undefined) settingsUpdate['settings.canCreateSprints'] = permissions.canCreateSprints;
      if (permissions.canUploadFiles !== undefined) settingsUpdate['settings.canUploadFiles'] = permissions.canUploadFiles;
      if (permissions.canEditSettings !== undefined) settingsUpdate['settings.canEditSettings'] = permissions.canEditSettings;
      if (permissions.canDeleteResources !== undefined) settingsUpdate['settings.canDeleteResources'] = permissions.canDeleteResources;
    }
    if (health) {
      if (health.blockers !== undefined) settingsUpdate['settings.blockers'] = health.blockers;
      if (health.risks !== undefined) settingsUpdate['settings.risks'] = health.risks;
      if (health.issues !== undefined) settingsUpdate['settings.issues'] = health.issues;
      if (health.dependencies !== undefined) settingsUpdate['settings.dependencies'] = health.dependencies;
      if (health.healthNotes !== undefined) settingsUpdate['settings.healthNotes'] = health.healthNotes;
    }
    if (archive) {
      if (archive.isArchived !== undefined) settingsUpdate['settings.isArchived'] = archive.isArchived;
      if (archive.isArchived) settingsUpdate['settings.archivedAt'] = new Date();
      else settingsUpdate['settings.restoredAt'] = new Date();
    }

    const updatePayload = { ...updateFields, ...settingsUpdate };
    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ message: 'No settings to update' });
    }

    const project = await Project.findOneAndUpdate({ _id: req.params.projectId, domain: req.user.domain }, updatePayload, { new: true, runValidators: true })
      .select('name description status phase progress deadline startDate client settings techStack members teamChannel teamsTeamId teamsChannelId')
      .populate('members', 'name email role avatar');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    await Activity.create({
      user: req.user._id,
      domain: req.user.domain,
      type: 'project_update',
      source: 'internal',
      description: `Updated project settings for ${project.name}`,
      metadata: { projectId: project._id, projectName: project.name },
    });

    res.json(project);
  } catch (error) {
    next(error);
  }
};
