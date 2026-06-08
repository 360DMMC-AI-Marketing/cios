const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/cios',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  CLICKUP_API_KEY: process.env.CLICKUP_API_KEY || '',
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID || '',
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET || '',
  MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID || '',
  DEFAULT_TEAMS_TEAM_ID: process.env.DEFAULT_TEAMS_TEAM_ID || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT || '587',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '',
};

module.exports = env;
