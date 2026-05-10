import { z } from 'zod';
import { formatTaskDetails, formatTaskList } from '../utils/formatter.js';

export function register(mcpServer, service) {
  mcpServer.registerTool(
    'get_task_details',
    {
      description:
        'Get full details of a specific task including description, priority score, risk assessment, assignee, and due date.',
      inputSchema: {
        task_id: z
          .number()
          .int()
          .positive()
          .describe('The numeric ID of the task'),
      },
    },
    async ({ task_id }) => {
      try {
        const task = await service.getTask(task_id);
        return { content: [{ type: 'text', text: formatTaskDetails(task) }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching task ${task_id}: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  mcpServer.registerTool(
    'get_overdue_tasks',
    {
      description:
        'Get all overdue tasks across all projects. Returns tasks past their due date sorted by how many days overdue, with risk levels.',
    },
    async () => {
      try {
        const tasks = await service.getOverdueTasks();
        const text = formatTaskList(tasks, 'Overdue Tasks');
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching overdue tasks: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  mcpServer.registerTool(
    'get_tasks_due_today',
    {
      description:
        'Get all tasks due today across all active projects. Useful for daily planning and standup preparation.',
    },
    async () => {
      try {
        const tasks = await service.getTasksDueToday();
        const text = formatTaskList(tasks, "Tasks Due Today");
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching tasks due today: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  mcpServer.registerTool(
    'search_tasks',
    {
      description:
        'Search for tasks by keyword across all projects, or within a specific project. Matches against task name and description.',
      inputSchema: {
        keyword: z
          .string()
          .min(1)
          .describe('Search keyword to match against task names and descriptions'),
        project_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional: limit search to a specific project ID'),
      },
    },
    async ({ keyword, project_id }) => {
      try {
        const tasks = await service.searchTasks(keyword, project_id);
        const scope = project_id ? `Project #${project_id}` : 'All Projects';
        const text = formatTaskList(tasks, `Search: "${keyword}" in ${scope}`);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error searching tasks: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
