const { Router } = require('express');
const db = require('../services/db');
const router = Router();

router.get('/', async (req, res) => {
  const checks = { status: 'ok', timestamp: new Date().toISOString() };

  // Check Supabase
  try {
    const { error } = await db.from('projects').select('id').limit(1);
    checks.database = error ? 'error' : 'connected';
    if (error) checks.database_error = error.message;
  } catch (e) {
    checks.database = 'unreachable';
  }

  // Check Redis
  try {
    const IORedis = require('ioredis');
    const redis = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      connectTimeout: 3000
    });
    await redis.ping();
    checks.redis = 'connected';
    redis.disconnect();
  } catch (e) {
    checks.redis = 'unreachable';
  }

  const healthy = checks.database === 'connected' && checks.redis === 'connected';
  res.status(healthy ? 200 : 503).json(checks);
});

module.exports = router;
