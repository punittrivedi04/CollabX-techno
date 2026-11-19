import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:5000/api";
const LOG_FILE = "C:/Users/puntt/.gemini/antigravity/brain/99bd4567-c47a-443b-acf0-f8cc328143f1/.system_generated/tasks/task-541.log";

async function postJson(endpoint, data, headers = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json, headers: res.headers };
}

async function getJson(endpoint, token) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

function findLatestOtpFromLogs(email, purpose) {
  if (!fs.existsSync(LOG_FILE)) return null;
  const content = fs.readFileSync(LOG_FILE, "utf-8");
  const regex = new RegExp(`\\[CollabX Dev OTP\\] \\(${purpose}\\) ${email} -> (\\d{6})`, "gi");
  const matches = [...content.matchAll(regex)];
  if (matches.length > 0) {
    return matches[matches.length - 1][1];
  }
  return null;
}

async function runFullE2ETest() {
  console.log("=== FULL END-TO-END AUTH VERIFICATION ===");
  let passed = 0;
  let failed = 0;

  // 1. Unknown user login -> 404 USER_NOT_FOUND
  console.log("\n1. Testing Login with non-existent user...");
  const r1 = await postJson("/auth/login", {
    email: "definitely_not_a_user_999@technonjr.org",
    password: "Password123!",
  });
  if (r1.status === 404 && r1.data?.code === "USER_NOT_FOUND") {
    console.log("   ✓ Received 404 USER_NOT_FOUND with message:", r1.data.message);
    passed++;
  } else {
    console.error("   ✗ Expected 404 USER_NOT_FOUND, got:", r1.status, r1.data);
    failed++;
  }

  // 2. Existing user, wrong password -> 401 INVALID_PASSWORD
  console.log("\n2. Testing Login with wrong password...");
  const r2 = await postJson("/auth/login", {
    email: "punittrivedi699@gmail.com",
    password: "incorrect_password",
  });
  if (r2.status === 401 && r2.data?.code === "INVALID_PASSWORD") {
    console.log("   ✓ Received 401 INVALID_PASSWORD with message:", r2.data.message);
    passed++;
  } else {
    console.error("   ✗ Expected 401 INVALID_PASSWORD, got:", r2.status, r2.data);
    failed++;
  }

  // 3. Existing user, valid login -> 200 OK + dual token
  console.log("\n3. Testing Login with valid credentials...");
  const r3 = await postJson("/auth/login", {
    email: "punittrivedi699@gmail.com",
    password: "123456",
  });
  if (r3.status === 200 && r3.data?.token && r3.data?.user?.email) {
    console.log("   ✓ Received 200 OK with valid JWT & User:", r3.data.user.name, `(${r3.data.user.email})`);
    passed++;
  } else {
    console.error("   ✗ Expected 200 with JWT, got:", r3.status, r3.data);
    failed++;
  }

  // 4. Register with existing verified user -> 409 USER_EXISTS
  console.log("\n4. Testing Register with existing email...");
  const r4 = await postJson("/auth/register", {
    name: "Punit Trivedi",
    email: "punittrivedi699@gmail.com",
    password: "SecretPassword123!",
  });
  if (r4.status === 409 && r4.data?.code === "USER_EXISTS") {
    console.log("   ✓ Received 409 USER_EXISTS with message:", r4.data.message);
    passed++;
  } else {
    console.error("   ✗ Expected 409 USER_EXISTS, got:", r4.status, r4.data);
    failed++;
  }

  // 5. Register with brand new user -> 200 OK + 2m signed otpToken
  const testNewEmail = `freshstudent_${Date.now()}@technonjr.org`;
  console.log(`\n5. Testing Register with brand new email (${testNewEmail})...`);
  const r5 = await postJson("/auth/register", {
    name: "Fresh Student",
    email: testNewEmail,
    password: "StrongPassword123!",
  });
  if (r5.status === 200 && r5.data?.otpToken) {
    console.log("   ✓ Received 200 OK with stateless 2m otpToken:", r5.data.message);
    passed++;
  } else {
    console.error("   ✗ Expected 200 with otpToken, got:", r5.status, r5.data);
    failed++;
  }

  // 6. Verify OTP with correct 6-digit code -> 200 OK + Auto-Login
  console.log("\n6. Testing Verify-OTP with 6-digit code from signup...");
  const otpSignup = findLatestOtpFromLogs(testNewEmail, "signup");
  console.log("   Retrieved logged Dev OTP:", otpSignup);
  if (!otpSignup) {
    console.error("   ✗ Could not find OTP in log file");
    failed++;
  } else {
    const r6 = await postJson("/auth/verify-otp", {
      email: testNewEmail,
      otp: otpSignup,
      otpToken: r5.data.otpToken,
    });
    if (r6.status === 200 && r6.data?.token && r6.data?.user?.is_verified === true) {
      console.log("   ✓ User verified successfully! Direct session established with JWT token.");
      console.log("   ✓ User profile returned:", r6.data.user);
      passed++;

      // 7. Verify session works with GET /auth/me
      console.log("\n7. Testing GET /auth/me with new session token...");
      const r7 = await getJson("/auth/me", r6.data.token);
      if (r7.status === 200 && r7.data?.user?.email === testNewEmail) {
        console.log("   ✓ Authenticated /auth/me confirmed valid session for:", r7.data.user.email);
        passed++;
      } else {
        console.error("   ✗ Expected 200 for /auth/me, got:", r7.status, r7.data);
        failed++;
      }
    } else {
      console.error("   ✗ Expected 200 with token & verified user, got:", r6.status, r6.data);
      failed++;
    }
  }

  // 8. Forgot Password -> 200 OK + reset otpToken
  console.log("\n8. Testing Forgot-Password for existing user...");
  const r8 = await postJson("/auth/forgot-password", {
    email: testNewEmail,
  });
  if (r8.status === 200 && r8.data?.otpToken) {
    console.log("   ✓ Received 200 OK with reset otpToken:", r8.data.message);
    passed++;
  } else {
    console.error("   ✗ Expected 200 with reset otpToken, got:", r8.status, r8.data);
    failed++;
  }

  // Small delay for disk log buffer to flush
  await new Promise((r) => setTimeout(r, 600));

  // 9. Reset Password with OTP & new password
  console.log("\n9. Testing Reset-Password with OTP...");
  const otpReset = findLatestOtpFromLogs(testNewEmail, "reset_password");
  console.log("   Retrieved logged Reset Dev OTP:", otpReset);
  if (!otpReset) {
    console.error("   ✗ Could not find reset OTP in log file");
    failed++;
  } else {
    const r9 = await postJson("/auth/reset-password", {
      email: testNewEmail,
      otp: otpReset,
      otpToken: r8.data.otpToken,
      newPassword: "BrandNewPassword999!",
    });
    if (r9.status === 200 && r9.data?.success) {
      console.log("   ✓ Password reset successful:", r9.data.message);
      passed++;

      // 10. Login with new password
      console.log("\n10. Testing Login with the newly reset password...");
      const r10 = await postJson("/auth/login", {
        email: testNewEmail,
        password: "BrandNewPassword999!",
      });
      if (r10.status === 200 && r10.data?.token) {
        console.log("   ✓ Logged in successfully with new password!");
        passed++;
      } else {
        console.error("   ✗ Login with new password failed:", r10.status, r10.data);
        failed++;
      }
    } else {
      console.error("   ✗ Expected 200 for reset-password, got:", r9.status, r9.data);
      failed++;
    }
  }

  console.log(`\n==========================================`);
  console.log(`ALL FLOWS VERIFIED: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================\n`);

  if (failed > 0) process.exit(1);
}

runFullE2ETest();
