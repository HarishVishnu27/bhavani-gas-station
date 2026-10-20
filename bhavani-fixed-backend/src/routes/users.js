const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - list all users. Owner/supervisor see everyone (for admin
// screens); the van also needs this to pick which delivery guy to issue
// stock to, so it's allowed read-only access too.
router.get('/', requireAuth, requireRole('owner', 'supervisor', 'van'), async (req, res) => {
  const users = await User.find().select('-passwordHash').sort({ role: 1, name: 1 });
  res.json(users);
});

// POST /api/users - create a new user (owner only). Defaults to the standard
// seeded password so the field team can onboard a new delivery guy any time.
router.post('/', requireAuth, requireRole('owner'), async (req, res) => {
  const { name, username, role, phone } = req.body;
  if (!name || !username || !role) {
    return res.status(400).json({ error: 'name, username and role are required' });
  }
  if (!['owner', 'supervisor', 'delivery', 'van'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const defaultPassword = process.env.DEFAULT_PASSWORD || 'pass';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const user = await User.create({
    name,
    username: username.toLowerCase().trim(),
    role,
    phone,
    passwordHash,
    mustChangePassword: true,
  });
  res.status(201).json({ id: user._id, name: user.name, username: user.username, role: user.role });
});

// POST /api/users/:id/reset-password - owner/supervisor resets someone's
// password back to the shared default (e.g. if a delivery guy forgets his).
router.post('/:id/reset-password', requireAuth, requireRole('owner', 'supervisor'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const defaultPassword = process.env.DEFAULT_PASSWORD || 'pass';
  user.passwordHash = await bcrypt.hash(defaultPassword, 10);
  user.mustChangePassword = true;
  await user.save();
  res.json({ message: `Password reset to the default ("${defaultPassword}") - user should change it on next login.` });
});

module.exports = router;
