const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
  name: { type: String, enum: ['github', 'clickup', 'microsoft_graph'], required: true, unique: true },
  isConnected: { type: Boolean, default: false },
  credentials: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastSync: { type: Date },
  syncInterval: { type: Number, default: 5 },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('Integration', integrationSchema);
