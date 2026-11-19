const BASE_URL = "http://localhost:5000/api";

async function postJson(endpoint, data) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

async function runTests() {
  console.log("=== STARTING AUTH FLOW TESTS ===");
  let passed = 0;
  let failed = 0;

  // Test 1: Login non-existent email
  console.log("\n[Test 1] POST /auth/login with unknown email...");
  const res1 = await postJson("/auth/login", {
    email: "unknown_user_12345@technonjr.org",
    password: "somepassword",
  });
  if (res1.status === 404 && res1.data?.code === "USER_NOT_FOUND") {
    console.log("PASS: 404 USER_NOT_FOUND returned correctly");
    passed++;
  } else {
    console.error("FAIL: Expected 404 USER_NOT_FOUND, got:", res1.status, res1.data);
    failed++;
  }

  // Test 2: Login wrong password on existing seeded user
  console.log("\n[Test 2] POST /auth/login with incorrect password...");
  const res2 = await postJson("/auth/login", {
    email: "punittrivedi699@gmail.com",
    password: "wrongpassword123",
  });
  if (res2.status === 401 && res2.data?.code === "INVALID_PASSWORD") {
    console.log("PASS: 401 INVALID_PASSWORD returned correctly");
    passed++;
  } else {
    console.error("FAIL: Expected 401 INVALID_PASSWORD, got:", res2.status, res2.data);
    failed++;
  }

  // Test 3: Login valid credentials
  console.log("\n[Test 3] POST /auth/login with valid credentials...");
  const res3 = await postJson("/auth/login", {
    email: "punittrivedi699@gmail.com",
    password: "123456",
  });
  if (res3.status === 200 && res3.data?.token && res3.data?.user?.email) {
    console.log("PASS: 200 OK returned with token & user:", res3.data.user.email);
    passed++;
  } else {
    console.error("FAIL: Expected 200 with token, got:", res3.status, res3.data);
    failed++;
  }

  // Test 4: Register with existing verified user
  console.log("\n[Test 4] POST /auth/register with already registered user...");
  const res4 = await postJson("/auth/register", {
    name: "Punit Trivedi",
    email: "punittrivedi699@gmail.com",
    password: "Password123!",
  });
  if (res4.status === 409 && res4.data?.code === "USER_EXISTS") {
    console.log("PASS: 409 USER_EXISTS returned correctly");
    passed++;
  } else {
    console.error("FAIL: Expected 409 USER_EXISTS, got:", res4.status, res4.data);
    failed++;
  }

  // Test 5: Forgot Password with non-existent email
  console.log("\n[Test 5] POST /auth/forgot-password with unknown email...");
  const res5 = await postJson("/auth/forgot-password", {
    email: "nonexistent_reset_user@technonjr.org",
  });
  if (res5.status === 404 && res5.data?.code === "USER_NOT_FOUND") {
    console.log("PASS: 404 USER_NOT_FOUND returned correctly");
    passed++;
  } else {
    console.error("FAIL: Expected 404 USER_NOT_FOUND, got:", res5.status, res5.data);
    failed++;
  }

  // Test 6: Verify OTP with invalid OTP code
  console.log("\n[Test 6] POST /auth/verify-otp with fake/invalid code...");
  const testEmail = `test_otp_${Date.now()}@test.com`;
  const regRes = await postJson("/auth/register", {
    name: "Test OTP User",
    email: testEmail,
    password: "Password123!",
  });
  const otpToken = regRes.data?.otpToken;

  const res6 = await postJson("/auth/verify-otp", {
    email: testEmail,
    otp: "000000",
    otpToken,
  });
  if (res6.status === 400 && res6.data?.code === "INVALID_OTP") {
    console.log("PASS: 400 INVALID_OTP returned correctly for wrong code");
    passed++;
  } else {
    console.error("FAIL: Expected 400 INVALID_OTP, got:", res6.status, res6.data);
    failed++;
  }

  // Test 7: Reset password with invalid OTP
  console.log("\n[Test 7] POST /auth/reset-password with invalid code...");
  const res7 = await postJson("/auth/reset-password", {
    email: "punittrivedi699@gmail.com",
    otp: "000000",
    otpToken,
    newPassword: "NewSecretPassword123!",
  });
  if (res7.status === 400) {
    console.log("PASS: 400 rejected invalid reset attempt:", res7.data?.message);
    passed++;
  } else {
    console.error("FAIL: Expected 400, got:", res7.status, res7.data);
    failed++;
  }

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

runTests();
