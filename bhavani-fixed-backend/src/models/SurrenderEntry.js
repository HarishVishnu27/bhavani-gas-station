const mongoose = require('mongoose');

// Customer walks into the station directly and surrenders a cylinder - no
// delivery guy involved. Entered directly by the Godown Supervisor. Kept in its
// own collection, never merged with EmptyReturnLog.
const surrenderEntrySchema = new mongoose.Schema(
  {
    businessDate: { type: String, required: true },
    cylinderType: { type: mongoose.Schema.Types.ObjectId, ref: 'CylinderType', required: true },
    qty: { type: Number, required: true, min: 0 }, // adds to godown EMPTY stock
    time: { type: Date, default: Date.now },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SurrenderEntry', surrenderEntrySchema);
