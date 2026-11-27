module.exports = {
  apps: [
    {
      name: "collabx-api",
      script: "server.js",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
    },
    {
      name: "collabx-web",
      script: "../client/node_modules/vite/bin/vite.js",
      args: "--host 127.0.0.1 --port 18411",
      cwd: "../client",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};