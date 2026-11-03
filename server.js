const crypto = require('crypto');
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'farm.db');

let dbPromise = null;

const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 2000;

function makeHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeText(value, fieldName, options = {}) {
  const { required = false, maxLength = MAX_TEXT_LENGTH, defaultValue = '' } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw makeHttpError(400, `${fieldName} is required.`);
    }
    return defaultValue;
  }

  if (typeof value !== 'string') {
    throw makeHttpError(400, `${fieldName} must be a string.`);
  }

  const normalized = value.trim();

  if (required && !normalized) {
    throw makeHttpError(400, `${fieldName} is required.`);
  }

  if (normalized.length > maxLength) {
    throw makeHttpError(400, `${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

function normalizeConsumer(input = {}, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw makeHttpError(400, 'Request body must be a JSON object.');
  }

  const eggsOrderedValue = input.eggsOrdered === undefined
    ? Number(existing.eggsOrdered || 0)
    : Number(input.eggsOrdered);

  if (!Number.isFinite(eggsOrderedValue) || eggsOrderedValue < 0) {
    throw makeHttpError(400, 'eggsOrdered must be a non-negative number.');
  }

  return {
    id: existing.id || crypto.randomUUID(),
    name: normalizeText(input.name ?? existing.name, 'name', { required: true, maxLength: MAX_NAME_LENGTH }),
    phone: normalizeText(input.phone ?? existing.phone, 'phone', { required: true, maxLength: 40 }),
    email: normalizeText(input.email ?? existing.email, 'email', { maxLength: 254 }),
    address: normalizeText(input.address ?? existing.address, 'address'),
    buyerType: normalizeText(input.buyerType ?? existing.buyerType ?? 'Retail', 'buyerType', { maxLength: 80 }) || 'Retail',
    eggsOrdered: eggsOrderedValue,
    location: normalizeText(input.location ?? existing.location, 'location', { maxLength: 120 }),
    notes: normalizeText(input.notes ?? existing.notes, 'notes'),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    ensureDataDir();

    const db = new sqlite3.Database(DB_PATH, (error) => {
      if (error) {
        return reject(makeHttpError(500, `Unable to open database: ${error.message}`));
      }

      db.run(
        `CREATE TABLE IF NOT EXISTS consumers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT,
          address TEXT,
          buyerType TEXT,
          eggsOrdered REAL DEFAULT 0,
          location TEXT,
          notes TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )`,
        (createError) => {
          if (createError) {
            return reject(makeHttpError(500, `Database setup failed: ${createError.message}`));
          }
          return resolve(db);
        }
      );
    });
  });
}

async function getDatabase() {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }
  return dbPromise;
}

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onComplete(error) {
      if (error) return reject(error);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows || []);
    });
  });
}

function getSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row || null);
    });
  });
}

async function listConsumers() {
  const db = await getDatabase();
  return allSql(db, 'SELECT * FROM consumers ORDER BY createdAt DESC');
}

async function getConsumerById(id) {
  const db = await getDatabase();
  return getSql(db, 'SELECT * FROM consumers WHERE id = ?', [id]);
}

async function addConsumer(input) {
  const consumer = normalizeConsumer(input, {});
  const db = await getDatabase();

  await runSql(
    db,
    `INSERT INTO consumers (
      id, name, phone, email, address, buyerType, eggsOrdered, location, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      consumer.id,
      consumer.name,
      consumer.phone,
      consumer.email,
      consumer.address,
      consumer.buyerType,
      consumer.eggsOrdered,
      consumer.location,
      consumer.notes,
      consumer.createdAt,
      consumer.updatedAt
    ]
  );

  return consumer;
}

async function updateConsumer(id, input) {
  const db = await getDatabase();
  const existing = await getConsumerById(id);

  if (!existing) {
    throw makeHttpError(404, 'Consumer not found.');
  }

  const consumer = normalizeConsumer(input, existing);

  await runSql(
    db,
    `UPDATE consumers SET
      name = ?, phone = ?, email = ?, address = ?, buyerType = ?, eggsOrdered = ?, location = ?, notes = ?, updatedAt = ?
     WHERE id = ?`,
    [
      consumer.name,
      consumer.phone,
      consumer.email,
      consumer.address,
      consumer.buyerType,
      consumer.eggsOrdered,
      consumer.location,
      consumer.notes,
      consumer.updatedAt,
      id
    ]
  );

  return consumer;
}

async function deleteConsumer(id) {
  const db = await getDatabase();
  const result = await runSql(db, 'DELETE FROM consumers WHERE id = ?', [id]);

  if (result.changes === 0) {
    throw makeHttpError(404, 'Consumer not found.');
  }

  return { success: true };
}

app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'sqlite',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/consumers', async (req, res, next) => {
  try {
    const consumers = await listConsumers();
    res.json(consumers);
  } catch (error) {
    next(error);
  }
});

app.get('/api/consumers/:id', async (req, res, next) => {
  try {
    const consumer = await getConsumerById(req.params.id);
    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found.' });
    }
    return res.json(consumer);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/consumers', async (req, res, next) => {
  try {
    const consumer = await addConsumer(req.body || {});
    return res.status(201).json(consumer);
  } catch (error) {
    return next(error);
  }
});

app.put('/api/consumers/:id', async (req, res, next) => {
  try {
    const consumer = await updateConsumer(req.params.id, req.body || {});
    return res.json(consumer);
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/consumers/:id', async (req, res, next) => {
  try {
    const response = await deleteConsumer(req.params.id);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || (error.type === 'entity.parse.failed' ? 400 : 500);
  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error.' : error.message
  });
});

async function startServer() {
  await getDatabase();
  return app.listen(PORT, () => {
    console.log(`Farm Poultry Dashboard backend running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, getDatabase };

