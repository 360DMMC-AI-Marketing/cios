const mongoose = require('mongoose');
const companySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
  plan: { type: String, enum: ['starter', 'team', 'enterprise'], default: 'starter' },
  outlookTenantId: { type: String, default: '' },
  outlookClientId: { type: String, default: '' },
  outlookClientSecret: { type: String, default: '' },
  logo: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
module.exports = mongoose.model('Company', companySchema);
