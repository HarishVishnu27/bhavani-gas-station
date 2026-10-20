const mongoose = require('mongoose');

// One document per location (GODOWN, VAN). Holds the current on-hand balance
// per cylinder type and condition. This is the live stock ledger.
const balanceSchema = new mongoose.Schema(
  {
    cylinderType: { type: mongoose.Schema.Types.ObjectId, ref: 'CylinderType', required: true },
    filled: { type: Number, default: 0 },
    empty: { type: Number, default: 0 },
    defect: { type: Number, default: 0 },
  },
  { _id: false }
);

const stockLocationSchema = new mongoose.Schema({
  locationType: { type: String, enum: ['GODOWN', 'VAN'], required: true, unique: true },
  balances: [balanceSchema],
});

module.exports = mongoose.model('StockLocation', stockLocationSchema);
