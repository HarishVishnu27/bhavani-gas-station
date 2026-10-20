const express = require('express');
const SurrenderEntry = require('../models/SurrenderEntry');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustLocationBalance, todayBusinessDate } = require('../utils/stockHelpers');

const router = express.Router();

// POST /api/surrender-entry  { cylinderType, qty, businessDate? }
// Customer walks in directly - no delivery guy involved. Separate register from
// Empty Return even though both add to Godown empty stock.
router.post('/', requireAuth, requireRole('owner', 'supervisor'), async (req, res) => {
  const { cylinderType, qty, businessDate } = req.body;
  if (!cylinderType || !qty || qty <= 0) {
    return res.status(400).json({ error: 'cylinderType and a positive qty are required' });
  }
  const date = businessDate || todayBusinessDate();

  const entry = await SurrenderEntry.create({
    businessDate: date,
    cylinderType,
    qty,
    enteredBy: req.user.id,
  });

  await adjustLocationBalance('GODOWN', cylinderType, { empty: qty });

  res.status(201).json(entry);
});

router.get('/', requireAuth, async (req, res) => {
  const filter = {};
  if (req.query.date) filter.businessDate = req.query.date;
  const entries = await SurrenderEntry.find(filter).populate('cylinderType enteredBy').sort({ time: -1 });
  res.json(entries);
});

module.exports = router;
