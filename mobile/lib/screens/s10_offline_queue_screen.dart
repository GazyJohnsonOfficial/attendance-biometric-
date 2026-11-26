import 'package:flutter/material.dart';
import '../services/api_service.dart';

class S10OfflineQueueScreen extends StatefulWidget {
  final ApiService api;
  final String courseCode;
  final String code;
  final String indexNumber;

  const S10OfflineQueueScreen({
    super.key,
    required this.api,
    required this.courseCode,
    required this.code,
    required this.indexNumber,
  });

  @override
  State<S10OfflineQueueScreen> createState() => _S10OfflineQueueScreenState();
}

class _S10OfflineQueueScreenState extends State<S10OfflineQueueScreen> {
  bool _isRetrying = false;
  String? _statusNotice;

  void _retrySubmission() async {
    setState(() {
      _isRetrying = true;
      _statusNotice = null;
    });

    try {
      final challenge = await widget.api.startCheckin(
        code: widget.code,
        indexNumber: widget.indexNumber,
      );
      final result = await widget.api.submitCheckin(
        challengeId: challenge.challengeId,
        indexNumber: widget.indexNumber,
      );
      setState(() {
        _statusNotice = result.isPresent
            ? 'Connection restored! Attendance successfully marked.'
            : 'Submitted for lecturer review.';
      });
    } catch (_) {
      setState(() {
        _statusNotice = 'Network still unreachable. Your record is securely saved and will auto-sync.';
      });
    } finally {
      if (mounted) setState(() => _isRetrying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('Offline check-in', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        backgroundColor: Colors.white,
        elevation: 0.5,
        foregroundColor: Colors.black87,
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: const [
                      Icon(Icons.wifi_off, color: Color(0xFFD97706), size: 24),
                      SizedBox(width: 10),
                      Text(
                        'No connection',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF111827)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Your attendance selfie and signed Keystore challenge are saved on this phone. They will automatically be submitted as soon as you are back online.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF4B5563), height: 1.4),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(widget.courseCode, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                            const SizedBox(height: 2),
                            const Text('Saved locally · waiting to send', style: TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text('Queued', style: TextStyle(color: Color(0xFF92400E), fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            if (_statusNotice != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF93C5FD)),
                ),
                child: Text(_statusNotice!, style: const TextStyle(color: Color(0xFF1E40AF), fontSize: 12)),
              ),
            ],

            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _isRetrying ? null : _retrySubmission,
              icon: _isRetrying
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.sync, color: Colors.white),
              label: const Text('Retry now', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0F766E),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),

            const Spacer(),

            // Phone problem / fallback guidance (PDF S10)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text('Phone problem?', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF374151))),
                  SizedBox(height: 4),
                  Text(
                    'Dead battery or broken screen: your lecturer can mark you manually with an approved excuse reason.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF6B7280), height: 1.4),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
