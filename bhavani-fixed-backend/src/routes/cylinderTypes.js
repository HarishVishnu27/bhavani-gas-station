const express = require('express');
const CylinderType = require('../models/CylinderType');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const types = await CylinderType.find().sort({ sortOrder: 1 });
  res.json(types);
});

module.exports = router;
