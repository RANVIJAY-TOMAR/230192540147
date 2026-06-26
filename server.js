import express from 'express';
import { initializeAuth, Log } from './utils/logger.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running smoothly on port ${PORT}`);
  
  // 1. Log into the test server automatically using your saved client keys
  await initializeAuth();

  // 2. Fire an initial sanity check log to verify the full network pipeline works
  await Log('backend', 'info', 'middleware', 'Application tracking module successfully active.');
});