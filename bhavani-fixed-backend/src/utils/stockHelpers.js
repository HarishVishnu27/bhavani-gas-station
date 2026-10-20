const StockLocation = require('../models/StockLocation');

function todayBusinessDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

// Adjusts a location's (GODOWN/VAN) balance for one cylinder type by the given
// deltas (can be negative). Creates the balance line if it doesn't exist yet.
// Does NOT allow a balance to go negative - throws if it would.
async function adjustLocationBalance(locationType, cylinderTypeId, { filled = 0, empty = 0, defect = 0 }) {
  const loc = await StockLocation.findOne({ locationType });
  if (!loc) throw new Error(`Stock location ${locationType} not initialized`);

  let line = loc.balances.find((b) => b.cylinderType.toString() === cylinderTypeId.toString());
  if (!line) {
    line = { cylinderType: cylinderTypeId, filled: 0, empty: 0, defect: 0 };
    loc.balances.push(line);
    line = loc.balances[loc.balances.length - 1];
  }

  const newFilled = line.filled + filled;
  const newEmpty = line.empty + empty;
  const newDefect = line.defect + defect;

  if (newFilled < 0 || newEmpty < 0 || newDefect < 0) {
    throw new Error(
      `Insufficient stock at ${locationType} for this cylinder type (filled:${line.filled}+${filled}, empty:${line.empty}+${empty}, defect:${line.defect}+${defect})`
    );
  }

  line.filled = newFilled;
  line.empty = newEmpty;
  line.defect = newDefect;

  await loc.save();
  return line;
}

module.exports = { todayBusinessDate, adjustLocationBalance };
