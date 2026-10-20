const express = require('express');
const EmptiesToLorry = require('../models/EmptiesToLorry');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustLocationBalance, todayBusinessDate } = require('../utils/stockHelpers');
const { openingStockOn, movementBetween, nextDateStr } = require('../utils/reportHelpers');

const router = express.Router();

// POST /api/empties-to-lorry  { cylinderType, empty, defect, businessDate? }
// Records what the outbound lorry takes back — this IS the Excel's "Emty Return"
// sheet (see reportHelpers.js: it's the only thing that reduces Empty/Defect
// stock in the Consolidated Report's closing-stock formula).
//
// Like the Excel's own running Empty Balance (Received - Emty - Defect - NC -
// Return), you can't send out more empties/defects than are actually on hand —
// so this checks the day's running available balance (opening + collected so far
// today + surrender so far today - what's already gone to the lorry today)
// before allowing the entry.
router.post('/', requireAuth, requireRole('owner', 'supervisor'), async (req, res) => {
  const { cylinderType, empty = 0, defect = 0, businessDate } = req.body;
  if (!cylinderType || (empty <= 0 && defect <= 0)) {
    return res.status(400).json({ error: 'cylinderType and a positive empty or defect quantity are required' });
  }
  const date = businessDate || todayBusinessDate();

  const opening = await openingStockOn(cylinderType, date);
  const soFarToday = await movementBetween(date, nextDateStr(date), cylinderType);
  const availableEmpty = opening.empty + soFarToday.emptyCollected + soFarToday.surrender - soFarToday.lorryEmpty;
  const availableDefect = opening.defect + soFarToday.defectCollected - soFarToday.lorryDefect;

  if (empty > availableEmpty) {
    return res.status(400).json({ error: `Only ${availableEmpty} empty cylinders available for this type today (asked for ${empty})` });
  }
  if (defect > availableDefect) {
    return res.status(400).json({ error: `Only ${availableDefect} defect cylinders available for this type today (asked for ${defect})` });
  }

  await adjustLocationBalance('GODOWN', cylinderType, { empty: -empty, defect: -defect });
  const entry = await EmptiesToLorry.create({
    businessDate: date,
    cylinderType,
    empty,
    defect,
    enteredBy: req.user.id,
  });

  res.status(201).json(entry);
});

router.get('/', requireAuth, async (req, res) => {
  const filter = {};
  if (req.query.date) filter.businessDate = req.query.date;
  const entries = await EmptiesToLorry.find(filter).populate('cylinderType enteredBy').sort({ createdAt: -1 });
  res.json(entries);
});

module.exports = router;
