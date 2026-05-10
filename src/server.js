#!/usr/bin/env node

// Import config first — crashes immediately with a clear message if env vars are missing
import { config } from './config/env.js';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ActiveCollabService } from './services/activecollab.service.js';
import { register as registerPrompts } from './prompts/systemPrompt.js';
import * as projectsTools from './tools/projects.tool.js';
import * as tasksTools from './tools/tasks.tool.js';
import * as usersTools from './tools/users.tool.js';
import * as reportsTools from './tools/reports.tool.js';
import * as commentsTools from './tools/comments.tool.js';

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer(
  {
    name: 'mcp-activecollab',
    version: '1.0.0',
  },
  {
    capabilities: { logging: {} },
    instructions:
      'Use these tools to query ActiveCollab for project status, tasks, team workload, time records, and daily standup reports. All access is read-only.',
  }
);

const service = new ActiveCollabService();

// ─── Tool registration ────────────────────────────────────────────────────────

projectsTools.register(server, service);
tasksTools.register(server, service);
usersTools.register(server, service);
reportsTools.register(server, service);
commentsTools.register(server, service);
registerPrompts(server);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  process.stderr.write(`[mcp-activecollab] Received ${signal}, shutting down gracefully...\n`);
  try {
    await server.close();
  } catch {
    // ignore close errors during shutdown
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // All operational logs go to stderr — stdout is reserved for MCP JSON-RPC framing
  process.stderr.write(
    `[mcp-activecollab] Server started. Connected to ${config.baseUrl}\n`
  );
}

main().catch((err) => {
  // Sanitize: never expose the API token in error output
  const rawMsg = err?.message ?? String(err);
  const safeMsg = rawMsg.replace(config.apiToken, '[REDACTED]');
  process.stderr.write(`[mcp-activecollab] Fatal startup error: ${safeMsg}\n`);
  process.exit(1);
});
