const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CONSUMERS_FILE = path.join(DATA_DIR, 'consumers.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONSUMERS_FILE)) {
    fs.writeFileSync(CONSUMERS_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function readConsumers() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(CONSUMERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeConsumers(data) {
  ensureDataFile();
  fs.writeFileSync(CONSUMERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeConsumer(input = {}) {
  const name = normalizeString(input.name);
  const phone = normalizeString(input.phone);

  if (!name || !phone) {
    const error = new Error('Consumer name and phone are required.');
    error.statusCode = 400;
    throw error;
  }

  return {
    id: input.id || generateId(),
    name,
    phone,
    email: normalizeString(input.email),
    address: normalizeString(input.address),
    buyerType: normalizeString(input.buyerType) || 'Retail',
    eggsOrdered: Number(input.eggsOrdered) || 0,
    location: normalizeString(input.location),
    notes: normalizeString(input.notes),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function generateId() {
  return 'consumer-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
}

app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Farm Poultry Dashboard backend is running.',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/consumers', (req, res) => {
  res.json(readConsumers());
});

app.get('/api/consumers/:id', (req, res) => {
  const consumer = readConsumers().find((item) => item.id === req.params.id);

  if (!consumer) {
    return res.status(404).json({ error: 'Consumer not found' });
  }

  res.json(consumer);
});

app.post('/api/consumers', (req, res) => {
  try {
    const newConsumer = normalizeConsumer(req.body || {});
    const consumers = readConsumers();

    consumers.push(newConsumer);
    writeConsumers(consumers);

    res.status(201).json(newConsumer);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message || 'Unable to create consumer.' });
  }
});

app.put('/api/consumers/:id', (req, res) => {
  try {
    const consumers = readConsumers();
    const index = consumers.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    const updatedConsumer = normalizeConsumer({
      ...consumers[index],
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString()
    });

    consumers[index] = updatedConsumer;
    writeConsumers(consumers);

    res.json(updatedConsumer);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message || 'Unable to update consumer.' });
  }
});

app.delete('/api/consumers/:id', (req, res) => {
  const consumers = readConsumers();
  const filtered = consumers.filter((item) => item.id !== req.params.id);

  if (filtered.length === consumers.length) {
    return res.status(404).json({ error: 'Consumer not found' });
  }

  writeConsumers(filtered);
  res.json({ success: true, message: 'Consumer deleted successfully.' });
});

app.get('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error'
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
