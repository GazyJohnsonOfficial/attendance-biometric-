import 'dart:async';
import 'package:flutter/material.dart';
import '../models/student_models.dart';
import '../services/api_service.dart';
import 's8_result_screen.dart';
import 's10_offline_queue_screen.dart';

class S7SelfieLivenessScreen extends StatefulWidget {
  final ApiService api;
  final CheckinChallenge challenge;
  final String studentIndex;
  final EnrolledClass enrolledClass;
  final String enteredCode;

  const S7SelfieLivenessScreen({
    super.key,
    required this.api,
    required this.challenge,
    required this.studentIndex,
    required this.enrolledClass,
    required this.enteredCode,
  });

  @override
  State<S7SelfieLivenessScreen> createState() => _S7SelfieLivenessScreenState();
}

class _S7SelfieLivenessScreenState extends State<S7SelfieLivenessScreen> {
  int _secondsLeft = 60;
  Timer? _timer;
  bool _livenessPromptCompleted = false;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  void _startCountdown() {
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_secondsLeft > 1) {
        setState(() => _secondsLeft--);
      } else {
        t.cancel();
        _submitVerification(timeout: true);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _promptText {
    switch (widget.challenge.livenessPrompt) {
      case 'blink_twice':
        return 'Blink twice naturally';
      case 'turn_head_left':
        return 'Turn head slightly to the left';
      case 'turn_head_right':
        return 'Turn head slightly to the right';
      case 'smile':
        return 'Smile naturally';
      default:
        return 'Blink naturally';
    }
  }

  void _simulateLivenessAction() {
    setState(() => _livenessPromptCompleted = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Liveness prompt confirmed by on-device ML Kit!'),
        duration: Duration(milliseconds: 1500),
      ),
    );
  }

  void _submitVerification({bool timeout = false}) async {
    _timer?.cancel();
    setState(() => _isSubmitting = true);

    try {
      final result = await widget.api.submitCheckin(
        challengeId: widget.challenge.challengeId,
        indexNumber: widget.studentIndex,
        latitude: 4.9016,
        longitude: -1.7831,
        accuracyM: 20,
        mockLocation: false,
        livenessCompleted: _livenessPromptCompleted && !timeout,
        photoKey: 'yaw-checkin-wide',
      );

      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => S8ResultScreen(
            result: result,
            courseCode: widget.challenge.courseCode,
            studentIndex: widget.studentIndex,
            api: widget.api,
          ),
        ),
      );
    } catch (_) {
      // Network failure -> route to S10 Offline Queue
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => S10OfflineQueueScreen(
            api: widget.api,
            courseCode: widget.challenge.courseCode,
            code: widget.enteredCode,
            indexNumber: widget.studentIndex,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF141F26),
      appBar: AppBar(
        title: const Text('Verify it is you', style: TextStyle(color: Colors.white, fontSize: 16)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          child: Column(
            children: [
              // Liveness Prompt Banner (PDF S7)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: _livenessPromptCompleted ? const Color(0xFF065F46) : const Color(0xFF0F766E),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _livenessPromptCompleted ? Icons.check_circle : Icons.camera_front,
                      color: Colors.white,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _livenessPromptCompleted ? 'Liveness verified' : _promptText,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 12),

              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white12,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('Device OK', style: TextStyle(color: Colors.greenAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white12,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('Location active', style: TextStyle(color: Colors.greenAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white12,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text('0:${_secondsLeft.toString().padLeft(2, '0')}', style: const TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),

              const Spacer(),

              // Wide frame selfie preview simulation
              Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 250,
                    height: 320,
                    decoration: BoxDecoration(
                      shape: BoxShape.rectangle,
                      borderRadius: BorderRadius.circular(125),
                      border: Border.all(
                        color: _livenessPromptCompleted ? const Color(0xFF10B981) : const Color(0xFF319795),
                        width: 3.5,
                      ),
                      color: Colors.black45,
                    ),
                    child: const Center(
                      child: Icon(Icons.person, size: 100, color: Colors.white24),
                    ),
                  ),
                  if (!_livenessPromptCompleted)
                    Positioned(
                      bottom: 20,
                      child: TextButton.icon(
                        onPressed: _simulateLivenessAction,
                        icon: const Icon(Icons.touch_app, size: 16, color: Colors.amberAccent),
                        label: const Text('Tap to simulate action', style: TextStyle(color: Colors.amberAccent, fontSize: 12)),
                      ),
                    ),
                ],
              ),

              const Spacer(),

              const Text(
                'Keep your face inside the oval with the classroom visible in the background.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.4),
              ),

              const SizedBox(height: 20),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.white38),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Cancel', style: TextStyle(color: Colors.white)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _isSubmitting ? null : () => _submitVerification(),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0F766E),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: _isSubmitting
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Submit check-in', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
