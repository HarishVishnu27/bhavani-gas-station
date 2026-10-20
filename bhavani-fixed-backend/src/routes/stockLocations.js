const express = require('express');
const StockLocation = require('../models/StockLocation');
const OpeningStockLog = require('../models/OpeningStockLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustLocationBalance, todayBusinessDate } = require('../utils/stockHelpers');

const router = express.Router();

// GET /api/stock-locations - current live balances for Godown and Van
router.get('/', requireAuth, async (req, res) => {
  const locations = await StockLocation.find().populate('balances.cylinderType');
  res.json(locations);
});

// POST /api/stock-locations/opening-stock  (supervisor/owner, one-time or correction)
// { locationType: 'GODOWN'|'VAN', cylinderType, filled, empty, defect }
router.post('/opening-stock', requireAuth, requireRole('owner', 'supervisor'), async (req, res) => {
  const { locationType, cylinderType, filled = 0, empty = 0, defect = 0, businessDate } = req.body;
  if (!['GODOWN', 'VAN'].includes(locationType) || !cylinderType) {
    return res.status(400).json({ error: 'locationType and cylinderType are required' });
  }
  const date = businessDate || todayBusinessDate();

  let loc = await StockLocation.findOne({ locationType });
  if (!loc) loc = await StockLocation.create({ locationType, balances: [] });

  const existing = loc.balances.find((b) => b.cylinderType.toString() === cylinderType);
  if (existing) {
    existing.filled = filled;
    existing.empty = empty;
    existing.defect = defect;
  } else {
    loc.balances.push({ cylinderType, filled, empty, defect });
  }
  await loc.save();

  // For GODOWN, this is also the baseline the Consolidated Report (Excel-style
  // ledger) walks forward from — see utils/reportHelpers.js.
  await OpeningStockLog.create({
    locationType,
    businessDate: date,
    cylinderType,
    filled,
    empty,
    defect,
    setBy: req.user.id,
  });

  res.json({ message: 'Opening stock set', location: loc });
});

module.exports = router;
