const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = await User.findOne({ username: username.toLowerCase().trim(), active: true });
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

// POST /api/auth/change-password  { currentPassword, newPassword }
// Available to every role at any time, not just when mustChangePassword is true.
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'newPassword must be at least 4 characters' });
  }
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.mustChangePassword = false;
  await user.save();

  res.json({ message: 'Password changed successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-passwordHash');
  res.json(user);
});

module.exports = router;
