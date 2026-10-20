const express = require('express');
const DailyLine = require('../models/DailyLine');
const { requireAuth, requireRole } = require('../middleware/auth');
const { todayBusinessDate } = require('../utils/stockHelpers');

const router = express.Router();

// GET /api/daily-lines?guy=<id>&date=YYYY-MM-DD
// Delivery guys/van see their own lines; owner/supervisor can pass ?guy= to
// look at anyone's. Returns the line items (one per source batch) PLUS a
// computed "Total" row per cylinder type, matching the Excel layout.
router.get('/', requireAuth, async (req, res) => {
  const date = req.query.date || todayBusinessDate();
  let guyId = req.query.guy;

  if (['delivery', 'van'].includes(req.user.role)) {
    guyId = req.user.id; // can only ever see their own
  } else if (!guyId) {
    return res.status(400).json({ error: 'guy query param is required for owner/supervisor' });
  }

  const lines = await DailyLine.find({ guy: guyId, businessDate: date }).populate('cylinderType');

  // group into { [cylinderTypeId]: { lines: [...], total: {...} } }
  const grouped = {};
  for (const line of lines) {
    const key = line.cylinderType._id.toString();
    if (!grouped[key]) {
      grouped[key] = { cylinderType: line.cylinderType, lines: [], total: emptyTotals() };
    }
    grouped[key].lines.push(line);
    addInto(grouped[key].total, line);
  }
  for (const key of Object.keys(grouped)) {
    const t = grouped[key].total;
    t.filledBalance = t.received - t.delivered - t.nc - t.returned;
    // Matches the Excel Template sheet: Emty Balance = Received - (Emty+Defect) - NC - Return
    // (I5 = B5-(G5+H5)-D5-E5). This is why Filled Balance and Emty Balance should match at
    // end of day: both subtract NC and Return from Received, differing only in whether the
    // third term is "Delivered" or "Emty+Defect" collected — which should be equal once every
    // delivered cylinder has come back as either an empty or a defect.
    t.emptyBalance = t.received - (t.emptyCollected + t.defectCollected) - t.nc - t.returned;
  }

  res.json(Object.values(grouped));
});

function emptyTotals() {
  return { received: 0, delivered: 0, nc: 0, returned: 0, emptyCollected: 0, defectCollected: 0 };
}
function addInto(total, line) {
  total.received += line.received;
  total.delivered += line.delivered;
  total.nc += line.nc;
  total.returned += line.returned;
  total.emptyCollected += line.emptyCollected;
  total.defectCollected += line.defectCollected;
}

// PATCH /api/daily-lines/:id   { delivered?, nc?, returned?, emptyCollected?, defectCollected? }
// A delivery guy/van updates their own running numbers through the day.
// "returned" (unsold filled handed back) is normally also set automatically
// when their end-of-day RETURN request is accepted (and that locks the line
// via `closed`), but it's editable here too so a guy can correct/enter it
// directly rather than only through the accept workflow.
router.patch('/:id', requireAuth, requireRole('delivery', 'van'), async (req, res) => {
  const line = await DailyLine.findById(req.params.id);
  if (!line) return res.status(404).json({ error: 'Line not found' });
  if (line.guy.toString() !== req.user.id) return res.status(403).json({ error: 'Not your line' });
  if (line.closed) return res.status(400).json({ error: 'This line is already closed out for the day' });

  const { delivered, nc, returned, emptyCollected, defectCollected } = req.body;
  if (delivered !== undefined) line.delivered = delivered;
  if (nc !== undefined) line.nc = nc;
  if (returned !== undefined) line.returned = returned;
  if (emptyCollected !== undefined) line.emptyCollected = emptyCollected;
  if (defectCollected !== undefined) line.defectCollected = defectCollected;

  if (line.delivered + line.nc + line.returned > line.received) {
    return res.status(400).json({ error: 'Delivered + NC + Returned cannot exceed Received for this line' });
  }

  await line.save();
  res.json(line);
});

module.exports = router;
