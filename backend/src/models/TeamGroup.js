const mongoose = require('mongoose');

const DEFAULT_GROUPS = [
  {
    name: 'Development Team',
    roles: ['frontend_developer', 'backend_developer', 'full_stack_developer', 'mobile_developer', 'devops_engineer'],
    icon: '👨‍💻',
    order: 0,
  },
  {
    name: 'QA & Testing Team',
    roles: ['qa_tester', 'automation_tester', 'qa_lead'],
    icon: '🧪',
    order: 1,
  },
  {
    name: 'Design Team',
    roles: ['ui_designer', 'ux_designer', 'product_designer'],
    icon: '🎨',
    order: 2,
  },
  {
    name: 'Project Management Team',
    roles: ['project_manager', 'team_leader', 'scrum_master'],
    icon: '📊',
    order: 3,
  },
  {
    name: 'Business Team',
    roles: ['business_analyst', 'product_owner', 'business_developer'],
    icon: '📈',
    order: 4,
  },
  {
    name: 'Administration Team',
    roles: ['admin', 'company_owner'],
    icon: '🔐',
    order: 5,
  },
  {
    name: 'Interns',
    roles: ['development_intern', 'qa_intern', 'design_intern', 'business_intern'],
    icon: '🎓',
    order: 6,
  },
];

const teamGroupSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  domain: { type: String, required: true, index: true },
  name: { type: String, required: true },
  icon: { type: String, default: '👥' },
  roles: [{ type: String }],
  isDefault: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

teamGroupSchema.index({ project: 1, order: 1 });

module.exports = mongoose.model('TeamGroup', teamGroupSchema);
module.exports.DEFAULT_GROUPS = DEFAULT_GROUPS;
