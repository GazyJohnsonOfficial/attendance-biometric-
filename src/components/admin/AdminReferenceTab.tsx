import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Calendar, Check, Edit3, FileSpreadsheet, Inbox, MapPin, Plus, Power,
  RotateCcw, Upload, X, GraduationCap,
} from 'lucide-react';
import { customFetch } from '@/api-client-react/custom-fetch';
import { lecturerKeys } from '@/lib/lecturerApi';
import { useToast } from '@/hooks/use-toast';
import type { DepartmentReferenceItem } from './AdminPortal';

interface ProgrammeItem {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  departmentName: string;
  active: boolean;
  coursesCount: number;
  updatedAt: string;
}

interface CourseItem {
  id: string;
  code: string;
  title: string;
  departmentId: string;
  departmentName: string;
  programmeIds: string[];
  programmeNames: string[];
  level: number;
  active: boolean;
  updatedAt: string;
}

interface LocationItem {
  id: string;
  name: string;
  building: string;
  active: boolean;
  updatedAt: string;
}

interface AcademicConfig {
  levels: number[];
  semesters: string[];
  currentAcademicYear: string;
  academicYears: string[];
  updatedAt: string;
}

interface ReferenceRequestItem {
  id: string;
  type: 'course' | 'location';
  lecturerName: string;
  lecturerEmail: string;
  departmentName?: string;
  programmeName?: string;
  level?: number;
  courseCode?: string;
  courseTitle?: string;
  locationName?: string;
  building?: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
  createdAt: string;
  resolvedAt?: string | null;
}

