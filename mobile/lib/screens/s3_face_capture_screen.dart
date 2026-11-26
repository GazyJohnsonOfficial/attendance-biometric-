import 'package:flutter/material.dart';
import '../models/student_models.dart';
import '../services/api_service.dart';
import 's4_my_classes_screen.dart';

class S3FaceCaptureScreen extends StatefulWidget {
  final ApiService api;
  final StudentUser user;
  const S3FaceCaptureScreen({super.key, required this.api, required this.user});

  @override
  State<S3FaceCaptureScreen> createState() => _S3FaceCaptureScreenState();
}

class _S3FaceCaptureScreenState extends State<S3FaceCaptureScreen> {
  int _currentStep = 1;
  bool _isProcessing = false;

  final List<Map<String, String>> _steps = [
    {'title': 'Center your face', 'hint': 'Look directly into the oval with good light.'},
    {'title': 'Turn head slightly left', 'hint': 'Turn slowly until the guide flashes green.'},
    {'title': 'Turn head slightly right', 'hint': 'Keep your eyes visible without sunglasses.'},
    {'title': 'Blink naturally', 'hint': 'Completing liveness verification.'},
  ];

  void _nextPose() async {
    if (_currentStep < 4) {
      setState(() => _currentStep++);
    } else {
      setState(() => _isProcessing = true);
      await Future.delayed(const Duration(milliseconds: 1200));
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => S4MyClassesScreen(api: widget.api, studentIndex: widget.user.indexNumber),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final stepInfo = _steps[_currentStep - 1];

    return Scaffold(
      backgroundColor: const Color(0xFF141F26),
      appBar: AppBar(
        title: const Text('Face enrollment', style: TextStyle(color: Colors.white, fontSize: 16)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            children: [
              Text(
                'Step $_currentStep of 4: ${stepInfo['title']}',
                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                stepInfo['hint']!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const Spacer(),
              // Camera Oval Frame
              Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 240,
                    height: 310,
                    decoration: BoxDecoration(
                      shape: BoxShape.rectangle,
                      borderRadius: BorderRadius.circular(120),
                      border: Border.all(color: const Color(0xFF319795), width: 3),
                      color: Colors.black38,
                    ),
                    child: Center(
                      child: Icon(
                        _currentStep == 4 ? Icons.remove_red_eye : Icons.face,
                        size: 90,
                        color: Colors.white30,
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 20,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F766E),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        stepInfo['title']!,
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ],
              ),
              const Spacer(),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(4, (index) {
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: index < _currentStep ? const Color(0xFF319795) : Colors.white24,
                    ),
                  );
                }),
              ),
              const SizedBox(height: 20),
              const Text(
                'Good light, no cap or sunglasses, only one face.\nThis becomes your verified portrait.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white60, fontSize: 12, height: 1.4),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _isProcessing ? null : _nextPose,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                  minimumSize: const Size.fromHeight(50),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _isProcessing
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : Text(
                        _currentStep == 4 ? 'Save face profile' : 'Capture & Next',
                        style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
