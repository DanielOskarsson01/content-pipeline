require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Static files (dashboard)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/health', require('./routes/health'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/runs', require('./routes/runs'));
app.use('/api/entities', require('./routes/entities'));
app.use('/api/content', require('./routes/generated-content'));

// Error handler (must be last)
app.use(require('./middleware/errorHandler'));

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'pong') ws.isAlive = true;
    } catch (e) { /* ignore malformed messages */ }
  });
  ws.on('close', () => { clients.delete(ws); });
});

// Heartbeat every 30s
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
    ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// Broadcast to all connected WebSocket clients
function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// Redis pub/sub subscriber for worker events
async function setupRedisSubscriber() {
  try {
    const IORedis = require('ioredis');
    const subscriber = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null
    });

    subscriber.subscribe('pipeline-events', (err) => {
      if (err) console.error('Redis subscribe error:', err.message);
      else console.log('Subscribed to pipeline-events channel');
    });

    subscriber.on('message', (channel, message) => {
      if (channel === 'pipeline-events') {
        try {
          broadcast(JSON.parse(message));
        } catch (e) { /* ignore parse errors */ }
      }
    });
  } catch (e) {
    console.warn('Redis subscriber not available:', e.message);
  }
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Content Pipeline API running on port ${PORT}`);
  setupRedisSubscriber();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(heartbeat);
  wss.close();
  server.close(() => process.exit(0));
});

module.exports = { broadcast };
