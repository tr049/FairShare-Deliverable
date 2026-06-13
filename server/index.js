// index.js — Fairshare API entry point.
// Express + SQLite (Sprint Zero local data layer). Runs on port 3001 with no
// .env: the database file is created next to this script and the JWT secret
// defaults to a baked-in dev value. Start with: node index.js

const express = require('express');
const cors = require('cors');
require('./db'); // opens the SQLite file and ensures the schema exists

const authRouter = require('./routes/auth');
const groupsRouter = require('./routes/groups');
const { overallRouter } = require('./routes/balances');
const { sendError } = require('./lib/helpers');

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/auth', authRouter);
app.use('/groups', groupsRouter);
app.use('/balances', overallRouter);

// Unknown routes still answer in the contract's error shape.
app.use((req, res) => sendError(res, 404, 'not_found', 'Not found.'));

// Malformed JSON bodies and anything unexpected.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'validation', 'Request body must be valid JSON.');
  }
  console.error(err);
  sendError(res, 500, 'server_error', 'Something went wrong on the server.');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Fairshare API listening on http://localhost:${PORT}`);
});
