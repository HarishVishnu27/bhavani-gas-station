const mongoose = require('mongoose');

// One line per (delivery guy or van) x (day) x (cylinder type) x (source batch).
// A guy can have MULTIPLE lines for the same type/day if he drew stock more than
// once (e.g. morning from Godown, afternoon top-up from Van) - this mirrors the
// Excel sheet, which shows a separate "Van" row under each guy's normal rows.
const dailyLineSchema = new mongoose.Schema(
  {
    guy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    businessDate: { type: String, required: true }, // 'YYYY-MM-DD'
    cylinderType: { type: mongoose.Schema.Types.ObjectId, ref: 'CylinderType', required: true },
    source: { type: String, enum: ['GODOWN', 'VAN'], required: true },
    sourceRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'StockRequest' },

    received: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    nc: { type: Number, default: 0 },       // new connection - no empty expected back
    returned: { type: Number, default: 0 }, // undelivered filled, handed back at day end
    emptyCollected: { type: Number, default: 0 },
    defectCollected: { type: Number, default: 0 },

    detailsStatus: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'APPROVED'],
      default: 'PENDING',
    },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    closed: { type: Boolean, default: false }, // true once end-of-day return accepted
  },
  { timestamps: true }
);

dailyLineSchema.index({ guy: 1, businessDate: 1, cylinderType: 1 });

module.exports = mongoose.model('DailyLine', dailyLineSchema);
