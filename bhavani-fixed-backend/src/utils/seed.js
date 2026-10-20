require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../db');
const CylinderType = require('../models/CylinderType');
const User = require('../models/User');
const StockLocation = require('../models/StockLocation');

const CYLINDER_TYPES = [
  { name: '14.2 KG', code: '14_2KG', sortOrder: 1 },
  { name: '10 KG', code: '10KG', sortOrder: 2 },
  { name: '19 KG', code: '19KG', sortOrder: 3 },
  { name: '19 KG Xtra', code: '19KG_XTRA', sortOrder: 4 },
  { name: '19 KG Nanocut', code: '19KG_NANOCUT', sortOrder: 5 },
  { name: '47.5 KG', code: '47_5KG', sortOrder: 6 },
  { name: '5 KG (Domestic)', code: '5KG_DOM', sortOrder: 7 },
  { name: '5 KG FTL (Commercial)', code: '5KG_FTL', sortOrder: 8 },
  { name: '2 KG FTL (Commercial)', code: '2KG_FTL', sortOrder: 9 },
];

// username, display name, role. Matches the Excel's named delivery guys.
const USERS = [
  { username: 'owner', name: 'Owner', role: 'owner' },
  { username: 'supervisor', name: 'Ashok (Godown Supervisor)', role: 'supervisor' },
  { username: 'van', name: 'Van', role: 'van' },
  // Two sample delivery guys for now, per your request - add more any time
  // via POST /api/users once logged in as owner.
  { username: 'ravikumar', name: 'Ravikumar', role: 'delivery' },
  { username: 'pari', name: 'Pari', role: 'delivery' },
];

async function seed() {
  await connectDB();

  console.log('[seed] Cylinder types...');
  for (const t of CYLINDER_TYPES) {
    await CylinderType.findOneAndUpdate({ code: t.code }, t, { upsert: true, new: true });
  }

  console.log('[seed] Stock locations (Godown, Van)...');
  await StockLocation.findOneAndUpdate(
    { locationType: 'GODOWN' }, { locationType: 'GODOWN' }, { upsert: true }
  );
  await StockLocation.findOneAndUpdate(
    { locationType: 'VAN' }, { locationType: 'VAN' }, { upsert: true }
  );

  console.log('[seed] Users (default password = "pass" for everyone)...');
  const defaultPassword = process.env.DEFAULT_PASSWORD || 'pass';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  for (const u of USERS) {
    await User.findOneAndUpdate(
      { username: u.username },
      { ...u, passwordHash, mustChangePassword: true, active: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log('[seed] Done. Sample logins (all passwords = "pass"):');
  USERS.forEach((u) => console.log(`  - ${u.username} / pass  (${u.role})`));
  console.log('[seed] Every user can change their password after logging in via POST /api/auth/change-password.');

  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
