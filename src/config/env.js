import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val.trim();
}

function optionalEnv(name, defaultValue) {
  const val = process.env[name];
  return val && val.trim() !== '' ? val.trim() : defaultValue;
}

export const config = Object.freeze({
  apiToken: requireEnv('ACTIVECOLLAB_API_TOKEN'),
  baseUrl: optionalEnv('ACTIVECOLLAB_BASE_URL', 'https://www.manageprojects.us/api/v1').replace(/\/$/, ''),
  timeoutMs: parseInt(optionalEnv('REQUEST_TIMEOUT_MS', '30000'), 10),
  cache: Object.freeze({
    projectsTtlMs: parseInt(optionalEnv('CACHE_TTL_PROJECTS_MS', '300000'), 10),
    tasksTtlMs: parseInt(optionalEnv('CACHE_TTL_TASKS_MS', '60000'), 10),
  }),
});
