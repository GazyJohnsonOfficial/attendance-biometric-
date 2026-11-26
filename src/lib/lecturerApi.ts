import { useMutation, useQuery } from '@tanstack/react-query';
import { customFetch } from '@/api-client-react/custom-fetch';
import type {
  ClassItem,
  ClassReport,
  RosterResponse,
  SessionItem,
} from '@workspace/api-client-react';

export interface LecturerProfile {
  userId: string;
  staffId: string;
  fullName: string;
  email: string;
  phone: string;
  departments: string[];
  reviewStatus: 'not_yet_reviewed' | 'kept' | 'removed' | 'approved' | 'pending' | 'suspended';
  emailVerified: boolean;
}

export interface RegisterLecturerInput {
  staffId: string;
  fullName: string;
  email: string;
  phone: string;
  departments: string[];
  password?: string;
}

export interface AuthStatusResponse {
  hasEnvAdminPasscode: boolean;
  adminPasswordConfigured: boolean;
  previewDemoAvailable: boolean;
  claimedAdminEmail: string | null;
}

export interface AuthUserPayload {
  id: string;
  fullName: string;
  email: string;
  role?: 'super_admin' | 'department_admin' | 'lecturer';
  staffId?: string;
  departments?: string[];
}

export interface AuthLoginSuccessResponse {
  requiresTwoFactor?: false;
  token: string;
  accountType: 'lecturer' | 'admin';
  user: AuthUserPayload;
  sessionTimeoutMinutes?: number;
}

export interface AuthTwoFactorResponse {
  requiresTwoFactor: true;
  challengeId: string;
  accountType: 'admin';
  previewTwoFactorCode?: string;
}

export type AuthLoginResponse = AuthLoginSuccessResponse | AuthTwoFactorResponse;

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  return customFetch<AuthStatusResponse>('/api/auth/status');
}

