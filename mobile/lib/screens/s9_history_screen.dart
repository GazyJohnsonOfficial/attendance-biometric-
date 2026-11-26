import 'package:flutter/material.dart';
import '../models/student_models.dart';
import '../services/api_service.dart';

class S9HistoryScreen extends StatefulWidget {
  final ApiService api;
  final String studentIndex;
  final Function(int) onTabChanged;

  const S9HistoryScreen({
    super.key,
    required this.api,
    required this.studentIndex,
    required this.onTabChanged,
  });

  @override
  State<S9HistoryScreen> createState() => _S9HistoryScreenState();
}

class _S9HistoryScreenState extends State<S9HistoryScreen> {
  int _percentage = 87;
  int _totalSessions = 15;
  int _attendedCount = 13;
  int _threshold = 75;
  List<AttendanceHistoryRecord> _records = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  void _loadHistory() async {
    setState(() => _isLoading = true);
    try {
      final data = await widget.api.getAttendanceHistory(widget.studentIndex);
      final rawList = data['records'] as List? ?? [];
      setState(() {
        _percentage = data['percentage'] ?? 87;
        _totalSessions = data['totalSessions'] ?? 15;
        _attendedCount = data['attendedCount'] ?? 13;
        _threshold = data['thresholdPercentage'] ?? 75;
        _records = rawList.map((r) => AttendanceHistoryRecord.fromJson(r)).toList();
        _isLoading = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'present':
        return const Color(0xFF059669);
      case 'needs_review':
        return const Color(0xFFD97706);
      case 'excused':
        return const Color(0xFF2563EB);
      default:
        return const Color(0xFFDC2626);
    }
  }

  Color _statusBg(String status) {
    switch (status) {
      case 'present':
        return const Color(0xFFD1FAE5);
      case 'needs_review':
        return const Color(0xFFFEF3C7);
      case 'excused':
        return const Color(0xFFDBEAFE);
      default:
        return const Color(0xFFFEE2E2);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('Attendance History', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: Color(0xFF111827))),
        backgroundColor: Colors.white,
        elevation: 0.5,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Top Percentage Card (PDF S9)
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        '$_percentage%',
                        style: TextStyle(
                          fontSize: 42,
                          fontWeight: FontWeight.bold,
                          color: _percentage >= _threshold ? const Color(0xFF0F766E) : const Color(0xFFDC2626),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$_attendedCount of $_totalSessions sessions · minimum $_threshold%',
                        style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                      ),
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: _percentage / 100.0,
                          minHeight: 8,
                          backgroundColor: const Color(0xFFE5E7EB),
                          valueColor: AlwaysStoppedAnimation<Color>(
                            _percentage >= _threshold ? const Color(0xFF0F766E) : const Color(0xFFDC2626),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 20),
                const Text(
                  'Past Sessions',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF374151)),
                ),
                const SizedBox(height: 10),

                if (_records.isEmpty) ...[
                  // Sample mock items matching PDF S9 wireframe
                  _buildMockRow('24 Nov', 'CS 305 · Routing Protocols', 'present'),
                  _buildMockRow('17 Nov', 'CS 305 · IP Addressing & CIDR', 'needs_review'),
                  _buildMockRow('10 Nov', 'CS 305 · Network Topologies', 'present'),
                  _buildMockRow('03 Nov', 'CS 305 · OSI Model Layer 2', 'absent'),
                  _buildMockRow('27 Oct', 'CS 305 · Intro to Networks', 'excused'),
                ] else ...[
                  ..._records.map((r) => _buildRow(r)),
                ],
              ],
            ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: 1,
        onTap: widget.onTabChanged,
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

  Widget _buildMockRow(String date, String title, String status) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(date, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF111827))),
              Text(title, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: _statusBg(status),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              status == 'needs_review' ? 'Review' : status[0].toUpperCase() + status.substring(1),
              style: TextStyle(color: _statusColor(status), fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRow(AttendanceHistoryRecord r) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${r.date.day} ${_monthName(r.date.month)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
              Text('${r.courseCode} · ${r.topic}', style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: _statusBg(r.status),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              r.status == 'needs_review' ? 'Review' : r.status[0].toUpperCase() + r.status.substring(1),
              style: TextStyle(color: _statusColor(r.status), fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  String _monthName(int month) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  }
}
