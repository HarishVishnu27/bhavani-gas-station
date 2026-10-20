const LoadReceived = require('../models/LoadReceived');
const EmptiesToLorry = require('../models/EmptiesToLorry');
const SurrenderEntry = require('../models/SurrenderEntry');
const DailyLine = require('../models/DailyLine');
const OpeningStockLog = require('../models/OpeningStockLog');

function nextDateStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// A floor date older than any real businessDate, used when a cylinder type has
// never had an Opening Stock baseline set (so "all history" counts as movement).
const EPOCH = '0000-01-01';

/**
 * This whole file implements the Consolidated Report exactly as the Excel does it
 * (see 'Consolidated Report ' sheet + the Template/Van/Overall Delivery Report
 * sheets it pulls from):
 *
 *   Closing Filled = Opening Filled + Load Received - (Delivered + NC)
 *     (Consolidated!B11 = SUM(B6-B7), where B7 "Delivery" = Overall Delivery
 *      Report!$C$25 = SUM(Delivered,NC) across every guy + Van)
 *
 *   Closing Empty  = Opening Empty + Emty Received(field, live) + Surrender Entry
 *                    - Emty Return
 *   Closing Defect = Opening Defect + Defect Received(field, live) - Defect Return
 *     (Consolidated!C11 = SUM(C8+C9)-C10+C4, where C8 "Emty Received" is the LIVE
 *      running total of Emty/Defect collected across every guy's own daily report
 *      — Overall Delivery Report!G24/H24 — not a separately-confirmed "godown
 *      return"; and C10 "Emty Return" is the Emty Return sheet, which is a
 *      straight dispatch ledger that only ever SUBTRACTS from stock — i.e. what
 *      this app calls "Empties to Lorry". There is no separate "Godown Returns"
 *      concept in the Excel at all — only these two.)
 *
 * "Returned" (unsold filled handed back by a delivery guy) is deliberately NOT
 * subtracted anywhere here, same as the Excel: those cylinders never left the
 * system (only Delivered+NC did), so they don't need to be added back either.
 */

// Per cylinder type, the day's raw ledger movement:
//   loadReceived, delivery (= delivered+nc from every DailyLine that day),
//   emptyCollected / defectCollected (the "field, live" totals from DailyLine),
//   surrender, lorryEmpty, lorryDefect
async function movementBetween(fromInclusive, toExclusive, cylinderTypeId) {
  const range = { $gte: fromInclusive, $lt: toExclusive };
  const typeFilter = cylinderTypeId ? { cylinderType: cylinderTypeId } : {};
  const [loads, lines, surrenders, lorries] = await Promise.all([
    LoadReceived.find({ ...typeFilter, businessDate: range }),
    DailyLine.find({ ...typeFilter, businessDate: range }),
    SurrenderEntry.find({ ...typeFilter, businessDate: range }),
    EmptiesToLorry.find({ ...typeFilter, businessDate: range }),
  ]);

  const m = { loadReceived: 0, delivery: 0, emptyCollected: 0, defectCollected: 0, surrender: 0, lorryEmpty: 0, lorryDefect: 0 };
  loads.forEach((l) => { m.loadReceived += l.filled; });
  lines.forEach((l) => { m.delivery += l.delivered + l.nc; m.emptyCollected += l.emptyCollected; m.defectCollected += l.defectCollected; });
  surrenders.forEach((s) => { m.surrender += s.qty; });
  lorries.forEach((l) => { m.lorryEmpty += l.empty; m.lorryDefect += l.defect; });
  return m;
}

function applyMovement(stock, m) {
  return {
    filled: stock.filled + m.loadReceived - m.delivery,
    empty: stock.empty + m.emptyCollected + m.surrender - m.lorryEmpty,
    defect: stock.defect + m.defectCollected - m.lorryDefect,
  };
}

// The most recent manually-set Opening Stock baseline for GODOWN, for a given
// cylinder type, at or before `date`. Falls back to zero/EPOCH if none was ever set.
async function baselineFor(cylinderTypeId, date) {
  const log = await OpeningStockLog.findOne({
    locationType: 'GODOWN', cylinderType: cylinderTypeId, businessDate: { $lte: date },
  }).sort({ businessDate: -1, createdAt: -1 });
  if (!log) return { filled: 0, empty: 0, defect: 0, businessDate: EPOCH };
  return { filled: log.filled, empty: log.empty, defect: log.defect, businessDate: log.businessDate };
}

// Opening stock for `date` = baseline + every day's movement strictly before `date`.
async function openingStockOn(cylinderTypeId, date) {
  const baseline = await baselineFor(cylinderTypeId, date);
  if (baseline.businessDate >= date) return { filled: baseline.filled, empty: baseline.empty, defect: baseline.defect };
  const m = await movementBetween(baseline.businessDate, date, cylinderTypeId);
  return applyMovement(baseline, m);
}

// Closing stock for `date` = opening stock for `date` + that day's own movement.
async function closingStockOn(cylinderTypeId, date) {
  const opening = await openingStockOn(cylinderTypeId, date);
  const m = await movementBetween(date, nextDateStr(date), cylinderTypeId);
  return applyMovement(opening, m);
}

module.exports = { nextDateStr, movementBetween, applyMovement, openingStockOn, closingStockOn };