export async function loginUnified(payload: {
  email: string;
  password?: string;
  accountType?: 'auto' | 'lecturer' | 'admin';
  demo?: boolean;
}): Promise<AuthLoginResponse> {
  return customFetch<AuthLoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function verifyTwoFactor(payload: {
  challengeId: string;
  code: string;
}): Promise<AuthLoginSuccessResponse> {
  return customFetch<AuthLoginSuccessResponse>('/api/auth/2fa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function claimAdminPassword(payload: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<AuthLoginSuccessResponse> {
  return customFetch<AuthLoginSuccessResponse>('/api/auth/admin/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function logoutUnified(): Promise<void> {
  try {
    await customFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout network errors when clearing client memory session
  }
}

export async function logoutAllDevices(): Promise<{ success: boolean; revokedSessions: number }> {
  return customFetch<{ success: boolean; revokedSessions: number }>('/api/auth/logout-all', {
    method: 'POST',
  });
}

export async function requestLecturerPasswordReset(email: string): Promise<{
  ok: boolean;
  message: string;
  previewResetCode?: string;
}> {
  return customFetch('/api/auth/lecturer/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function confirmLecturerPasswordReset(payload: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ ok: boolean; revokedSessions: number }> {
  return customFetch('/api/auth/lecturer/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export interface LearnedCourse {
  id?: string;
  courseCode: string;
  courseTitle: string;
  department: string;
  programme: string;
  programmeNames?: string[];
  level?: number;
}

export interface LearnedProgrammeRecord {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  departmentName: string;
}

export interface LearnedLocation {
  id?: string;
  name: string;
  building?: string;
  lat: number | null;
  lng: number | null;
  radiusM: number;
}

export interface AcademicReferenceData {
  levels: number[];
  semesters: string[];
  currentAcademicYear: string;
  academicYears: string[];
  updatedAt: string;
  defaults: {
    attendanceThresholdPct: number;
    defaultRadiusM: number;
    maxRadiusM: number;
    allowLateStatus: boolean;
    lateAfterMinutesDefault: number;
    allowStaticCodes: boolean;
    rotatingCodeSeconds: number;
    privacyPolicyVersion: string;
    privacyPolicyText: string;
    consentNoticeText: string;
  };
}

export interface GlobalSessionItem extends SessionItem {
  courseCode: string;
  courseTitle: string;
}

export interface SessionActivityEvent {
  id: string;
  category: 'checkin' | 'manual_override' | 'review' | 'lifecycle';
  title: string;
  description: string;
  occurredAt: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  studentName: string | null;
  indexNumber: string | null;
  status: string | null;
  previousStatus: string | null;
  flags: string[];
  faceScore: string | null;
  distanceM: number | null;
}

export interface LecturerNotificationItem {
  id: string;
  type: 'unfinalised_session' | 'dispute' | 'photo_request' | 'reference_request';
  title: string;
  detail: string;
  tone: 'warning' | 'success' | 'neutral';
  href: string;
  createdAt: string;
}

export const lecturerKeys = {
  profile: ['/api/lecturer/profile'] as const,
  notifications: ['/api/lecturer/notifications'] as const,
  lists: (type: string) => ['/api/lists', type] as const,
  classesFiltered: (includeArchived: boolean) => ['/api/classes', { includeArchived }] as const,
  allSessions: ['/api/sessions'] as const,
  sessionActivity: (sessionId: string) => ['/api/sessions', sessionId, 'activity'] as const,
  identity: (classId: string) => ['/api/classes', classId, 'identity'] as const,
  reportThreshold: (classId: string, threshold: number) =>
    ['/api/classes', classId, 'reports', 'summary', threshold] as const,
};

export function useLecturerNotifications() {
  return useQuery({
    queryKey: lecturerKeys.notifications,
    queryFn: () => customFetch<LecturerNotificationItem[]>('/api/lecturer/notifications'),
  });
}

export function useCopyClass() {
  return useMutation({
    mutationFn: ({
      classId,
      semester,
      academicYear,
      includeRoster = true,
    }: {
      classId: string;
      semester: string;
      academicYear: string;
      includeRoster?: boolean;
    }) =>
      customFetch<ClassItem>(`/api/classes/${classId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semester, academicYear, includeRoster }),
      }),
  });
}

export function useLecturerProfile() {
  return useQuery({
    queryKey: lecturerKeys.profile,
    queryFn: () => customFetch<LecturerProfile>('/api/lecturer/profile'),
  });
}

export function useUpdateLecturerProfile() {
  return useMutation({
    mutationFn: (data: Partial<Omit<LecturerProfile, 'userId' | 'reviewStatus' | 'emailVerified'>>) =>
      customFetch<LecturerProfile>('/api/lecturer/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  });
}

export function useRegisterLecturer() {
  return useMutation({
    mutationFn: (data: RegisterLecturerInput) =>
      customFetch<LecturerProfile>('/api/lecturer/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}

export function useLearnedDepartments() {
  return useQuery({
    queryKey: lecturerKeys.lists('departments'),
    queryFn: async () => (await customFetch<{ items: string[] }>('/api/lists/departments')).items,
  });
}

export function useLearnedProgrammes() {
  return useQuery({
    queryKey: lecturerKeys.lists('programmes'),
    queryFn: async () => (await customFetch<{ items: string[] }>('/api/lists/programmes')).items,
  });
}

export function useLearnedProgrammeRecords() {
  return useQuery({
    queryKey: [...lecturerKeys.lists('programmes'), 'records'] as const,
    queryFn: async () =>
      (await customFetch<{ items: string[]; records?: LearnedProgrammeRecord[] }>('/api/lists/programmes'))
        .records ?? [],
  });
}

export function useLearnedCourses() {
  return useQuery({
    queryKey: lecturerKeys.lists('courses'),
    queryFn: async () => (await customFetch<{ items: LearnedCourse[] }>('/api/lists/courses')).items,
  });
}

export function useLearnedLocations() {
  return useQuery({
    queryKey: lecturerKeys.lists('locations'),
    queryFn: async () => (await customFetch<{ items: LearnedLocation[] }>('/api/lists/locations')).items,
  });
}

export function useLearnedAcademic() {
  return useQuery({
    queryKey: lecturerKeys.lists('academic'),
    queryFn: () => customFetch<AcademicReferenceData>('/api/lists/academic'),
  });
}

export function useSubmitReferenceRequest() {
  return useMutation({
    mutationFn: (payload: {
      type: 'course' | 'location';
      departmentName?: string;
      programmeName?: string;
      level?: number;
      courseCode?: string;
      courseTitle?: string;
      locationName?: string;
      building?: string;
      note?: string;
    }) =>
      customFetch('/api/lists/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
  });
}

export function useAllClasses(includeArchived: boolean) {
  return useQuery({
    queryKey: lecturerKeys.classesFiltered(includeArchived),
    queryFn: () =>
      customFetch<ClassItem[]>(
        includeArchived ? '/api/classes?includeArchived=true' : '/api/classes',
      ),
  });
}

export function useAllSessions() {
  return useQuery({
    queryKey: lecturerKeys.allSessions,
    queryFn: () => customFetch<GlobalSessionItem[]>('/api/sessions'),
  });
}

export function useClassIdentity(classId: string, enabled: boolean) {
  return useQuery({
    queryKey: lecturerKeys.identity(classId),
    queryFn: () => customFetch<RosterResponse>(`/api/classes/${classId}/identity`),
    enabled,
  });
}

export function useAddStudent() {
  return useMutation({
    mutationFn: ({
      classId,
      data,
    }: {
      classId: string;
      data: { fullName: string; indexNumber: string; email: string; phone?: string | null };
    }) =>
      customFetch<RosterResponse>(`/api/classes/${classId}/students`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}

export function useUpdateStudent() {
  return useMutation({
    mutationFn: ({
      classId,
      indexNumber,
      data,
    }: {
      classId: string;
      indexNumber: string;
      data: { fullName?: string; email?: string; phone?: string | null };
    }) =>
      customFetch<RosterResponse>(
        `/api/classes/${classId}/students/${encodeURIComponent(indexNumber)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        },
      ),
  });
}

export function useRemoveStudent() {
  return useMutation({
    mutationFn: ({ classId, indexNumber }: { classId: string; indexNumber: string }) =>
      customFetch<RosterResponse>(
        `/api/classes/${classId}/students/${encodeURIComponent(indexNumber)}`,
        { method: 'DELETE' },
      ),
  });
}

export function useConfirmStudentPhoto() {
  return useMutation({
    mutationFn: ({ classId, indexNumber }: { classId: string; indexNumber: string }) =>
      customFetch<RosterResponse>(
        `/api/classes/${classId}/students/${encodeURIComponent(indexNumber)}/confirm`,
        { method: 'POST' },
      ),
  });
}

export function useDisputeStudentPhoto() {
  return useMutation({
    mutationFn: ({
      classId,
      indexNumber,
      reason,
    }: {
      classId: string;
      indexNumber: string;
      reason: string;
    }) =>
      customFetch<RosterResponse>(
        `/api/classes/${classId}/students/${encodeURIComponent(indexNumber)}/dispute`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        },
      ),
  });
}

export function useOpenSession() {
  return useMutation({
    mutationFn: (sessionId: string) =>
      customFetch<SessionItem>(`/api/sessions/${sessionId}/open`, { method: 'POST' }),
  });
}

export function useExtendSession() {
  return useMutation({
    mutationFn: ({ sessionId, minutes }: { sessionId: string; minutes: number }) =>
      customFetch<SessionItem>(`/api/sessions/${sessionId}/extend`, {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      }),
  });
}

export function useReopenSession() {
  return useMutation({
    mutationFn: ({ sessionId, reason }: { sessionId: string; reason: string }) =>
      customFetch<SessionItem>(`/api/sessions/${sessionId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  });
}

export function useClassReportThreshold(classId: string, threshold: number) {
  return useQuery({
    queryKey: lecturerKeys.reportThreshold(classId, threshold),
    queryFn: () =>
      customFetch<ClassReport>(
        `/api/classes/${classId}/reports/summary?threshold=${encodeURIComponent(threshold)}`,
      ),
  });
}

export function useSessionActivity(sessionId: string, refetchInterval?: number) {
  return useQuery({
    queryKey: lecturerKeys.sessionActivity(sessionId),
    queryFn: () => customFetch<SessionActivityEvent[]>(`/api/sessions/${sessionId}/activity`),
    enabled: Boolean(sessionId),
    refetchInterval,
  });
}

export interface BulkDecideRecordsInput {
  sessionId: string;
  recordIds: string[];
  status: 'present' | 'absent';
  note?: string;
}

export function bulkDecideRecords({
  sessionId,
  recordIds,
  status,
  note,
}: BulkDecideRecordsInput) {
  return customFetch<{ updatedCount: number }>(`/api/sessions/${sessionId}/bulk-decision`, {
    method: 'POST',
    body: JSON.stringify({ recordIds, status, note }),
  });
}

export function useBulkDecideRecords() {
  return useMutation({
    mutationFn: bulkDecideRecords,
  });
}

export async function downloadApiFile(
  url: string,
  fallbackFilename: string,
  extraHeaders?: Record<string, string>,
): Promise<void> {
  const blob = await customFetch<Blob>(url, {
    responseType: 'blob',
    headers: extraHeaders,
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fallbackFilename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

