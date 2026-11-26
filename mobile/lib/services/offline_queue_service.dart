import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/student_models.dart';
import 'api_service.dart';

class OfflineQueueService extends ChangeNotifier {
  final ApiService _api;
  final List<QueuedOfflineCheckin> _queue = [];

  OfflineQueueService(this._api);

  List<QueuedOfflineCheckin> get queue => List.unmodifiable(_queue);
  int get count => _queue.length;

  void enqueue({
    required String courseCode,
    required String code,
    required String indexNumber,
    double? latitude,
    double? longitude,
    double? accuracyM,
  }) {
    final item = QueuedOfflineCheckin(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      courseCode: courseCode,
      code: code,
      indexNumber: indexNumber,
      timestamp: DateTime.now(),
      latitude: latitude,
      longitude: longitude,
      accuracyM: accuracyM,
    );
    _queue.insert(0, item);
    notifyListeners();
  }

  Future<bool> retryItem(QueuedOfflineCheckin item) async {
    item.isSyncing = true;
    notifyListeners();

    try {
      final challenge = await _api.startCheckin(
        code: item.code,
        indexNumber: item.indexNumber,
      );
      final result = await _api.submitCheckin(
        challengeId: challenge.challengeId,
        indexNumber: item.indexNumber,
        latitude: item.latitude,
        longitude: item.longitude,
        accuracyM: item.accuracyM,
      );
      if (result.isPresent || result.status == 'needs_review') {
        _queue.removeWhere((q) => q.id == item.id);
        notifyListeners();
        return true;
      }
      return false;
    } catch (_) {
      item.isSyncing = false;
      notifyListeners();
      return false;
    }
  }

  void remove(String id) {
    _queue.removeWhere((q) => q.id == id);
    notifyListeners();
  }
}
