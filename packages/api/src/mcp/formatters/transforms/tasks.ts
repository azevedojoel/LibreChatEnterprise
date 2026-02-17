import { registerTransform, registerToolOnlyFallback } from './registry';

type TaskItem = {
  id?: string;
  title?: string;
  status?: string;
  due?: string;
  updated?: string;
  [key: string]: unknown;
};

type TaskListResponse = {
  items?: TaskItem[];
  nextPageToken?: string;
  error?: string;
};

type TaskListListItem = {
  id?: string;
  title?: string;
  updated?: string;
  [key: string]: unknown;
};

type TaskListListResponse = {
  items?: TaskListListItem[];
  nextPageToken?: string;
  error?: string;
};

function formatDate(val: unknown): string {
  if (typeof val !== 'string') return '-';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? val : d.toISOString().split('T')[0];
}

function transformListTasks(parsed: unknown): string {
  const data = parsed as TaskListResponse;
  if (data?.error) {
    return data.error;
  }
  const items = data?.items ?? [];
  if (items.length === 0) {
    return data?.nextPageToken ? `(empty)\nnextPageToken: ${data.nextPageToken}` : '(empty)';
  }
  const rows = items.map((t) => {
    const id = t?.id ?? '-';
    const name = (t?.title ?? '').replace(/\|/g, '\\|').trim() || '-';
    const status = t?.status ?? '-';
    const date = formatDate(t?.due ?? t?.updated);
    return `${id} | ${name} | ${status} | ${date}`;
  });
  const header = 'id | name | status | date';
  const sep = '---|------|--------|----------';
  const body = [header, sep, ...rows].join('\n');
  return data?.nextPageToken ? `${body}\nnextPageToken: ${data.nextPageToken}` : body;
}

function transformListTaskLists(parsed: unknown): string {
  const data = parsed as TaskListListResponse;
  if (data?.error) {
    return data.error;
  }
  const items = data?.items ?? [];
  if (items.length === 0) {
    return data?.nextPageToken ? `(empty)\nnextPageToken: ${data.nextPageToken}` : '(empty)';
  }
  const rows = items.map((t) => {
    const id = t?.id ?? '-';
    const name = (t?.title ?? '').replace(/\|/g, '\\|').trim() || '-';
    const date = formatDate(t?.updated);
    return `${id} | ${name} | ${date}`;
  });
  const header = 'id | name | date';
  const sep = '---|------|----------';
  const body = [header, sep, ...rows].join('\n');
  return data?.nextPageToken ? `${body}\nnextPageToken: ${data.nextPageToken}` : body;
}

const GOOGLE_SERVER_ALIASES = [
  'Google',
  'google',
  'google-workspace',
  'Google Workspace',
  'Google_Workspace',
];

export function registerTaskTransforms(): void {
  for (const server of GOOGLE_SERVER_ALIASES) {
    registerTransform(server, 'tasks.listTasks', transformListTasks);
    registerTransform(server, 'tasks.listTaskLists', transformListTaskLists);
  }
  registerToolOnlyFallback('tasks.listTasks', transformListTasks);
  registerToolOnlyFallback('tasks.listTaskLists', transformListTaskLists);
}
