import { registerToolOnlyFallback } from './registry';

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

/** Compact JSON for custom UI: i=items, i[].id, i[].n=name, i[].s=status, i[].d=date, e=error, p=nextPageToken */
function transformListTasks(parsed: unknown): string {
  const data = parsed as TaskListResponse;
  if (data?.error) return JSON.stringify({ e: data.error });
  const items = data?.items ?? [];
  if (items.length === 0) {
    return data?.nextPageToken ? JSON.stringify({ i: [], p: data.nextPageToken }) : JSON.stringify({ i: [] });
  }
  const i = items.map((t) => {
    const o: { id?: string; n?: string; s?: string; d?: string } = {};
    if (t?.id) o.id = t.id;
    const name = (t?.title ?? '').trim();
    if (name) o.n = name.slice(0, 200);
    if (t?.status) o.s = t.status;
    const date = formatDate(t?.due ?? t?.updated);
    if (date !== '-') o.d = date;
    return o;
  });
  const out: { i: typeof i; p?: string } = { i };
  if (data?.nextPageToken) out.p = data.nextPageToken;
  return JSON.stringify(out);
}

/** Compact JSON for custom UI: i=items, i[].id, i[].n=name, i[].d=date, e=error, p=nextPageToken */
function transformListTaskLists(parsed: unknown): string {
  const data = parsed as TaskListListResponse;
  if (data?.error) return JSON.stringify({ e: data.error });
  const items = data?.items ?? [];
  if (items.length === 0) {
    return data?.nextPageToken ? JSON.stringify({ i: [], p: data.nextPageToken }) : JSON.stringify({ i: [] });
  }
  const i = items.map((t) => {
    const o: { id?: string; n?: string; d?: string } = {};
    if (t?.id) o.id = t.id;
    const name = (t?.title ?? '').trim();
    if (name) o.n = name.slice(0, 200);
    const date = formatDate(t?.updated);
    if (date !== '-') o.d = date;
    return o;
  });
  const out: { i: typeof i; p?: string } = { i };
  if (data?.nextPageToken) out.p = data.nextPageToken;
  return JSON.stringify(out);
}

export function registerTaskTransforms(): void {
  registerToolOnlyFallback('tasks_listTasks', transformListTasks);
  registerToolOnlyFallback('tasks_listTaskLists', transformListTaskLists);
}
