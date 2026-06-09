const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const User = require('./models/User');
const Project = require('./models/Project');
const Task = require('./models/Task');
const Sprint = require('./models/Sprint');
const Integration = require('./models/Integration');
const Activity = require('./models/Activity');
const Resource = require('./models/Resource');
const ProjectMember = require('./models/ProjectMember');
const Company = require('./models/Company');
const TeamGroup = require('./models/TeamGroup');
const { DEFAULT_GROUPS } = TeamGroup;

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cios');
    console.log('Connected to MongoDB');

    await Promise.all([
      User.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
      Sprint.deleteMany({}),
      Integration.deleteMany({}),
      Activity.deleteMany({}),
      Resource.deleteMany({}),
      ProjectMember.deleteMany({}),
      Company.deleteMany({}),
      TeamGroup.deleteMany({}),
    ]);

    await Company.create({ name: "Admin's Company", domain: 'admin@cios.com', plan: 'enterprise' });

    const admin = await User.create({ name: 'Admin User', email: 'admin@cios.com', password: 'password123', role: 'admin', domain: 'admin@cios.com' });
    const pm = await User.create({ name: 'Project Manager', email: 'pm@cios.com', password: 'password123', role: 'project_manager', domain: 'admin@cios.com' });
    const dev = await User.create({ name: 'Developer User', email: 'dev@cios.com', password: 'password123', role: 'developer', domain: 'admin@cios.com' });
    const qa = await User.create({ name: 'QA Tester', email: 'qa@cios.com', password: 'password123', role: 'qa_tester', domain: 'admin@cios.com' });
    const intern = await User.create({ name: 'Intern User', email: 'intern@cios.com', password: 'password123', role: 'intern', domain: 'admin@cios.com' });
    await User.create({ name: 'Test User', email: 'test@demo.com', password: 'password123', role: 'admin', domain: 'test@demo.com' });

    const projectWeb = await Project.create({ name: 'Website Redesign', projectType: 'software', description: 'Redesign company website with modern stack', status: 'on_track', phase: 'review', progress: 65, deadline: new Date('2025-08-01'), members: [admin._id, pm._id, dev._id, qa._id, intern._id], domain: 'admin@cios.com' });
    const projectMobile = await Project.create({ name: 'Mobile App v2', projectType: 'design', description: 'Version 2 of the mobile application', status: 'completed', phase: 'launched', progress: 100, deadline: new Date('2025-09-15'), members: [admin._id, pm._id, dev._id, qa._id, intern._id], domain: 'admin@cios.com' });
    const projectApi = await Project.create({ name: 'API Gateway', projectType: 'business', description: 'Build unified API gateway for microservices', status: 'delayed', phase: 'testing', progress: 45, deadline: new Date('2025-06-01'), members: [admin._id, pm._id, dev._id, qa._id, intern._id], domain: 'admin@cios.com' });
    const projectEcom = await Project.create({ name: 'E-commerce Platform', projectType: 'content', description: 'Full-stack e-commerce platform with payment integration', status: 'ready_to_test', phase: 'testing', progress: 82, deadline: new Date('2025-07-15'), members: [admin._id, pm._id, dev._id, qa._id, intern._id], domain: 'admin@cios.com' });
    const projectDashboard = await Project.create({ name: 'Analytics Dashboard', projectType: 'research', description: 'Real-time analytics dashboard with charts and reporting', status: 'on_track', phase: 'development', progress: 55, deadline: new Date('2025-09-01'), members: [admin._id, pm._id, dev._id, qa._id, intern._id], domain: 'admin@cios.com' });

    // Create default team groups for each project
    const allProjects = [projectWeb, projectMobile, projectApi, projectEcom, projectDashboard];
    const groupMap = {}; // projectId -> { groupName -> groupDoc }
    for (const proj of allProjects) {
      const pid = String(proj._id);
      groupMap[pid] = {};
      for (const def of DEFAULT_GROUPS) {
        const g = await TeamGroup.create({
          project: proj._id,
          domain: proj.domain,
          name: def.name,
          icon: def.icon,
          roles: def.roles,
          isDefault: true,
          order: def.order,
        });
        groupMap[pid][def.name] = g;
      }
    }

    const roleToGroup = (role) => {
      if (['admin', 'company_owner'].includes(role)) return 'Administration Team';
      if (['project_manager', 'team_leader', 'scrum_master'].includes(role)) return 'Project Management Team';
      if (['developer', 'frontend_developer', 'backend_developer', 'full_stack_developer', 'mobile_developer', 'devops_engineer'].includes(role)) return 'Development Team';
      if (['qa_tester', 'automation_tester', 'qa_lead'].includes(role)) return 'QA & Testing Team';
      if (['designer', 'ui_designer', 'ux_designer', 'product_designer'].includes(role)) return 'Design Team';
      if (['business_analyst', 'product_owner', 'business_developer'].includes(role)) return 'Business Team';
      if (['intern', 'development_intern', 'qa_intern', 'design_intern', 'business_intern'].includes(role)) return 'Interns';
      return 'Development Team';
    };

    await User.findByIdAndUpdate(admin._id, { $push: { assignedProjects: { $each: allProjects.map(p => p._id) } } });
    const allProjectIds = allProjects.map(p => p._id);
    await User.findByIdAndUpdate(pm._id, { $push: { assignedProjects: { $each: allProjectIds } } });
    await User.findByIdAndUpdate(dev._id, { $push: { assignedProjects: { $each: allProjectIds } } });
    await User.findByIdAndUpdate(qa._id, { $push: { assignedProjects: { $each: allProjectIds } } });
    await User.findByIdAndUpdate(intern._id, { $push: { assignedProjects: { $each: allProjectIds } } });

    const tasks = await Task.create([
      { title: 'Design homepage mockup', status: 'done', priority: 'high', project: projectWeb._id, assignee: dev._id, deadline: new Date('2025-06-15'), estimatedHours: 20, loggedHours: 18 },
      { title: 'Implement responsive navbar', status: 'in_progress', priority: 'medium', project: projectWeb._id, assignee: dev._id, deadline: new Date('2025-07-01'), estimatedHours: 15, loggedHours: 8 },
      { title: 'Set up CI/CD pipeline', status: 'todo', priority: 'high', project: projectWeb._id, assignee: dev._id, deadline: new Date('2025-07-15'), estimatedHours: 10 },
      { title: 'User authentication flow', status: 'in_progress', priority: 'urgent', project: projectMobile._id, assignee: dev._id, deadline: new Date('2025-07-01'), estimatedHours: 30, loggedHours: 12 },
      { title: 'Push notification service', status: 'todo', priority: 'medium', project: projectMobile._id, assignee: intern._id, deadline: new Date('2025-08-01'), estimatedHours: 15 },
      { title: 'API rate limiting', status: 'done', priority: 'high', project: projectApi._id, assignee: dev._id, deadline: new Date('2025-05-15'), estimatedHours: 12, loggedHours: 14 },
      { title: 'Documentation', status: 'in_progress', priority: 'low', project: projectApi._id, assignee: pm._id, deadline: new Date('2025-06-10'), estimatedHours: 8, loggedHours: 4 },
      { title: 'Database migration script', status: 'delayed', priority: 'urgent', project: projectApi._id, assignee: dev._id, deadline: new Date('2025-05-20'), estimatedHours: 25, loggedHours: 20 },
      { title: 'Payment gateway integration', status: 'done', priority: 'high', project: projectEcom._id, assignee: dev._id, deadline: new Date('2025-06-01'), estimatedHours: 40, loggedHours: 38 },
      { title: 'Product catalog API', status: 'done', priority: 'high', project: projectEcom._id, assignee: dev._id, deadline: new Date('2025-06-15'), estimatedHours: 30, loggedHours: 28 },
      { title: 'Shopping cart UI', status: 'in_progress', priority: 'medium', project: projectEcom._id, assignee: dev._id, deadline: new Date('2025-07-01'), estimatedHours: 20, loggedHours: 10 },
      { title: 'Order management system', status: 'todo', priority: 'high', project: projectEcom._id, assignee: pm._id, deadline: new Date('2025-07-10'), estimatedHours: 25 },
      { title: 'QA test suite for checkout', status: 'in_progress', priority: 'medium', project: projectEcom._id, assignee: qa._id, deadline: new Date('2025-07-05'), estimatedHours: 15, loggedHours: 6 },
      { title: 'Dashboard data pipeline', status: 'done', priority: 'high', project: projectDashboard._id, assignee: dev._id, deadline: new Date('2025-06-20'), estimatedHours: 20, loggedHours: 18 },
      { title: 'Real-time chart components', status: 'in_progress', priority: 'medium', project: projectDashboard._id, assignee: dev._id, deadline: new Date('2025-07-15'), estimatedHours: 25, loggedHours: 12 },
      { title: 'Report export feature', status: 'todo', priority: 'low', project: projectDashboard._id, assignee: dev._id, deadline: new Date('2025-08-01'), estimatedHours: 12 },
      { title: 'User permission system', status: 'in_progress', priority: 'high', project: projectDashboard._id, assignee: pm._id, deadline: new Date('2025-07-20'), estimatedHours: 18, loggedHours: 8 },
    ]);

    await Project.findByIdAndUpdate(projectWeb._id, { $push: { tasks: { $each: tasks.slice(0, 3).map((t) => t._id) } } });
    await Project.findByIdAndUpdate(projectMobile._id, { $push: { tasks: { $each: tasks.slice(3, 5).map((t) => t._id) } } });
    await Project.findByIdAndUpdate(projectApi._id, { $push: { tasks: { $each: tasks.slice(5, 8).map((t) => t._id) } } });
    await Project.findByIdAndUpdate(projectEcom._id, { $push: { tasks: { $each: tasks.slice(8, 13).map((t) => t._id) } } });
    await Project.findByIdAndUpdate(projectDashboard._id, { $push: { tasks: { $each: tasks.slice(13).map((t) => t._id) } } });

    const today = new Date();
    const webTasks = tasks.slice(0, 3).map(t => t._id);
    const mobileTasks = tasks.slice(3, 5).map(t => t._id);
    const apiTasks = tasks.slice(5, 8).map(t => t._id);
    const ecomTasks = tasks.slice(8, 13).map(t => t._id);
    const dashTasks = tasks.slice(13).map(t => t._id);

    await Sprint.create([
      { name: 'Sprint 1 — Homepage', project: projectWeb._id, startDate: new Date(today - 14*86400000), endDate: new Date(today + 14*86400000), status: 'active', goal: 'Complete homepage redesign with responsive navbar and CI/CD pipeline', tasks: webTasks, createdBy: pm._id },
      { name: 'Sprint 2 — Auth & Notifications', project: projectMobile._id, startDate: new Date(today - 7*86400000), endDate: new Date(today + 21*86400000), status: 'active', goal: 'Implement user authentication flow and push notification service', tasks: mobileTasks, createdBy: pm._id },
      { name: 'Sprint 3 — API Core', project: projectApi._id, startDate: new Date(today - 21*86400000), endDate: new Date(today + 7*86400000), status: 'active', goal: 'Finalize API rate limiting, documentation, and database migration script', tasks: apiTasks, createdBy: pm._id },
      { name: 'Sprint 4 — Checkout Flow', project: projectEcom._id, startDate: new Date(today - 10*86400000), endDate: new Date(today + 18*86400000), status: 'active', goal: 'Complete payment gateway, product catalog, and shopping cart', tasks: ecomTasks.slice(0, 3), createdBy: pm._id },
      { name: 'Sprint 5 — Data Viz', project: projectDashboard._id, startDate: new Date(today - 5*86400000), endDate: new Date(today + 23*86400000), status: 'active', goal: 'Build data pipeline and real-time chart components', tasks: dashTasks, createdBy: pm._id },
    ]);

    const now = new Date();
    const userDomainMap = {};
    for (const u of [admin, pm, dev, qa, intern]) {
      userDomainMap[u._id.toString()] = u.domain;
    }
    const activityData = [
      { user: dev._id, domain: userDomainMap[dev._id.toString()], type: 'github_commit', source: 'github', description: 'feat: add user auth middleware', score: 10 },
      { user: dev._id, domain: userDomainMap[dev._id.toString()], type: 'github_commit', source: 'github', description: 'fix: resolve navbar overflow issue', score: 8 },
      { user: dev._id, domain: userDomainMap[dev._id.toString()], type: 'github_pr', source: 'github', description: 'PR: Authentication flow implementation', score: 8 },
      { user: dev._id, domain: userDomainMap[dev._id.toString()], type: 'clickup_update', source: 'clickup', description: 'Updated task: Implement responsive navbar', score: 6 },
      { user: pm._id, domain: userDomainMap[pm._id.toString()], type: 'clickup_update', source: 'clickup', description: 'Created sprint planning document', score: 6 },
      { user: pm._id, domain: userDomainMap[pm._id.toString()], type: 'teams_message', source: 'teams', description: 'Discussion about API gateway architecture', score: 4 },
      { user: dev._id, domain: userDomainMap[dev._id.toString()], type: 'teams_message', source: 'teams', description: 'Code review request for auth module', score: 4 },
      { user: intern._id, domain: userDomainMap[intern._id.toString()], type: 'teams_message', source: 'teams', description: 'Question about push notification service', score: 3 },
      { user: admin._id, domain: userDomainMap[admin._id.toString()], type: 'outlook_email', source: 'outlook', description: 'Weekly project status report', score: 3 },
      { user: pm._id, domain: userDomainMap[pm._id.toString()], type: 'outlook_calendar', source: 'outlook', description: 'Sprint review meeting', score: 5 },
    ];

    for (let i = 0; i < activityData.length; i++) {
      const a = activityData[i];
      a.createdAt = new Date(now - i * 3600000);
      await Activity.create(a);
    }

    await Resource.create([
      { project: projectWeb._id, title: 'Frontend Repository', category:'dev', type:'github', url:'https://github.com/company/website-redesign', description:'Main frontend repo for the website redesign', addedBy: pm._id },
      { project: projectWeb._id, title: 'Figma Design System', category:'design', type:'figma', url:'https://figma.com/file/company/website-redesign', description:'Complete design system with components', addedBy: pm._id },
      { project: projectWeb._id, title: 'Technical Specs', category:'documentation', type:'pdf', description:'Technical specification document for the redesign', addedBy: dev._id },
      { project: projectMobile._id, title: 'Mobile App Repo', category:'dev', type:'github', url:'https://github.com/company/mobile-app-v2', description:'React Native mobile application', addedBy: pm._id },
      { project: projectMobile._id, title: 'Notion Project Board', category:'external', type:'notion', url:'https://notion.so/company/mobile-app-v2', description:'Project management and sprint planning', addedBy: pm._id },
      { project: projectApi._id, title: 'API Gateway Repo', category:'dev', type:'gitlab', url:'https://gitlab.com/company/api-gateway', description:'Microservices API gateway', addedBy: pm._id },
      { project: projectApi._id, title: 'API Documentation', category:'documentation', type:'link', url:'https://docs.company.com/api', description:'Swagger/OpenAPI documentation', addedBy: dev._id },
      { project: projectEcom._id, title: 'E-commerce Repo', category:'dev', type:'github', url:'https://github.com/company/ecommerce-platform', description:'Full-stack e-commerce monorepo', addedBy: pm._id },
      { project: projectEcom._id, title: 'Stripe Dashboard', category:'external', type:'link', url:'https://dashboard.stripe.com', description:'Payment processing dashboard', addedBy: pm._id },
      { project: projectEcom._id, title: 'ERD Diagram', category:'documentation', type:'pdf', description:'Database entity-relationship diagram', addedBy: dev._id },
      { project: projectDashboard._id, title: 'Dashboard Repo', category:'dev', type:'github', url:'https://github.com/company/analytics-dashboard', description:'Real-time analytics frontend', addedBy: pm._id },
      { project: projectDashboard._id, title: 'Figma Mockups', category:'design', type:'figma', url:'https://figma.com/file/company/analytics-dashboard', description:'Dashboard UI mockups and prototypes', addedBy: dev._id },
    ]);

    const memberEntries = [
      ['admin', 'admin'],
      ['pm', 'project_manager'],
      ['dev', 'frontend_developer'],
      ['qa', 'qa_tester'],
      ['intern', 'intern'],
    ];
    const userMap = { admin, pm, dev, qa, intern };
    const membersData = [];
    for (const proj of allProjects) {
      for (const [key, role] of memberEntries) {
        const u = userMap[key];
        const groupName = roleToGroup(role);
        const group = groupMap[String(proj._id)][groupName];
        membersData.push({
          project: proj._id,
          domain: proj.domain,
          user: u._id,
          email: u.email,
          projectRole: role,
          teamGroup: group._id,
          status: 'active',
          invitedBy: admin._id,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        });
      }
    }
    await ProjectMember.create(membersData);

    await Integration.create([
      { name: 'github', isConnected: false, config: { repos: [] } },
      { name: 'clickup', isConnected: false, config: { lists: [] } },
      { name: 'microsoft_graph', isConnected: false, config: {} },
    ]);

    console.log('Seed complete!');
    console.log('Demo accounts:');
    console.log('  admin@cios.com / password123 (Admin)');
    console.log('  pm@cios.com / password123 (PM)');
    console.log('  dev@cios.com / password123 (Developer)');
    console.log('  qa@cios.com / password123 (QA Tester)');
    console.log('  intern@cios.com / password123 (Intern)
  test@demo.com / password123 (Test User - Admin)');

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();


