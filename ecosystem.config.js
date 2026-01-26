module.exports = {
  apps: [
    {
      name: 'content-pipeline-api',
      script: 'server.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      max_memory_restart: '512M',
      error_file: '/var/log/content-pipeline/api-error.log',
      out_file: '/var/log/content-pipeline/api-out.log',
      merge_logs: true
    },
    {
      name: 'content-pipeline-worker',
      script: 'workers/stageWorker.js',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '512M',
      error_file: '/var/log/content-pipeline/worker-error.log',
      out_file: '/var/log/content-pipeline/worker-out.log',
      merge_logs: true
    }
  ]
};
