module.exports = {
  apps: [{
    name: "pension-restart",
    script: "./server.js",
    cwd: "/var/www/pension-restart",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "500M",
    kill_timeout: 10_000,
    listen_timeout: 10_000,
    time: true,
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
  }],
};
