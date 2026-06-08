const mongoose = require('mongoose');

const stepSchema = new mongoose.Schema({
  order: { type: Number, required: true },
  description: { type: String, required: true },
  expectedResult: { type: String, default: '' },
  actualResult: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'pass', 'fail', 'blocked'], default: 'pending' },
  evidence: { type: String, default: '' },
}, { _id: true });

const testCaseSchema = new mongoose.Schema({
  testCaseId: { type: String },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  feature: { type: String, default: '' },
  type: {
    type: String,
    enum: ['integration', 'unit', 'e2e', 'security', 'performance', 'manual'],
    default: 'manual',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent', 'critical'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['draft', 'ready', 'in_progress', 'passed', 'failed', 'blocked', 'skipped'],
    default: 'draft',
  },
  precondition: { type: String, default: '' },
  steps: [stepSchema],
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  sprint: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint' },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  linkedTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  linkedBug: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  executedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  executedAt: { type: Date },
  failureReason: { type: String, default: '' },
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    mimeType: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  }],
  tags: [{ type: String }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

testCaseSchema.pre('save', async function (next) {
  if (!this.testCaseId) {
    const count = await mongoose.model('TestCase').countDocuments({ project: this.project });
    this.testCaseId = `TC-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

testCaseSchema.index({ project: 1, status: 1 });
testCaseSchema.index({ testCaseId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('TestCase', testCaseSchema);