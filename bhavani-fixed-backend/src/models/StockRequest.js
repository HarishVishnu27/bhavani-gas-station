const mongoose = require('mongoose');

// Covers BOTH workflows from the spec:
//   ISSUE  — Godown/Van -> Delivery Guy/Van. Raised by the GIVING side (supervisor
//            or van user), accepted by the RECEIVING side (the delivery guy/van).
//   RETURN — Delivery Guy/Van -> Godown or Van. Raised by the delivery guy/van,
//            accepted by whichever side is receiving it back (supervisor or van).
//
// Nothing posts to the StockLocation balances or the guy's DailyLine until a
// request is ACCEPTED - that's the two-way confirmation the business wants.
const partySchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['GODOWN', 'VAN', 'USER'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // set only when kind === 'USER'
  },
  { _id: false }
);

const stockRequestSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['ISSUE', 'RETURN'], required: true },
    businessDate: { type: String, required: true }, // 'YYYY-MM-DD', the operational day this belongs to
    cylinderType: { type: mongoose.Schema.Types.ObjectId, ref: 'CylinderType', required: true },
    filled: { type: Number, default: 0 },
    empty: { type: Number, default: 0 },
    defect: { type: Number, default: 0 },
    from: { type: partySchema, required: true },
    to: { type: partySchema, required: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date },
    note: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockRequest', stockRequestSchema);
