import { formatUserList, formatUserWorkload } from '../utils/formatter.js';

export function register(mcpServer, service) {
  mcpServer.registerTool(
    'get_users',
    {
      description:
        'List all team members in ActiveCollab with their IDs, names, email addresses, and roles.',
    },
    async () => {
      try {
        const users = await service.getUsers();
        return { content: [{ type: 'text', text: formatUserList(users) }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching users: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  mcpServer.registerTool(
    'get_team_workload',
    {
      description:
        'Analyze team workload across all projects. Shows open task counts, estimated hours per team member, and tasks grouped by assignee. Useful for capacity planning and identifying overloaded members.',
    },
    async () => {
      try {
        const workload = await service.getTeamWorkload();
        return { content: [{ type: 'text', text: formatUserWorkload(workload) }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching team workload: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
