const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Company = require('../models/Company');
const Activity = require('../models/Activity');

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).populate('assignedProjects');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastActive = new Date();
    user.status = 'active';
    user.onboardingCompleted = true;
    await user.save();

    await Activity.create({
      user: user._id,
      domain: user.domain,
      type: 'login',
      source: 'internal',
      description: 'User logged in',
    });

    const token = generateToken(user);
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, plan } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const validPlans = ['starter', 'team', 'enterprise'];

    const bareDomain = email.split('@')[1]?.toLowerCase() || email.toLowerCase();

    const user = await User.create({
      name, email, password, domain: bareDomain,
      role: 'admin', onboardingCompleted: true,
    });

    const company = await Company.create({
      name: name + "'s Company",
      domain: bareDomain,
      plan: validPlans.includes(plan) ? plan : 'starter',
      createdBy: user._id,
    });

    const token = generateToken(user);
    res.status(201).json({ token, user });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('assignedProjects')
    .populate({ path: 'assignedProjects', populate: { path: 'tasks' } });
  res.json(user);
};

exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'githubUsername', 'clickupId', 'teamsId', 'outlookEmail', 'figmaUsername', 'lovableUsername', 'onboardingCompleted'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (req.file) {
      updates.avatar = `/uploads/${req.file.filename}`;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.microsoftConfig = (req, res) => {
  res.json({
    clientId: env.MICROSOFT_CLIENT_ID,
    tenantId: env.MICROSOFT_TENANT_ID,
    redirectUri: env.FRONTEND_URL,
  });
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
};
