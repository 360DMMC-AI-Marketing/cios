const mongoose = require('mongoose');

const projectRoleEnum = [
  'admin', 'project_manager', 'team_leader', 'developer', 'frontend_developer',
  'backend_developer', 'full_stack_developer', 'qa_tester', 'designer',
  'business_analyst', 'intern', 'viewer',
  'mobile_developer', 'devops_engineer', 'automation_tester', 'qa_lead',
  'ui_designer', 'ux_designer', 'product_designer', 'scrum_master',
  'product_owner', 'business_developer', 'company_owner',
  'development_intern', 'qa_intern', 'design_intern', 'business_intern',
];

const projectMemberSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  domain: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email: { type: String, trim: true, lowercase: true },
  projectRole: { type: String, enum: projectRoleEnum, default: 'developer' },
  teamGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamGroup' },
  status: { type: String, enum: ['pending', 'active', 'declined'], default: 'active' },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  invitedAt: { type: Date },
  acceptedAt: { type: Date },
  token: { type: String },
}, { timestamps: true });

projectMemberSchema.index({ project: 1, user: 1 }, { sparse: true });
projectMemberSchema.index({ project: 1, email: 1 }, { sparse: true });

module.exports = mongoose.model('ProjectMember', projectMemberSchema);
