const mongoose = require('mongoose');

const cylinderTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g. "14.2 KG"
  code: { type: String, required: true, unique: true },  // e.g. "14_2KG" - used in APIs
  sortOrder: { type: Number, default: 0 },
});

module.exports = mongoose.model('CylinderType', cylinderTypeSchema);
