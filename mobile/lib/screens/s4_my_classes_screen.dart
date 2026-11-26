import 'package:flutter/material.dart';
import '../models/student_models.dart';
import '../services/api_service.dart';
import 's5_photo_request_screen.dart';
import 's6_join_session_screen.dart';
import 's9_history_screen.dart';
import 's11_profile_screen.dart';

class S4MyClassesScreen extends StatefulWidget {
  final ApiService api;
  final String studentIndex;
  const S4MyClassesScreen({super.key, required this.api, required this.studentIndex});

  @override
  State<S4MyClassesScreen> createState() => _S4MyClassesScreenState();
}

class _S4MyClassesScreenState extends State<S4MyClassesScreen> {
  int _selectedTabIndex = 0;
  List<EnrolledClass> _classes = [];
  bool _isLoading = true;
  int _pendingPhotoRequests = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  void _loadData() async {
    setState(() => _isLoading = true);
    try {
      final res = await widget.api.getMyClasses(widget.studentIndex);
      setState(() {
        _classes = res;
        _isLoading = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_selectedTabIndex == 1) {
      return S9HistoryScreen(api: widget.api, studentIndex: widget.studentIndex, onTabChanged: (i) => setState(() => _selectedTabIndex = i));
    }
    if (_selectedTabIndex == 2) {
      return S11ProfileScreen(api: widget.api, studentIndex: widget.studentIndex, onTabChanged: (i) => setState(() => _selectedTabIndex = i));
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('My Classes', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Color(0xFF111827))),
        backgroundColor: Colors.white,
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF4B5563)),
            onPressed: _loadData,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async => _loadData(),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Photo Request Alert Banner (S5 trigger)
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFF59E0B)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.shield_outlined, color: Color(0xFFB45309), size: 28),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: const [
                              Text(
                                'Photo request pending',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF92400E)),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'Dr. Mensah asks to view your verified registration portrait.',
                                style: TextStyle(fontSize: 12, color: Color(0xFF78350F)),
                              ),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => S5PhotoRequestScreen(api: widget.api)),
                            );
                          },
                          child: const Text('Review', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFB45309))),
                        ),
                      ],
                    ),
                  ),

                  const Text(
                    'Level 300 · Semester 1',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF6B7280), letterSpacing: 0.5),
                  ),
                  const SizedBox(height: 10),

                  if (_classes.isEmpty) ...[
                    Container(
                      margin: const EdgeInsets.only(top: 20),
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE5E7EB)),
                      ),
                      child: Column(
                        children: const [
                          Icon(Icons.menu_book, size: 48, color: Color(0xFF9CA3AF)),
                          SizedBox(height: 12),
                          Text(
                            'Not in a class yet?',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                          ),
                          SizedBox(height: 6),
                          Text(
                            'Classes appear automatically when your lecturer uploads the roster. Contact your lecturer if your name is missing.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Color(0xFF6B7280), fontSize: 13, height: 1.4),
                          ),
                        ],
                      ),
                    ),
                  ] else ...[
                    ..._classes.map((cls) {
                      final hasActiveSession = cls.activeSession != null && cls.activeSession!.status == 'open';

                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: hasActiveSession ? const Color(0xFF0F766E) : const Color(0xFFE5E7EB),
                            width: hasActiveSession ? 1.5 : 1,
                          ),
                          boxShadow: const [
                            BoxShadow(color: Color(0x05000000), blurRadius: 4, offset: Offset(0, 2)),
                          ],
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(14),
                            onTap: hasActiveSession
                                ? () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => S6JoinSessionScreen(
                                          api: widget.api,
                                          enrolledClass: cls,
                                          studentIndex: widget.studentIndex,
                                        ),
                                      ),
                                    );
                                  }
                                : null,
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        cls.courseCode,
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF111827)),
                                      ),
                                      if (hasActiveSession) ...[
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFD1FAE5),
                                            borderRadius: BorderRadius.circular(20),
                                            border: Border.all(color: const Color(0xFF10B981)),
                                          ),
                                          child: const Text(
                                            '● Open now',
                                            style: TextStyle(color: Color(0xFF065F46), fontSize: 11, fontWeight: FontWeight.bold),
                                          ),
                                        ),
                                      ] else ...[
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFF3F4F6),
                                            borderRadius: BorderRadius.circular(12),
                                          ),
                                          child: const Text('Idle', style: TextStyle(color: Color(0xFF6B7280), fontSize: 11)),
                                        ),
                                      ],
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    cls.courseTitle,
                                    style: const TextStyle(fontSize: 13, color: Color(0xFF4B5563)),
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    children: [
                                      const Icon(Icons.location_on_outlined, size: 14, color: Color(0xFF6B7280)),
                                      const SizedBox(width: 4),
                                      Text(
                                        cls.activeSession?.venue ?? 'Campus Room',
                                        style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                                      ),
                                      const Spacer(),
                                      if (hasActiveSession)
                                        const Text(
                                          'Tap to mark attendance →',
                                          style: TextStyle(color: Color(0xFF0F766E), fontWeight: FontWeight.bold, fontSize: 12),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  ],
                ],
              ),
            ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedTabIndex,
        onTap: (index) => setState(() => _selectedTabIndex = index),
        selectedItemColor: const Color(0xFF0F766E),
        unselectedItemColor: const Color(0xFF9CA3AF),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.school), label: 'Classes'),
          BottomNavigationBarItem(icon: Icon(Icons.bar_chart), label: 'History'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
