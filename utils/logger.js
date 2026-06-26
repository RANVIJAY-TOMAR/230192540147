import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.TEST_SERVER_BASE_URL || 'http://4.224.186.213/evaluation-service';
let cachedAccessToken = '';

// Allowed Enum maps based on strict document constraints
const ALLOWED_STACKS = ['backend', 'frontend'];
const ALLOWED_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];
const ALLOWED_PACKAGES = [
  'cache', 'controller', 'cron_job', 'db', 'domain', 'handler', 'repository', 'route', 'service',
  'api', 'component', 'hook', 'page', 'state', 'style',
  'auth', 'config', 'middleware', 'utils'
];

/**
 * Automates obtaining an Access Token from the auth API at server boot.
 */
export async function initializeAuth() {
  try {
    const authPayload = {
      email: process.env.COLLEGE_EMAIL,
      name: process.env.STUDENT_NAME,
      rollNo: String(process.env.ROLL_NUMBER),
      accessCode: process.env.ACTUAL_ACCESS_CODE,
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET
    };

    const response = await axios.post(`${BASE_URL}/auth`, authPayload);
    if (response.data && response.data.access_token) {
      cachedAccessToken = response.data.access_token;
      console.log('✅ Authorization Token obtained and cached successfully.');
    }
  } catch (error) {
    console.error('❌ Authentication initialization failure:', error.response?.data || error.message);
  }
}

/**
 * Core Log function to hit the protected /logs route
 */
export async function Log(stack, level, pkg, message) {
  // Convert inputs strictly to lower case to satisfy constraints
  const cleanStack = String(stack).toLowerCase();
  const cleanLevel = String(level).toLowerCase();
  const cleanPkg = String(pkg).toLowerCase();

  // Validate values against lists locally before making a network trip
  if (!ALLOWED_STACKS.includes(cleanStack) || !ALLOWED_LEVELS.includes(cleanLevel) || !ALLOWED_PACKAGES.includes(cleanPkg)) {
    console.error(`⚠️ Log validation rejected locally: invalid parameters passed.`);
    return;
  }

  if (!cachedAccessToken) {
    console.error('⚠️ Log dropped: No valid token available.');
    return;
  }

  try {
    const payload = {
      stack: cleanStack,
      level: cleanLevel,
      package: cleanPkg,
      message: message
    };

    const response = await axios.post(`${BASE_URL}/logs`, payload, {
      headers: {
        'Authorization': `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log(`🚀 Log Delivered Successfully | ID: ${response.data.logID}`);
    }
  } catch (error) {
    console.error('❌ Remote Log Transmission failed:', error.response?.data || error.message);
  }
}