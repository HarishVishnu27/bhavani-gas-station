const express = require('express');
const mongoose = require('mongoose');
const StockRequest = require('../models/StockRequest');
const DailyLine = require('../models/DailyLine');
const EmptyReturnLog = require('../models/EmptyReturnLog');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adjustLocationBalance, todayBusinessDate } = require('../utils/stockHelpers');

const router = express.Router();

// POST /api/stock-requests  - raise an ISSUE or a RETURN request
router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, cylinderType, filled = 0, empty = 0, defect = 0, businessDate, note } = req.body;
    const date = businessDate || todayBusinessDate();

    if (!['ISSUE', 'RETURN'].includes(type)) return res.status(400).json({ error: 'type must be ISSUE or RETURN' });
    if (!cylinderType) return res.status(400).json({ error: 'cylinderType is required' });

    if (type === 'ISSUE') {
      if (!['owner', 'supervisor', 'van'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only the godown supervisor or the van can issue stock' });
      }
      if (filled <= 0) return res.status(400).json({ error: 'filled must be greater than 0 for an ISSUE' });

      const from = { kind: req.user.role === 'van' ? 'VAN' : 'GODOWN' };
      const { to } = req.body;
      if (!to || !['VAN', 'USER'].includes(to.kind)) {
        return res.status(400).json({ error: "to.kind must be 'VAN' or 'USER'" });
      }
      if (to.kind === 'USER' && !to.user) return res.status(400).json({ error: 'to.user is required when to.kind is USER' });
      if (to.kind === 'VAN' && from.kind === 'VAN') {
        return res.status(400).json({ error: 'Van cannot issue to itself' });
      }

      const doc = await StockRequest.create({
        type, businessDate: date, cylinderType, filled, from, to,
        raisedBy: req.user.id, note,
      });
      return res.status(201).json(doc);
    }

    // type === 'RETURN'
    // FIX: van can also raise returns, and delivery guys return to godown or van
    if (!['delivery', 'van'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only a delivery guy or the van can raise a return' });
    }
    if (filled <= 0 && empty <= 0 && defect <= 0) {
      return res.status(400).json({ error: 'At least one of filled/empty/defect must be greater than 0' });
    }
    const { to } = req.body;
    if (!to || !['GODOWN', 'VAN'].includes(to.kind)) {
      return res.status(400).json({ error: "to.kind must be 'GODOWN' or 'VAN'" });
    }
    if (to.kind === 'VAN' && req.user.role === 'van') {
      return res.status(400).json({ error: 'Van cannot return to itself' });
    }

    const from = { kind: 'USER', user: req.user.id };
    const doc = await StockRequest.create({
      type, businessDate: date, cylinderType, filled, empty, defect, from, to,
      raisedBy: req.user.id, note,
    });
    return res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-requests
router.get('/', requireAuth, async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  if (req.user.role === 'delivery') {
    filter.$or = [
      { raisedBy: req.user.id },
      { type: 'ISSUE', 'to.kind': 'USER', 'to.user': req.user.id },
    ];
  } else if (req.user.role === 'van') {
    filter.$or = [
      { raisedBy: req.user.id },
      { type: 'ISSUE', 'to.kind': 'VAN' },
      { type: 'RETURN', 'to.kind': 'VAN' },
    ];
  }

  const list = await StockRequest.find(filter)
    .populate('cylinderType raisedBy acceptedBy to.user from.user')
    .sort({ createdAt: -1 });
  res.json(list);
});

// POST /api/stock-requests/:id/accept
// NOTE: Uses non-transactional sequential writes — compatible with standalone MongoDB
router.post('/:id/accept', requireAuth, async (req, res) => {
  try {
    // Use findOneAndUpdate to atomically claim the request (avoid double-accept race)
    const request = await StockRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'PENDING' },
      { $set: { status: '__PROCESSING__' } },
      { new: false }
    );
    if (!request) {
      const existing = await StockRequest.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Request not found' });
      return res.status(400).json({ error: `Request already ${existing.status}` });
    }

    const canAccept = checkCanAccept(request, req.user);
    if (!canAccept) {
      // Rollback status
      await StockRequest.updateOne({ _id: request._id }, { $set: { status: 'PENDING' } });
      return res.status(403).json({ error: 'You are not the intended recipient of this request' });
    }

    if (request.type === 'ISSUE') {
      if (request.to.kind === 'USER') {
        const recipient = await User.findById(request.to.user);
        if (recipient?.role === 'delivery') {
          const pendingApprovalLine = await DailyLine.findOne({
            guy: request.to.user,
            detailsStatus: { $in: ['PENDING', 'SUBMITTED'] },
          });
          if (pendingApprovalLine) {
            await StockRequest.updateOne({ _id: request._id }, { $set: { status: 'PENDING' } });
            return res.status(400).json({
              error: 'Previous delivery details are pending supervisor approval. Complete approval before accepting the next issue.',
            });
          }
        }
      }

      // Deduct from source location
      await adjustLocationBalance(request.from.kind, request.cylinderType, { filled: -request.filled });

      if (request.to.kind === 'VAN') {
        // Update the StockLocation balance for VAN
        await adjustLocationBalance('VAN', request.cylinderType, { filled: request.filled });
        // Also create a DailyLine for the van user so My Day shows it
        // Find the van user
        const User = require('../models/User');
        const vanUser = await User.findOne({ role: 'van' });
        if (vanUser) {
          await DailyLine.create({
            guy: vanUser._id,
            businessDate: request.businessDate,
            cylinderType: request.cylinderType,
            source: request.from.kind, // GODOWN
            sourceRequest: request._id,
            received: request.filled,
          });
        }
      } else {
        // to a named delivery guy — create their daily line
        await DailyLine.create({
          guy: request.to.user,
          businessDate: request.businessDate,
          cylinderType: request.cylinderType,
          source: request.from.kind, // GODOWN or VAN
          sourceRequest: request._id,
          received: request.filled,
        });
      }
    } else {
      // RETURN: lands at GODOWN or VAN
      await adjustLocationBalance(request.to.kind, request.cylinderType, {
        filled: request.filled, empty: request.empty, defect: request.defect,
      });

      if (request.empty > 0 || request.defect > 0) {
        await EmptyReturnLog.create({
          businessDate: request.businessDate,
          cylinderType: request.cylinderType,
          empty: request.empty,
          defect: request.defect,
          returnedBy: request.from.user,
          receivedAt: request.to.kind,
          acceptedBy: req.user.id,
          sourceRequest: request._id,
        });
      }

      // Close out the guy's open lines for this type/day
      const openLines = await DailyLine.find({
        guy: request.from.user,
        businessDate: request.businessDate,
        cylinderType: request.cylinderType,
        closed: false,
      });

      for (const line of openLines) {
        const balance = line.received - line.delivered - line.nc - line.returned;
        if (balance > 0) line.returned += balance;
        line.closed = true;
        await line.save();
      }
    }

    const updated = await StockRequest.findByIdAndUpdate(
      request._id,
      { $set: { status: 'ACCEPTED', acceptedBy: req.user.id, acceptedAt: new Date() } },
      { new: true }
    ).populate('cylinderType raisedBy acceptedBy to.user from.user');

    res.json(updated);
  } catch (err) {
    // If we errored mid-way, try to restore PENDING so the user can retry
    try { await StockRequest.updateOne({ _id: req.params.id, status: '__PROCESSING__' }, { $set: { status: 'PENDING' } }); } catch(_) {}
    res.status(400).json({ error: err.message });
  }
});

