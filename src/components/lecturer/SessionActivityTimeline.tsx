import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserX,
  X,
} from 'lucide-react';
import type { SessionActivityEvent } from '@/lib/lecturerApi';

interface SessionActivityTimelineProps {
  events: SessionActivityEvent[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  sessionTopic?: string;
  sessionVenue?: string;
}

type CategoryFilter = 'all' | 'checkin' | 'manual_override' | 'review' | 'lifecycle';
type ToneFilter = 'all' | 'flagged' | 'success';

const CATEGORY_TABS: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: 'All activity' },
  { key: 'checkin', label: 'Check-in events' },
  { key: 'manual_override', label: 'Manual overrides' },
  { key: 'review', label: 'Review queue updates' },
  { key: 'lifecycle', label: 'Session lifecycle' },
];

function formatEventTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function getCategoryConfig(event: SessionActivityEvent) {
  switch (event.category) {
    case 'checkin':
      if (event.tone === 'warning' || event.status === 'needs_review' || event.flags.length > 0) {
        return {
          label: 'Check-in (Flagged)',
          categoryName: 'Check-in',
          Icon: AlertTriangle,
          nodeColor: 'border-amber-300 bg-amber-50 text-amber-800',
          badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
        };
      }
      return {
        label: 'Check-in (Verified)',
        categoryName: 'Check-in',
        Icon: UserCheck,
        nodeColor: 'border-emerald-300 bg-emerald-50 text-emerald-700',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };

    case 'manual_override':
      if (event.status === 'absent' || event.tone === 'danger') {
        return {
          label: 'Manual Override (Absent)',
          categoryName: 'Manual override',
          Icon: UserX,
          nodeColor: 'border-rose-300 bg-rose-50 text-rose-700',
          badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
        };
      }
      return {
        label: 'Manual Override',
        categoryName: 'Manual override',
        Icon: UserCog,
        nodeColor: 'border-sky-300 bg-sky-50 text-sky-700',
        badgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
      };

    case 'review':
      if (event.status === 'absent' || event.tone === 'danger') {
        return {
          label: 'Review Decision (Absent)',
          categoryName: 'Review',
          Icon: ShieldAlert,
          nodeColor: 'border-rose-300 bg-rose-50 text-rose-700',
          badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
        };
      }
      if (event.status === 'needs_review' || event.tone === 'warning') {
        return {
          label: 'Review Decision',
          categoryName: 'Review',
          Icon: ShieldAlert,
          nodeColor: 'border-amber-300 bg-amber-50 text-amber-800',
          badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
        };
      }
      return {
        label: 'Review Decision (Approved)',
        categoryName: 'Review',
        Icon: ShieldCheck,
        nodeColor: 'border-purple-300 bg-purple-50 text-purple-700',
        badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
      };

    case 'lifecycle':
    default:
      if (event.title.toLowerCase().includes('reopen')) {
        return {
          label: 'Session Reopened',
          categoryName: 'Lifecycle',
          Icon: RotateCcw,
          nodeColor: 'border-amber-300 bg-amber-50 text-amber-800',
          badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
        };
      }
      if (event.title.toLowerCase().includes('extend')) {
        return {
          label: 'Window Extended',
          categoryName: 'Lifecycle',
          Icon: Clock3,
          nodeColor: 'border-slate-300 bg-slate-100 text-slate-700',
          badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
        };
      }
      if (event.title.toLowerCase().includes('finaliz')) {
        return {
          label: 'Session Finalized',
          categoryName: 'Lifecycle',
          Icon: CheckCircle2,
          nodeColor: 'border-primary/40 bg-primary/10 text-primary',
          badgeColor: 'bg-primary/10 text-primary border-primary/20',
        };
      }
      return {
        label: 'Session Event',
        categoryName: 'Lifecycle',
        Icon: Radio,
        nodeColor: 'border-border bg-muted text-muted-foreground',
        badgeColor: 'bg-muted text-muted-foreground border-border',
      };
  }
}

