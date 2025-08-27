// Lightweight entrypoint delegating to ./app.js
const { start } = require('./app');
start().catch(err => {
  console.error(err);
  process.exit(1);
});
