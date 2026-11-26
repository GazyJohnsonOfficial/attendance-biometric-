/// Biometric Class Attendance System - Student Models (PDF Specification v1.1)

class StudentUser {
  final String id;
  final String indexNumber;
  final String fullName;
  final String email;
  final bool faceEnrolled;
  final String? boundDeviceId;

  StudentUser({
    required this.id,
    required this.indexNumber,
    required this.fullName,
    required this.email,
    this.faceEnrolled = true,
    this.boundDeviceId,
  });

  factory StudentUser.fromJson(Map<String, dynamic> json) {
    return StudentUser(
      id: json['id'] ?? '',
      indexNumber: json['indexNumber'] ?? '',
      fullName: json['fullName'] ?? '',
      email: json['email'] ?? '',
      faceEnrolled: json['faceEnrolled'] ?? true,
      boundDeviceId: json['boundDeviceId'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'indexNumber': indexNumber,
    'fullName': fullName,
    'email': email,
    'faceEnrolled': faceEnrolled,
    'boundDeviceId': boundDeviceId,
  };
}

class ActiveSessionInfo {
  final String id;
  final String topic;
  final String venue;
  final String status;
  final String codeMode;
  final DateTime closesAt;

  ActiveSessionInfo({
    required this.id,
    required this.topic,
    required this.venue,
    required this.status,
    required this.codeMode,
    required this.closesAt,
  });

  factory ActiveSessionInfo.fromJson(Map<String, dynamic> json) {
    return ActiveSessionInfo(
      id: json['id'] ?? '',
      topic: json['topic'] ?? '',
      venue: json['venue'] ?? '',
      status: json['status'] ?? 'open',
      codeMode: json['codeMode'] ?? 'rotating',
      closesAt: DateTime.tryParse(json['closesAt'] ?? '') ?? DateTime.now(),
    );
  }
}

class EnrolledClass {
  final String id;
  final String courseCode;
  final String courseTitle;
  final String department;
  final String programme;
  final int level;
  final String semester;
  final ActiveSessionInfo? activeSession;

  EnrolledClass({
    required this.id,
    required this.courseCode,
    required this.courseTitle,
    required this.department,
    required this.programme,
    required this.level,
    required this.semester,
    this.activeSession,
  });

  factory EnrolledClass.fromJson(Map<String, dynamic> json) {
    return EnrolledClass(
      id: json['id'] ?? '',
      courseCode: json['courseCode'] ?? '',
      courseTitle: json['courseTitle'] ?? '',
      department: json['department'] ?? '',
      programme: json['programme'] ?? '',
      level: json['level'] ?? 300,
      semester: json['semester'] ?? 'Semester 1',
      activeSession: json['activeSession'] != null
          ? ActiveSessionInfo.fromJson(json['activeSession'])
          : null,
    );
  }
}

class CheckinChallenge {
  final String challengeId;
  final String nonce;
  final String livenessPrompt; // e.g. "blink_twice", "turn_head_left"
  final int expiresInSeconds;
  final String courseCode;
  final String courseTitle;
  final String venue;
  final String lecturer;
  final String sessionId;

  CheckinChallenge({
    required this.challengeId,
    required this.nonce,
    required this.livenessPrompt,
    required this.expiresInSeconds,
    required this.courseCode,
    required this.courseTitle,
    required this.venue,
    required this.lecturer,
    required this.sessionId,
  });

  factory CheckinChallenge.fromJson(Map<String, dynamic> json) {
    final classMap = json['class'] as Map<String, dynamic>? ?? {};
    return CheckinChallenge(
      challengeId: json['challenge_id'] ?? '',
      nonce: json['nonce'] ?? '',
      livenessPrompt: json['liveness_prompt'] ?? 'blink_twice',
      expiresInSeconds: json['expires_in'] ?? 90,
      courseCode: classMap['course'] ?? '',
      courseTitle: classMap['title'] ?? '',
      venue: classMap['venue'] ?? '',
      lecturer: classMap['lecturer'] ?? '',
      sessionId: classMap['session_id'] ?? '',
    );
  }
}

class CheckinResult {
  final String status; // 'present' or 'needs_review'
  final String message;
  final DateTime markedAt;
  final List<String> reasons;

  CheckinResult({
    required this.status,
    required this.message,
    required this.markedAt,
    this.reasons = const [],
  });

  bool get isPresent => status == 'present';

  factory CheckinResult.fromJson(Map<String, dynamic> json) {
    return CheckinResult(
      status: json['status'] ?? 'needs_review',
      message: json['message'] ?? '',
      markedAt: DateTime.tryParse(json['marked_at'] ?? '') ?? DateTime.now(),
      reasons: List<String>.from(json['reasons'] ?? []),
    );
  }
}

class AttendanceHistoryRecord {
  final String id;
  final String courseCode;
  final String courseTitle;
  final String topic;
  final DateTime date;
  final String status; // 'present', 'needs_review', 'absent', 'excused'

  AttendanceHistoryRecord({
    required this.id,
    required this.courseCode,
    required this.courseTitle,
    required this.topic,
    required this.date,
    required this.status,
  });

  factory AttendanceHistoryRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceHistoryRecord(
      id: json['id'] ?? '',
      courseCode: json['courseCode'] ?? '',
      courseTitle: json['courseTitle'] ?? '',
      topic: json['topic'] ?? '',
      date: DateTime.tryParse(json['date'] ?? '') ?? DateTime.now(),
      status: json['status'] ?? 'present',
    );
  }
}

class QueuedOfflineCheckin {
  final String id;
  final String courseCode;
  final String code;
  final String indexNumber;
  final DateTime timestamp;
  final double? latitude;
  final double? longitude;
  final double? accuracyM;
  bool isSyncing;

  QueuedOfflineCheckin({
    required this.id,
    required this.courseCode,
    required this.code,
    required this.indexNumber,
    required this.timestamp,
    this.latitude,
    this.longitude,
    this.accuracyM,
    this.isSyncing = false,
  });
}