function exportActivityCsv(events: SessionActivityEvent[], sessionTopic?: string): void {
  const escapeCsv = (val: unknown) => `"${String(val ?? '').replaceAll('"', '""')}"`;
  const headers = [
    'Timestamp (ISO)',
    'Category',
    'Action / Title',
    'Student Name',
    'Index Number',
    'Status',
    'Previous Status',
    'Face Match Score',
    'Distance (m)',
    'Flags',
    'Description / Justification',
  ];

  const rows = events.map((ev) => [
    ev.occurredAt,
    ev.category,
    ev.title,
    ev.studentName ?? '',
    ev.indexNumber ?? '',
    ev.status ?? '',
    ev.previousStatus ?? '',
    ev.faceScore !== null ? `${Math.round(Number(ev.faceScore) * 100)}%` : '',
    ev.distanceM !== null ? String(ev.distanceM) : '',
    ev.flags.join('; '),
    ev.description,
  ]);

  const csv = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = (sessionTopic || 'session').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  a.href = url;
  a.download = `${safeTitle}-attendance-activity.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SessionActivityTimeline({
  events,
  isLoading,
  isError,
  onRetry,
  sessionTopic,
  sessionVenue,
}: SessionActivityTimelineProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [toneFilter, setToneFilter] = useState<ToneFilter>('all');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Breakdown metrics
  const counts = useMemo(() => {
    const summary = {
      all: events.length,
      checkin: 0,
      manual_override: 0,
      review: 0,
      lifecycle: 0,
      flagged: 0,
      verifiedCheckins: 0,
    };
    for (const ev of events) {
      if (ev.category in summary) {
        summary[ev.category as keyof typeof summary] += 1;
      }
      if (ev.tone === 'warning' || ev.status === 'needs_review' || ev.flags.length > 0) {
        summary.flagged += 1;
      }
      if (ev.category === 'checkin' && ev.tone === 'success') {
        summary.verifiedCheckins += 1;
      }
    }
    return summary;
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = events.filter((ev) => {
      const matchCat = categoryFilter === 'all' || ev.category === categoryFilter;
      const isFlagged = ev.tone === 'warning' || ev.status === 'needs_review' || ev.flags.length > 0;
      const matchTone =
        toneFilter === 'all' ||
        (toneFilter === 'flagged' && isFlagged) ||
        (toneFilter === 'success' && !isFlagged && ev.tone === 'success');
      const matchQuery =
        !q ||
        `${ev.title} ${ev.description} ${ev.studentName ?? ''} ${ev.indexNumber ?? ''} ${ev.flags.join(' ')} ${ev.status ?? ''}`
          .toLowerCase()
          .includes(q);
      return matchCat && matchTone && matchQuery;
    });

    return result.sort((a, b) => {
      const timeA = new Date(a.occurredAt).getTime();
      const timeB = new Date(b.occurredAt).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [events, categoryFilter, toneFilter, search, sortOrder]);

  return (
    <section className="surface overflow-hidden" data-testid="section-session-activity" id="session-activity">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <span>Session audit trail &amp; live events</span>
            {sessionVenue && <span>· {sessionVenue}</span>}
          </div>
          <h2 className="mt-1 flex items-center gap-2 font-serif text-xl font-extrabold text-foreground" data-testid="heading-session-activity">
            <Activity size={18} className="text-primary" />
            Session Activity
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chronological audit log of all check-in events, manual overrides, review queue updates, and session lifecycle events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportActivityCsv(filteredEvents, sessionTopic)}
            disabled={!filteredEvents.length}
            className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            data-testid="button-export-activity-csv"
            title="Download activity events as CSV"
          >
            <Download size={13} /> Export Activity CSV
          </button>
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading}
            className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            data-testid="button-refresh-activity"
            title="Refresh activity feed"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground" data-testid="text-activity-count">
            {filteredEvents.length} of {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 divide-x divide-y border-b bg-muted/20 sm:grid-cols-4 sm:divide-y-0">
        <div className="p-3.5 text-center sm:text-left sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Events</div>
          <div className="mt-1 font-serif text-2xl font-bold tabular-nums text-foreground">{counts.all}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Logged actions</div>
        </div>
        <div className="p-3.5 text-center sm:text-left sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">Check-in Events</div>
          <div className="mt-1 font-serif text-2xl font-bold tabular-nums text-emerald-700">{counts.checkin}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {counts.verifiedCheckins} clean · {counts.checkin - counts.verifiedCheckins} flagged
          </div>
        </div>
        <div className="p-3.5 text-center sm:text-left sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800">Manual Overrides</div>
          <div className="mt-1 font-serif text-2xl font-bold tabular-nums text-sky-700">{counts.manual_override}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Lecturer justifications logged</div>
        </div>
        <div className="p-3.5 text-center sm:text-left sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-800">Review Queue Updates</div>
          <div className="mt-1 font-serif text-2xl font-bold tabular-nums text-purple-700">{counts.review}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Flags resolved by lecturer</div>
        </div>
      </div>

      {/* Filter and search toolbar */}
      <div className="flex flex-col gap-3 border-b bg-muted/10 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
            {CATEGORY_TABS.map((tab) => {
              const active = categoryFilter === tab.key;
              const countVal = counts[tab.key as keyof typeof counts] ?? 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setCategoryFilter(tab.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`filter-activity-${tab.key}`}
                >
                  {tab.label} <span className="ml-1 opacity-75 font-mono text-[11px]">({countVal})</span>
                </button>
              );
            })}
          </div>

          {counts.flagged > 0 && (
            <button
              type="button"
              onClick={() => setToneFilter((prev) => (prev === 'flagged' ? 'all' : 'flagged'))}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                toneFilter === 'flagged'
                  ? 'border-amber-400 bg-amber-100 text-amber-900 font-bold'
                  : 'bg-card text-amber-800 hover:bg-amber-50 border-amber-200'
              }`}
              data-testid="filter-activity-flagged"
            >
              <AlertTriangle size={12} className="inline mr-1" />
              Flagged only ({counts.flagged})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64 lg:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="field !py-1.5 pl-8 pr-8 !text-xs"
              placeholder="Search by student, index, note, or flag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter attendance activity"
              data-testid="input-search-session-activity"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear activity filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                data-testid="button-clear-activity-search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            data-testid="button-toggle-sort-order"
            title={`Current order: ${sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}`}
          >
            <ArrowDownUp size={13} />
            {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>
      </div>

      {/* Timeline Content */}
      {isLoading ? (
        <div className="space-y-4 p-6">
          {[1, 2, 3].map((k) => (
            <div key={k} className="flex gap-4 animate-pulse">
              <div className="h-9 w-9 rounded-xl bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-muted" />
                <div className="h-3 w-72 rounded bg-muted/70" />
                <div className="h-10 rounded-lg bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          <AlertTriangle size={24} className="mx-auto text-amber-600 mb-2" />
          <p className="font-semibold text-foreground">Couldn’t load session activity</p>
          <p className="mt-1 text-xs text-muted-foreground">Verify your connection or server status and try again.</p>
          <button
            type="button"
            onClick={onRetry}
            className="btn btn-outline mt-3 !px-3 !py-1.5 !text-xs"
            data-testid="button-retry-activity"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Clock3 size={26} className="mx-auto text-muted-foreground/80" />
          <h3 className="mt-3 text-sm font-bold text-foreground">No activity events found</h3>
          <p className="mt-1 max-w-md mx-auto text-xs text-muted-foreground">
            {search || categoryFilter !== 'all' || toneFilter !== 'all'
              ? 'No events match the active search or category filters.'
              : 'As students scan the rotating QR code or typed code, or when manual marks and review decisions are saved, events stream here in real time.'}
          </p>
          {(categoryFilter !== 'all' || toneFilter !== 'all' || search) && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setToneFilter('all');
                setSearch('');
              }}
              className="btn btn-outline mt-4 !px-3 !py-1.5 !text-xs"
              data-testid="button-reset-activity-filters"
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : (
        <div className="p-5 sm:p-6" data-testid="list-session-activity">
          <ol className="relative border-l border-border/80 ml-4 sm:ml-5 space-y-6">
            {filteredEvents.map((ev) => {
              const { label, categoryName, Icon, nodeColor, badgeColor } = getCategoryConfig(ev);
              const isManual = ev.category === 'manual_override';
              const isReview = ev.category === 'review';
              const isCheckin = ev.category === 'checkin';
              const hasFlags = ev.flags.length > 0;

              return (
                <li
                  key={ev.id}
                  className="group relative ml-6 sm:ml-8"
                  data-testid={`activity-item-${ev.id}`}
                >
                  {/* Timeline Node Icon */}
                  <span
                    className={`absolute -left-[37px] sm:-left-[45px] top-0 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border shadow-2xs transition-transform group-hover:scale-105 ${nodeColor}`}
                    aria-hidden="true"
                  >
                    <Icon size={16} />
                  </span>

                  {/* Card Container */}
                  <div className="rounded-xl border bg-card p-4 shadow-2xs transition-colors hover:border-primary/40 sm:p-5">
                    {/* Header Row: Title, Category Badge, Status Transition, and Timestamps */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{ev.title}</span>
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${badgeColor}`}>
                          {categoryName}
                        </span>

                        {ev.previousStatus && ev.status && (
                          <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-mono text-[11px] text-foreground">
                            <span className="text-muted-foreground">{ev.previousStatus.replace('_', ' ')}</span>
                            <span>→</span>
                            <span className="font-bold">{ev.status.replace('_', ' ')}</span>
                          </span>
                        )}

                        {!ev.previousStatus && ev.status && (
                          <span
                            className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              ev.status === 'present'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ev.status === 'needs_review'
                                  ? 'bg-amber-100 text-amber-900'
                                  : ev.status === 'absent'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-secondary text-muted-foreground'
                            }`}
                          >
                            {ev.status.replace('_', ' ')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                        <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-foreground font-medium">
                          {getRelativeTime(ev.occurredAt)}
                        </span>
                        <time dateTime={ev.occurredAt} className="text-[11px]">
                          {formatEventTime(ev.occurredAt)}
                        </time>
                      </div>
                    </div>

                    {/* Student Identity Row (if applicable) */}
                    {(ev.studentName || ev.indexNumber) && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-2.5 py-1 text-xs">
                          <span className="font-semibold text-foreground">{ev.studentName ?? 'Roster Student'}</span>
                          {ev.indexNumber && (
                            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground border">
                              {ev.indexNumber}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Description or Reason Callout Box */}
                    {isManual ? (
                      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-950">
                        <div className="font-semibold text-[11px] uppercase tracking-wider text-sky-800 flex items-center gap-1.5 mb-1">
                          <Edit3 size={12} /> Mandatory Manual Justification
                        </div>
                        <p className="leading-relaxed font-sans">{ev.description}</p>
                      </div>
                    ) : isReview ? (
                      <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/70 p-3 text-xs text-purple-950">
                        <div className="font-semibold text-[11px] uppercase tracking-wider text-purple-800 flex items-center gap-1.5 mb-1">
                          <ShieldCheck size={12} /> Lecturer Review Note
                        </div>
                        <p className="leading-relaxed font-sans">{ev.description}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{ev.description}</p>
                    )}

                    {/* Telemetry and Security Flags Strip */}
                    {(hasFlags || ev.faceScore !== null || ev.distanceM !== null) && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
                        {ev.faceScore !== null && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                              Number(ev.faceScore) >= 0.8
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                          >
                            <ShieldCheck size={11} /> Face match {Math.round(Number(ev.faceScore) * 100)}%
                          </span>
                        )}

                        {ev.distanceM !== null && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-background px-2 py-0.5 font-mono text-[10px] text-foreground font-semibold">
                            <span>GPS:</span> {ev.distanceM} m from pin
                          </span>
                        )}

                        {ev.flags.map((flag) => (
                          <span
                            key={flag}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100/90 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-950"
                          >
                            <AlertTriangle size={11} className="text-amber-800" />
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
