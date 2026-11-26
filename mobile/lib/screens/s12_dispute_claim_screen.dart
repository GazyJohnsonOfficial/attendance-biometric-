import 'package:flutter/material.dart';
import '../services/api_service.dart';

class S12DisputeClaimScreen extends StatefulWidget {
  final ApiService api;
  final String indexNumber;
  final String email;
  final String fullName;

  const S12DisputeClaimScreen({
    super.key,
    required this.api,
    required this.indexNumber,
    required this.email,
    required this.fullName,
  });

  @override
  State<S12DisputeClaimScreen> createState() => _S12DisputeClaimScreenState();
}

class _S12DisputeClaimScreenState extends State<S12DisputeClaimScreen> {
  final _reasonController = TextEditingController(
    text: 'I am the registered student for this index number. The previous registration was done without my authorization.',
  );
  bool _isSubmitting = false;
  bool _claimSubmitted = false;
  String? _errorMessage;

  void _submitClaim() async {
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() => _errorMessage = 'Please explain your identity claim.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      await widget.api.claimIndexNumber(
        indexNumber: widget.indexNumber,
        email: widget.email,
        fullName: widget.fullName,
        reason: reason,
      );
      setState(() => _claimSubmitted = true);
    } catch (e) {
      setState(() => _errorMessage = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('Index number taken', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        backgroundColor: Colors.white,
        elevation: 0.5,
        foregroundColor: Colors.black87,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFFDE68A)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: const [
                      Icon(Icons.warning_amber_rounded, color: Color(0xFFD97706), size: 24),
                      SizedBox(width: 8),
                      Text(
                        'Index number already registered',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF92400E)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Index number ${widget.indexNumber} is already associated with an active student profile.',
                    style: const TextStyle(fontSize: 13, color: Color(0xFF78350F), height: 1.4),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'If this is your genuine student ID, submit an identity claim below. The campus administrator will verify your Student ID card and resolve the dispute in person.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF92400E), height: 1.4),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

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

            if (!_claimSubmitted) ...[
              const Text('Explanation for the administrator', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              TextField(
                controller: _reasonController,
                maxLines: 4,
                decoration: InputDecoration(
                  hintText: 'Describe your situation...',
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submitClaim,
                icon: const Icon(Icons.shield, color: Colors.white),
                label: const Text('This index number is mine', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => Navigator.pop(context),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Cancel & try a different index', style: TextStyle(color: Color(0xFF4B5563))),
              ),
            ] else ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFD1FAE5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF10B981)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text('Dispute case opened', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF065F46))),
                    SizedBox(height: 6),
                    Text(
                      'Check-in is temporarily locked for this index number until an administrator reviews your case in person. Until then, your lecturer can record attendance manually with an excuse note.',
                      style: TextStyle(fontSize: 12, color: Color(0xFF047857), height: 1.4),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Return to Login', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
