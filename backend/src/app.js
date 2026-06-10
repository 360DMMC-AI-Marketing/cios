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
const interestRoutes = require('./routes/interests');
const bugRoutes = require('./routes/bugs');
const myTasksRoutes = require('./routes/myTasks');

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
app.use('/api/interests', interestRoutes);
app.use('/api/bugs', bugRoutes);
app.use('/api/my-tasks', myTasksRoutes);

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

    await Promise.all([
      User.deleteMany({}), Company.deleteMany({}), Project.deleteMany({}),
      ProjectMember.deleteMany({}), Task.deleteMany({}), Sprint.deleteMany({}),
      TeamGroup.deleteMany({}), Activity.deleteMany({}), Resource.deleteMany({}),
      Integration.deleteMany({}),
    ]);

    await Company.create({ name: "Admin's Company", domain: 'admin@cios.com', plan: 'enterprise' });

    const admin = await User.create({ name: 'Admin User', email: 'admin@cios.com', password: 'password123', role: 'admin', domain: 'admin@cios.com' });
    const pm = await User.create({ name: 'Project Manager', email: 'pm@cios.com', password: 'password123', role: 'project_manager', domain: 'admin@cios.com' });
    const dev = await User.create({ name: 'Developer User', email: 'dev@cios.com', password: 'password123', role: 'developer', domain: 'admin@cios.com' });
    const qa = await User.create({ name: 'QA Tester', email: 'qa@cios.com', password: 'password123', role: 'qa_tester', domain: 'admin@cios.com' });
    const intern = await User.create({ name: 'Intern User', email: 'intern@cios.com', password: 'password123', role: 'intern', domain: 'admin@cios.com' });
    const manager = await User.create({ name: 'Team Lead', email: 'manager@cios.com', password: 'password123', role: 'manager', domain: 'admin@cios.com' });
    const designer = await User.create({ name: 'UI/UX Designer', email: 'designer@cios.com', password: 'password123', role: 'developer', domain: 'admin@cios.com' });
    const analyst = await User.create({ name: 'Business Analyst', email: 'analyst@cios.com', password: 'password123', role: 'manager', domain: 'admin@cios.com' });
    const scrum = await User.create({ name: 'Scrum Master', email: 'scrum@cios.com', password: 'password123', role: 'team_lead', domain: 'admin@cios.com' });
    await User.create({ name: 'Test User', email: 'test@demo.com', password: 'password123', role: 'admin', domain: 'admin@cios.com' });

    const allUsers = [admin, pm, dev, qa, intern, manager, designer, analyst, scrum];
    const allUserIds = allUsers.map(u => u._id);

    const projects = await Project.create([
      { name: 'Website Redesign', projectType: 'software', description: 'Redesign company website with modern stack', status: 'on_track', phase: 'development', progress: 33, deadline: new Date('2025-08-01'), members: allUserIds, domain: 'admin@cios.com' },
      { name: 'Mobile App v2', projectType: 'design', description: 'Version 2 of the mobile application', status: 'completed', phase: 'launched', progress: 100, deadline: new Date('2025-09-15'), members: allUserIds, domain: 'admin@cios.com' },
      { name: 'API Gateway', projectType: 'business', description: 'Build unified API gateway for microservices', status: 'delayed', phase: 'business_growth', progress: 33, deadline: new Date('2025-06-01'), members: allUserIds, domain: 'admin@cios.com' },
      { name: 'E-commerce Platform', projectType: 'content', description: 'Full-stack e-commerce platform with payment integration', status: 'ready_to_test', phase: 'content_creation', progress: 40, deadline: new Date('2025-07-15'), members: allUserIds, domain: 'admin@cios.com' },
      { name: 'Analytics Dashboard', projectType: 'research', description: 'Real-time analytics dashboard with charts and reporting', status: 'on_track', phase: 'research', progress: 25, deadline: new Date('2025-09-01'), members: allUserIds, domain: 'admin@cios.com' },
    ]);
    const [pWeb, pMobile, pApi, pEcom, pDash] = projects;

    const groupMap = {};
    for (const proj of projects) {
      const pid = String(proj._id);
      groupMap[pid] = {};
      for (const def of DEFAULT_GROUPS) {
        const g = await TeamGroup.create({ project: proj._id, domain: proj.domain, name: def.name, icon: def.icon, roles: def.roles, isDefault: true, order: def.order });
        groupMap[pid][def.name] = g;
      }
    }

    const roleToGroup = (role) => {
      if (['admin', 'company_owner'].includes(role)) return 'Administration Team';
      if (['project_manager', 'team_leader', 'scrum_master'].includes(role)) return 'Project Management Team';
      if (['developer', 'frontend_developer', 'backend_developer', 'full_stack_developer', 'mobile_developer', 'devops_engineer'].includes(role)) return 'Development Team';
      if (['qa_tester', 'automation_tester', 'qa_lead'].includes(role)) return 'QA & Testing Team';
      if (['designer', 'ui_designer', 'ux_designer', 'product_designer'].includes(role)) return 'Design Team';
      if (['manager', 'business_analyst', 'product_owner', 'business_developer'].includes(role)) return 'Business Team';
      if (['intern', 'development_intern', 'qa_intern', 'design_intern', 'business_intern'].includes(role)) return 'Interns';
      return 'Development Team';
    };

    const memberEntries = [
      ['admin', 'admin'], ['pm', 'project_manager'], ['dev', 'frontend_developer'],
      ['qa', 'qa_tester'], ['intern', 'intern'], ['manager', 'team_leader'],
      ['designer', 'ui_designer'], ['analyst', 'business_analyst'], ['scrum', 'scrum_master'],
    ];
    const userMap = { admin, pm, dev, qa, intern, manager, designer, analyst, scrum };
    const membersData = [];
    for (const proj of projects) {
      for (const [key, role] of memberEntries) {
        const u = userMap[key];
        const groupName = roleToGroup(role);
        const group = groupMap[String(proj._id)][groupName];
        membersData.push({ project: proj._id, domain: proj.domain, user: u._id, email: u.email, projectRole: role, teamGroup: group._id, status: 'active', invitedBy: admin._id, invitedAt: new Date(), acceptedAt: new Date() });
      }
    }
    await ProjectMember.create(membersData);

    for (const u of allUsers) {
      await User.findByIdAndUpdate(u._id, { $push: { assignedProjects: { $each: projects.map(p => p._id) } } });
    }

    const tasks = await Task.create([
      { title: 'Design homepage mockup', status: 'done', priority: 'high', project: pWeb._id, assignee: dev._id, deadline: new Date('2025-06-15'), estimatedHours: 20, loggedHours: 18 },
      { title: 'Implement responsive navbar', status: 'in_progress', priority: 'medium', project: pWeb._id, assignee: dev._id, deadline: new Date('2025-07-01'), estimatedHours: 15, loggedHours: 8 },
      { title: 'Set up CI/CD pipeline', status: 'todo', priority: 'high', project: pWeb._id, assignee: dev._id, deadline: new Date('2025-07-15'), estimatedHours: 10 },
      { title: 'User authentication flow', status: 'in_progress', priority: 'urgent', project: pMobile._id, assignee: dev._id, deadline: new Date('2025-07-01'), estimatedHours: 30, loggedHours: 12 },
      { title: 'Push notification service', status: 'todo', priority: 'medium', project: pMobile._id, assignee: intern._id, deadline: new Date('2025-08-01'), estimatedHours: 15 },
      { title: 'API rate limiting', status: 'done', priority: 'high', project: pApi._id, assignee: dev._id, deadline: new Date('2025-05-15'), estimatedHours: 12, loggedHours: 14 },
      { title: 'Documentation', status: 'in_progress', priority: 'low', project: pApi._id, assignee: pm._id, deadline: new Date('2025-06-10'), estimatedHours: 8, loggedHours: 4 },
      { title: 'Database migration script', status: 'delayed', priority: 'urgent', project: pApi._id, assignee: dev._id, deadline: new Date('2025-05-20'), estimatedHours: 25, loggedHours: 20 },
      { title: 'Payment gateway integration', status: 'done', priority: 'high', project: pEcom._id, assignee: dev._id, deadline: new Date('2025-06-01'), estimatedHours: 40, loggedHours: 38 },
      { title: 'Product catalog API', status: 'done', priority: 'high', project: pEcom._id, assignee: dev._id, deadline: new Date('2025-06-15'), estimatedHours: 30, loggedHours: 28 },
      { title: 'Shopping cart UI', status: 'in_progress', priority: 'medium', project: pEcom._id, assignee: dev._id, deadline: new Date('2025-07-01'), estimatedHours: 20, loggedHours: 10 },
      { title: 'Order management system', status: 'todo', priority: 'high', project: pEcom._id, assignee: pm._id, deadline: new Date('2025-07-10'), estimatedHours: 25 },
      { title: 'QA test suite for checkout', status: 'in_progress', priority: 'medium', project: pEcom._id, assignee: qa._id, deadline: new Date('2025-07-05'), estimatedHours: 15, loggedHours: 6 },
      { title: 'Dashboard data pipeline', status: 'done', priority: 'high', project: pDash._id, assignee: dev._id, deadline: new Date('2025-06-20'), estimatedHours: 20, loggedHours: 18 },
      { title: 'Real-time chart components', status: 'in_progress', priority: 'medium', project: pDash._id, assignee: dev._id, deadline: new Date('2025-07-15'), estimatedHours: 25, loggedHours: 12 },
      { title: 'Report export feature', status: 'todo', priority: 'low', project: pDash._id, assignee: dev._id, deadline: new Date('2025-08-01'), estimatedHours: 12 },
      { title: 'User permission system', status: 'in_progress', priority: 'high', project: pDash._id, assignee: pm._id, deadline: new Date('2025-07-20'), estimatedHours: 18, loggedHours: 8 },
    ]);

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

    const today = new Date();
    await Sprint.create([
      // Completed sprints (past)
      { name: 'MVP Launch — Homepage', project: pWeb._id, startDate: new Date(today - 60*86400000), endDate: new Date(today - 30*86400000), status: 'completed', goal: 'Initial homepage MVP launch', tasks: [tasks[0]], createdBy: pm._id },
      { name: 'MVP — Auth', project: pMobile._id, startDate: new Date(today - 50*86400000), endDate: new Date(today - 20*86400000), status: 'completed', goal: 'Core authentication flow', tasks: [tasks[3]], createdBy: pm._id },
      { name: 'Sprint 0 — API Foundation', project: pApi._id, startDate: new Date(today - 70*86400000), endDate: new Date(today - 40*86400000), status: 'completed', goal: 'API rate limiting and initial setup', tasks: [tasks[5]], createdBy: pm._id },
      { name: 'Sprint 0 — Payment Core', project: pEcom._id, startDate: new Date(today - 65*86400000), endDate: new Date(today - 35*86400000), status: 'completed', goal: 'Payment gateway and product catalog', tasks: [tasks[8], tasks[9]], createdBy: pm._id },
      { name: 'Sprint 0 — Data Pipeline', project: pDash._id, startDate: new Date(today - 55*86400000), endDate: new Date(today - 25*86400000), status: 'completed', goal: 'Initial data pipeline setup', tasks: [tasks[13]], createdBy: pm._id },
      // Active sprints
      { name: 'Sprint 1 — Homepage', project: pWeb._id, startDate: new Date(today - 14*86400000), endDate: new Date(today + 14*86400000), status: 'active', goal: 'Complete homepage redesign', tasks: projTasks[pWeb._id], createdBy: pm._id },
      { name: 'Sprint 2 — Auth & Notifications', project: pMobile._id, startDate: new Date(today - 7*86400000), endDate: new Date(today + 21*86400000), status: 'active', goal: 'Implement auth and notifications', tasks: projTasks[pMobile._id], createdBy: pm._id },
      { name: 'Sprint 3 — API Core', project: pApi._id, startDate: new Date(today - 21*86400000), endDate: new Date(today + 7*86400000), status: 'active', goal: 'Finalize API rate limiting, documentation, and database migration', tasks: projTasks[pApi._id], createdBy: pm._id },
      { name: 'Sprint 4 — Checkout Flow', project: pEcom._id, startDate: new Date(today - 10*86400000), endDate: new Date(today + 18*86400000), status: 'active', goal: 'Complete payment gateway, product catalog, and shopping cart', tasks: projTasks[pEcom._id], createdBy: pm._id },
      { name: 'Sprint 5 — Data Viz', project: pDash._id, startDate: new Date(today - 5*86400000), endDate: new Date(today + 23*86400000), status: 'active', goal: 'Build data pipeline and real-time chart components', tasks: projTasks[pDash._id], createdBy: pm._id },
    ]);

    const now = new Date();
    const activityData = [
      { user: dev._id, domain: 'admin@cios.com', type: 'github_commit', source: 'github', description: 'feat: add user auth middleware', score: 10 },
      { user: dev._id, domain: 'admin@cios.com', type: 'github_commit', source: 'github', description: 'fix: resolve navbar overflow issue', score: 8 },
      { user: dev._id, domain: 'admin@cios.com', type: 'github_pr', source: 'github', description: 'PR: Authentication flow implementation', score: 8 },
      { user: dev._id, domain: 'admin@cios.com', type: 'clickup_update', source: 'clickup', description: 'Updated task: Implement responsive navbar', score: 6 },
      { user: pm._id, domain: 'admin@cios.com', type: 'clickup_update', source: 'clickup', description: 'Created sprint planning document', score: 6 },
      { user: pm._id, domain: 'admin@cios.com', type: 'teams_message', source: 'teams', description: 'Discussion about API gateway architecture', score: 4 },
      { user: dev._id, domain: 'admin@cios.com', type: 'teams_message', source: 'teams', description: 'Code review request for auth module', score: 4 },
      { user: intern._id, domain: 'admin@cios.com', type: 'teams_message', source: 'teams', description: 'Question about push notification service', score: 3 },
      { user: admin._id, domain: 'admin@cios.com', type: 'outlook_email', source: 'outlook', description: 'Weekly project status report', score: 3 },
      { user: pm._id, domain: 'admin@cios.com', type: 'outlook_calendar', source: 'outlook', description: 'Sprint review meeting', score: 5 },
      { user: manager._id, domain: 'admin@cios.com', type: 'teams_message', source: 'teams', description: 'Team lead sync: sprint goals review', score: 5 },
      { user: designer._id, domain: 'admin@cios.com', type: 'clickup_update', source: 'clickup', description: 'Updated design system components', score: 7 },
      { user: analyst._id, domain: 'admin@cios.com', type: 'outlook_email', source: 'outlook', description: 'Market research report for Q3', score: 4 },
      { user: scrum._id, domain: 'admin@cios.com', type: 'teams_message', source: 'teams', description: 'Facilitated daily standup meeting', score: 3 },
      { user: qa._id, domain: 'admin@cios.com', type: 'github_pr', source: 'github', description: 'QA test suite for checkout flow', score: 6 },
    ];
    for (let i = 0; i < activityData.length; i++) {
      await Activity.create({ ...activityData[i], createdAt: new Date(now - i * 3600000) });
    }

    const TestCase = require('./models/TestCase');
    const sprintDocs = await Sprint.find({ project: { $in: projects.map(p => p._id) } });
    const completedSprints = sprintDocs.filter(s => s.status === 'completed');
    const testCaseData = [];
    for (const sprint of completedSprints) {
      const sprintTasks = tasks.filter(t => sprint.tasks.some(st => st.toString() === t._id.toString()));
      for (const task of sprintTasks) {
        testCaseData.push({
          title: `[Auto] ${task.title} — validation`,
          project: sprint.project,
          sprint: sprint._id,
          assignee: qa._id,
          linkedTask: task._id,
          createdBy: pm._id,
          status: 'passed',
          type: 'integration',
          priority: 'high',
          autoGenerated: true,
          feature: task.title,
          steps: [
            { order: 1, description: `Navigate to the ${task.title} feature`, expectedResult: 'Page loads successfully', status: 'pass' },
            { order: 2, description: 'Execute the core functionality', expectedResult: 'Operation completes without errors', status: 'pass' },
            { order: 3, description: 'Verify output matches expected results', expectedResult: 'All assertions pass', status: 'pass' },
          ],
        });
      }
    }
    // Additional manual test cases for rich demo data
    testCaseData.push(
      { title: 'Login form validation', project: pMobile._id, assignee: qa._id, createdBy: pm._id, status: 'passed', type: 'manual', priority: 'critical', feature: 'Authentication', steps: [{ order: 1, description: 'Open login page', expectedResult: 'Login form is displayed', status: 'pass' }, { order: 2, description: 'Enter invalid email format', expectedResult: 'Validation error shown', status: 'pass' }] },
      { title: 'Checkout total calculation', project: pEcom._id, assignee: qa._id, createdBy: pm._id, status: 'failed', type: 'manual', priority: 'urgent', feature: 'Checkout', steps: [{ order: 1, description: 'Add items to cart', expectedResult: 'Items appear in cart', status: 'pass' }, { order: 2, description: 'Verify total with tax', expectedResult: 'Total matches expected (bug #142)', status: 'fail', actualResult: 'Total is off by $0.01' }] },
      { title: 'Dashboard chart rendering', project: pDash._id, assignee: qa._id, createdBy: pm._id, status: 'in_progress', type: 'e2e', priority: 'high', feature: 'Dashboard', steps: [{ order: 1, description: 'Load dashboard page', expectedResult: 'Charts render within 2s', status: 'pass' }, { order: 2, description: 'Verify real-time updates', expectedResult: 'Data refreshes every 30s', status: 'pending' }] },
      { title: 'Responsive navbar breakpoints', project: pWeb._id, assignee: qa._id, createdBy: pm._id, status: 'ready', type: 'manual', priority: 'medium', feature: 'Navigation', steps: [{ order: 1, description: 'Resize to mobile viewport', expectedResult: 'Nav collapses to hamburger menu', status: 'pending' }, { order: 2, description: 'Test all nav links', expectedResult: 'Each link navigates correctly', status: 'pending' }] },
    );
    await TestCase.create(testCaseData);

    await Resource.create([
      { project: pWeb._id, title: 'Frontend Repository', category:'dev', type:'github', url:'https://github.com/company/website-redesign', description:'Main frontend repo', addedBy: pm._id },
      { project: pWeb._id, title: 'Figma Design System', category:'design', type:'figma', url:'https://figma.com/file/company/website-redesign', description:'Design system with components', addedBy: pm._id },
      { project: pWeb._id, title: 'Technical Specs', category:'documentation', type:'pdf', description:'Technical specification document', addedBy: dev._id },
      { project: pMobile._id, title: 'Mobile App Repo', category:'dev', type:'github', url:'https://github.com/company/mobile-app-v2', description:'React Native mobile app', addedBy: pm._id },
      { project: pMobile._id, title: 'Notion Project Board', category:'external', type:'notion', url:'https://notion.so/company/mobile-app-v2', description:'Project management board', addedBy: pm._id },
      { project: pApi._id, title: 'API Gateway Repo', category:'dev', type:'gitlab', url:'https://gitlab.com/company/api-gateway', description:'Microservices API gateway', addedBy: pm._id },
      { project: pApi._id, title: 'API Documentation', category:'documentation', type:'link', url:'https://docs.company.com/api', description:'Swagger/OpenAPI documentation', addedBy: dev._id },
      { project: pEcom._id, title: 'E-commerce Repo', category:'dev', type:'github', url:'https://github.com/company/ecommerce-platform', description:'Full-stack e-commerce monorepo', addedBy: pm._id },
      { project: pEcom._id, title: 'Stripe Dashboard', category:'external', type:'link', url:'https://dashboard.stripe.com', description:'Payment processing dashboard', addedBy: pm._id },
      { project: pEcom._id, title: 'ERD Diagram', category:'documentation', type:'pdf', description:'Database entity-relationship diagram', addedBy: dev._id },
      { project: pDash._id, title: 'Dashboard Repo', category:'dev', type:'github', url:'https://github.com/company/analytics-dashboard', description:'Real-time analytics frontend', addedBy: pm._id },
      { project: pDash._id, title: 'Figma Mockups', category:'design', type:'figma', url:'https://figma.com/file/company/analytics-dashboard', description:'Dashboard UI mockups', addedBy: dev._id },
    ]);

    await Integration.create([
      { name: 'github', isConnected: false, config: { repos: [] } },
      { name: 'clickup', isConnected: false, config: { lists: [] } },
      { name: 'microsoft_graph', isConnected: false, config: {} },
    ]);

    res.json({ message: 'Full demo data seeded! Login with any account (password: password123). Accounts: admin@cios.com, pm@cios.com, dev@cios.com, qa@cios.com, intern@cios.com, manager@cios.com, designer@cios.com, analyst@cios.com, scrum@cios.com, test@demo.com' });
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

const { runAutoDelete } = require('./controllers/interestController');
cron.schedule('0 3 * * *', () => { runAutoDelete().catch(console.error); });

console.log('CIOS backend starting...');

const PORT = env.PORT;
connectDB().then(async () => {
  try {
    const db = require('mongoose').connection.db;
    const indexes = await db.collection('testcases').indexes();
    for (const idx of indexes) {
      if (idx.unique && idx.key?.testCaseId) {
        if (Object.keys(idx.key).length === 1) {
          await db.collection('testcases').dropIndex(idx.name);
          console.log(`Dropped global unique index ${idx.name} on testCaseId`);
        }
      }
    }
  } catch (e) {
    if (e.code !== 27) console.warn('Index cleanup:', e.message);
  }
  server.listen(PORT, () => { console.log(`CIOS backend running on port ${PORT}`); });
});

module.exports = { app, server, io };
