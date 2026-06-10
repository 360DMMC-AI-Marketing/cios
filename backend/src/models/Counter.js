const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  model: { type: String, required: true },
  field: { type: String, required: true },
  reference: { type: mongoose.Schema.Types.ObjectId },
  count: { type: Number, default: 0 },
});

counterSchema.index({ model: 1, field: 1, reference: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);
