# mcp-activecollab

A production-ready **Model Context Protocol (MCP) server** that connects Claude Desktop (or any MCP-compatible AI) to a self-hosted [ActiveCollab](https://activecollab.com/) installation.

---

## Features

- **11 MCP tools** covering projects, tasks, users, comments, time records, and reports
- **Smart AI features**: priority scoring, overdue risk detection, workload analysis, standup summaries
- **In-memory caching** with configurable TTLs to minimize API calls
- **Retry logic** with exponential backoff and `Retry-After` header support
- **Token-safe logging** — API token is never exposed in logs or error messages
- **ES Modules** throughout, Node.js 20+

---

## Prerequisites

- Node.js 20 or higher
- An ActiveCollab self-hosted installation
- An ActiveCollab API token (see [Getting your API token](#getting-your-api-token))

---

## Installation

```bash
git clone https://github.com/your-org/mcp-activecollab.git
cd mcp-activecollab
npm install
```

---

## Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and fill in your credentials:

```env
ACTIVECOLLAB_API_TOKEN=your_token_here
ACTIVECOLLAB_BASE_URL=https://www.manageprojects.us/api/v1
REQUEST_TIMEOUT_MS=30000
CACHE_TTL_PROJECTS_MS=300000
CACHE_TTL_TASKS_MS=60000
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ACTIVECOLLAB_API_TOKEN` | **Yes** | — | Your ActiveCollab API token |
| `ACTIVECOLLAB_BASE_URL` | No | `https://www.manageprojects.us/api/v1` | Base URL of your ActiveCollab API |
| `REQUEST_TIMEOUT_MS` | No | `30000` | HTTP request timeout in milliseconds |
| `CACHE_TTL_PROJECTS_MS` | No | `300000` | Cache TTL for projects/users (5 minutes) |
| `CACHE_TTL_TASKS_MS` | No | `60000` | Cache TTL for tasks/comments (1 minute) |

---

## Getting Your API Token

1. Log into your ActiveCollab instance
2. Click your avatar → **My Settings** → **API Tokens**
3. Click **+ New Token**, give it a name (e.g., "Claude MCP"), and copy the token
4. Paste it into your `.env` file as `ACTIVECOLLAB_API_TOKEN`

---

## Running Locally

```bash
# Production mode
npm start

# Development mode (auto-restarts on file changes)
npm run dev
```

When started, the server writes to stderr:
```
[mcp-activecollab] Server started. Connected to https://www.manageprojects.us/api/v1
```

The server communicates over **stdio** (standard input/output) using the MCP JSON-RPC protocol. It is not a web server — do not try to send HTTP requests to it directly.

---

## Claude Desktop Integration

1. Locate your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Add the following entry (replace the path with the absolute path to your installation):

```json
{
  "mcpServers": {
    "activecollab": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-activecollab/src/server.js"],
      "env": {
        "ACTIVECOLLAB_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

3. Restart Claude Desktop.

4. You should see "activecollab" appear in the MCP tools panel. Ask Claude:
   > "List all my active projects in ActiveCollab"

---

## Available Tools

| Tool | Description | Inputs |
|---|---|---|
| `get_projects` | List all active projects with status and due dates | None |
| `get_project_tasks` | Get all tasks for a project, sorted by priority | `project_id` |
| `get_task_details` | Full details with priority score and risk assessment | `task_id` |
| `get_overdue_tasks` | All overdue tasks with risk levels | None |
| `get_tasks_due_today` | Tasks due today across all projects | None |
| `search_tasks` | Search tasks by keyword, optionally within a project | `keyword`, `project_id?` |
| `get_users` | List all team members with roles | None |
| `get_team_workload` | Tasks and estimated hours per team member | None |
| `get_task_comments` | Comments on a specific task with authors and dates | `project_id`, `task_id` |
| `get_time_records` | Time tracking records with totals | `project_id?` |
| `get_standup_summary` | Daily standup: overdue + due today + time logged | None |

---

## Example Prompts

Use these prompts with Claude after connecting the MCP server:

**Project Overview**
> "Show me all active projects with their due dates and statuses."

**Daily Standup**
> "Generate a daily standup summary for today's meeting."

**Overdue Tasks**
> "Which tasks are most critically overdue? Show me the top 10 with risk levels."

**Team Workload**
> "Who on the team has the most open tasks? Show me the workload breakdown."

**Task Search**
> "Search for all tasks related to 'API integration' and show their assignees and due dates."

**Project Deep Dive**
> "List all tasks in project 42 sorted by priority. Which ones are overdue?"

**Time Tracking**
> "Show me time records for project 15 this period."

**Capacity Planning**
> "Which team members have more than 10 open tasks? Who might be overloaded?"

---

## Architecture

```
src/
├── server.js                    # Entry point: MCP server + tool registration
├── config/
│   └── env.js                   # Environment variable validation
├── services/
│   └── activecollab.service.js  # ActiveCollab API client with caching + retry
├── tools/
│   ├── projects.tool.js         # get_projects, get_project_tasks
│   ├── tasks.tool.js            # get_task_details, get_overdue_tasks, get_tasks_due_today, search_tasks
│   ├── users.tool.js            # get_users, get_team_workload
│   ├── reports.tool.js          # get_time_records, get_standup_summary
│   └── comments.tool.js         # get_task_comments
├── utils/
│   └── formatter.js             # Markdown formatters, priority scoring, risk detection
└── prompts/
    └── systemPrompt.js          # MCP system prompt definition
```

---

## Security Notes

- **Never commit `.env`** — it is in `.gitignore` by default
- The API token is only read from environment variables, never hardcoded
- All error messages sanitize the token before logging (`[REDACTED]`)
- The server is **read-only** — it does not create, update, or delete any data
- Use a dedicated API token with minimum required permissions
- Consider running with `--allow-read` flags if your security policy requires it
- For production, store the token in a secrets manager and inject it via the `env` block in `claude_desktop_config.json`

---

## Troubleshooting

### "Missing required environment variable: ACTIVECOLLAB_API_TOKEN"
Your `.env` file is missing or the variable is not set. Run `cp .env.example .env` and fill in the token.

### Server starts but Claude Desktop doesn't see it
- Make sure the path in `claude_desktop_config.json` is an **absolute** path
- Restart Claude Desktop after editing the config
- Check that Node.js 20+ is on your system PATH: `node --version`

### "ActiveCollab API 401"
Your API token is invalid or expired. Generate a new one from ActiveCollab → My Settings → API Tokens.

### "ActiveCollab API 404" on task comments
ActiveCollab comment endpoints vary by version. If comments return 404, the endpoint URL may differ for your installation. Check your AC version's API docs.

### Slow responses on "due today" or "team workload"
These tools fan out across all projects. If you have many projects, increase `CACHE_TTL_TASKS_MS` to reduce repeat calls, or the first request will take longer as it fetches in parallel.

### Tools work but return empty results
Some ActiveCollab endpoints return data in nested shapes (e.g., `{ tasks: [...] }`). The service normalizes these, but if your AC version uses an unusual shape, open an issue with the raw API response.

---

## License

MIT
