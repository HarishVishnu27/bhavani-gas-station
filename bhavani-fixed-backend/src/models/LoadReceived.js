const mongoose = require('mongoose');

const loadReceivedSchema = new mongoose.Schema(
  {
    businessDate: { type: String, required: true },
    cylinderType: { type: mongoose.Schema.Types.ObjectId, ref: 'CylinderType', required: true },
    filled: { type: Number, required: true, min: 0 },
    time: { type: Date, default: Date.now },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LoadReceived', loadReceivedSchema);
