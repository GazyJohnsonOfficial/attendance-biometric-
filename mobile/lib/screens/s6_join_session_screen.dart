import 'package:flutter/material.dart';
import '../models/student_models.dart';
import '../services/api_service.dart';
import 's7_selfie_liveness_screen.dart';

class S6JoinSessionScreen extends StatefulWidget {
  final ApiService api;
  final EnrolledClass enrolledClass;
  final String studentIndex;
  final String? initialCode;

  const S6JoinSessionScreen({
    super.key,
    required this.api,
    required this.enrolledClass,
    required this.studentIndex,
    this.initialCode,
  });

  @override
  State<S6JoinSessionScreen> createState() => _S6JoinSessionScreenState();
}

class _S6JoinSessionScreenState extends State<S6JoinSessionScreen> {
  final _codeController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    if (widget.initialCode != null) {
      _codeController.text = widget.initialCode!;
    }
  }

  void _proceedToLiveness() async {
    final code = _codeController.text.trim();
    if (code.isEmpty) {
      setState(() => _errorMessage = 'Scan the projector QR code or enter the 6-character code.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final challenge = await widget.api.startCheckin(
        code: code,
        indexNumber: widget.studentIndex,
      );
      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => S7SelfieLivenessScreen(
            api: widget.api,
            challenge: challenge,
            studentIndex: widget.studentIndex,
            enrolledClass: widget.enrolledClass,
            enteredCode: code,
          ),
        ),
      );
    } catch (e) {
      setState(() => _errorMessage = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final active = widget.enrolledClass.activeSession;

    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('Join attendance session', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        backgroundColor: Colors.white,
        elevation: 0.5,
        foregroundColor: Colors.black87,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Session Details Card (PDF S6)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: const Color(0xFF263A43),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        widget.enrolledClass.courseCode,
                        style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text('Live', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    widget.enrolledClass.courseTitle,
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  const Divider(color: Colors.white24),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.location_on, color: Color(0xFFF5C556), size: 15),
                      const SizedBox(width: 6),
                      Text(
                        active?.venue ?? 'Lecture Hall',
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                      ),
                      const Spacer(),
                      if (active?.id != null)
                        Text(
                          'ID: ${active!.id.substring(0, 8).toUpperCase()}',
                          style: const TextStyle(color: Colors.white60, fontSize: 11, fontFamily: 'monospace'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            if (_errorMessage != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFF87171)),
                ),
                child: Text(_errorMessage!, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 13)),
              ),
              const SizedBox(height: 16),
            ],

            OutlinedButton.icon(
              onPressed: () {
                // In demo/mobile scanner mode, simulate scanning from camera
                setState(() {
                  _codeController.text = 'K7Q2XP';
                });
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Simulated QR camera scan: Code captured')),
                );
              },
              icon: const Icon(Icons.qr_code_scanner, color: Color(0xFF0F766E)),
              label: const Text('Scan Projector QR Code', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0F766E))),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: const BorderSide(color: Color(0xFF0F766E), width: 1.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),

            const SizedBox(height: 16),
            Row(
              children: const [
                Expanded(child: Divider()),
                Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('or enter typed code', style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 12))),
                Expanded(child: Divider()),
              ],
            ),
            const SizedBox(height: 16),

            const Text('Session Code (e.g. K7Q-2XP)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            TextField(
              controller: _codeController,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, letterSpacing: 4, fontWeight: FontWeight.bold, fontFamily: 'monospace'),
              decoration: InputDecoration(
                hintText: 'K7Q-2XP',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),

            const SizedBox(height: 20),

            // Identity confirmation block (PDF S6)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.person_pin, color: Color(0xFF0F766E)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Marking attendance as', style: TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                        Text(
                          'Student ID: ${widget.studentIndex}',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF111827)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _isLoading ? null : _proceedToLiveness,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0F766E),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: _isLoading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Continue to verification', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
            ),
          ],
        ),
      ),
    );
  }
}
