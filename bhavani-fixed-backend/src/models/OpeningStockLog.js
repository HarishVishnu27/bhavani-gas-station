const mongoose = require('mongoose');

// One-time (or rare, manual-correction) setup of starting balances. After the
// first day, "opening stock" for any day is simply the prior day's closing
// stock - computed, not re-entered. This log just records when/who set it.
const openingStockLogSchema = new mongoose.Schema(
  {
    locationType: { type: String, enum: ['GODOWN', 'VAN'], required: true },
    // The operational day this baseline applies to (defaults to "today" when set).
    // The Consolidated Report (GODOWN only) walks forward from the most recent
    // baseline at/before the report date, so this anchors that walk.
    businessDate: { type: String, required: true },
    cylinderType: { type: mongoose.Schema.Types.ObjectId, ref: 'CylinderType', required: true },
    filled: { type: Number, default: 0 },
    empty: { type: Number, default: 0 },
    defect: { type: Number, default: 0 },
    setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

openingStockLogSchema.index({ locationType: 1, cylinderType: 1, businessDate: 1 });

module.exports = mongoose.model('OpeningStockLog', openingStockLogSchema);
