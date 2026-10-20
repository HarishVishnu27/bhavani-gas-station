const mongoose = require('mongoose');

// Written automatically whenever a RETURN StockRequest (empty/defect portion) is
// ACCEPTED. This is the "Empty Return" sheet from the Excel - a straight ledger,
// always separate from Surrender Entries even though both add to godown/van stock.
const emptyReturnLogSchema = new mongoose.Schema(
  {
    businessDate: { type: String, required: true },
    cylinderType: { type: mongoose.Schema.Types.ObjectId, ref: 'CylinderType', required: true },
    empty: { type: Number, default: 0 },
    defect: { type: Number, default: 0 },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the guy/van who handed it back
    receivedAt: { type: String, enum: ['GODOWN', 'VAN'], required: true },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'StockRequest' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmptyReturnLog', emptyReturnLogSchema);
