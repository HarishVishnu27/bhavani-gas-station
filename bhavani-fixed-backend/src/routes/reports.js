const express = require('express');
const CylinderType = require('../models/CylinderType');
const DailyLine = require('../models/DailyLine');
const User = require('../models/User');
const LoadReceived = require('../models/LoadReceived');
const EmptiesToLorry = require('../models/EmptiesToLorry');
const SurrenderEntry = require('../models/SurrenderEntry');
const StockRequest = require('../models/StockRequest');
const { requireAuth, requireRole } = require('../middleware/auth');
const { todayBusinessDate } = require('../utils/stockHelpers');
const { openingStockOn, closingStockOn } = require('../utils/reportHelpers');

const router = express.Router();

// GET /api/reports/overall-delivery?date=YYYY-MM-DD
// Auto-aggregated across every delivery guy + the van, per cylinder type.
router.get('/overall-delivery', requireAuth, async (req, res) => {
  const date = req.query.date || todayBusinessDate();
  const lines = await DailyLine.find({ businessDate: date }).populate('cylinderType');

  const byType = {};
  for (const l of lines) {
    const key = l.cylinderType._id.toString();
    if (!byType[key]) {
      byType[key] = {
        cylinderType: l.cylinderType,
        delivered: 0, nc: 0, returned: 0, emptyCollected: 0, defectCollected: 0,
      };
    }
    byType[key].delivered += l.delivered;
    byType[key].nc += l.nc;
    byType[key].returned += l.returned;
    byType[key].emptyCollected += l.emptyCollected;
    byType[key].defectCollected += l.defectCollected;
  }
  res.json({ businessDate: date, rows: Object.values(byType) });
});

// GET /api/reports/consolidated?date=YYYY-MM-DD
// The master daily summary per cylinder type (Godown) — formulas match the
// Excel 'Consolidated Report ' sheet exactly. See utils/reportHelpers.js for
// the full derivation, including why there is only ONE "return" concept here
// (Empties to Lorry), not two — the Excel has no separate "Godown Returns" row.
router.get('/consolidated', requireAuth, async (req, res) => {
  const date = req.query.date || todayBusinessDate();
  const types = await CylinderType.find().sort({ sortOrder: 1 });

  const [loads, lorries, surrenders, lines] = await Promise.all([
    LoadReceived.find({ businessDate: date }),
    EmptiesToLorry.find({ businessDate: date }),
    SurrenderEntry.find({ businessDate: date }),
    DailyLine.find({ businessDate: date }),
  ]);

  const sumBy = (arr, field) => {
    const out = {};
    arr.forEach((x) => { const key = x.cylinderType.toString(); out[key] = (out[key] || 0) + x[field]; });
    return out;
  };

  const loadMap = sumBy(loads, 'filled');
  const lorryEmptyMap = sumBy(lorries, 'empty');
  const lorryDefectMap = sumBy(lorries, 'defect');
  const surrenderMap = sumBy(surrenders, 'qty');

  // "Delivery" = filled cylinders that left the system to customers = delivered + nc
  // (Overall Delivery Report!$C$25 = SUM(Delivered,NC) across every guy + Van)
  // "emptyCollectedMap"/"defectCollectedMap" = the LIVE running totals collected by
  // delivery guys in the field, straight from DailyLine — this is the Excel's
  // "Emty Received" row (Overall Delivery Report!G24/H24), not a separately
  // confirmed godown return.
  const deliveryMap = {};
  const emptyCollectedMap = {};
  const defectCollectedMap = {};
  lines.forEach((l) => {
    const key = l.cylinderType.toString();
    deliveryMap[key] = (deliveryMap[key] || 0) + l.delivered + l.nc;
    emptyCollectedMap[key] = (emptyCollectedMap[key] || 0) + l.emptyCollected;
    defectCollectedMap[key] = (defectCollectedMap[key] || 0) + l.defectCollected;
  });

  const rows = await Promise.all(types.map(async (t) => {
    const key = t._id.toString();
    const [opening, closing] = await Promise.all([openingStockOn(t._id, date), closingStockOn(t._id, date)]);
    return {
      cylinderType: t,
      openingStock: opening,
      loadReceived: loadMap[key] || 0,
      totalStock: opening.filled + (loadMap[key] || 0),
      delivery: deliveryMap[key] || 0,
      surrenderEntry: surrenderMap[key] || 0,
      // "Empties (Field, Live)" — Excel's "Emty Received" row
      emptyCollectedInField: emptyCollectedMap[key] || 0,
      defectCollectedInField: defectCollectedMap[key] || 0,
      // "Empties to Lorry" — Excel's "Emty Return" sheet (dispatch out, reduces stock)
      emptiesGivenToLorry: { empty: lorryEmptyMap[key] || 0, defect: lorryDefectMap[key] || 0 },
      closingStock: closing,
    };
  }));

  res.json({ businessDate: date, rows });
});

// GET /api/reports/van-distribution?date=YYYY-MM-DD
// How much the Van gave to each named delivery guy that day.
router.get('/van-distribution', requireAuth, async (req, res) => {
  const date = req.query.date || todayBusinessDate();
  const requests = await StockRequest.find({
    businessDate: date, type: 'ISSUE', 'from.kind': 'VAN', status: 'ACCEPTED',
  }).populate('cylinderType to.user');

  const rows = requests.map((r) => ({
    deliveryGuy: r.to.user,
    cylinderType: r.cylinderType,
    filled: r.filled,
    acceptedAt: r.acceptedAt,
  }));
  res.json({ businessDate: date, rows });
});

// GET /api/reports/reconciliation?date=YYYY-MM-DD
// Flags, per delivery guy/van, any gap between Delivered and (Empty+Defect
// collected) for that cylinder type/day - Returns and NC are excluded by
// design since they're tracked as separate fields.
router.get('/reconciliation', requireAuth, requireRole('owner', 'supervisor'), async (req, res) => {
  const date = req.query.date || todayBusinessDate();
  const lines = await DailyLine.find({ businessDate: date }).populate('cylinderType guy');

  const byGuyType = {};
  for (const l of lines) {
    const key = `${l.guy._id}_${l.cylinderType._id}`;
    if (!byGuyType[key]) {
      byGuyType[key] = { guy: l.guy, cylinderType: l.cylinderType, delivered: 0, emptyPlusDefect: 0 };
    }
    byGuyType[key].delivered += l.delivered;
    byGuyType[key].emptyPlusDefect += l.emptyCollected + l.defectCollected;
  }

  const rows = Object.values(byGuyType)
    .map((r) => ({ ...r, gap: r.delivered - r.emptyPlusDefect }))
    .filter((r) => r.gap !== 0);

  res.json({ businessDate: date, mismatches: rows });
});

module.exports = router;
