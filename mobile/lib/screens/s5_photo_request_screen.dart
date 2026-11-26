import 'package:flutter/material.dart';
import '../services/api_service.dart';

class S5PhotoRequestScreen extends StatefulWidget {
  final ApiService api;
  const S5PhotoRequestScreen({super.key, required this.api});

  @override
  State<S5PhotoRequestScreen> createState() => _S5PhotoRequestScreenState();
}

class _S5PhotoRequestScreenState extends State<S5PhotoRequestScreen> {
  bool _isActionDone = false;
  String _statusMessage = '';

  void _handleDecision(bool approved) {
    setState(() {
      _isActionDone = true;
      _statusMessage = approved
          ? 'Photo release approved. Your lecturer can now verify your portrait.'
          : 'Photo release declined. You can still check in with live selfie review.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('Photo release request', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
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
                  const Text(
                    'Dr. Kwesi Mensah · CS 305',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: Color(0xFF111827)),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'The lecturer uploaded a class roster row with your index number (5231001) but an unverified or alternate email.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF4B5563), height: 1.4),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('Roster email: kwame.a@mail.com', style: TextStyle(fontSize: 12, color: Color(0xFF374151))),
                        SizedBox(height: 4),
                        Text('Your account email: ama.boateng@st.school.edu.gh', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF0F766E))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'If you approve, the lecturer sees your registration portrait, full name and phone number on their roster.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF6B7280), height: 1.4),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (!_isActionDone) ...[
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _handleDecision(false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Decline', style: TextStyle(color: Color(0xFF374151), fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _handleDecision(true),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0F766E),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Approve', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Center(
                child: TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Not you? Report to administrator', style: TextStyle(color: Color(0xFFEF4444), fontSize: 13)),
                ),
              ),
            ] else ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFD1FAE5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF10B981)),
                ),
                child: Text(_statusMessage, style: const TextStyle(color: Color(0xFF065F46), fontSize: 13, height: 1.4)),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Return to My Classes', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
