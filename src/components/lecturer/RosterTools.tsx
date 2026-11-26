import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAttendanceOverviewQueryKey,
  getGetClassQueryKey,
  getGetClassRosterQueryKey,
  useCommitRoster,
  usePreviewRoster,
} from '@workspace/api-client-react';
import type { RosterItem, RosterPreview, RosterRowInput } from '@workspace/api-client-react';
import { AlertTriangle, Check, Download, LoaderCircle, RefreshCw, Trash2, UserPlus, X } from 'lucide-react';
import { useAddStudent, useRemoveStudent, useUpdateStudent } from '@/lib/lecturerApi';
import { useToast } from '@/hooks/use-toast';

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const cell = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }> };
    if (typeof cell.text === 'string') return cell.text.trim();
    if (cell.result != null) return String(cell.result).trim();
    if (Array.isArray(cell.richText)) return cell.richText.map(part => part.text ?? '').join('').trim();
  }
  return String(value).trim();
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (character === '"' && quoted && text[i + 1] === '"') {
      field += '"';
      i += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if (character === '\n' && !quoted) {
      row.push(field.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (quoted) throw new Error('A quoted CSV value is missing its closing quote.');
  row.push(field.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

function rowsFromMatrix(matrix: string[][]): RosterRowInput[] {
  const values = matrix.map(row => row.map(value => value.trim()));
  const headers = (values[0] ?? []).map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const findHeader = (names: string[]) => headers.findIndex(value => names.includes(value));
  const nameColumn = findHeader(['fullname', 'studentname', 'name']);
  const indexColumn = findHeader(['indexnumber', 'studentindex', 'indexno', 'index']);
  const emailColumn = findHeader(['email', 'emailaddress', 'studentemail']);
  const phoneColumn = findHeader(['phone', 'phonenumber', 'telephone', 'mobile']);
  const hasHeader = nameColumn >= 0 && indexColumn >= 0 && emailColumn >= 0;
  const columns = hasHeader
    ? { name: nameColumn, index: indexColumn, email: emailColumn, phone: phoneColumn }
    : { name: 0, index: 1, email: 2, phone: 3 };
  const rows = values.slice(hasHeader ? 1 : 0);
  return rows
    .filter(row => row.some(value => value.length > 0))
    .map(row => ({
      fullName: row[columns.name] ?? '',
      indexNumber: row[columns.index] ?? '',
      email: row[columns.email] ?? '',
      phone: columns.phone >= 0 ? row[columns.phone] || null : row[3] || null,
    }));
}

function downloadRosterTemplate(): void {
  const contents = 'full_name,index_number,phone,email\nAma Boateng,5231001,0241234567,ama.boateng@example.com\n';
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'attendance-roster-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function RosterImportModal({
  classId,
  onClose,
}: {
  classId: string;
  onClose: () => void;
}) {
  const preview = usePreviewRoster();
  const commit = useCommitRoster();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [rosterText, setRosterText] = useState('');
  const [rosterFile, setRosterFile] = useState('');
  const [importError, setImportError] = useState('');
  const [editableRows, setEditableRows] = useState<RosterRowInput[]>([]);
  const [previewData, setPreviewData] = useState<RosterPreview | null>(null);

  const runPreview = (rows: RosterRowInput[]) => {
    if (!rows.length) {
      setImportError('No roster rows were found. Add at least one student.');
      return;
    }
    setImportError('');
    setEditableRows(rows);
    preview.mutate(
      { classId, data: { rows } },
      {
        onSuccess: (res) => {
          setPreviewData(res);
          setEditableRows(
            res.rows.map((r) => ({
              fullName: r.fullName,
              indexNumber: r.indexNumber,
              email: r.email,
              phone: r.phone ?? null,
            })),
          );
        },
      },
    );
  };

  const handleFile = async (file: File) => {
    try {
      let matrix: string[][];
      if (file.name.toLowerCase().endsWith('.csv')) {
        matrix = parseCsvMatrix(await file.text());
      } else if (file.name.toLowerCase().endsWith('.xlsx')) {
        const { default: ExcelJS } = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('This workbook does not contain a worksheet.');
        matrix = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const values = row.values;
          const cells = Array.isArray(values) ? values.slice(1) : Object.values(values);
          matrix.push(cells.map(cellToText));
        });
      } else {
        throw new Error('Choose a .csv or .xlsx file.');
      }
      const rows = rowsFromMatrix(matrix);
      setRosterFile(file.name);
      runPreview(rows);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The file could not be read.');
    }
  };

  const updateEditableCell = (idx: number, key: keyof RosterRowInput, val: string) => {
    setEditableRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [key]: key === 'phone' ? val || null : val } : row)),
    );
  };

  const removeRowAndRevalidate = (idx: number) => {
    const next = editableRows.filter((_, i) => i !== idx);
    if (!next.length) {
      setEditableRows([]);
      setPreviewData(null);
      return;
    }
    runPreview(next);
  };

  const resolveConflictKeepThis = (idx: number) => {
    const target = editableRows[idx];
    if (!target) return;
    const norm = target.indexNumber.trim().toUpperCase();
    const next = editableRows.filter(
      (r, i) => i === idx || r.indexNumber.trim().toUpperCase() !== norm,
    );
    runPreview(next);
  };

  const doCommit = () => {
    if (!previewData) return;
    const valid = previewData.rows
      .filter((r) => r.status === 'ready' || r.status === 'invited')
      .map((r) => ({
        fullName: r.fullName,
        indexNumber: r.indexNumber,
        email: r.email,
        phone: r.phone,
      }));
    if (!valid.length) return;
    commit.mutate(
      { classId, data: { rows: valid } },
      {
        onSuccess: (res) => {
          qc.invalidateQueries({ queryKey: getGetClassRosterQueryKey(classId) });
          qc.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
          qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
          const invitedCount = res.rows.filter((r) => r.linkStatus === 'invited').length;
          toast({
            title: 'Roster saved',
            description:
              invitedCount > 0
                ? `${res.rosterCount} students saved · Invitation emails queued for ${invitedCount} invited student(s).`
                : `${res.rosterCount} students saved on the roster.`,
          });
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#182630]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-extrabold">Import class roster</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload CSV/Excel or paste rows, then review, fix errors, or resolve duplicate conflicts inline.
            </p>
          </div>
          <button className="rounded-lg p-2 hover:bg-muted cursor-pointer" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {!previewData ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Columns: <span className="font-mono">name, index, email, phone</span>
              </span>
              <button
                type="button"
                className="btn btn-outline !px-3 !py-1.5 !text-xs"
                onClick={downloadRosterTemplate}
                data-testid="button-download-roster-template"
              >
                <Download size={13} /> CSV template
              </button>
            </div>
            <label className="mb-3 block rounded-xl border border-dashed bg-muted/20 p-4 text-sm font-semibold">
              Choose a .csv or .xlsx file
              <input
                className="mt-2 block w-full text-xs font-normal"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void handleFile(file);
                }}
                data-testid="input-roster-file"
              />
              {rosterFile && <span className="mt-2 block text-xs font-normal text-muted-foreground">Loaded: {rosterFile}</span>}
              <span className="mt-1.5 block text-[11px] font-normal text-muted-foreground">
                Google Form CSV/Excel exports work directly. Word, PDF, and scanned rosters are planned for a later phase.
              </span>
            </label>
            <textarea
              className="field min-h-36 font-mono text-xs leading-6"
              placeholder={'Ama Boateng, 5231001, ama.boateng@example.com, 0241234567'}
              value={rosterText}
              onChange={(e) => {
                setRosterText(e.target.value);
                setImportError('');
              }}
              data-testid="input-roster-csv"
            />
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3">
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                <span className="text-emerald-700">{previewData.validRows} valid</span>
                <span className={previewData.errorRows ? 'text-destructive' : 'text-muted-foreground'}>
                  {previewData.errorRows} errors
                </span>
                <span className={previewData.conflictRows ? 'text-amber-700' : 'text-muted-foreground'}>
                  {previewData.conflictRows} conflicts
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewData(null)}
                  className="btn btn-outline !px-3 !py-1.5 !text-xs"
                >
                  Start over
                </button>
                <button
                  type="button"
                  onClick={() => runPreview(editableRows)}
                  disabled={preview.isPending}
                  className="btn btn-outline !px-3 !py-1.5 !text-xs"
                  data-testid="button-revalidate-roster"
                >
                  <RefreshCw size={13} /> Re-validate
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="table-head border-b bg-muted/30 text-left">
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-2 py-2.5">Index</th>
                    <th className="px-2 py-2.5">Email</th>
                    <th className="px-2 py-2.5">Phone</th>
                    <th className="px-2 py-2.5">Account link</th>
                    <th className="px-2 py-2.5">Validation</th>
                    <th className="px-3 py-2.5 text-right">Row</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previewData.rows.map((r, i) => {
                    const rowVal = editableRows[i] ?? r;
                    const isConflict = r.status === 'conflict';
                    const isError = r.status === 'error';
                    return (
                      <tr key={i} className={isError ? 'bg-red-50/40' : isConflict ? 'bg-amber-50/40' : ''}>
                        <td className="px-2 py-2">
                          <input
                            className="field !py-1.5 !text-xs"
                            value={rowVal.fullName}
                            onChange={(e) => updateEditableCell(i, 'fullName', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="field !py-1.5 font-mono !text-xs w-28"
                            value={rowVal.indexNumber}
                            onChange={(e) => updateEditableCell(i, 'indexNumber', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="field !py-1.5 !text-xs"
                            value={rowVal.email}
                            onChange={(e) => updateEditableCell(i, 'email', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="field !py-1.5 !text-xs w-28"
                            value={rowVal.phone ?? ''}
                            onChange={(e) => updateEditableCell(i, 'phone', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`text-[11px] font-semibold whitespace-nowrap ${
                              r.linkStatus === 'matched'
                                ? 'text-emerald-700'
                                : r.linkStatus === 'conflict'
                                  ? 'text-destructive'
                                  : 'text-amber-800'
                            }`}
                          >
                            {r.linkStatus === 'matched'
                              ? 'Matched'
                              : r.linkStatus === 'needs_approval'
                                ? 'Needs approval'
                                : r.linkStatus === 'conflict'
                                  ? 'Conflict'
                                  : 'Invited'}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-semibold">
                            {isError ? (
                              <span className="text-destructive">{r.issues[0] || 'Error'}</span>
                            ) : isConflict ? (
                              <span className="text-amber-800">{r.issues[0] || 'Conflict'}</span>
                            ) : (
                              <span className="text-emerald-700">Ready</span>
                            )}
                          </div>
                          {Array.isArray((r as { warnings?: string[] }).warnings) &&
                            ((r as { warnings?: string[] }).warnings?.length ?? 0) > 0 && (
                              <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-amber-800">
                                {(r as { warnings?: string[] }).warnings?.map((warn, wi) => (
                                  <div key={wi}>{warn}</div>
                                ))}
                              </div>
                            )}
                          {isConflict && (
                            <button
                              type="button"
                              onClick={() => resolveConflictKeepThis(i)}
                              className="mt-1 text-[11px] font-semibold text-primary underline cursor-pointer"
                            >
                              Keep this row
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeRowAndRevalidate(i)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importError && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {importError}
          </div>
        )}
        {commit.isError && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Fix errors or conflicts before committing, or try again.
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          {!previewData ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!rosterText.trim() || preview.isPending}
              onClick={() => {
                try {
                  runPreview(rowsFromMatrix(parseCsvMatrix(rosterText)));
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : 'Could not parse CSV text.');
                }
              }}
              data-testid="button-preview-roster"
            >
              {preview.isPending ? 'Checking…' : 'Preview roster'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={commit.isPending || previewData.validRows === 0 || previewData.errorRows > 0 || previewData.conflictRows > 0}
              onClick={doCommit}
              data-testid="button-commit-roster"
            >
              {commit.isPending ? 'Saving…' : `Commit ${previewData.validRows} students`}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function SingleStudentModal({
  classId,
  existing,
  onClose,
}: {
  classId: string;
  existing?: RosterItem | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const add = useAddStudent();
  const update = useUpdateStudent();
  const isEditing = Boolean(existing);

  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [indexNumber, setIndexNumber] = useState(existing?.indexNumber ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (isEditing && existing) {
      update.mutate(
        {
          classId,
          indexNumber: existing.indexNumber,
          data: { fullName: fullName.trim(), email: email.trim(), phone: phone.trim() || null },
        },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getGetClassRosterQueryKey(classId) });
            qc.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
            toast({ title: 'Student details updated' });
            onClose();
          },
          onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Could not update student.'),
        },
      );
    } else {
      add.mutate(
        {
          classId,
          data: {
            fullName: fullName.trim(),
            indexNumber: indexNumber.trim().toUpperCase(),
            email: email.trim(),
            phone: phone.trim() || null,
          },
        },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getGetClassRosterQueryKey(classId) });
            qc.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
            qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
            toast({
              title: 'Student added to roster',
              description: `Invitation email sent to ${email.trim().toLowerCase()}.`,
            });
            onClose();
          },
          onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Could not add student.'),
        },
      );
    }
  };

  const pending = add.isPending || update.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#182630]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-md rounded-t-2xl border bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-extrabold">
            {isEditing ? 'Edit roster student' : 'Add a student'}
          </h2>
          <button className="rounded-lg p-2 hover:bg-muted cursor-pointer" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-semibold">
            Full name
            <input
              className="field mt-1.5"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Kwame Nkrumah"
              required
              minLength={2}
              data-testid="input-student-fullname"
            />
          </label>
          <label className="block text-xs font-semibold">
            Index number
            <input
              className="field mt-1.5 font-mono"
              value={indexNumber}
              onChange={(e) => setIndexNumber(e.target.value)}
              placeholder="5231008"
              disabled={isEditing}
              required
              data-testid="input-student-index"
            />
          </label>
          <label className="block text-xs font-semibold">
            Student email
            <input
              className="field mt-1.5"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kwame.nkrumah@school.edu.gh"
              required
              data-testid="input-student-email"
            />
          </label>
          <label className="block text-xs font-semibold">
            Phone (optional)
            <input
              className="field mt-1.5"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0240000000"
              data-testid="input-student-phone"
            />
          </label>
          {isEditing && existing && email.trim().toLowerCase() !== existing.email.toLowerCase() && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Changing this student’s email places the account link in <b>needs approval</b> and hides their photo until confirmed.
            </p>
          )}
          {errorMsg && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {errorMsg}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="button-save-student">
              {pending ? <LoaderCircle size={15} className="animate-spin" /> : isEditing ? <Check size={15} /> : <UserPlus size={15} />}
              {isEditing ? 'Save changes' : 'Add student'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function RemoveStudentModal({
  classId,
  student,
  onClose,
}: {
  classId: string;
  student: RosterItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const remove = useRemoveStudent();

  const confirmRemove = () => {
    remove.mutate(
      { classId, indexNumber: student.indexNumber },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetClassRosterQueryKey(classId) });
          qc.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
          qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#182630]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-md rounded-t-2xl border bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle size={19} />
          </span>
          <div>
            <h2 className="font-serif text-lg font-extrabold">Remove student from roster?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Remove <b>{student.fullName}</b> ({student.indexNumber}) from this class roster. Past finalized session logs remain intact.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmRemove}
            disabled={remove.isPending}
            className="btn bg-destructive text-destructive-foreground hover:brightness-110"
            data-testid="button-confirm-remove-student"
          >
            {remove.isPending ? 'Removing…' : 'Remove student'}
          </button>
        </div>
      </section>
    </div>
  );
}
