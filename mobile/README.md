# Student Mobile App (Android / Flutter)
**Biometric Class Attendance System · Specification Build v1.1**

This is the standalone student mobile app built strictly according to the architecture specified in Section 4.2 and Section 9.1 of the development document.

---

### Features & 12 Screen Implementations
1. **S1 Login**: Student sign-in by index number and password with lockout protection.
2. **S2 Register**: Full name, index number, institutional email OTP verification, password, and biometric consent notice (Ghana Data Protection Act 843).
3. **S3 Face Capture**: 4-step guided enrollment poses (center, turn left, turn right, blink) creating the encrypted reference template.
4. **S4 My Classes**: Enrolled courses from lecturer rosters with live "Open now" indicators and "Not in a class yet?" fallback.
5. **S5 Photo Request**: Student privacy approval/rejection when a lecturer uploads an index with an unverified email.
6. **S6 Join Session**: Course details, QR camera scanner, or 6-character rotating code entry with student identity confirmation.
7. **S7 Selfie & Liveness**: Wide-frame camera capture with classroom background, randomized on-device liveness prompts, 60s countdown, and GPS accuracy checking.
8. **S8 Result**: "Present" or "Sent to lecturer for review" with plain-language reasons.
9. **S9 History**: Course attendance percentage vs 75% institutional threshold and session logs.
10. **S10 Offline Queue**: Encrypted on-device queue for poor/no network check-ins with automatic retries and lecturer manual-mark guidance.
11. **S11 Profile**: Reference photo status, bound phone status, re-capture photo, and request new phone re-bind flow.
12. **S12 Dispute**: "This index number is mine" claim workflow for in-person administrative resolution.

---

### Prerequisites
- **Flutter SDK**: `>= 3.16.0` (Dart `>= 3.2.0`)
- **Android Studio / Android SDK**: API Level 26+ (Android 8.0+)
- **Device**: Android phone with front camera (supports 2 GB RAM budget devices)

---

### How to Run Locally

1. **Install dependencies**:
   ```bash
   cd mobile
   flutter pub get
   ```

2. **Configure API Endpoint**:
   Edit `lib/services/api_service.dart` or pass via environment variable:
   ```dart
   String baseUrl = 'https://your-api-domain.com/api';
   ```

3. **Run on connected Android device or emulator**:
   ```bash
   flutter run
   ```

4. **Build Release APK**:
   ```bash
   flutter build apk --release
   ```
   The generated APK will be at `build/app/outputs/flutter-apk/app-release.apk` (under 30 MB).
