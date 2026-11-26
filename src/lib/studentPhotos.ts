import amaPortrait from '@/assets/images/student_ama_portrait_1795655214951.jpg';
import kofiPortrait from '@/assets/images/student_kofi_portrait_1795655216015.jpg';
import yawPortrait from '@/assets/images/student_yaw_portrait_1795655216679.jpg';
import yawCheckinWide from '@/assets/images/checkin_yaw_wide_1795655218107.jpg';
import kwameCheckinWide from '@/assets/images/checkin_kwame_wide_1795655217587.jpg';

const PHOTO_MAP: Record<string, string> = {
  'ama-portrait': amaPortrait,
  'kofi-portrait': kofiPortrait,
  'yaw-portrait': yawPortrait,
  'yaw-checkin-wide': yawCheckinWide,
  'kwame-checkin-wide': kwameCheckinWide,
};

export function getStudentPhotoUrl(key?: string | null): string | null {
  if (!key) return null;
  return PHOTO_MAP[key] ?? null;
}
