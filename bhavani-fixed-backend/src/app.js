const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const cylinderTypeRoutes = require('./routes/cylinderTypes');
const stockLocationRoutes = require('./routes/stockLocations');
const loadReceivedRoutes = require('./routes/loadReceived');
const emptiesToLorryRoutes = require('./routes/emptiesToLorry');
const surrenderEntryRoutes = require('./routes/surrenderEntry');
const stockRequestRoutes = require('./routes/stockRequests');
const dailyLineRoutes = require('./routes/dailyLines');
const reportRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cylinder-types', cylinderTypeRoutes);
app.use('/api/stock-locations', stockLocationRoutes);
app.use('/api/load-received', loadReceivedRoutes);
app.use('/api/empties-to-lorry', emptiesToLorryRoutes);
app.use('/api/surrender-entry', surrenderEntryRoutes);
app.use('/api/stock-requests', stockRequestRoutes);
app.use('/api/daily-lines', dailyLineRoutes);
app.use('/api/reports', reportRoutes);

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// central error handler (catches anything thrown/forwarded with next(err))
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
