const axios = require('axios');
const env = require('../config/env');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Activity = require('../models/Activity');

class ClickUpService {
  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.clickup.com/api/v2',
      headers: {
        Authorization: env.CLICKUP_API_KEY,
        'Content-Type': 'application/json',
      },
    });
  }

  async syncTasks(listId, projectId) {
    try {
      const { data } = await this.api.get(`/list/${listId}/task`, {
        params: { include_closed: true, subtasks: false },
      });

      const tasks = data.tasks || [];
      for (const t of tasks) {
        const existing = await Task.findOne({ clickupTaskId: t.id });
        if (existing) {
          existing.status = mapClickUpStatus(t.status.status);
          existing.title = t.name;
          existing.description = t.description || existing.description;
          await existing.save();
        } else {
          const task = await Task.create({
            title: t.name,
            description: t.description || '',
            status: mapClickUpStatus(t.status.status),
            clickupTaskId: t.id,
            project: projectId,
            deadline: t.due_date ? new Date(parseInt(t.due_date)) : null,
          });
          await Project.findByIdAndUpdate(projectId, { $push: { tasks: task._id } });
        }
      }

      return { synced: tasks.length };
    } catch (error) {
      console.error('ClickUp sync error:', error.message);
      return null;
    }
  }

  async createTask(clickupListId, taskData) {
    try {
      const { data } = await this.api.post(`/list/${clickupListId}/task`, {
        name: taskData.title,
        description: taskData.description,
        due_date: taskData.deadline ? new Date(taskData.deadline).getTime().toString() : undefined,
        priority: mapPriority(taskData.priority),
      });
      return data;
    } catch (error) {
      console.error('ClickUp create task error:', error.message);
      return null;
    }
  }
}

function mapClickUpStatus(status) {
  const map = {
    'to do': 'todo',
    'in progress': 'in_progress',
    'in review': 'review',
    'complete': 'done',
    'closed': 'done',
  };
  return map[status?.toLowerCase()] || 'todo';
}

function mapPriority(priority) {
  const map = { low: 4, medium: 3, high: 2, urgent: 1 };
  return map[priority] || 3;
}

ClickUpService.prototype.sync = async function() {
  try {
    const Project = require('../models/Project');
    const projects = await Project.find({ clickupListId: { $ne: '' }, isActive: true });
    let total = { projects: 0, synced: 0 };
    for (const p of projects) {
      const result = await this.syncTasks(p.clickupListId, p._id);
      if (result) {
        total.projects++;
        total.synced += result.synced;
      }
    }
    return total;
  } catch (error) {
    console.error('ClickUp auto-sync error:', error.message);
    return null;
  }
};

module.exports = new ClickUpService();
