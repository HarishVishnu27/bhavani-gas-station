const mongoose = require('mongoose');

// The outbound lorry backhaul - empties/defects handed to the lorry taking the
// load back to the refill plant. Its own daily page, per the spec. Does NOT need
// to reconcile against Load Received on any given day.
const emptiesToLorrySchema = new mongoose.Schema(
  {
    businessDate: { type: String, required: true },
    cylinderType: { type: mongoose.Schema.Types.ObjectId, ref: 'CylinderType', required: true },
    empty: { type: Number, default: 0 },
    defect: { type: Number, default: 0 },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmptiesToLorry', emptiesToLorrySchema);
