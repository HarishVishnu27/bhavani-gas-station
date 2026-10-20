const express = require('express');
const LoadReceived = require('../models/LoadReceived');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustLocationBalance, todayBusinessDate } = require('../utils/stockHelpers');

const router = express.Router();

// POST /api/load-received  { cylinderType, filled, businessDate? }
router.post('/', requireAuth, requireRole('owner', 'supervisor'), async (req, res) => {
  const { cylinderType, filled, businessDate } = req.body;
  if (!cylinderType || !filled || filled <= 0) {
    return res.status(400).json({ error: 'cylinderType and a positive filled quantity are required' });
  }
  const date = businessDate || todayBusinessDate();

  const entry = await LoadReceived.create({
    businessDate: date,
    cylinderType,
    filled,
    enteredBy: req.user.id,
  });

  await adjustLocationBalance('GODOWN', cylinderType, { filled });

  res.status(201).json(entry);
});

// GET /api/load-received?date=YYYY-MM-DD
router.get('/', requireAuth, async (req, res) => {
  const filter = {};
  if (req.query.date) filter.businessDate = req.query.date;
  const entries = await LoadReceived.find(filter).populate('cylinderType enteredBy').sort({ time: -1 });
  res.json(entries);
});

module.exports = router;
