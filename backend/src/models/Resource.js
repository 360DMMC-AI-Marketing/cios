const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['dev', 'design', 'documentation', 'external', 'file'],
    default: 'external',
  },
  subcategory: { type: String, default: '' },
  type: {
    type: String,
    enum: ['link', 'document', 'figma', 'github', 'gitlab', 'notion', 'jira', 'trello', 'confluence', 'sharepoint', 'pdf', 'docx', 'xlsx', 'pptx', 'txt', 'image', 'video', 'other'],
    default: 'link',
  },
  url: { type: String, default: '' },
  description: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  fileType: { type: String, default: '' },
  fileName: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Resource', resourceSchema);
