import { useState } from 'react';
import type { ClassItem } from '@workspace/api-client-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, CheckCircle2, Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { downloadApiFile, useClassReportThreshold } from '@/lib/lecturerApi';
import { exportClassReportPdf } from '@/lib/reportPdf';
import { useToast } from '@/hooks/use-toast';

export function ReportCardEnhanced({
  item,
  threshold,
}: {
  item: ClassItem;
  threshold: number;
}) {
  const { toast } = useToast();
  const report = useClassReportThreshold(item.id, threshold);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);

  if (report.isLoading) {
    return (
      <section className="surface p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-36 animate-pulse rounded bg-muted/70" />
      </section>
    );
  }

  if (report.isError) {
    return (
      <section className="surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">{item.courseCode}</div>
            <h2 className="mt-1 font-bold">{item.courseTitle}</h2>
          </div>
          <button
            className="btn btn-outline !px-3 !py-2"
            onClick={() => report.refetch()}
            data-testid={`button-retry-report-${item.id}`}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">This class report could not be loaded.</p>
      </section>
    );
  }

  const data = report.data;
  const safeName = item.courseCode.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

  const triggerApiExport = async (format: 'xlsx' | 'csv') => {
    try {
      setExporting(format);
      await downloadApiFile(
        `/api/classes/${item.id}/reports/export?format=${format}&threshold=${threshold}`,
        `${safeName}-attendance-report.${format}`,
      );
    } catch {
      toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <div className="eyebrow">
            {item.courseCode} · {item.programme}
          </div>
          <h2 className="mt-1 font-bold">{item.courseTitle}</h2>
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
            {data?.totalSessions ?? 0} finalized sessions · threshold {threshold}%
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {Boolean(data?.students.length) && (
            <>
              <button
                type="button"
                className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                onClick={() => data && exportClassReportPdf(item, data)}
                data-testid={`button-export-pdf-${item.id}`}
              >
                <FileText size={13} /> PDF
              </button>
              <button
                type="button"
                className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                disabled={exporting === 'xlsx'}
                onClick={() => void triggerApiExport('xlsx')}
                data-testid={`button-export-xlsx-${item.id}`}
              >
                <FileSpreadsheet size={13} /> {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
              </button>
              <button
                type="button"
                className="btn btn-outline !px-2.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                disabled={exporting === 'csv'}
                onClick={() => void triggerApiExport('csv')}
                data-testid={`button-export-report-${item.id}`}
              >
                <Download size={13} /> CSV
              </button>
            </>
          )}
        </div>
      </div>

      {!data?.students.length || data.totalSessions === 0 ? (
        <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <BarChart3 size={18} className="shrink-0 text-primary" />
          <span>Attendance trends and threshold alerts appear after at least one session is finalized.</span>
        </div>
      ) : (
        <>
          {Boolean(data.sessionTrend?.length) && (
            <div className="border-b px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow">Session attendance trend</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  Dashed line: {threshold}% minimum threshold
                </span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.sessionTrend} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2dfd7" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip
                      formatter={(val) => [`${val}%`, 'Attendance']}
                      labelFormatter={(label) => `Session: ${label}`}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #e2dfd7',
                        fontSize: '12px',
                      }}
                    />
                    <ReferenceLine y={threshold} stroke="#d97706" strokeDasharray="4 4" />
                    <Bar dataKey="percentage" fill="#2c7a6b" radius={[5, 5, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <div className="eyebrow mb-3">Students below {threshold}%</div>
              {data.belowThreshold.length ? (
                <div className="space-y-2">
                  {data.belowThreshold.slice(0, 6).map((st) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg bg-amber-50/80 px-3 py-2"
                      key={st.indexNumber}
                      data-testid={`report-low-attendance-${st.indexNumber}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold">{st.fullName}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{st.indexNumber}</div>
                      </div>
                      <span className="font-mono text-xs font-bold text-amber-800 tabular-nums">{st.percentage}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                  <CheckCircle2 size={15} className="mb-1 text-primary" /> All students meet the {threshold}% threshold.
                </div>
              )}
            </div>

            <div>
              <div className="eyebrow mb-3">Class roster overview</div>
              <div className="max-h-56 space-y-2 overflow-auto pr-1">
                {data.students.map((st) => (
                  <div className="flex items-center justify-between gap-3 border-b pb-2" key={st.indexNumber}>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{st.fullName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {st.attended} of {st.total} sessions
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
                        <div
                          className={`h-full rounded-full ${st.percentage < threshold ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(100, st.percentage)}%` }}
                        />
                      </div>
                      <span className="w-9 text-right font-mono text-xs tabular-nums">{st.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t bg-muted/25 px-5 py-3 text-[11px] text-muted-foreground">
            Low attendance is a prompt for lecturer follow-up, not an automated decision.
          </div>
        </>
      )}
    </section>
  );
}

export function ReportsControls({
  threshold,
  onThresholdChange,
}: {
  threshold: number;
  onThresholdChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs">
      <span className="font-semibold text-muted-foreground whitespace-nowrap">Alert threshold:</span>
      {[70, 75, 80].map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => onThresholdChange(val)}
          className={`rounded-md px-2.5 py-1 font-mono text-xs font-bold transition cursor-pointer ${
            threshold === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
          }`}
          data-testid={`button-threshold-${val}`}
        >
          {val}%
        </button>
      ))}
    </div>
  );
}
