/** Main entry point - start app setup */
const { start } = require('./app');
start().catch(err => {
  console.error(err);
  process.exit(1);
});
