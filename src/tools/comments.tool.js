import { z } from 'zod';
import { formatComments } from '../utils/formatter.js';

export function register(mcpServer, service) {
  mcpServer.registerTool(
    'get_task_comments',
    {
      description:
        'Get all comments on a specific task. Returns comments with author names, dates, and content. Useful for understanding task history and discussions.',
      inputSchema: {
        project_id: z
          .number()
          .int()
          .positive()
          .describe('The numeric ID of the project containing the task'),
        task_id: z
          .number()
          .int()
          .positive()
          .describe('The numeric ID of the task to retrieve comments for'),
      },
    },
    async ({ project_id, task_id }) => {
      try {
        const comments = await service.getComments(project_id, task_id);
        return { content: [{ type: 'text', text: formatComments(comments, task_id) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching comments for task ${task_id} in project ${project_id}: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
