const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');

const env = require('./config/env');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { setupSocket } = require('./socket');
const { runStatusEngine } = require('./services/statusEngine');
const Integration = require('./models/Integration');
const integrationController = require('./controllers/integrationController');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const analyticsRoutes = require('./routes/analytics');
const integrationRoutes = require('./routes/integrations');
const sprintRoutes = require('./routes/sprints');
const companyRoutes = require('./routes/companies');
const notificationRoutes = require('./routes/notifications');
const testingRoutes = require('./routes/testing');
const workLogRoutes = require('./routes/workLogs');
const testCaseRoutes = require('./routes/testCases');

const app = express();
const server = http.createServer(app);

const allowedOrigins = env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : ['http://localhost:5173'];
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/sprints', sprintRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/testing', testingRoutes);
app.use('/api/work-logs', workLogRoutes);
app.use('/api/test-cases', testCaseRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/seed', async (req, res) => {
  try {
    const User = require('./models/User');
    const Company = require('./models/Company');
    const Project = require('./models/Project');
    const ProjectMember = require('./models/ProjectMember');
    const Task = require('./models/Task');
    const Sprint = require('./models/Sprint');
    const TeamGroup = require('./models/TeamGroup');
    const Activity = require('./models/Activity');
    const Resource = require('./models/Resource');
    const Integration = require('./models/Integration');
    const { DEFAULT_GROUPS } = TeamGroup;

    // Clear all data
    await Promise.all([
      User.deleteMany({}), Company.deleteMany({}), Project.deleteMany({}),
      ProjectMember.deleteMany({}), Task.deleteMany({}), Sprint.deleteMany({}),
      TeamGroup.deleteMany({}), Activity.deleteMany({}), Resource.deleteMany({}),
      Integration.deleteMany({}),
    ]);

    // Company
    await Company.create({ name: "Admin's Company", domain: 'admin@cios.com', plan: 'enterprise' });

    // Users
    const admin = await User.create({ name: 'Admin User', email: 'admin@cios.com', password: 'password123', role: 'admin', domain: 'admin@cios.com' });
    const pm = await User.create({ name: 'Project Manager', email: 'pm@cios.com', password: 'password123', role: 'project_manager', domain: 'admin@cios.com' });
    const dev = await User.create({ name: 'Developer User', email: 'dev@cios.com', password: 'password123', role: 'developer', domain: 'admin@cios.com' });
    const qa = await User.create({ name: 'QA Tester', email: 'qa@cios.com', password: 'password123', role: 'qa_tester', domain: 'admin@cios.com' });
    const intern = await User.create({ name: 'Intern User', email: 'intern@cios.com', password: 'password123', role: 'intern', domain: 'admin@cios.com' });
    const users = { admin, pm, dev, qa, intern };

    // Projects
    const projects = await Project.create([
      { name: 'Website Redesign', projectType: 'software', description: 'Redesign company website with modern stack', status: 'on_track', phase: 'review', progress: 65, domain: 'admin@cios.com' },
      { name: 'Mobile App v2', projectType: 'design', description: 'Version 2 of the mobile application', status: 'completed', phase: 'launched', progress: 100, domain: 'admin@cios.com' },
      { name: 'API Gateway', projectType: 'business', description: 'Build unified API gateway for microservices', status: 'delayed', phase: 'testing', progress: 45, domain: 'admin@cios.com' },
      { name: 'E-commerce Platform', projectType: 'content', description: 'Full-stack e-commerce platform with payment integration', status: 'ready_to_test', phase: 'testing', progress: 82, domain: 'admin@cios.com' },
      { name: 'Analytics Dashboard', projectType: 'research', description: 'Real-time analytics dashboard with charts and reporting', status: 'on_track', phase: 'development', progress: 55, domain: 'admin@cios.com' },
    ]);
    const [pWeb, pMobile, pApi, pEcom, pDash] = projects;

    // Team groups per project
    for (const proj of projects) {
      for (const def of DEFAULT_GROUPS) {
        await TeamGroup.create({ project: proj._id, domain: proj.domain, name: def.name, icon: def.icon, roles: def.roles, isDefault: true, order: def.order });
      }
    }

    // Project members
    const roleToGroup = r => {
      if (['admin','company_owner'].includes(r)) return 'Administration Team';
      if (['project_manager','team_leader','scrum_master'].includes(r)) return 'Project Management Team';
      if (['developer','frontend_developer','backend_developer','full_stack_developer','mobile_developer','devops_engineer'].includes(r)) return 'Development Team';
      if (['qa_tester','automation_tester','qa_lead'].includes(r)) return 'QA & Testing Team';
      if (['designer','ui_designer','ux_designer','product_designer'].includes(r)) return 'Design Team';
      if (['business_analyst','product_owner','business_developer'].includes(r)) return 'Business Team';
      if (['intern','development_intern','qa_intern','design_intern','business_intern'].includes(r)) return 'Interns';
      return 'Development Team';
    };
    const userList = [
      { key: 'admin', role: 'admin' }, { key: 'pm', role: 'project_manager' },
      { key: 'dev', role: 'frontend_developer' }, { key: 'qa', role: 'qa_tester' },
      { key: 'intern', role: 'intern' },
    ];
    for (const proj of projects) {
      for (const { key, role } of userList) {
        const u = users[key];
        const group = await TeamGroup.findOne({ project: proj._id, name: roleToGroup(role) });
        await ProjectMember.create({ project: proj._id, domain: proj.domain, user: u._id, email: u.email, projectRole: role, teamGroup: group?._id, status: 'active', invitedBy: admin._id, invitedAt: new Date(), acceptedAt: new Date() });
      }
      await User.findByIdAndUpdate(admin._id, { $addToSet: { assignedProjects: proj._id } });
    }

    // Tasks
    const tasks = await Task.create([
      { title: 'Design homepage mockup', status: 'done', priority: 'high', project: pWeb._id, assignee: dev._id, estimatedHours: 20, loggedHours: 18 },
      { title: 'Implement responsive navbar', status: 'in_progress', priority: 'medium', project: pWeb._id, assignee: dev._id, estimatedHours: 15, loggedHours: 8 },
      { title: 'Set up CI/CD pipeline', status: 'todo', priority: 'high', project: pWeb._id, assignee: dev._id, estimatedHours: 10 },
      { title: 'User authentication flow', status: 'in_progress', priority: 'urgent', project: pMobile._id, assignee: dev._id, estimatedHours: 30, loggedHours: 12 },
      { title: 'Push notification service', status: 'todo', priority: 'medium', project: pMobile._id, assignee: intern._id, estimatedHours: 15 },
      { title: 'API rate limiting', status: 'done', priority: 'high', project: pApi._id, assignee: dev._id, estimatedHours: 12, loggedHours: 14 },
      { title: 'Documentation', status: 'in_progress', priority: 'low', project: pApi._id, assignee: pm._id, estimatedHours: 8, loggedHours: 4 },
      { title: 'Database migration script', status: 'delayed', priority: 'urgent', project: pApi._id, assignee: dev._id, estimatedHours: 25, loggedHours: 20 },
      { title: 'Payment gateway integration', status: 'done', priority: 'high', project: pEcom._id, assignee: dev._id, estimatedHours: 40, loggedHours: 38 },
      { title: 'Product catalog API', status: 'done', priority: 'high', project: pEcom._id, assignee: dev._id, estimatedHours: 30, loggedHours: 28 },
      { title: 'Shopping cart UI', status: 'in_progress', priority: 'medium', project: pEcom._id, assignee: dev._id, estimatedHours: 20, loggedHours: 10 },
      { title: 'Order management system', status: 'todo', priority: 'high', project: pEcom._id, assignee: pm._id, estimatedHours: 25 },
      { title: 'QA test suite for checkout', status: 'in_progress', priority: 'medium', project: pEcom._id, assignee: qa._id, estimatedHours: 15, loggedHours: 6 },
      { title: 'Dashboard data pipeline', status: 'done', priority: 'high', project: pDash._id, assignee: dev._id, estimatedHours: 20, loggedHours: 18 },
      { title: 'Real-time chart components', status: 'in_progress', priority: 'medium', project: pDash._id, assignee: dev._id, estimatedHours: 25, loggedHours: 12 },
      { title: 'Report export feature', status: 'todo', priority: 'low', project: pDash._id, assignee: dev._id, estimatedHours: 12 },
      { title: 'User permission system', status: 'in_progress', priority: 'high', project: pDash._id, assignee: pm._id, estimatedHours: 18, loggedHours: 8 },
    ]);

    // Link tasks to projects
    const projTasks = {
      [pWeb._id]: tasks.slice(0,3).map(t => t._id),
      [pMobile._id]: tasks.slice(3,5).map(t => t._id),
      [pApi._id]: tasks.slice(5,8).map(t => t._id),
      [pEcom._id]: tasks.slice(8,13).map(t => t._id),
      [pDash._id]: tasks.slice(13).map(t => t._id),
    };
    for (const [pid, tids] of Object.entries(projTasks)) {
      await Project.findByIdAndUpdate(pid, { $push: { tasks: { $each: tids } } });
    }

    // Sprints
    const today = new Date();
    await Sprint.create([
      { name: 'Sprint 1 — Homepage', project: pWeb._id, startDate: new Date(today - 14*86400000), endDate: new Date(today + 14*86400000), status: 'active', goal: 'Complete homepage redesign', tasks: projTasks[pWeb._id], createdBy: pm._id },
      { name: 'Sprint 2 — Auth & Notifications', project: pMobile._id, startDate: new Date(today - 7*86400000), endDate: new Date(today + 21*86400000), status: 'active', goal: 'Implement auth and notifications', tasks: projTasks[pMobile._id], createdBy: pm._id },
      { name: 'Sprint 3 — API Core', project: pApi._id, startDate: new Date(today - 21*86400000), endDate: new Date(today + 7*86400000), status: 'active', goal: 'Finalize API core features', tasks: projTasks[pApi._id], createdBy: pm._id },
      { name: 'Sprint 4 — Checkout Flow', project: pEcom._id, startDate: new Date(today - 10*86400000), endDate: new Date(today + 18*86400000), status: 'active', goal: 'Complete checkout flow', tasks: projTasks[pEcom._id], createdBy: pm._id },
      { name: 'Sprint 5 — Data Viz', project: pDash._id, startDate: new Date(today - 5*86400000), endDate: new Date(today + 23*86400000), status: 'active', goal: 'Build data visualization', tasks: projTasks[pDash._id], createdBy: pm._id },
    ]);

    // Resources
    await Resource.create([
      { project: pWeb._id, title: 'Frontend Repository', category:'dev', type:'github', url:'https://github.com/company/website-redesign', description:'Main frontend repo', addedBy: pm._id },
      { project: pWeb._id, title: 'Figma Design System', category:'design', type:'figma', url:'https://figma.com/file/company/website-redesign', description:'Design system with components', addedBy: pm._id },
      { project: pMobile._id, title: 'Mobile App Repo', category:'dev', type:'github', url:'https://github.com/company/mobile-app-v2', description:'React Native mobile app', addedBy: pm._id },
      { project: pApi._id, title: 'API Gateway Repo', category:'dev', type:'gitlab', url:'https://gitlab.com/company/api-gateway', description:'Microservices API gateway', addedBy: pm._id },
      { project: pEcom._id, title: 'E-commerce Repo', category:'dev', type:'github', url:'https://github.com/company/ecommerce-platform', description:'Full-stack e-commerce', addedBy: pm._id },
      { project: pDash._id, title: 'Dashboard Repo', category:'dev', type:'github', url:'https://github.com/company/analytics-dashboard', description:'Real-time analytics frontend', addedBy: pm._id },
    ]);

    // Integrations
    await Integration.create([
      { name: 'github', isConnected: false, config: { repos: [] } },
      { name: 'clickup', isConnected: false, config: { lists: [] } },
      { name: 'microsoft_graph', isConnected: false, config: {} },
    ]);

    res.json({ message: 'Full demo data seeded! Login: admin@cios.com / password123' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(errorHandler);
setupSocket(io);

cron.schedule('*/15 * * * *', () => { runStatusEngine().catch(console.error); });

async function autoSyncIntegrations() {
  try {
    const integrations = await Integration.find({ isConnected: true });
    for (const int of integrations) {
      try {
        const service = integrationController.getSyncService(int.name);
        if (service && typeof service.sync === 'function') {
          await service.sync();
          await Integration.findOneAndUpdate({ name: int.name }, { lastSync: new Date() });
        }
      } catch (err) { console.error(`Auto-sync failed for ${int.name}:`, err.message); }
    }
  } catch (err) { console.error('Auto-sync error:', err.message); }
}

cron.schedule('*/30 * * * *', () => { autoSyncIntegrations(); });
console.log('CIOS backend starting...');

const PORT = env.PORT;
connectDB().then(() => {
  server.listen(PORT, () => { console.log(`CIOS backend running on port ${PORT}`); });
});

module.exports = { app, server, io };
