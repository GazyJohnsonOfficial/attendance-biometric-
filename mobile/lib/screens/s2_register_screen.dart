import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 's3_face_capture_screen.dart';
import 's12_dispute_claim_screen.dart';

class S2RegisterScreen extends StatefulWidget {
  final ApiService api;
  const S2RegisterScreen({super.key, required this.api});

  @override
  State<S2RegisterScreen> createState() => _S2RegisterScreenState();
}

class _S2RegisterScreenState extends State<S2RegisterScreen> {
  final _nameController = TextEditingController();
  final _indexController = TextEditingController();
  final _emailController = TextEditingController();
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _otpSent = false;
  String? _previewOtpHint;
  bool _consentGiven = false;
  bool _isLoading = false;
  String? _errorMessage;

  void _sendOtp() async {
    final name = _nameController.text.trim();
    final index = _indexController.text.trim();
    final email = _emailController.text.trim();

    if (name.isEmpty || index.isEmpty || email.isEmpty) {
      setState(() => _errorMessage = 'Please complete your full name, index number, and email.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await widget.api.registerStart(fullName: name, indexNumber: index, email: email);
      setState(() {
        _otpSent = true;
        _previewOtpHint = res['previewOtp'];
        if (_previewOtpHint != null) {
          _otpController.text = _previewOtpHint!;
        }
      });
    } catch (e) {
      final msg = e.toString().replaceAll('Exception: ', '');
      if (msg.contains('already registered')) {
        _promptIndexTaken(index, email, name);
      } else {
        setState(() => _errorMessage = msg);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _promptIndexTaken(String index, String email, String name) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => S12DisputeClaimScreen(
          api: widget.api,
          indexNumber: index,
          email: email,
          fullName: name,
        ),
      ),
    );
  }

  void _completeRegistration() async {
    final index = _indexController.text.trim();
    final email = _emailController.text.trim();
    final code = _otpController.text.trim();
    final pass = _passwordController.text.trim();

    if (code.length != 6) {
      setState(() => _errorMessage = 'Enter the 6-digit verification code.');
      return;
    }
    if (pass.length < 6) {
      setState(() => _errorMessage = 'Password must be at least 6 characters.');
      return;
    }
    if (!_consentGiven) {
      setState(() => _errorMessage = 'You must accept the biometric consent notice.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final user = await widget.api.registerVerify(
        indexNumber: index,
        email: email,
        code: code,
        password: pass,
        consentGiven: _consentGiven,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => S3FaceCaptureScreen(api: widget.api, user: user),
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Register student', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0,
      ),
      backgroundColor: const Color(0xFFF9FAFB),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Create your attendance profile',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF111827)),
            ),
            const SizedBox(height: 6),
            const Text(
              'No class is needed yet. Classes appear automatically once your lecturer adds you.',
              style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
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
            const Text('Full name', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                hintText: 'Ama Boateng',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 14),
            const Text('Index number', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            TextField(
              controller: _indexController,
              decoration: InputDecoration(
                hintText: '5231001',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 14),
            const Text('Institutional email', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            TextField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(
                hintText: 'ama.boateng@st.school.edu.gh',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 16),
            if (!_otpSent) ...[
              ElevatedButton(
                onPressed: _isLoading ? null : _sendOtp,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: _isLoading
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Send verification code', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ] else ...[
              if (_previewOtpHint != null) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE6FFFA),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFF319795)),
                  ),
                  child: Text('Preview code: $_previewOtpHint', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                ),
                const SizedBox(height: 14),
              ],
              const Text('6-digit email code', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              TextField(
                controller: _otpController,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, letterSpacing: 6, fontWeight: FontWeight.bold),
                maxLength: 6,
                decoration: InputDecoration(
                  hintText: '123456',
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 10),
              const Text('Sign-in password', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: InputDecoration(
                  hintText: 'Choose password (6+ characters)',
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Checkbox(
                    value: _consentGiven,
                    onChanged: (v) => setState(() => _consentGiven = v ?? false),
                    activeColor: const Color(0xFF0F766E),
                  ),
                  const Expanded(
                    child: Text(
                      'I consent to my face photo being used for attendance verification and shown to lecturers who add me to their class roster (Act 843).',
                      style: TextStyle(fontSize: 12, color: Color(0xFF374151), height: 1.4),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _isLoading ? null : _completeRegistration,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: _isLoading
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Continue to face capture', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
