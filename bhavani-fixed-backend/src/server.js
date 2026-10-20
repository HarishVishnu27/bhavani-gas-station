require('dotenv').config();
const app = require('./app');
const connectDB = require('./db');

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[server] Bhavani Agencies API listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
