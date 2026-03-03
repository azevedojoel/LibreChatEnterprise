import { Calendar, Clock, MapPin, Users, FileText } from 'lucide-react';

function formatEventDateTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dateStr} at ${timeStr}`;
  } catch {
    return iso;
  }
}

export type EventPreviewArgs = {
  summary?: string;
  subject?: string;
  description?: string;
  body?: string | { content?: string; contentType?: string };
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: string[] | Array<{ emailAddress?: { address?: string } }>;
  location?: string | { displayName?: string };
  [key: string]: unknown;
};

function normalizeAttendees(
  attendees: EventPreviewArgs['attendees'],
): string[] {
  if (!Array.isArray(attendees)) return [];
  return attendees.map((a) => {
    if (typeof a === 'string') return a;
    return (a as { emailAddress?: { address?: string } })?.emailAddress?.address ?? '';
  }).filter(Boolean);
}

export function EventPreviewDetails({ args }: { args: EventPreviewArgs }) {
  const title = args.summary ?? args.subject ?? 'Untitled event';
  const startDt = args.start?.dateTime ?? args.start?.date;
  const endDt = args.end?.dateTime ?? args.end?.date;
  const timeRange =
    startDt && endDt
      ? `${formatEventDateTime(startDt)} – ${formatEventDateTime(endDt).replace(/^.+ at /, '')}`
      : startDt
        ? formatEventDateTime(startDt)
        : null;
  const description =
    args.description ??
    (typeof args.body === 'string' ? args.body : args.body?.content);
  const location =
    typeof args.location === 'string' ? args.location : args.location?.displayName;
  const attendees = normalizeAttendees(args.attendees);
  const hasDetails = title || timeRange || description || attendees.length > 0 || location;

  if (!hasDetails) {
    return <p className="text-text-secondary">No details</p>;
  }

  return (
    <div className="space-y-3">
      {title && (
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Event</p>
            <p className="font-medium text-text-primary">{title}</p>
          </div>
        </div>
      )}
      {timeRange && (
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">When</p>
            <p className="text-text-primary">{timeRange}</p>
          </div>
        </div>
      )}
      {location && (
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Where</p>
            <p className="text-text-primary">{location}</p>
          </div>
        </div>
      )}
      {attendees.length > 0 && (
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Attendees
            </p>
            <p className="text-text-primary">{attendees.join(', ')}</p>
          </div>
        </div>
      )}
      {description && (
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Description
            </p>
            <p className="whitespace-pre-wrap break-words text-text-primary">
              {description.length > 300 ? `${description.slice(0, 300)}…` : description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