// POST /api/stock-requests/:id/reject
router.post('/:id/reject', requireAuth, async (req, res) => {
  const request = await StockRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: `Request already ${request.status}` });

  const canAccept = checkCanAccept(request, req.user);
  if (!canAccept) return res.status(403).json({ error: 'You are not the intended recipient of this request' });

  request.status = 'REJECTED';
  request.acceptedBy = req.user.id;
  request.acceptedAt = new Date();
  if (req.body.reason) request.note = `${request.note ? request.note + ' | ' : ''}Rejected: ${req.body.reason}`;
  await request.save();
  res.json(request);
});

// FIX: Corrected permission logic
// - supervisor/owner can accept ANYTHING (returns to godown, issues to van, etc.)
// - van can accept ISSUE-to-VAN and RETURN-to-VAN
// - delivery can accept ISSUE-to-USER (their own id)
function checkCanAccept(request, user) {
  if (['owner', 'supervisor'].includes(user.role)) return true;

  if (request.type === 'ISSUE') {
    if (request.to.kind === 'VAN') return user.role === 'van';
    if (request.to.kind === 'USER') {
      const toUserId = request.to.user ? request.to.user.toString() : null;
      return toUserId === user.id;
    }
  } else {
    // RETURN
    if (request.to.kind === 'GODOWN') return ['supervisor', 'owner'].includes(user.role);
    if (request.to.kind === 'VAN') return user.role === 'van';
  }
  return false;
}

module.exports = router;
