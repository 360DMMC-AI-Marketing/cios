const Company = require('../models/Company');
const User = require('../models/User');
const { enforceUserLimit, getCompanyUsage } = require('../config/planLimits');

exports.getCompanies = async (req, res, next) => {
  try {
    const companies = await Company.find({ domain: req.user.domain, isActive: true }).populate('createdBy', 'name');
    const enriched = await Promise.all(companies.map(async (c) => {
      const usage = await getCompanyUsage(c.domain);
      return { ...c.toObject(), usage };
    }));
    res.json(enriched);
  } catch (e) { next(e); }
};

exports.createCompany = async (req, res, next) => {
  try {
    const existing = await Company.findOne({ domain: req.body.domain?.toLowerCase() });
    if (existing) return res.status(400).json({ message: 'Domain already registered' });
    const company = await Company.create({ ...req.body, createdBy: req.user._id, domain: req.body.domain?.toLowerCase() });
    res.status(201).json(company);
  } catch (e) { next(e); }
};

exports.updateCompany = async (req, res, next) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!company) return res.status(404).json({ message: 'Company not found' });
    res.json(company);
  } catch (e) { next(e); }
};

exports.importCompanyUsers = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const { defaultRole = 'developer' } = req.body;
    const validRoles = ['admin', 'team_lead', 'project_manager', 'manager', 'qa_tester', 'developer', 'intern', 'other'];
    const role = validRoles.includes(defaultRole) ? defaultRole : 'developer';
    const microsoftGraphService = require('../services/microsoftGraphService');
    const crypto = require('crypto');
    const env = require('../config/env');
    const client = await microsoftGraphService.getClient();
    if (!client) return res.status(503).json({ message: 'Microsoft Graph not connected' });
    const { data } = await client.get('/users', {
      params: { $filter: `endswith(mail,'@${company.domain}')`, $select: 'displayName,mail,id', $top: 999 }
    });
    const graphUsers = data.value || [];
    const planLimit = getPlanLimit(company.plan, 'users');
    const currentActive = await User.countDocuments({ domain: company.domain, isActive: true });
    let imported = 0, skipped = 0;
    const newUsers = [];
    for (const gu of graphUsers) {
      if (!gu.mail) { skipped++; continue; }
      const existing = await User.findOne({ outlookEmail: gu.mail.toLowerCase() });
      if (existing) { skipped++; continue; }
      if (planLimit !== Infinity && (currentActive + imported) >= planLimit) {
        skipped++;
        continue;
      }
      const tempPassword = crypto.randomBytes(8).toString('hex') + 'Aa1!';
      const created = await User.create({
        name: gu.displayName || gu.mail.split('@')[0],
        email: gu.mail.toLowerCase(),
        password: tempPassword,
        role,
        outlookEmail: gu.mail.toLowerCase(),
        teamsId: gu.id || '',
        domain: company.domain,
        isActive: true,
      });
      newUsers.push({ user: created, tempPassword });
      imported++;
    }
    const adminUser = await User.findById(req.user._id);
    if (newUsers.length > 0) {
      const { sendEmail } = require('../services/emailService');
      for (const { user: u, tempPassword } of newUsers) {
        try {
          await sendEmail({
            to: u.email,
            senderEmail: adminUser?.outlookEmail || req.user.email,
            subject: 'You have been added to CIOS',
            html: `<p>Hi ${u.name},</p><p>You have been added to CIOS for <strong>${company.name}</strong>.</p><p>Login: ${env.FRONTEND_URL}<br>Email: ${u.email}<br>Temporary password: <strong>${tempPassword}</strong></p>`,
          });
        } catch (e) { console.error(`Email failed for ${u.email}:`, e.message); }
      }
    }
    res.json({ imported, skipped, total: graphUsers.length, planLimitReached: planLimit !== Infinity && (currentActive + imported) >= planLimit });
  } catch (e) { next(e); }
};

exports.updatePlan = async (req, res, next) => {
  try {
    const { plan } = req.body;
    const validPlans = ['starter', 'team', 'enterprise'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ message: `Invalid plan. Must be one of: ${validPlans.join(', ')}` });
    }
    const company = await Company.findByIdAndUpdate(req.params.id, { plan }, { new: true });
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const usage = await getCompanyUsage(company.domain);
    res.json({ ...company.toObject(), usage });
  } catch (e) { next(e); }
};

exports.getCompanyById = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id).populate('createdBy', 'name');
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const usage = await getCompanyUsage(company.domain);
    res.json({ ...company.toObject(), usage });
  } catch (e) { next(e); }
};
