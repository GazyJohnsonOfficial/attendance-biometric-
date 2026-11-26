import { useMemo } from 'react';
import type { AttendanceRecord, SessionItem } from '@workspace/api-client-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

interface SessionProgressChartProps {
  session: SessionItem;
  records: AttendanceRecord[];
}

interface TrendBucket {
  label: string;
  rangeLabel: string;
  cumulative: number;
  newCheckIns: number;
}

function formatTimeShort(ts: number): string {
  return new Intl.DateTimeFormat('en-GH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

export function SessionProgressChart({ session, records }: SessionProgressChartProps) {
  const { buckets, checkedInTotal, progressPct, onTimeCount } = useMemo(() => {
    const validCheckIns = records
      .filter(
        (r) =>
          Boolean(r.markedAt) &&
          (r.status === 'present' || r.status === 'needs_review' || r.status === 'excused'),
      )
      .map((r) => ({
        ts: new Date(r.markedAt!).getTime(),
        isLate: r.flags.includes('LATE'),
      }))
      .filter((item) => !Number.isNaN(item.ts))
      .sort((a, b) => a.ts - b.ts);

    const total = validCheckIns.length;
    const pct =
      session.rosterCount > 0 ? Math.min(100, Math.round((total / session.rosterCount) * 100)) : 0;
    const onTime = validCheckIns.filter((item) => !item.isLate).length;

    if (total === 0) {
      return {
        buckets: [] as TrendBucket[],
        checkedInTotal: 0,
        progressPct: pct,
        onTimeCount: 0,
      };
    }

    const sessionStartMs = new Date(session.startsAt).getTime();
    const sessionEndMs = new Date(session.endsAt).getTime();
    const earliestMarkMs = validCheckIns[0].ts;
    const latestMarkMs = validCheckIns[validCheckIns.length - 1].ts;

    const rangeStart = Number.isNaN(sessionStartMs)
      ? earliestMarkMs
      : Math.min(sessionStartMs, earliestMarkMs);
    const rawEnd = Number.isNaN(sessionEndMs)
      ? latestMarkMs
      : Math.max(sessionEndMs, latestMarkMs);
    const rangeEnd = Math.max(rawEnd, rangeStart + 10 * 60_000);

    const bucketCount = 8;
    const stepMs = Math.max(60_000, Math.ceil((rangeEnd - rangeStart) / bucketCount));

    let runningTotal = 0;
    const result: TrendBucket[] = [];

    for (let i = 0; i < bucketCount; i += 1) {
      const bStart = rangeStart + i * stepMs;
      const bEnd = i === bucketCount - 1 ? Math.max(rangeEnd, bStart + stepMs) : rangeStart + (i + 1) * stepMs;

      const countInBucket = validCheckIns.filter((c) =>
        i === bucketCount - 1 ? c.ts >= bStart && c.ts <= bEnd : c.ts >= bStart && c.ts < bEnd,
      ).length;

      runningTotal += countInBucket;

      result.push({
        label: formatTimeShort(bEnd),
        rangeLabel: `${formatTimeShort(bStart)} – ${formatTimeShort(bEnd)}`,
        cumulative: runningTotal,
        newCheckIns: countInBucket,
      });
    }

    return {
      buckets: result,
      checkedInTotal: total,
      progressPct: pct,
      onTimeCount: onTime,
    };
  }, [records, session.endsAt, session.rosterCount, session.startsAt]);

  const yMax = Math.max(session.rosterCount, checkedInTotal, 1);

  return (
    <section className="surface p-5" data-testid="section-session-progress-chart">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Session velocity</div>
          <h2 className="mt-1 flex items-center gap-2 font-bold">
            <TrendingUp size={17} className="text-primary" />
            Attendance progress over time
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
          <div>
            <span className="text-muted-foreground">Completion: </span>
            <span className="font-mono font-bold text-foreground" data-testid="text-session-progress-pct">
              {progressPct}%
            </span>
            <span className="text-muted-foreground"> ({checkedInTotal}/{session.rosterCount})</span>
          </div>
          {checkedInTotal > 0 && (
            <div className="hidden sm:block text-muted-foreground">
              On-time: <span className="font-mono font-semibold text-foreground">{onTimeCount}</span>
            </div>
          )}
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-xs text-muted-foreground">
          <TrendingUp size={18} className="shrink-0 text-primary" />
          <span>
            No check-ins recorded yet. Cumulative attendance and arrival spikes across the session window will plot here automatically.
          </span>
        </div>
      ) : (
        <>
          <div className="mt-4 h-56 w-full" data-testid="chart-session-attendance-trend">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={buckets} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="sessionProgressFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2c7a6b" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2c7a6b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2dfd7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, yMax]}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.rangeLabel
                      ? `Window: ${payload[0].payload.rangeLabel}`
                      : ''
                  }
                  formatter={(value, name) => [
                    `${value} ${Number(value) === 1 ? 'student' : 'students'}`,
                    name === 'cumulative' ? 'Total checked in' : 'Checked in during window',
                  ]}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #e2dfd7',
                    fontSize: '12px',
                  }}
                />
                {session.rosterCount > 0 && (
                  <ReferenceLine
                    y={session.rosterCount}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                    label={{
                      value: `Roster (${session.rosterCount})`,
                      position: 'insideTopRight',
                      fill: '#b45309',
                      fontSize: 10,
                    }}
                  />
                )}
                <Bar
                  dataKey="newCheckIns"
                  fill="#94a3b8"
                  fillOpacity={0.45}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#2c7a6b"
                  strokeWidth={2.5}
                  fill="url(#sessionProgressFill)"
                  dot={{ r: 3, fill: '#2c7a6b', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#2c7a6b' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#2c7a6b]" />
              Cumulative checked in
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-400/60" />
              Arrivals per time window
            </span>
            {session.rosterCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-600" />
                Roster target ({session.rosterCount})
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
