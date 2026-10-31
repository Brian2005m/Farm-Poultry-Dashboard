const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
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
  const raw = fs.readFileSync(CONSUMERS_FILE, 'utf8');
  try {
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

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Farm Poultry Dashboard backend is running.' });
});

app.get('/api/consumers', (req, res) => {
  res.json(readConsumers());
});

app.get('/api/consumers/:id', (req, res) => {
  const consumers = readConsumers();
  const consumer = consumers.find((item) => item.id === req.params.id);

  if (!consumer) {
    return res.status(404).json({ error: 'Consumer not found' });
  }

  res.json(consumer);
});

app.post('/api/consumers', (req, res) => {
  const { name, phone, email, address, buyerType, eggsOrdered, location, notes } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: 'Consumer name and phone are required.' });
  }

  const consumers = readConsumers();
  const newConsumer = {
    id: cryptoRandomId(),
    name,
    phone,
    email: email || '',
    address: address || '',
    buyerType: buyerType || 'Retail',
    eggsOrdered: Number(eggsOrdered) || 0,
    location: location || '',
    notes: notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  consumers.push(newConsumer);
  writeConsumers(consumers);

  res.status(201).json(newConsumer);
});

app.put('/api/consumers/:id', (req, res) => {
  const consumers = readConsumers();
  const index = consumers.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Consumer not found' });
  }

  const updated = {
    ...consumers[index],
    ...req.body,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  };

  consumers[index] = updated;
  writeConsumers(consumers);

  res.json(updated);
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function cryptoRandomId() {
  return 'consumer-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
}

ensureDataFile();

app.listen(PORT, () => {
  console.log(`Farm Poultry Dashboard backend running at http://localhost:${PORT}`);
});
