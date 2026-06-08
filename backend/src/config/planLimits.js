const Project = require('../models/Project');

const PLAN_LIMITS = {
  starter: { users: 10, projects: 3 },
  team: { users: 50, projects: Infinity },
  enterprise: { users: Infinity, projects: Infinity },
};

function getPlanLimit(plan, key) {
  const limits = PLAN_LIMITS[plan];
  if (!limits) return null;
  return limits[key];
}

async function enforceUserLimit(domain, plan) {
  const User = require('../models/User');
  const limit = getPlanLimit(plan, 'users');
  if (limit === Infinity) return { allowed: true };
  const count = await User.countDocuments({ domain });
  if (count >= limit) {
    return { allowed: false, message: `Plan limit reached: maximum ${limit} users allowed on the ${plan} plan. Upgrade to add more users.` };
  }
  return { allowed: true };
}

async function enforceProjectLimit(domain, plan) {
  const limit = getPlanLimit(plan, 'projects');
  if (limit === Infinity) return { allowed: true };
  const count = await Project.countDocuments({ domain });
  if (count >= limit) {
    return { allowed: false, message: `Plan limit reached: maximum ${limit} projects allowed on the ${plan} plan. Upgrade to create more projects.` };
  }
  return { allowed: true };
}

async function getCompanyUsage(domain) {
  const User = require('../models/User');
  const userCount = await User.countDocuments({ domain });
  const projectCount = await Project.countDocuments({ domain });
  return { userCount, projectCount };
}

async function getDomainProjectIds(domain) {
  const projects = await Project.find({ domain }).select('_id');
  return projects.map(p => String(p._id));
}

module.exports = { PLAN_LIMITS, getPlanLimit, enforceUserLimit, enforceProjectLimit, getCompanyUsage, getDomainProjectIds };