export function AdminReferenceTab({
  isSuperAdmin,
  departments,
}: {
  isSuperAdmin: boolean;
  departments: DepartmentReferenceItem[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [subTab, setSubTab] = useState<'programmes' | 'courses' | 'academic' | 'locations' | 'requests'>('programmes');
  const [importOpen, setImportOpen] = useState(false);

  // Programmes state
  const [progName, setProgName] = useState('');
  const [progCode, setProgCode] = useState('');
  const [progDeptId, setProgDeptId] = useState('');
  const [editingProgId, setEditingProgId] = useState<string | null>(null);
  const [editProgName, setEditProgName] = useState('');
  const [editProgCode, setEditProgCode] = useState('');

  // Courses state
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDeptId, setCourseDeptId] = useState('');
  const [courseProgIds, setCourseProgIds] = useState<string[]>([]);
  const [courseLevel, setCourseLevel] = useState(300);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourseTitle, setEditCourseTitle] = useState('');
  const [editCourseLevel, setEditCourseLevel] = useState(300);

  // Academic state
  const [levelsInput, setLevelsInput] = useState('');
  const [semestersInput, setSemestersInput] = useState('');
  const [yearsInput, setYearsInput] = useState('');
  const [currentYearInput, setCurrentYearInput] = useState('');

  // Locations state
  const [locName, setLocName] = useState('');
  const [locBuilding, setLocBuilding] = useState('');
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editLocName, setEditLocName] = useState('');
  const [editLocBuilding, setEditLocBuilding] = useState('');

  // Import state
  const [importTarget, setImportTarget] = useState<'departments' | 'programmes' | 'courses' | 'locations'>('courses');
  const [importCsv, setImportCsv] = useState('');
  const [importFileBase64, setImportFileBase64] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');

  const programmesQuery = useQuery<ProgrammeItem[]>({
    queryKey: ['admin-reference-programmes'],
    queryFn: () => customFetch<ProgrammeItem[]>('/api/admin/reference/programmes'),
  });

  const coursesQuery = useQuery<CourseItem[]>({
    queryKey: ['admin-reference-courses'],
    queryFn: () => customFetch<CourseItem[]>('/api/admin/reference/courses'),
  });

  const locationsQuery = useQuery<LocationItem[]>({
    queryKey: ['admin-reference-locations'],
    queryFn: () => customFetch<LocationItem[]>('/api/admin/reference/locations'),
  });

  const academicQuery = useQuery<AcademicConfig>({
    queryKey: ['admin-reference-academic'],
    queryFn: () => customFetch<AcademicConfig>('/api/admin/reference/academic'),
  });

  const requestsQuery = useQuery<ReferenceRequestItem[]>({
    queryKey: ['admin-reference-requests'],
    queryFn: () => customFetch<ReferenceRequestItem[]>('/api/admin/reference/requests'),
  });

  const invalidateAllReference = () => {
    qc.invalidateQueries({ queryKey: ['admin-reference-departments'] });
    qc.invalidateQueries({ queryKey: ['admin-reference-programmes'] });
    qc.invalidateQueries({ queryKey: ['admin-reference-courses'] });
    qc.invalidateQueries({ queryKey: ['admin-reference-locations'] });
    qc.invalidateQueries({ queryKey: ['admin-reference-academic'] });
    qc.invalidateQueries({ queryKey: ['admin-reference-requests'] });
    qc.invalidateQueries({ queryKey: ['admin-overview'] });
    qc.invalidateQueries({ queryKey: ['admin-audit'] });
    qc.invalidateQueries({ queryKey: lecturerKeys.lists('departments') });
    qc.invalidateQueries({ queryKey: lecturerKeys.lists('programmes') });
    qc.invalidateQueries({ queryKey: lecturerKeys.lists('courses') });
    qc.invalidateQueries({ queryKey: lecturerKeys.lists('locations') });
    qc.invalidateQueries({ queryKey: lecturerKeys.lists('academic') });
  };

  const activeDepts = departments.filter((d) => d.active);
  const programmes = programmesQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const academic = academicQuery.data;
  const requests = requestsQuery.data ?? [];
  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;

  const createProgramme = useMutation({
    mutationFn: (payload: { name: string; code?: string; departmentId: string }) =>
      customFetch('/api/admin/reference/programmes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateAllReference();
      setProgName('');
      setProgCode('');
      toast({ title: 'Programme added' });
    },
    onError: (err) => {
      toast({ title: 'Could not add programme', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const updateProgramme = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; code?: string; active?: boolean } }) =>
      customFetch(`/api/admin/reference/programmes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      invalidateAllReference();
      setEditingProgId(null);
      toast({ title: 'Programme updated' });
    },
    onError: (err) => {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const createCourse = useMutation({
    mutationFn: (payload: {
      code: string;
      title: string;
      departmentId: string;
      programmeIds: string[];
      level: number;
    }) =>
      customFetch('/api/admin/reference/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateAllReference();
      setCourseCode('');
      setCourseTitle('');
      setCourseProgIds([]);
      toast({ title: 'Course added to programme catalog' });
    },
    onError: (err) => {
      toast({ title: 'Could not add course', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const updateCourse = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; level?: number; active?: boolean } }) =>
      customFetch(`/api/admin/reference/courses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      invalidateAllReference();
      setEditingCourseId(null);
      toast({ title: 'Course updated' });
    },
  });

  const updateAcademic = useMutation({
    mutationFn: (payload: {
      levels: number[];
      semesters: string[];
      currentAcademicYear: string;
      academicYears: string[];
    }) =>
      customFetch('/api/admin/reference/academic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateAllReference();
      toast({ title: 'Academic terms & active year saved' });
    },
    onError: (err) => {
      toast({ title: 'Could not save academic config', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const createLocation = useMutation({
    mutationFn: (payload: { name: string; building?: string }) =>
      customFetch('/api/admin/reference/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateAllReference();
      setLocName('');
      setLocBuilding('');
      toast({ title: 'Location added' });
    },
    onError: (err) => {
      toast({ title: 'Could not add location', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const updateLocation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; building?: string; active?: boolean } }) =>
      customFetch(`/api/admin/reference/locations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      invalidateAllReference();
      setEditingLocId(null);
      toast({ title: 'Location updated' });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: (payload: { target: string; csvText?: string; fileBase64?: string }) =>
      customFetch<{ added: number; skipped: number; errors: string[] }>('/api/admin/reference/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      invalidateAllReference();
      toast({
        title: `Import complete: ${res.added} added`,
        description: `${res.skipped} duplicate(s) skipped${res.errors.length ? ` · ${res.errors.length} warning(s)` : ''}.`,
      });
      if (res.errors.length === 0) {
        setImportOpen(false);
        setImportCsv('');
        setImportFileBase64(null);
        setImportFileName('');
      }
    },
    onError: (err) => {
      toast({ title: 'Bulk import failed', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    },
  });

  const resolveRequestMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) =>
      customFetch(`/api/admin/reference/requests/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      }),
    onSuccess: (_data, vars) => {
      invalidateAllReference();
      toast({
        title: vars.decision === 'approved' ? 'Request approved & added to lists' : 'Request rejected',
      });
    },
  });

  const effectiveProgDeptId = progDeptId || activeDepts[0]?.id || '';
  const effectiveCourseDeptId = courseDeptId || activeDepts[0]?.id || '';
  const deptProgrammes = programmes.filter((p) => p.active && p.departmentId === effectiveCourseDeptId);

  const handleImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = () => {
        setImportCsv(String(reader.result ?? ''));
        setImportFileBase64(null);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? '');
        const b64 = result.includes(',') ? result.split(',')[1] : result;
        setImportFileBase64(b64);
      };
      reader.readAsDataURL(file);
    }
  };

  const openAcademicWithLoaded = () => {
    setSubTab('academic');
    if (academic && !levelsInput) {
      setLevelsInput(academic.levels.join(', '));
      setSemestersInput(academic.semesters.join(', '));
      setYearsInput(academic.academicYears.join(', '));
      setCurrentYearInput(academic.currentAcademicYear);
    }
  };

  return (
    <div className="space-y-6" data-testid="section-admin-reference">
      <div className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="eyebrow">Institutional Reference Lists</div>
            <h2 className="mt-1 font-serif text-lg font-bold">Programmes, Courses, Terms &amp; Locations</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lecturer sign-up, class creation, and session setup read strictly from these active lists. Items are deactivated rather than deleted.
            </p>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="btn btn-outline whitespace-nowrap shrink-0 text-xs"
              data-testid="button-open-bulk-import"
            >
              <FileSpreadsheet size={14} /> Bulk Excel / CSV Import
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {[
            { key: 'programmes', label: `Programmes (${programmes.length})`, icon: GraduationCap },
            { key: 'courses', label: `Courses (${courses.length})`, icon: BookOpen },
            { key: 'academic', label: 'Levels, Semesters & Year', icon: Calendar },
            { key: 'locations', label: `Locations (${locations.length})`, icon: MapPin },
            { key: 'requests', label: `Requests Inbox (${pendingRequestsCount})`, icon: Inbox },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => (key === 'academic' ? openAcademicWithLoaded() : setSubTab(key as typeof subTab))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`ref-subtab-${key}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* PROGRAMMES */}
      {subTab === 'programmes' && (
        <div className="space-y-6">
          {isSuperAdmin && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!progName.trim() || !effectiveProgDeptId) return;
                createProgramme.mutate({
                  name: progName.trim(),
                  ...(progCode.trim() ? { code: progCode.trim() } : {}),
                  departmentId: effectiveProgDeptId,
                });
              }}
              className="surface grid gap-3 p-5 sm:grid-cols-[1fr_.45fr_.75fr_auto] sm:items-end"
            >
              <label className="block text-xs font-semibold">
                Programme name
                <input
                  className="field mt-1.5"
                  placeholder="e.g. BSc Cyber Security"
                  value={progName}
                  onChange={(e) => setProgName(e.target.value)}
                  required
                  data-testid="input-new-programme-name"
                />
              </label>
              <label className="block text-xs font-semibold">
                Code (optional)
                <input
                  className="field mt-1.5 font-mono uppercase"
                  placeholder="BSC-CS"
                  value={progCode}
                  onChange={(e) => setProgCode(e.target.value.toUpperCase())}
                />
              </label>
              <label className="block text-xs font-semibold">
                Parent Department
                <select
                  className="field mt-1.5"
                  value={effectiveProgDeptId}
                  onChange={(e) => setProgDeptId(e.target.value)}
                  required
                >
                  {activeDepts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={createProgramme.isPending}
                className="btn btn-primary whitespace-nowrap shrink-0"
                data-testid="button-add-programme"
              >
                <Plus size={14} /> Add programme
              </button>
            </form>
          )}

          <div className="surface overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Programme</th>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Linked Courses</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {programmes.map((p) => (
                  <tr key={p.id} className={!p.active ? 'bg-muted/20 opacity-75' : 'hover:bg-muted/20'}>
                    <td className="px-5 py-3.5 font-semibold">
                      {editingProgId === p.id ? (
                        <input
                          className="field !py-1 !text-xs"
                          value={editProgName}
                          onChange={(e) => setEditProgName(e.target.value)}
                        />
                      ) : (
                        p.name
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px]">
                      {editingProgId === p.id ? (
                        <input
                          className="field !py-1 !text-xs w-24 font-mono uppercase"
                          value={editProgCode}
                          onChange={(e) => setEditProgCode(e.target.value.toUpperCase())}
                        />
                      ) : (
                        p.code
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{p.departmentName}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums">{p.coursesCount}</td>
                    <td className="px-5 py-3.5">
                      <span className={p.active ? 'font-semibold text-emerald-700' : 'font-semibold text-muted-foreground'}>
                        {p.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {isSuperAdmin && (
                        <div className="flex justify-end gap-1.5">
                          {editingProgId === p.id ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() =>
                                  updateProgramme.mutate({ id: p.id, data: { name: editProgName, code: editProgCode } })
                                }
                              >
                                <Check size={12} /> Save
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => setEditingProgId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => {
                                  setEditingProgId(p.id);
                                  setEditProgName(p.name);
                                  setEditProgCode(p.code);
                                }}
                              >
                                <Edit3 size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => updateProgramme.mutate({ id: p.id, data: { active: !p.active } })}
                              >
                                {p.active ? <Power size={12} /> : <RotateCcw size={12} />}
                                {p.active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COURSES */}
      {subTab === 'courses' && (
        <div className="space-y-6">
          {isSuperAdmin && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const selectedIds = courseProgIds.length > 0 ? courseProgIds : deptProgrammes.slice(0, 1).map((p) => p.id);
                if (!courseCode.trim() || !courseTitle.trim() || !effectiveCourseDeptId || selectedIds.length === 0) {
                  toast({ title: 'Fill code, title, department, and at least one programme', variant: 'destructive' });
                  return;
                }
                createCourse.mutate({
                  code: courseCode.trim().toUpperCase(),
                  title: courseTitle.trim(),
                  departmentId: effectiveCourseDeptId,
                  programmeIds: selectedIds,
                  level: courseLevel,
                });
              }}
              className="surface space-y-4 p-5"
            >
              <div className="grid gap-3 sm:grid-cols-[.5fr_1fr_.75fr_.4fr]">
                <label className="block text-xs font-semibold">
                  Course code
                  <input
                    className="field mt-1.5 font-mono uppercase"
                    placeholder="CS 310"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                    required
                    data-testid="input-new-course-code"
                  />
                </label>
                <label className="block text-xs font-semibold">
                  Course title
                  <input
                    className="field mt-1.5"
                    placeholder="Operating Systems"
                    value={courseTitle}
                    onChange={(e) => setCourseTitle(e.target.value)}
                    required
                    data-testid="input-new-course-title"
                  />
                </label>
                <label className="block text-xs font-semibold">
                  Department
                  <select
                    className="field mt-1.5"
                    value={effectiveCourseDeptId}
                    onChange={(e) => {
                      setCourseDeptId(e.target.value);
                      setCourseProgIds([]);
                    }}
                  >
                    {activeDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold">
                  Level
                  <select
                    className="field mt-1.5 font-mono"
                    value={courseLevel}
                    onChange={(e) => setCourseLevel(Number(e.target.value))}
                  >
                    {(academic?.levels ?? [100, 200, 300, 400]).map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-muted-foreground">Offered on programme(s):</span>
                  {deptProgrammes.length === 0 ? (
                    <span className="text-amber-700">No active programmes under this department yet.</span>
                  ) : (
                    deptProgrammes.map((p) => {
                      const checked = courseProgIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                            checked ? 'border-primary bg-primary/10 text-primary' : 'bg-background'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setCourseProgIds((prev) =>
                                prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                              )
                            }
                            className="accent-primary"
                          />
                          {p.name}
                        </label>
                      );
                    })
                  )}
                </div>
                <button
                  type="submit"
                  disabled={createCourse.isPending}
                  className="btn btn-primary whitespace-nowrap shrink-0"
                  data-testid="button-add-course"
                >
                  <Plus size={14} /> Add course
                </button>
              </div>
            </form>
          )}

          <div className="surface overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Programme(s)</th>
                  <th className="px-5 py-3">Level</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {courses.map((c) => (
                  <tr key={c.id} className={!c.active ? 'bg-muted/20 opacity-75' : 'hover:bg-muted/20'}>
                    <td className="px-5 py-3.5 font-mono font-bold">{c.code}</td>
                    <td className="px-5 py-3.5 font-semibold">
                      {editingCourseId === c.id ? (
                        <input
                          className="field !py-1 !text-xs"
                          value={editCourseTitle}
                          onChange={(e) => setEditCourseTitle(e.target.value)}
                        />
                      ) : (
                        c.title
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.departmentName}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.programmeNames.join(', ')}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums">
                      {editingCourseId === c.id ? (
                        <input
                          type="number"
                          className="field !py-1 !text-xs w-20 font-mono"
                          value={editCourseLevel}
                          onChange={(e) => setEditCourseLevel(Number(e.target.value))}
                        />
                      ) : (
                        c.level
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={c.active ? 'font-semibold text-emerald-700' : 'font-semibold text-muted-foreground'}>
                        {c.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {isSuperAdmin && (
                        <div className="flex justify-end gap-1.5">
                          {editingCourseId === c.id ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() =>
                                  updateCourse.mutate({
                                    id: c.id,
                                    data: { title: editCourseTitle, level: editCourseLevel },
                                  })
                                }
                              >
                                <Check size={12} /> Save
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => setEditingCourseId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => {
                                  setEditingCourseId(c.id);
                                  setEditCourseTitle(c.title);
                                  setEditCourseLevel(c.level);
                                }}
                              >
                                <Edit3 size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => updateCourse.mutate({ id: c.id, data: { active: !c.active } })}
                              >
                                {c.active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ACADEMIC TERMS */}
      {subTab === 'academic' && academic && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const levels = (levelsInput || academic.levels.join(','))
              .split(',')
              .map((v) => Number(v.trim()))
              .filter((n) => Number.isInteger(n) && n >= 100 && n <= 900);
            const semesters = (semestersInput || academic.semesters.join(','))
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean);
            const academicYears = (yearsInput || academic.academicYears.join(','))
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean);
            const currentAcademicYear = currentYearInput || academic.currentAcademicYear;
            updateAcademic.mutate({ levels, semesters, academicYears, currentAcademicYear });
          }}
          className="surface space-y-5 p-6"
        >
          <div className="border-b pb-3">
            <h3 className="font-serif text-base font-bold">Levels, Semesters &amp; Current Academic Year</h3>
            <p className="text-xs text-muted-foreground">
              Controls the selectable term options when lecturers create new classes.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold">
              Academic levels (comma-separated)
              <input
                className="field mt-1.5 font-mono"
                value={levelsInput || academic.levels.join(', ')}
                onChange={(e) => setLevelsInput(e.target.value)}
                disabled={!isSuperAdmin}
                data-testid="input-academic-levels"
              />
            </label>
            <label className="block text-xs font-semibold">
              Semesters (comma-separated)
              <input
                className="field mt-1.5"
                value={semestersInput || academic.semesters.join(', ')}
                onChange={(e) => setSemestersInput(e.target.value)}
                disabled={!isSuperAdmin}
                data-testid="input-academic-semesters"
              />
            </label>
            <label className="block text-xs font-semibold">
              Academic years list (comma-separated)
              <input
                className="field mt-1.5 font-mono"
                value={yearsInput || academic.academicYears.join(', ')}
                onChange={(e) => setYearsInput(e.target.value)}
                disabled={!isSuperAdmin}
              />
            </label>
            <label className="block text-xs font-semibold">
              Current active academic year
              <select
                className="field mt-1.5 font-mono"
                value={currentYearInput || academic.currentAcademicYear}
                onChange={(e) => setCurrentYearInput(e.target.value)}
                disabled={!isSuperAdmin}
                data-testid="select-current-academic-year"
              >
                {(yearsInput ? yearsInput.split(',').map((v) => v.trim()).filter(Boolean) : academic.academicYears).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {isSuperAdmin && (
            <div className="flex justify-end border-t pt-4">
              <button
                type="submit"
                disabled={updateAcademic.isPending}
                className="btn btn-primary whitespace-nowrap shrink-0"
                data-testid="button-save-academic-terms"
              >
                <Check size={14} /> Save academic term configuration
              </button>
            </div>
          )}
        </form>
      )}

      {/* LOCATIONS (NAMES & BUILDINGS ONLY — NO COORDINATES OR RADIUS) */}
      {subTab === 'locations' && (
        <div className="space-y-6">
          {isSuperAdmin && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!locName.trim()) return;
                createLocation.mutate({ name: locName.trim(), building: locBuilding.trim() });
              }}
              className="surface grid gap-3 p-5 sm:grid-cols-[1fr_.85fr_auto] sm:items-end"
            >
              <label className="block text-xs font-semibold">
                Venue / Location name
                <input
                  className="field mt-1.5"
                  placeholder="e.g. Lecture Theatre 4"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  required
                  data-testid="input-new-location-name"
                />
              </label>
              <label className="block text-xs font-semibold">
                Building / Block (optional)
                <input
                  className="field mt-1.5"
                  placeholder="e.g. Science Complex"
                  value={locBuilding}
                  onChange={(e) => setLocBuilding(e.target.value)}
                  data-testid="input-new-location-building"
                />
              </label>
              <button
                type="submit"
                disabled={createLocation.isPending}
                className="btn btn-primary whitespace-nowrap shrink-0"
                data-testid="button-add-location"
              >
                <Plus size={14} /> Add location
              </button>
              <p className="sm:col-span-3 text-[11px] text-muted-foreground">
                Location records hold names and buildings only. Lecturers drop the GPS pin and choose the radius in metres for each live session.
              </p>
            </form>
          )}

          <div className="surface overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Location Name</th>
                  <th className="px-5 py-3">Building</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {locations.map((loc) => (
                  <tr key={loc.id} className={!loc.active ? 'bg-muted/20 opacity-75' : 'hover:bg-muted/20'}>
                    <td className="px-5 py-3.5 font-semibold">
                      {editingLocId === loc.id ? (
                        <input
                          className="field !py-1 !text-xs"
                          value={editLocName}
                          onChange={(e) => setEditLocName(e.target.value)}
                        />
                      ) : (
                        loc.name
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {editingLocId === loc.id ? (
                        <input
                          className="field !py-1 !text-xs"
                          value={editLocBuilding}
                          onChange={(e) => setEditLocBuilding(e.target.value)}
                        />
                      ) : (
                        loc.building || '—'
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={loc.active ? 'font-semibold text-emerald-700' : 'font-semibold text-muted-foreground'}>
                        {loc.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {isSuperAdmin && (
                        <div className="flex justify-end gap-1.5">
                          {editingLocId === loc.id ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() =>
                                  updateLocation.mutate({
                                    id: loc.id,
                                    data: { name: editLocName, building: editLocBuilding },
                                  })
                                }
                              >
                                <Check size={12} /> Save
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => setEditingLocId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => {
                                  setEditingLocId(loc.id);
                                  setEditLocName(loc.name);
                                  setEditLocBuilding(loc.building);
                                }}
                              >
                                <Edit3 size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline !px-2.5 !py-1 !text-xs whitespace-nowrap shrink-0"
                                onClick={() => updateLocation.mutate({ id: loc.id, data: { active: !loc.active } })}
                              >
                                {loc.active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REQUESTS INBOX */}
      {subTab === 'requests' && (
        <div className="surface overflow-hidden">
          <div className="border-b px-6 py-4">
            <h3 className="font-serif text-base font-bold">Missing Course &amp; Location Requests Inbox</h3>
            <p className="text-xs text-muted-foreground">
              Lecturers cannot type unlisted courses or venues; requests approved here are immediately added to the master lists.
            </p>
          </div>
          {requests.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">No requests in the inbox.</div>
          ) : (
            <div className="divide-y">
              {requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono uppercase text-[11px] font-bold text-primary">
                        {r.type}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <strong className="text-sm font-bold">
                        {r.type === 'course'
                          ? `${r.courseCode} — ${r.courseTitle}`
                          : `${r.locationName}${r.building ? ` (${r.building})` : ''}`}
                      </strong>
                    </div>
                    <div className="text-muted-foreground">
                      Requested by <span className="font-medium text-foreground">{r.lecturerName}</span> ({r.lecturerEmail})
                      {r.departmentName ? ` · ${r.departmentName}` : ''}
                      {r.programmeName ? ` · ${r.programmeName}` : ''}
                      {r.level ? ` · Level ${r.level}` : ''}
                    </div>
                    {r.note && <div className="text-muted-foreground">Note: “{r.note}”</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === 'pending' ? (
                      isSuperAdmin ? (
                        <>
                          <button
                            type="button"
                            disabled={resolveRequestMutation.isPending}
                            onClick={() => resolveRequestMutation.mutate({ id: r.id, decision: 'approved' })}
                            className="btn btn-primary !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                            data-testid={`button-approve-request-${r.id}`}
                          >
                            <Check size={13} /> Approve &amp; Add
                          </button>
                          <button
                            type="button"
                            disabled={resolveRequestMutation.isPending}
                            onClick={() => resolveRequestMutation.mutate({ id: r.id, decision: 'rejected' })}
                            className="btn btn-outline !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
                          >
                            <X size={13} /> Reject
                          </button>
                        </>
                      ) : (
                        <span className="font-semibold text-amber-700">Pending Super Admin</span>
                      )
                    ) : (
                      <span className={r.status === 'approved' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                        {r.status === 'approved' ? 'Approved & Added' : 'Rejected'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BULK EXCEL / CSV IMPORT MODAL */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setImportOpen(false);
          }}
        >
          <section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold">Bulk Import Reference Data</h3>
                <p className="text-xs text-muted-foreground">Import institutional reference lists only (no student rosters).</p>
              </div>
              <button type="button" onClick={() => setImportOpen(false)} className="rounded p-1.5 hover:bg-muted cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <label className="block text-xs font-semibold">
              Reference list target
              <select
                className="field mt-1.5"
                value={importTarget}
                onChange={(e) => setImportTarget(e.target.value as typeof importTarget)}
                data-testid="select-bulk-import-target"
              >
                <option value="departments">Departments (Name, Code)</option>
                <option value="programmes">Programmes (Name, Code, Department Name)</option>
                <option value="courses">Courses (Code, Title, Department, Programme, Level)</option>
                <option value="locations">Locations (Location Name, Building)</option>
              </select>
            </label>

            <label className="block text-xs font-semibold">
              Upload .xlsx or .csv file
              <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-dashed p-3">
                <Upload size={16} className="text-muted-foreground shrink-0" />
                <input type="file" accept=".xlsx,.csv" onChange={handleImportFile} className="text-xs w-full" />
              </div>
              {importFileName && <span className="mt-1 block font-mono text-[11px] text-primary">Selected: {importFileName}</span>}
            </label>

            <label className="block text-xs font-semibold">
              Or paste CSV lines directly
              <textarea
                className="field mt-1.5 font-mono text-xs min-h-[110px]"
                value={importCsv}
                onChange={(e) => {
                  setImportCsv(e.target.value);
                  setImportFileBase64(null);
                }}
                placeholder={
                  importTarget === 'departments'
                    ? 'Civil Engineering, CE\nMechanical Engineering, ME'
                    : importTarget === 'programmes'
                      ? 'BSc Artificial Intelligence, BSC-AI, Computer Science'
                      : importTarget === 'courses'
                        ? 'CS 420, Deep Learning Systems, Computer Science, BSc Computer Science, 400'
                        : 'Physics Lecture Hall 1, Science Complex'
                }
                data-testid="textarea-bulk-import-csv"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-outline whitespace-nowrap shrink-0" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkImportMutation.isPending}
                onClick={() =>
                  bulkImportMutation.mutate({
                    target: importTarget,
                    ...(importFileBase64 ? { fileBase64: importFileBase64 } : { csvText: importCsv }),
                  })
                }
                className="btn btn-primary whitespace-nowrap shrink-0"
                data-testid="button-submit-bulk-import"
              >
                {bulkImportMutation.isPending ? 'Importing…' : 'Run Import'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
