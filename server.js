const crypto = require('crypto');
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const CONSUMERS_FILE = path.join(DATA_DIR, 'consumers.json');
const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 2000;

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(CONSUMERS_FILE)) {
    fs.writeFileSync(CONSUMERS_FILE, '[]\n', 'utf8');
  }
}

function makeHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readConsumers() {
  ensureDataFile();
  const contents = fs.readFileSync(CONSUMERS_FILE, 'utf8');

  try {
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      throw new Error('Expected the consumers data file to contain a JSON array.');
    }
    return parsed;
  } catch (error) {
    const wrapped = makeHttpError(500, `Unable to read consumers data: ${error.message}`);
    throw wrapped;
  }
}

function writeConsumers(consumers) {
  ensureDataFile();
  const tmpFile = `${CONSUMERS_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    fs.writeFileSync(tmpFile, `${JSON.stringify(consumers, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpFile, CONSUMERS_FILE);
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

function normalizeText(value, fieldName, options = {}) {
  const {
    required = false,
    maxLength = MAX_TEXT_LENGTH,
    defaultValue = ''
  } = options;

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

  const name = normalizeText(input.name ?? existing.name, 'name', { required: true, maxLength: MAX_NAME_LENGTH });
  const phone = normalizeText(input.phone ?? existing.phone, 'phone', { required: true, maxLength: 40 });

  return {
    id: existing.id || crypto.randomUUID(),
    name,
    phone,
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

app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: 'consumer-api'
  });
});

app.get('/api/consumers', (req, res, next) => {
  try {
    res.json(readConsumers());
  } catch (error) {
    next(error);
  }
});

app.get('/api/consumers/:id', (req, res, next) => {
  try {
    const consumer = readConsumers().find((item) => item.id === req.params.id);
    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found.' });
    }
    return res.json(consumer);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/consumers', (req, res, next) => {
  try {
    const consumers = readConsumers();
    const consumer = normalizeConsumer(req.body, {});
    consumers.push(consumer);
    writeConsumers(consumers);
    return res.status(201).json(consumer);
  } catch (error) {
    return next(error);
  }
});

app.put('/api/consumers/:id', (req, res, next) => {
  try {
    const consumers = readConsumers();
    const index = consumers.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Consumer not found.' });
    }

    const consumer = normalizeConsumer(req.body, consumers[index]);
    consumers[index] = consumer;
    writeConsumers(consumers);
    return res.json(consumer);
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/consumers/:id', (req, res, next) => {
  try {
    const consumers = readConsumers();
    const remaining = consumers.filter((item) => item.id !== req.params.id);

    if (remaining.length === consumers.length) {
      return res.status(404).json({ error: 'Consumer not found.' });
    }

    writeConsumers(remaining);
    return res.json({ success: true });
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

function startServer() {
  ensureDataFile();
  return app.listen(PORT, () => {
    console.log(`Farm Poultry Dashboard backend running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

