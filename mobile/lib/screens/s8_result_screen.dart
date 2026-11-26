import 'package:flutter/material.dart';
import '../models/student_models.dart';
import '../services/api_service.dart';
import 's4_my_classes_screen.dart';

class S8ResultScreen extends StatelessWidget {
  final CheckinResult result;
  final String courseCode;
  final String studentIndex;
  final ApiService api;

  const S8ResultScreen({
    super.key,
    required this.result,
    required this.courseCode,
    required this.studentIndex,
    required this.api,
  });

  @override
  Widget build(BuildContext context) {
    final isPresent = result.isPresent;

    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Center(
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isPresent ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7),
                  ),
                  child: Icon(
                    isPresent ? Icons.check_circle : Icons.hourglass_top,
                    size: 48,
                    color: isPresent ? const Color(0xFF059669) : const Color(0xFFD97706),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                isPresent ? 'Present' : 'Sent for review',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  color: isPresent ? const Color(0xFF065F46) : const Color(0xFF92400E),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '$courseCode · ${result.markedAt.hour.toString().padLeft(2, '0')}:${result.markedAt.minute.toString().padLeft(2, '0')}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
              ),
              const SizedBox(height: 28),

              // Detail checklist (PDF S8)
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                ),
                child: Column(
                  children: [
                    _buildCheckItem(
                      icon: Icons.face,
                      title: 'Face verification',
                      status: isPresent ? 'Verified (High match)' : 'Needs lecturer check',
                      ok: isPresent,
                    ),
                    const Divider(height: 20),
                    _buildCheckItem(
                      icon: Icons.phone_android,
                      title: 'Device key',
                      status: 'Registered hardware keystore',
                      ok: true,
                    ),
                    const Divider(height: 20),
                    _buildCheckItem(
                      icon: Icons.location_on,
                      title: 'Location check',
                      status: 'Near lecture hall',
                      ok: true,
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              if (!isPresent) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFBEB),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFDE68A)),
                  ),
                  child: Text(
                    result.message.isNotEmpty
                        ? result.message
                        : 'Your selfie has been submitted to your lecturer for human review.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFF92400E), fontSize: 12),
                  ),
                ),
              ],

              const Spacer(),

              ElevatedButton(
                onPressed: () {
                  Navigator.pushAndRemoveUntil(
                    context,
                    MaterialPageRoute(
                      builder: (_) => S4MyClassesScreen(api: api, studentIndex: studentIndex),
                    ),
                    (route) => false,
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Done', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCheckItem({
    required IconData icon,
    required String title,
    required String status,
    required bool ok,
  }) {
    return Row(
      children: [
        Icon(icon, size: 20, color: ok ? const Color(0xFF0F766E) : const Color(0xFFD97706)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF111827))),
              Text(status, style: TextStyle(fontSize: 12, color: ok ? const Color(0xFF059669) : const Color(0xFFD97706))),
            ],
          ),
        ),
        Icon(ok ? Icons.check : Icons.access_time, size: 18, color: ok ? const Color(0xFF059669) : const Color(0xFFD97706)),
      ],
    );
  }
}
