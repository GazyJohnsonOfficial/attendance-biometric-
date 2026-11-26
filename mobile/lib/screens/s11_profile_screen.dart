import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 's1_login_screen.dart';

class S11ProfileScreen extends StatefulWidget {
  final ApiService api;
  final String studentIndex;
  final Function(int) onTabChanged;

  const S11ProfileScreen({
    super.key,
    required this.api,
    required this.studentIndex,
    required this.onTabChanged,
  });

  @override
  State<S11ProfileScreen> createState() => _S11ProfileScreenState();
}

class _S11ProfileScreenState extends State<S11ProfileScreen> {
  bool _recapturePending = false;
  bool _deviceRebindPending = false;

  void _requestRecapture() {
    setState(() => _recapturePending = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Photo re-capture submitted. Pending administrator approval.')),
    );
  }

  void _requestNewPhone() {
    setState(() => _deviceRebindPending = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Device re-bind request submitted with email verification.')),
    );
  }

  void _logout() {
    widget.api.setToken(null);
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => S1LoginScreen(api: widget.api)),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Text('Student Profile', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: Color(0xFF111827))),
        backgroundColor: Colors.white,
        elevation: 0.5,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Student identity tile
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: const Color(0xFF263A43),
                  child: Text(
                    widget.studentIndex.substring(widget.studentIndex.length - 2),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Ama Boateng', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      const SizedBox(height: 2),
                      Text('Index: ${widget.studentIndex}', style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                      Text('ama.boateng@st.school.edu.gh', style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF))),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Registration photo status (PDF S11)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Registration photo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text(
                      _recapturePending ? 'Re-capture pending approval' : 'Confirmed by 2 lecturers',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _recapturePending ? const Color(0xFFFEF3C7) : const Color(0xFFD1FAE5),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    _recapturePending ? 'Pending' : 'Active',
                    style: TextStyle(
                      color: _recapturePending ? const Color(0xFF92400E) : const Color(0xFF065F46),
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Bound device status (PDF S11)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('This phone', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text(
                      _deviceRebindPending ? 'Re-bind request submitted' : 'Hardware Keystore bound',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD1FAE5),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Text('Bound', style: TextStyle(color: Color(0xFF065F46), fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          OutlinedButton(
            onPressed: _requestRecapture,
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Re-capture photo', style: TextStyle(color: Color(0xFF0F766E), fontWeight: FontWeight.bold)),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: _requestNewPhone,
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Request new phone re-bind', style: TextStyle(color: Color(0xFF374151), fontWeight: FontWeight.bold)),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: _logout,
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Color(0xFFEF4444)),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Log out', style: TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: 2,
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
}
