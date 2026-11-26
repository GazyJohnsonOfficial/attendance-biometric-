import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/student_models.dart';

class ApiService {
  // Configurable base URL (points to backend server)
  String baseUrl = 'http://localhost:3000/api';
  String? authToken;

  void setToken(String? token) {
    authToken = token;
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (authToken != null) 'Authorization': 'Bearer $authToken',
  };

  /// S2: Start Registration (Generate OTP)
  Future<Map<String, dynamic>> registerStart({
    required String fullName,
    required String indexNumber,
    required String email,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/auth/student/register/start'),
      headers: _headers,
      body: jsonEncode({
        'fullName': fullName,
        'indexNumber': indexNumber,
        'email': email,
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Could not start registration.');
    }
    return data;
  }

  /// S2: Verify Registration OTP & Bind Device
  Future<StudentUser> registerVerify({
    required String indexNumber,
    required String email,
    required String code,
    required String password,
    required bool consentGiven,
    String? deviceId,
    String? deviceModel,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/auth/student/register/verify'),
      headers: _headers,
      body: jsonEncode({
        'indexNumber': indexNumber,
        'email': email,
        'code': code,
        'password': password,
        'consentGiven': consentGiven,
        'deviceId': deviceId ?? 'android_hw_keystore_01',
        'deviceModel': deviceModel ?? 'Android Phone',
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Registration verification failed.');
    }
    setToken(data['token']);
    return StudentUser.fromJson(data['user']);
  }

  /// S1: Login
  Future<StudentUser> login({
    required String indexOrEmail,
    required String password,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: _headers,
      body: jsonEncode({
        'email': indexOrEmail.contains('@') ? indexOrEmail : '$indexOrEmail@st.school.edu.gh',
        'password': password,
        'accountType': 'lecturer', // unified endpoint
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Login failed. Check your credentials.');
    }
    setToken(data['token']);
    return StudentUser(
      id: data['user']['id'] ?? 'user_1',
      indexNumber: indexOrEmail,
      fullName: data['user']['fullName'] ?? 'Student',
      email: data['user']['email'] ?? indexOrEmail,
    );
  }

  /// S12: Claim Index Number Dispute
  Future<Map<String, dynamic>> claimIndexNumber({
    required String indexNumber,
    required String email,
    required String fullName,
    required String reason,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/auth/student/claim'),
      headers: _headers,
      body: jsonEncode({
        'indexNumber': indexNumber,
        'email': email,
        'fullName': fullName,
        'reason': reason,
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Could not submit identity claim.');
    }
    return data;
  }

  /// S4: Get Enrolled Classes
  Future<List<EnrolledClass>> getMyClasses(String indexNumber) async {
    final res = await http.get(
      Uri.parse('$baseUrl/v1/me/classes?indexNumber=${Uri.encodeComponent(indexNumber)}'),
      headers: _headers,
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Could not load classes.');
    }
    final rawList = data['classes'] as List? ?? [];
    return rawList.map((c) => EnrolledClass.fromJson(c)).toList();
  }

  /// S6 & S7: Start Check-In (Validate Code, Receive Nonce + Liveness Prompt)
  Future<CheckinChallenge> startCheckin({
    required String code,
    required String indexNumber,
    String? deviceId,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/checkin/start'),
      headers: _headers,
      body: jsonEncode({
        'code': code,
        'indexNumber': indexNumber,
        'deviceId': deviceId ?? 'keystore_bound_phone',
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final err = data['error'];
      throw Exception(err is Map ? (err['message'] ?? 'Check-in failed') : err.toString());
    }
    return CheckinChallenge.fromJson(data);
  }

  /// S7 & S8: Submit Check-In
  Future<CheckinResult> submitCheckin({
    required String challengeId,
    required String indexNumber,
    double? latitude,
    double? longitude,
    double? accuracyM,
    bool mockLocation = false,
    bool livenessCompleted = true,
    String? photoKey,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/checkin/submit'),
      headers: _headers,
      body: jsonEncode({
        'challenge_id': challengeId,
        'indexNumber': indexNumber,
        'latitude': latitude,
        'longitude': longitude,
        'accuracy_m': accuracyM,
        'mock_location': mockLocation,
        'liveness_completed': livenessCompleted,
        'photoKey': photoKey ?? 'yaw-checkin-wide',
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final err = data['error'];
      throw Exception(err is Map ? (err['message'] ?? 'Submission rejected') : err.toString());
    }
    return CheckinResult.fromJson(data);
  }

  /// S9: Attendance History
  Future<Map<String, dynamic>> getAttendanceHistory(String indexNumber) async {
    final res = await http.get(
      Uri.parse('$baseUrl/v1/me/attendance?indexNumber=${Uri.encodeComponent(indexNumber)}'),
      headers: _headers,
    );
    final data = jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw Exception(data['error'] ?? 'Could not fetch history.');
    }
    return data;
  }
}
