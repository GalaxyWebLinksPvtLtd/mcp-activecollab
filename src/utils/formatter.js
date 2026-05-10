import { parseDueDate } from '../services/activecollab.service.js';

// ─── Priority helpers ────────────────────────────────────────────────────────

const PRIORITY_BASE = { low: 10, normal: 30, high: 70, urgent: 100 };
const PRIORITY_LABELS = { low: '🟢 Low', normal: '🔵 Normal', high: '🟠 High', urgent: '🔴 Urgent' };

export function priorityScore(task) {
  const base = PRIORITY_BASE[task.priority] ?? 30;
  const due = parseDueDate(task.due_on);
  let overdueBonus = 0;
  if (due && !task.is_completed) {
    const daysOverdue = Math.floor((Date.now() - due.getTime()) / 86_400_000);
    if (daysOverdue > 0) overdueBonus = Math.min(daysOverdue * 2, 30);
  }
  const depBonus = task.has_dependencies ? 10 : 0;
  return Math.min(base + overdueBonus + depBonus, 100);
}

export function overdueRisk(task) {
  const due = parseDueDate(task.due_on);
  if (!due || task.is_completed) return { daysOverdue: 0, riskLevel: 'none' };
  const daysOverdue = Math.floor((Date.now() - due.getTime()) / 86_400_000);
  let riskLevel = 'none';
  if (daysOverdue > 0) {
    if (daysOverdue <= 2) riskLevel = 'low';
    else if (daysOverdue <= 7) riskLevel = 'medium';
    else if (daysOverdue <= 14) riskLevel = 'high';
    else riskLevel = 'critical';
  }
  return { daysOverdue: Math.max(0, daysOverdue), riskLevel };
}

// ─── Date formatting ─────────────────────────────────────────────────────────

function formatDate(rawDue) {
  const d = parseDueDate(rawDue);
  if (!d) return 'No due date';
  return d.toISOString().slice(0, 10);
}

