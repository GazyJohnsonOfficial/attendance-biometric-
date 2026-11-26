import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, CalendarDays, MapPin, Radio, Search, X } from 'lucide-react';
import { useAllClasses, useAllSessions } from '@/lib/lecturerApi';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function parseLocalBoundary(dateStr: string, endOfDay: boolean): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const dt = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.getTime();
}

export function SessionsPageContent() {
  const sessions = useAllSessions();
  const classes = useAllClasses(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'scheduled' | 'closed' | 'finalized'>('all');
  const [classFilter, setClassFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const classOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const c of classes.data ?? []) {
      map.set(c.id, { id: c.id, label: `${c.courseCode} — ${c.courseTitle}` });
    }
    for (const s of sessions.data ?? []) {
      if (!map.has(s.classId)) {
        map.set(s.classId, { id: s.classId, label: `${s.courseCode} — ${s.courseTitle}` });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [classes.data, sessions.data]);

  if (sessions.isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="h-16 animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    );
  }

  if (sessions.isError) {
    return (
      <div className="surface p-6 text-sm text-muted-foreground">
        Couldn’t load sessions.{' '}
        <button className="underline text-primary cursor-pointer" onClick={() => sessions.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const allSessions = sessions.data ?? [];
  const fromTs = parseLocalBoundary(dateFrom, false);
  const toTs = parseLocalBoundary(dateTo, true);
  const q = search.trim().toLowerCase();

  const hasActiveFilters =
    statusFilter !== 'all' || classFilter !== 'all' || dateFrom !== '' || dateTo !== '' || q !== '';

  const clearFilters = () => {
    setSearch('');
    setClassFilter('all');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
  };

  const list = allSessions.filter((s) => {
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchClass = classFilter === 'all' || s.classId === classFilter;
    const matchSearch =
      !q ||
      `${s.courseCode} ${s.courseTitle} ${s.topic} ${s.venue}`.toLowerCase().includes(q);
    const startTs = new Date(s.startsAt).getTime();
    const matchFrom = fromTs === null || (!Number.isNaN(startTs) && startTs >= fromTs);
    const matchTo = toTs === null || (!Number.isNaN(startTs) && startTs <= toTs);
    return matchStatus && matchClass && matchSearch && matchFrom && matchTo;
  });

  return (
    <div className="space-y-5">
      <div className="surface p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_minmax(190px,1fr)_auto_auto]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="field pl-9 pr-8"
              placeholder="Search topic, course code, or venue…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search sessions by topic, class, or venue"
              data-testid="input-search-sessions"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search text"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                data-testid="button-clear-sessions-search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="field"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Filter by class"
            data-testid="select-filter-session-class"
          >
            <option value="all">All classes</option>
            {classOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 font-semibold">From</span>
            <input
              type="date"
              className="field !py-1.5"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Filter from date"
              data-testid="input-filter-session-date-from"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 font-semibold">To</span>
            <input
              type="date"
              className="field !py-1.5"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Filter to date"
              data-testid="input-filter-session-date-to"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
            {(['all', 'open', 'scheduled', 'closed', 'finalized'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`filter-session-${tab}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
            <span data-testid="text-sessions-count">
              {hasActiveFilters
                ? `Showing ${list.length} of ${allSessions.length} sessions`
                : `${allSessions.length} ${allSessions.length === 1 ? 'session' : 'sessions'}`}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="font-semibold text-primary underline hover:opacity-80 cursor-pointer"
                data-testid="button-clear-session-filters"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="surface px-5 py-12 text-center">
          <CalendarDays size={24} className="mx-auto text-primary" />
          <h3 className="mt-3 font-bold">No matching sessions</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'No sessions match your current search, class, date range, or status filters.'
              : 'Open any class to schedule or start a new attendance session.'}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="btn btn-outline mt-4"
              data-testid="button-empty-clear-session-filters"
            >
              Clear filters
            </button>
          ) : (
            <Link href="/classes" className="btn btn-primary mt-4">
              View classes <ArrowRight size={15} />
            </Link>
          )}
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="divide-y">
            {list.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/${s.id}`}
                className="flex flex-col gap-3 px-5 py-4 transition hover:bg-muted/35 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`row-all-session-${s.id}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      s.status === 'open' ? 'bg-primary/15 text-primary' : 'bg-secondary text-foreground'
                    }`}
                  >
                    <Radio size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">{s.courseCode}</span>
                      <span className="truncate font-semibold">{s.topic}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} /> {s.venue}
                      </span>
                      <span>{formatDate(s.startsAt)}</span>
                      <span>{s.codeMode === 'rotating' ? '45s rotating' : 'Static'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-5 pl-12 sm:pl-0 shrink-0">
                  <div className="text-right tabular-nums">
                    <div className="font-mono text-sm font-bold">
                      {s.checkedInCount} <span className="text-muted-foreground">/ {s.rosterCount}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">checked in</div>
                  </div>
                  <div className="w-20 text-right">
                    <span
                      className={`text-xs font-semibold capitalize ${
                        s.status === 'open'
                          ? 'text-emerald-700'
                          : s.status === 'closed'
                            ? 'text-amber-700'
                            : s.status === 'scheduled'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                      }`}
                    >
                      {s.status}
                    </span>
                    {s.reviewCount > 0 && (
                      <div className="text-[10px] font-semibold text-amber-800">{s.reviewCount} review</div>
                    )}
                  </div>
                  <ArrowRight size={15} className="text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

