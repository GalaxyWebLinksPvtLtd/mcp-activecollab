import { z } from 'zod';
import { formatTimeRecords, formatStandupSummary } from '../utils/formatter.js';

export function register(mcpServer, service) {
  mcpServer.registerTool(
    'get_time_records',
    {
      description:
        'Get time tracking records. Optionally filter by project. Returns a table of logged hours per user, task, and date with totals.',
      inputSchema: {
        project_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional: filter time records to a specific project ID'),
      },
    },
    async ({ project_id } = {}) => {
      try {
        const records = await service.getTimeRecords(project_id);
        return { content: [{ type: 'text', text: formatTimeRecords(records, project_id) }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching time records: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  mcpServer.registerTool(
    'get_standup_summary',
    {
      description:
        'Generate a daily standup summary including overdue tasks, tasks due today, and time logged today. Ideal for morning standups and status updates.',
    },
    async () => {
      try {
        const [overdueTasks, dueTodayTasks, timeRecords] = await Promise.all([
          service.getOverdueTasks().catch(() => []),
          service.getTasksDueToday().catch(() => []),
          service.getTimeRecords().catch(() => []),
        ]);
        const text = formatStandupSummary({ overdueTasks, dueTodayTasks, timeRecords });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error generating standup summary: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
