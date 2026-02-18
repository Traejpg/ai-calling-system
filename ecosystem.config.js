module.exports = {
  apps: [
    {
      name: 'ai-calling-system',
      script: './src/server.js',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Process management
      max_memory_restart: '500M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Auto-restart on failure
      autorestart: true,
      
      // Don't restart if crashing too fast
      exp_backoff_restart_delay: 100,
      
      // Health monitoring
      kill_timeout: 5000,
      listen_timeout: 10000,
      
      // Watch mode (disable in production)
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        '.git',
        '*.log'
      ],
      
      // Advanced features
      merge_logs: true,
      time: true,
      
      // Pre-start script
      exec_interpreter: 'node',
      
      // Post-deploy hook (if using PM2 deployment)
      post_deploy: 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  ],
  
  // Deployment configuration (optional - for PM2 deploy feature)
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/ai-calling-system.git',
      path: '/var/www/ai-calling-system',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
