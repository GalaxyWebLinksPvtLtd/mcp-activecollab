import axios from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config/env.js';

// ─── In-memory cache ────────────────────────────────────────────────────────

class Cache {
  constructor() {
    this._store = new Map();
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key, data, ttlMs) {
    this._store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  clear() {
    this._store.clear();
  }
}

// ─── HTTP client setup ───────────────────────────────────────────────────────

function createClient() {
  const client = axios.create({
    baseURL: config.baseUrl,
    timeout: config.timeoutMs,
    headers: {
      'X-Angie-AuthApiToken': config.apiToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  axiosRetry(client, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      error.response?.status === 429 ||
      error.response?.status >= 500,
    onRetry: (retryCount, error) => {
      // Strip auth header from log to avoid token exposure
      process.stderr.write(
        `[mcp-activecollab] Retry ${retryCount}: ${error.config?.method?.toUpperCase()} ${error.config?.url} — ${error.message}\n`
      );
    },
  });

  // Handle Retry-After header on 429 responses
  client.interceptors.response.use(null, async (error) => {
    if (error.response?.status === 429 && !error.config?.__retryAfterHandled) {
      const retryAfterSec = parseInt(error.response.headers['retry-after'] || '5', 10);
      error.config.__retryAfterHandled = true;
      await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
      return client.request(error.config);
    }
    throw error;
  });

  return client;
}

// ─── Response normalizers ────────────────────────────────────────────────────

// ActiveCollab API returns data in different shapes depending on endpoint/version.
// These helpers normalise all shapes to plain arrays.

function toArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // Some endpoints return { tasks: [...] } or { members: [...] }
  for (const key of ['tasks', 'members', 'users', 'projects', 'comments', 'time_records']) {
    if (Array.isArray(raw[key])) return raw[key];
  }
  // Some overdue endpoints return { task_ids: [], tasks: { id: task } }
  if (raw.tasks && typeof raw.tasks === 'object') return Object.values(raw.tasks);
  // Fallback: treat object values as array items
  return Object.values(raw);
}

function sanitizeError(error) {
  const status = error.response?.status;
  const apiMsg = error.response?.data?.message ?? error.response?.data?.error ?? null;
  const msg = apiMsg
    ? `ActiveCollab API ${status}: ${apiMsg}`
    : `ActiveCollab API error: ${status ?? 'network'} — ${error.message}`;
  const sanitized = new Error(msg.replace(config.apiToken, '[REDACTED]'));
  sanitized.statusCode = status;
  return sanitized;
}

// ─── Service class ───────────────────────────────────────────────────────────

export class ActiveCollabService {
  constructor() {
    this._client = createClient();
    this._cache = new Cache();
  }

  async _get(cacheKey, ttlMs, url, params = {}) {
    const cached = this._cache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const response = await this._client.get(url, { params });
      const data = response.data;
      this._cache.set(cacheKey, data, ttlMs);
      return data;
    } catch (error) {
      throw sanitizeError(error);
    }
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async getProjects() {
    const raw = await this._get('projects:all', config.cache.projectsTtlMs, '/projects');
    return toArray(raw);
  }

  async getProject(projectId) {
    const raw = await this._get(
      `projects:${projectId}`,
      config.cache.projectsTtlMs,
      `/projects/${projectId}`
    );
    // Single project is returned as the object itself, not wrapped
    return raw;
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async getTasks(projectId) {
    const raw = await this._get(
      `tasks:project:${projectId}`,
      config.cache.tasksTtlMs,
      `/projects/${projectId}/tasks`
    );
    return toArray(raw);
  }

  async getTask(projectId, taskId) {
    const raw = await this._get(
      `tasks:${projectId}:${taskId}`,
      config.cache.tasksTtlMs,
      `/projects/${projectId}/tasks/${taskId}`
    );
    return raw;
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getUsers() {
    const raw = await this._get('users:all', config.cache.projectsTtlMs, '/users');
    return toArray(raw);
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async getComments(projectId, taskId) {
    const raw = await this._get(
      `comments:${projectId}:${taskId}`,
      config.cache.tasksTtlMs,
      `/projects/${projectId}/tasks/${taskId}/comments`
    );
    return toArray(raw);
  }

  // ── Reports / computed ────────────────────────────────────────────────────

  async getOverdueTasks() {
    const raw = await this._get(
      'tasks:overdue',
      config.cache.tasksTtlMs,
      '/reports/run',
      { type: 'OverdueTasksFilter' }
    );
    return toArray(raw);
  }

  async getTimeRecords(projectId) {
    const url = projectId ? `/projects/${projectId}/time-records` : '/time-records';
    const cacheKey = projectId ? `time_records:${projectId}` : 'time_records:all';
    const raw = await this._get(cacheKey, config.cache.tasksTtlMs, url);
    return toArray(raw);
  }

  // ── Computed / client-side ────────────────────────────────────────────────

  async getTasksDueToday() {
    const cacheKey = 'tasks:due_today';
    const cached = this._cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const projects = await this.getProjects();
    const active = projects.filter((p) => !p.is_trashed && p.is_tracking_enabled !== false);

    const allTasks = (
      await Promise.all(
        active.slice(0, 30).map((p) =>
          this.getTasks(p.id).catch(() => [])
        )
      )
    ).flat();

    const dueTodayTasks = allTasks.filter((task) => {
      if (task.is_completed) return false;
      const due = parseDueDate(task.due_on);
      if (!due) return false;
      return due.toISOString().slice(0, 10) === today;
    });

    this._cache.set(cacheKey, dueTodayTasks, config.cache.tasksTtlMs);
    return dueTodayTasks;
  }

  async getTasksByAssignee(userId) {
    const cacheKey = `tasks:assignee:${userId}`;
    const cached = this._cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const projects = await this.getProjects();
    const active = projects.filter((p) => !p.is_trashed);

    const allTasks = (
      await Promise.all(
        active.slice(0, 30).map((p) =>
          this.getTasks(p.id).catch(() => [])
        )
      )
    ).flat();

    const assigneeTasks = allTasks.filter(
      (t) => !t.is_completed && String(t.assignee_id) === String(userId)
    );

    this._cache.set(cacheKey, assigneeTasks, config.cache.tasksTtlMs);
    return assigneeTasks;
  }

  async searchTasks(keyword, projectId) {
    const cacheKey = `tasks:search:${projectId ?? 'all'}:${keyword}`;
    const cached = this._cache.get(cacheKey);
    if (cached !== undefined) return cached;

    let tasks;
    if (projectId) {
      tasks = await this.getTasks(projectId);
    } else {
      const projects = await this.getProjects();
      const active = projects.filter((p) => !p.is_trashed);
      tasks = (
        await Promise.all(
          active.slice(0, 30).map((p) =>
            this.getTasks(p.id).catch(() => [])
          )
        )
      ).flat();
    }

    const lower = keyword.toLowerCase();
    const results = tasks.filter(
      (t) =>
        t.name?.toLowerCase().includes(lower) ||
        t.body?.toLowerCase().includes(lower) ||
        t.body_formatted?.toLowerCase().includes(lower)
    );

    this._cache.set(cacheKey, results, config.cache.tasksTtlMs);
    return results;
  }

  // ── Workload aggregation ──────────────────────────────────────────────────

  async getTeamWorkload() {
    const cacheKey = 'workload:team';
    const cached = this._cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const [projects, users] = await Promise.all([this.getProjects(), this.getUsers()]);
    const active = projects.filter((p) => !p.is_trashed);

    const allTasks = (
      await Promise.all(
        active.slice(0, 30).map((p) =>
          this.getTasks(p.id).catch(() => [])
        )
      )
    ).flat();

    const openTasks = allTasks.filter((t) => !t.is_completed);
    const userMap = Object.fromEntries(users.map((u) => [String(u.id), u]));

    const workload = {};
    for (const task of openTasks) {
      const uid = String(task.assignee_id || 'unassigned');
      if (!workload[uid]) {
        workload[uid] = {
          user: userMap[uid] ?? { id: uid, display_name: uid === 'unassigned' ? 'Unassigned' : `User #${uid}` },
          tasks: [],
          totalEstimatedHours: 0,
        };
      }
      workload[uid].tasks.push(task);
      workload[uid].totalEstimatedHours += task.estimate ?? 0;
    }

    const result = Object.values(workload).sort((a, b) => b.tasks.length - a.tasks.length);
    this._cache.set(cacheKey, result, config.cache.tasksTtlMs);
    return result;
  }

  // ── Cache management ──────────────────────────────────────────────────────

  clearCache() {
    this._cache.clear();
  }
}

// ── Utility exported for use in formatter ────────────────────────────────────

export function parseDueDate(rawDue) {
  if (!rawDue) return null;
  if (typeof rawDue === 'number') return new Date(rawDue * 1000);
  const d = new Date(rawDue);
  return isNaN(d.getTime()) ? null : d;
}
