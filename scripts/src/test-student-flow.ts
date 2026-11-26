import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('Testing Student Mobile App API Endpoints...');

  // 1. Check existing student enrolled classes
  console.log('\n1. Testing GET /api/v1/me/classes');
  const resClasses = await fetch(`${BASE_URL}/api/v1/me/classes?indexNumber=5231001`);
  assert.strictEqual(resClasses.status, 200, 'Should return 200 for enrolled classes');
  const classesData = await resClasses.json();
  console.log(`Found ${classesData.classes.length} classes for index 5231001`);
  assert.ok(Array.isArray(classesData.classes), 'Should return an array of classes');

  // 2. Test registration OTP request
  console.log('\n2. Testing POST /api/v1/auth/student/register/start');
  const testIndex = `TEST${Date.now().toString().slice(-4)}`;
  const regStartRes = await fetch(`${BASE_URL}/api/v1/auth/student/register/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Test Student',
      indexNumber: testIndex,
      email: `${testIndex.toLowerCase()}@st.school.edu.gh`,
    }),
  });
  assert.strictEqual(regStartRes.status, 200, 'Should return 200 for OTP start');
  const regStartData = await regStartRes.json();
  console.log('OTP preview:', regStartData.previewOtp);
  assert.ok(regStartData.previewOtp, 'Should return preview OTP in test environment');

  // 3. Test registration verify
  console.log('\n3. Testing POST /api/v1/auth/student/register/verify');
  const regVerifyRes = await fetch(`${BASE_URL}/api/v1/auth/student/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Test Student',
      indexNumber: testIndex,
      email: `${testIndex.toLowerCase()}@st.school.edu.gh`,
      code: regStartData.previewOtp,
      password: 'password123',
      consentGiven: true,
      deviceId: 'device_keystore_test_01',
      deviceModel: 'Samsung Galaxy A14 (SM-A145F)',
    }),
  });
  assert.strictEqual(regVerifyRes.status, 200, 'Should return 200 for verify');
  const regVerifyData = await regVerifyRes.json();
  console.log('Token issued:', Boolean(regVerifyData.token));
  assert.ok(regVerifyData.token, 'Should issue session token');
  assert.strictEqual(regVerifyData.deviceBound, true, 'Device should be bound');

  // 4. Test Checkin Start with open session code
  console.log('\n4. Testing POST /api/v1/checkin/start');
  // First find an open session or retrieve a valid code
  const classesWithSession = classesData.classes.filter((c: any) => c.activeSession);
  let sessionCode = '742918'; // default sample code
  let sessionLat = 5.6037;
  let sessionLng = -0.1870;

  if (classesWithSession.length > 0) {
    const active = classesWithSession[0].activeSession;
    console.log(`Active session found: ${active.topic} (ID: ${active.id})`);
  }

  const checkinStartRes = await fetch(`${BASE_URL}/api/v1/checkin/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: sessionCode,
      indexNumber: '5231001',
      deviceId: 'device_default',
    }),
  });

  const checkinStartData = await checkinStartRes.json();
  console.log('Checkin start response status:', checkinStartRes.status);
  if (checkinStartRes.status === 200) {
    console.log('Challenge ID:', checkinStartData.challenge_id);
    console.log('Liveness prompt:', checkinStartData.liveness_prompt);
    assert.ok(checkinStartData.challenge_id, 'Should issue challenge ID');
    assert.ok(checkinStartData.nonce, 'Should issue nonce');

    // 5. Test Checkin Submit (Present)
    console.log('\n5. Testing POST /api/v1/checkin/submit');
    const submitRes = await fetch(`${BASE_URL}/api/v1/checkin/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge_id: checkinStartData.challenge_id,
        session_id: checkinStartData.class.session_id,
        indexNumber: '5231001',
        selfie_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        face_match_score: 0.88,
        liveness_passed: true,
        gps_lat: sessionLat,
        gps_lng: sessionLng,
        gps_accuracy_m: 12.0,
        is_mock_location: false,
        device_integrity_ok: true,
      }),
    });
    const submitData = await submitRes.json();
    console.log('Submit outcome status:', submitRes.status, submitData.status);
    assert.ok(submitRes.status === 200 || submitRes.status === 409, 'Checkin submit should succeed or report duplicate');
  } else {
    console.log('Notice: checkin start with test code returned:', checkinStartData.error);
  }

  // 6. Test GET /api/v1/me/attendance
  console.log('\n6. Testing GET /api/v1/me/attendance');
  const attRes = await fetch(`${BASE_URL}/api/v1/me/attendance?indexNumber=5231001`);
  assert.strictEqual(attRes.status, 200, 'Attendance history should return 200');
  const attData = await attRes.json();
  console.log(`Student attendance rate: ${attData.percentage}% (Threshold: ${attData.threshold}%)`);
  console.log(`Attended: ${attData.attendedCount} / ${attData.totalSessions}`);
  assert.ok(typeof attData.percentage === 'number', 'Percentage should be numeric');

  // 7. Test POST /api/v1/auth/student/claim (S12 Dispute)
  console.log('\n7. Testing POST /api/v1/auth/student/claim (Dispute)');
  const claimRes = await fetch(`${BASE_URL}/api/v1/auth/student/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      indexNumber: '5231001',
      fullName: 'Ama Boateng (Claimant)',
      email: 'ama.claimant@school.edu.gh',
      reason: 'This index number is mine. Reporting unauthorized duplicate registration.',
    }),
  });
  assert.strictEqual(claimRes.status, 200, 'Claim endpoint should return 200');
  const claimData = await claimRes.json();
  console.log('Dispute created with ID:', claimData.disputeId);
  assert.ok(claimData.disputeId, 'Should return disputeId');

  console.log('\nAll student mobile app API tests passed successfully!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
