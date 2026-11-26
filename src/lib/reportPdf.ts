import { jsPDF } from 'jspdf';
import type { AttendanceRecord, ClassItem, ClassReport, RosterItem, SessionItem } from '@workspace/api-client-react';

export function exportClassReportPdf(item: ClassItem, report: ClassReport): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 44;
  let y = 52;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${item.courseCode} — ${item.courseTitle}`, margin, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 98, 110);
  doc.text(
    `${item.department} · ${item.programme} · Level ${item.level} · ${item.semester} (${item.academicYear})`,
    margin,
    y,
  );
  y += 24;

  doc.setDrawColor(215, 212, 204);
  doc.line(margin, y, 550, y);
  y += 22;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    `Finalized sessions: ${report.totalSessions}     |     Threshold: ${report.attendanceThreshold}%     |     Below threshold: ${report.belowThreshold.length} student(s)`,
    margin,
    y,
  );
  y += 26;

  doc.setFontSize(9.5);
  doc.text('Student Name', margin, y);
  doc.text('Index Number', margin + 210, y);
  doc.text('Attended', margin + 320, y);
  doc.text('Rate', margin + 395, y);
  doc.text('Status', margin + 445, y);
  y += 8;
  doc.line(margin, y, 550, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  for (const st of report.students) {
    if (y > 760) {
      doc.addPage();
      y = 52;
    }
    const below = report.totalSessions > 0 && st.percentage < report.attendanceThreshold;
    doc.setTextColor(below ? 180 : 30, below ? 83 : 41, below ? 9 : 59);
    doc.text(st.fullName.slice(0, 34), margin, y);
    doc.text(st.indexNumber, margin + 210, y);
    doc.text(`${st.attended} / ${st.total}`, margin + 320, y);
    doc.text(`${st.percentage}%`, margin + 395, y);
    doc.text(below ? `Below ${report.attendanceThreshold}%` : 'On track', margin + 445, y);
    y += 18;
  }

  y += 14;
  if (y > 770) {
    doc.addPage();
    y = 52;
  }
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Generated from Attendance Desk. Low attendance is a prompt for lecturer follow-up, not an automated decision.',
    margin,
    y,
  );

  const safe = item.courseCode.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  doc.save(`${safe}-attendance-report.pdf`);
}

export function exportSessionSheetPdf(
  session: SessionItem,
  records: AttendanceRecord[],
  courseLabel?: string,
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 44;
  let y = 52;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(courseLabel ? `${courseLabel} — ${session.topic}` : session.topic, margin, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 98, 110);
  const codeModeLabel =
    session.codeMode === 'static' ? 'static (lower security)' : 'rotating (45s)';
  doc.text(
    `Venue: ${session.venue} · Status: ${session.status.toUpperCase()} · Code mode: ${codeModeLabel} · Radius: ${session.radiusM} m`,
    margin,
    y,
  );
  y += 22;
  doc.line(margin, y, 550, y);
  y += 20;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Student Name', margin, y);
  doc.text('Index Number', margin + 185, y);
  doc.text('Status', margin + 275, y);
  doc.text('Source', margin + 350, y);
  doc.text('Note / Flags', margin + 415, y);
  y += 8;
  doc.line(margin, y, 550, y);
  y += 16;

  const lateCutoffMs =
    session.lateAfterMinutes != null && session.lateAfterMinutes > 0
      ? new Date(session.startsAt).getTime() + session.lateAfterMinutes * 60_000
      : null;

  doc.setFont('helvetica', 'normal');
  for (const r of records) {
    if (y > 760) {
      doc.addPage();
      y = 52;
    }
    const isLate =
      r.status === 'present' &&
      lateCutoffMs !== null &&
      r.markedAt != null &&
      new Date(r.markedAt).getTime() > lateCutoffMs;
    const statusText = isLate ? 'present (late)' : r.status.replace('_', ' ');

    doc.text(r.studentName.slice(0, 28), margin, y);
    doc.text(r.indexNumber, margin + 185, y);
    doc.text(statusText, margin + 275, y);
    doc.text(r.markedManually ? 'Manual' : 'Self check-in', margin + 350, y);
    const noteText = (r.note || r.flags.join(', ') || '—').slice(0, 28);
    doc.text(noteText, margin + 415, y);
    y += 18;
  }

  doc.save(`session-${session.id.slice(0, 8)}-sheet.pdf`);
}

export function exportClassRosterPdf(item: ClassItem, rows: RosterItem[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 44;
  const pageRight = 551;
  let y = 52;
  let page = 1;

  const drawTableHeader = () => {
    doc.setFillColor(244, 243, 239);
    doc.rect(margin, y - 12, pageRight - margin, 20, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('#', margin + 6, y);
    doc.text('Student Name', margin + 30, y);
    doc.text('Index Number', margin + 195, y);
    doc.text('Email', margin + 285, y);
    doc.text('Face Profile', margin + 435, y);
    y += 12;
    doc.setDrawColor(200, 196, 188);
    doc.line(margin, y, pageRight, y);
    y += 16;
  };

  const drawFooter = (pageNum: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 128, 140);
    doc.text(`${item.courseCode} · Student Roster`, margin, 812);
    doc.text(`Page ${pageNum}`, pageRight - 36, 812);
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 26, 36);
  doc.text(`${item.courseCode} — ${item.courseTitle}`, margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(90, 98, 110);
  doc.text(
    `${item.department} · ${item.programme} · Level ${item.level} · ${item.semester} (${item.academicYear})`,
    margin,
    y,
  );
  y += 18;

  const printedOn = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Official Class Student List     |     Total students: ${rows.length}     |     Printed: ${printedOn}`, margin, y);
  y += 16;

  doc.setDrawColor(215, 212, 204);
  doc.line(margin, y, pageRight, y);
  y += 22;

  drawTableHeader();
  drawFooter(page);

  rows.forEach((r, idx) => {
    if (y > 775) {
      doc.addPage();
      page += 1;
      y = 52;
      drawTableHeader();
      drawFooter(page);
    }

    const faceLabel = [
      r.faceEnrolled ? 'Enrolled' : 'Pending',
      r.verificationStatus === 'confirmed'
        ? 'Confirmed'
        : r.verificationStatus === 'disputed'
          ? 'Disputed'
          : null,
    ]
      .filter(Boolean)
      .join(' · ');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 110, 125);
    doc.text(String(idx + 1), margin + 6, y);

    doc.setTextColor(25, 33, 46);
    doc.text(r.fullName.slice(0, 30), margin + 30, y);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.text(r.indexNumber.slice(0, 16), margin + 195, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(75, 85, 99);
    doc.text((r.email || '—').slice(0, 29), margin + 285, y);
    doc.text(faceLabel.slice(0, 20), margin + 435, y);

    y += 7;
    doc.setDrawColor(235, 232, 226);
    doc.line(margin, y, pageRight, y);
    y += 14;
  });

  const safe = item.courseCode.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  doc.save(`${safe}-student-list.pdf`);
}