function relativeDate(rawDue) {
  const d = parseDueDate(rawDue);
  if (!d) return '';
  const days = Math.floor((d.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return ' *(due today)*';
  if (days === 1) return ' *(due tomorrow)*';
  if (days === -1) return ' *(1 day overdue)*';
  if (days < 0) return ` *(${Math.abs(days)} days overdue)*`;
  return ` *(in ${days} days)*`;
}

// ─── Project formatters ──────────────────────────────────────────────────────

export function formatProject(project) {
  const status = project.is_trashed ? 'Archived' : project.status_label ?? 'Active';
  const due = formatDate(project.due_on);
  const lines = [
    `## ${project.name} (ID: ${project.id})`,
    `- **Status:** ${status}`,
    `- **Due:** ${due}${relativeDate(project.due_on)}`,
  ];
  if (project.client_name) lines.push(`- **Client:** ${project.client_name}`);
  if (project.label) lines.push(`- **Label:** ${project.label}`);
  if (project.body) lines.push(`\n${project.body.slice(0, 300)}`);
  return lines.join('\n');
}

export function formatProjectList(projects) {
  if (!projects.length) return 'No projects found.';
  return projects.map(formatProject).join('\n\n---\n\n');
}

// ─── Task formatters ─────────────────────────────────────────────────────────

export function formatTask(task, opts = {}) {
  const { showScore = false } = opts;
  const due = formatDate(task.due_on);
  const { daysOverdue, riskLevel } = overdueRisk(task);
  const priority = PRIORITY_LABELS[task.priority] ?? '🔵 Normal';
  const status = task.is_completed ? '✅ Completed' : '⏳ Open';

  const lines = [
    `### ${task.name} (ID: ${task.id})`,
    `- **Status:** ${status}`,
    `- **Priority:** ${priority}`,
    `- **Due:** ${due}${relativeDate(task.due_on)}`,
  ];

  if (task.assignee_id) lines.push(`- **Assignee ID:** ${task.assignee_id}`);
  if (task.project_id) lines.push(`- **Project ID:** ${task.project_id}`);
  if (task.estimate) lines.push(`- **Estimate:** ${task.estimate}h`);
  if (showScore) lines.push(`- **Priority Score:** ${priorityScore(task)}/100`);
  if (riskLevel !== 'none' && riskLevel !== 'low') {
    lines.push(`- **Risk:** ${riskLevel.toUpperCase()} (${daysOverdue} days overdue)`);
  }
  if (task.body) lines.push(`\n${task.body.slice(0, 500)}`);

  return lines.join('\n');
}

export function formatTaskList(tasks, title = 'Tasks') {
  if (!tasks.length) return `No tasks found for: ${title}`;

  const sorted = [...tasks].sort((a, b) => priorityScore(b) - priorityScore(a));
  const header = `## ${title} (${tasks.length} task${tasks.length !== 1 ? 's' : ''})`;
  const items = sorted.map((t) => {
    const due = t.due_on ? ` | Due: ${formatDate(t.due_on)}${relativeDate(t.due_on)}` : '';
    const assignee = t.assignee_id ? ` | Assignee: ${t.assignee_id}` : '';
    const status = t.is_completed ? ' ✅' : '';
    return `- **[${t.id}]** ${t.name}${status}${due}${assignee}`;
  });

  return [header, ...items].join('\n');
}

export function formatTaskDetails(task) {
  return formatTask(task, { showScore: true });
}

// ─── User / workload formatters ───────────────────────────────────────────────

export function formatUser(user) {
  const parts = [`**${user.display_name ?? user.first_name + ' ' + user.last_name}** (ID: ${user.id})`];
  if (user.email) parts.push(`— ${user.email}`);
  if (user.role) parts.push(`— Role: ${user.role}`);
  return parts.join(' ');
}

export function formatUserList(users) {
  if (!users.length) return 'No users found.';
  return [`## Team Members (${users.length})`, ...users.map((u) => `- ${formatUser(u)}`)].join('\n');
}

export function formatUserWorkload(workloadEntries) {
  if (!workloadEntries.length) return 'No open tasks found.';

  const sections = workloadEntries.map((entry) => {
    const name = entry.user.display_name ?? `${entry.user.first_name} ${entry.user.last_name}`;
    const hours = entry.totalEstimatedHours > 0 ? ` | ${entry.totalEstimatedHours}h estimated` : '';
    const header = `### ${name} — ${entry.tasks.length} open task${entry.tasks.length !== 1 ? 's' : ''}${hours}`;
    const taskLines = entry.tasks
      .slice(0, 20)
      .map((t) => {
        const due = t.due_on ? ` (due: ${formatDate(t.due_on)}${relativeDate(t.due_on)})` : '';
        return `  - [${t.id}] ${t.name}${due}`;
      });
    return [header, ...taskLines].join('\n');
  });

  return [`## Team Workload Overview`, ...sections].join('\n\n');
}

// ─── Comment formatter ────────────────────────────────────────────────────────

export function formatComments(comments, taskId) {
  if (!comments.length) return `No comments found for task #${taskId}.`;

  const header = `## Comments on Task #${taskId} (${comments.length})`;
  const items = comments.map((c) => {
    const author = c.created_by_name ?? c.created_by_id ?? 'Unknown';
    const date = c.created_on ? new Date(c.created_on * 1000).toISOString().slice(0, 10) : '';
    const body = c.body ?? c.body_formatted ?? '';
    return `**${author}** ${date ? `(${date})` : ''}:\n${body.slice(0, 500)}`;
  });

  return [header, ...items].join('\n\n---\n\n');
}

// ─── Time record formatter ────────────────────────────────────────────────────

export function formatTimeRecords(records, projectId) {
  const title = projectId ? `Time Records — Project #${projectId}` : 'All Time Records';
  if (!records.length) return `No time records found. (${title})`;

  const total = records.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const header = `## ${title} (${records.length} records | Total: ${total.toFixed(2)}h)`;

  const rows = records.slice(0, 50).map((r) => {
    const date = r.record_date ? new Date(r.record_date * 1000).toISOString().slice(0, 10) : '—';
    const user = r.user_name ?? r.user_id ?? '—';
    const task = r.task_id ? `Task #${r.task_id}` : '—';
    const hours = (r.value ?? 0).toFixed(2);
    const summary = r.summary ?? '';
    return `| ${date} | ${user} | ${task} | ${hours}h | ${summary.slice(0, 60)} |`;
  });

  return [
    header,
    '',
    '| Date | User | Task | Hours | Summary |',
    '|------|------|------|-------|---------|',
    ...rows,
  ].join('\n');
}

// ─── Standup summary ──────────────────────────────────────────────────────────

export function formatStandupSummary({ overdueTasks, dueTodayTasks, timeRecords = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`# Daily Standup Summary — ${today}`, ''];

  // Overdue section
  lines.push(`## Overdue Tasks (${overdueTasks.length})`);
  if (!overdueTasks.length) {
    lines.push('No overdue tasks.');
  } else {
    const sorted = [...overdueTasks].sort((a, b) => {
      const ra = overdueRisk(a).daysOverdue;
      const rb = overdueRisk(b).daysOverdue;
      return rb - ra;
    });
    sorted.slice(0, 15).forEach((t) => {
      const { daysOverdue, riskLevel } = overdueRisk(t);
      const risk = riskLevel === 'critical' ? '🚨' : riskLevel === 'high' ? '🔴' : '🟠';
      lines.push(`- ${risk} [${t.id}] **${t.name}** — ${daysOverdue}d overdue`);
    });
    if (overdueTasks.length > 15) lines.push(`- *...and ${overdueTasks.length - 15} more*`);
  }

  lines.push('');

  // Due today section
  lines.push(`## Due Today (${dueTodayTasks.length})`);
  if (!dueTodayTasks.length) {
    lines.push('No tasks due today.');
  } else {
    dueTodayTasks.slice(0, 15).forEach((t) => {
      const assignee = t.assignee_id ? ` — Assignee: ${t.assignee_id}` : '';
      lines.push(`- 📅 [${t.id}] **${t.name}**${assignee}`);
    });
    if (dueTodayTasks.length > 15) lines.push(`- *...and ${dueTodayTasks.length - 15} more*`);
  }

  // Time logged today (optional)
  if (timeRecords.length) {
    const todayRecords = timeRecords.filter((r) => {
      const d = r.record_date ? new Date(r.record_date * 1000).toISOString().slice(0, 10) : '';
      return d === today;
    });
    if (todayRecords.length) {
      const totalHours = todayRecords.reduce((s, r) => s + (r.value ?? 0), 0).toFixed(2);
      lines.push('', `## Time Logged Today — ${totalHours}h`);
      todayRecords.forEach((r) => {
        lines.push(`- ${r.user_name ?? r.user_id}: ${(r.value ?? 0).toFixed(2)}h — ${r.summary ?? ''}`);
      });
    }
  }

  return lines.join('\n');
}

// ─── Blocker detection ────────────────────────────────────────────────────────

export function detectBlockers(tasks) {
  return tasks.filter(
    (t) =>
      !t.is_completed &&
      (t.is_locked || t.has_dependencies || (t.labels ?? []).some((l) => /block/i.test(l)))
  );
}

// ─── Markdown report ──────────────────────────────────────────────────────────

export function generateOverdueReport(tasks) {
  const overdue = tasks.filter((t) => {
    if (t.is_completed) return false;
    const due = parseDueDate(t.due_on);
    return due && due < new Date();
  });

  if (!overdue.length) return '# Overdue Task Report\n\nNo overdue tasks. 🎉';

  const grouped = {};
  for (const task of overdue) {
    const uid = String(task.assignee_id ?? 'unassigned');
    if (!grouped[uid]) grouped[uid] = [];
    grouped[uid].push(task);
  }

  const lines = [`# Overdue Task Report — ${new Date().toISOString().slice(0, 10)}`, ''];
  for (const [uid, utasks] of Object.entries(grouped)) {
    lines.push(`## Assignee: ${uid === 'unassigned' ? 'Unassigned' : `User #${uid}`}`);
    utasks
      .sort((a, b) => overdueRisk(b).daysOverdue - overdueRisk(a).daysOverdue)
      .forEach((t) => {
        const { daysOverdue, riskLevel } = overdueRisk(t);
        lines.push(`- [${riskLevel.toUpperCase()}] [${t.id}] **${t.name}** — ${daysOverdue} days overdue`);
      });
    lines.push('');
  }

  return lines.join('\n');
}
