import { z } from 'zod';
import { formatProjectList, formatTaskList } from '../utils/formatter.js';

export function register(mcpServer, service) {
  mcpServer.registerTool(
    'get_projects',
    {
      description:
        'List projects in ActiveCollab. Returns project names, IDs, statuses, due dates, and client names. By default only active projects are shown; set include_trashed to true to also list archived/trashed projects.',
      inputSchema: {
        include_trashed: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include archived/trashed projects in the results'),
      },
    },
    async ({ include_trashed = false }) => {
      try {
        const projects = await service.getProjects();
        const result = include_trashed ? projects : projects.filter((p) => !p.is_trashed);
        return {
          content: [{ type: 'text', text: formatProjectList(result) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching projects: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  mcpServer.registerTool(
    'get_project_tasks',
    {
      description:
        'Get all tasks for a specific project. Returns task names, IDs, assignees, due dates, and priorities, sorted by priority score.',
      inputSchema: {
        project_id: z
          .number()
          .int()
          .positive()
          .describe('The numeric ID of the ActiveCollab project'),
      },
    },
    async ({ project_id }) => {
      try {
        const tasks = await service.getTasks(project_id);
        const text = formatTaskList(tasks, `Project #${project_id}`);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching tasks for project ${project_id}: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
