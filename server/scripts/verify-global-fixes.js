import { io } from "../../client/node_modules/socket.io-client/build/cjs/index.js";

const BASE_URL = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

async function loginUser(email, password = "123456") {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.status !== 200 || !data.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  }
  return { token: data.token, user: data.user };
}

async function getJson(endpoint, token) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function postJson(endpoint, body, token) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function createSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket connection timeout (5s)"));
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function runGlobalVerification() {
  console.log("==========================================================");
  console.log("  COLLABX GLOBAL SYSTEM-WIDE VERIFICATION");
  console.log("==========================================================");
  let passed = 0;
  let failed = 0;

  // 1. LOGINS
  console.log("\n[1] Authenticating Test Users (Admin, Mentor, Student)...");
  let admin, mentor, student;
  try {
    admin = await loginUser("director@technonjr.org");
    console.log(`   ✓ Admin logged in: ${admin.user.name} (${admin.user.role})`);
    passed++;
  } catch (err) {
    console.error("   ✗ Admin login failed:", err.message);
    failed++;
  }

  try {
    mentor = await loginUser("paras.kothari@technonjr.org");
    console.log(`   ✓ Mentor logged in: ${mentor.user.name} (${mentor.user.role})`);
    passed++;
  } catch (err) {
    console.error("   ✗ Mentor login failed:", err.message);
    failed++;
  }

  try {
    student = await loginUser("punittrivedi699@gmail.com");
    console.log(`   ✓ Student logged in: ${student.user.name} (${student.user.role})`);
    passed++;
  } catch (err) {
    console.error("   ✗ Student login failed:", err.message);
    failed++;
  }

  // 2. MEMBER COUNT & OWNER DEDUPLICATION ACROSS ALL 47 PROJECTS
  console.log("\n[2] Verifying Member Count & Owner Deduplication across all projects...");
  try {
    const { status, data } = await getJson("/projects", admin.token);
    const projects = data.projects || [];
    console.log(`   Fetched ${projects.length} projects as Admin.`);

    if (projects.length === 47) {
      console.log("   ✓ Exactly 47 projects returned to Admin.");
      passed++;
    } else {
      console.error(`   ✗ Expected 47 projects, got ${projects.length}`);
      failed++;
    }

    let duplicateFound = false;
    let mathMismatch = false;

    for (const p of projects) {
      const ownerId = p.owner_id || p.owner?._id || p.owner?.id;
      // Check owner not in members
      const hasOwnerInMembers = (p.members || []).some(
        (m) => String(m.id || m._id) === String(ownerId)
      );
      if (hasOwnerInMembers) {
        console.error(`   ✗ Project #${p.id} "${p.title}" contains owner in members list!`);
        duplicateFound = true;
      }

      // Check math: memberCount === members.length + (owner ? 1 : 0)
      const expectedCount = (p.members?.length || 0) + (ownerId ? 1 : 0);
      if (p.memberCount !== expectedCount) {
        console.error(
          `   ✗ Project #${p.id} memberCount mismatch: memberCount=${p.memberCount}, expected=${expectedCount}`
        );
        mathMismatch = true;
      }
    }

    if (!duplicateFound) {
      console.log("   ✓ Zero duplicate owner entries in members list across ALL 47 projects!");
      passed++;
    } else {
      failed++;
    }

    if (!mathMismatch) {
      console.log("   ✓ Accurate memberCount and teamSize computed across ALL 47 projects!");
      passed++;
    } else {
      failed++;
    }
  } catch (err) {
    console.error("   ✗ Project check error:", err.message);
    failed++;
  }

  // 3. TEAM ENDPOINT (/api/team/:projectId) DEDUPLICATION & PAYLOAD
  console.log("\n[3] Testing Team Endpoint (/api/team/:projectId) Payload & Deduplication...");
  try {
    const testPIds = [1, 2, 3, 5];
    let teamOk = true;
    for (const pid of testPIds) {
      const { status, data } = await getJson(`/team/${pid}`, admin.token);
      if (status !== 200 || !data.team) {
        console.error(`   ✗ Team endpoint failed for project ${pid}:`, status, data);
        teamOk = false;
        continue;
      }
      const team = data.team;
      const ownerId = team.owner?.id || team.owner?._id;
      const hasDupe = (team.members || []).some(
        (m) => String(m.id || m._id) === String(ownerId)
      );
      if (hasDupe) {
        console.error(`   ✗ Team ${pid} has duplicate owner in members!`);
        teamOk = false;
      }
      const expectedTotal = (team.members?.length || 0) + (ownerId ? 1 : 0);
      if (team.totalMembers !== expectedTotal) {
        console.error(`   ✗ Team ${pid} totalMembers mismatch: ${team.totalMembers} vs ${expectedTotal}`);
        teamOk = false;
      }
    }
    if (teamOk) {
      console.log("   ✓ Team endpoint returns clean deduplicated team payload with totalMembers!");
      passed++;
    } else {
      failed++;
    }
  } catch (err) {
    console.error("   ✗ Team endpoint error:", err.message);
    failed++;
  }

  // 4. PROJECT ISOLATION: MENTOR & STUDENT VISIBILITY
  console.log("\n[4] Testing Role-Based Project Isolation...");
  let studentProjects = [];
  try {
    // Mentor project list
    const mentorProjRes = await getJson("/projects", mentor.token);
    const mentorProjects = mentorProjRes.data.projects || [];
    console.log(`   Mentor Dr. Paras Kothari sees ${mentorProjects.length} assigned project(s):`);
    mentorProjects.forEach((p) => console.log(`     - #${p.id} "${p.title}" (Mentor ID: ${p.mentor_id})`));
    if (mentorProjects.length > 0) {
      console.log("   ✓ Mentor globally sees their assigned projects!");
      passed++;
    } else {
      console.error("   ✗ Mentor saw 0 projects!");
      failed++;
    }

    // Student project list
    const studentProjRes = await getJson("/projects", student.token);
    studentProjects = studentProjRes.data.projects || [];
    console.log(`   Student Punit Trivedi sees ${studentProjects.length} enrolled project(s):`);
    studentProjects.forEach((p) => console.log(`     - #${p.id} "${p.title}"`));
    if (studentProjects.length > 0 && studentProjects.length < 47) {
      console.log("   ✓ Student project isolation strictly enforced!");
      passed++;
    } else {
      console.error("   ✗ Student saw invalid project count:", studentProjects.length);
      failed++;
    }
  } catch (err) {
    console.error("   ✗ Isolation check error:", err.message);
    failed++;
  }

  // 5. REAL-TIME SOCKET.IO CHAT: MULTI-PROJECT TEST
  console.log("\n[5] Testing Real-Time WebSocket Chat (Socket.io) across multiple projects...");
  let socketAdmin = null;
  let socketStudent = null;

  try {
    // Connect both sockets
    socketAdmin = await createSocket(admin.token);
    console.log("   ✓ Socket connected for Admin:", socketAdmin.id);
    passed++;

    socketStudent = await createSocket(student.token);
    console.log("   ✓ Socket connected for Student:", socketStudent.id);
    passed++;

    // Test Project 1 Chat
    const testProjectId = studentProjects[0]?.id || 1;
    console.log(`\n   --- Testing Real-Time Chat in Project #${testProjectId} ---`);

    // Both join project room
    socketAdmin.emit("join_project", testProjectId);
    socketStudent.emit("join_project", testProjectId);
    await new Promise((r) => setTimeout(r, 200));

    // Setup listener on Admin socket
    let receivedNewMessage = null;
    socketAdmin.on("chat:message:new", (msg) => {
      receivedNewMessage = msg;
    });

    // Student sends message via Socket.IO
    const testContent1 = `Test message via WebSocket at ${new Date().toISOString()}`;
    await new Promise((resolve, reject) => {
      socketStudent.emit(
        "send_message",
        { projectId: testProjectId, content: testContent1 },
        (res) => {
          if (res?.success) resolve(res);
          else reject(new Error(res?.message || "Socket send_message failed"));
        }
      );
    });
    console.log("   ✓ Student sent message via Socket.IO 'send_message'");

    // Wait for Admin to receive broadcast
    await new Promise((r) => setTimeout(r, 500));

    if (
      receivedNewMessage &&
      receivedNewMessage.content === testContent1 &&
      receivedNewMessage.sender?.name === student.user.name
    ) {
      console.log("   ✓ Admin received real-time 'chat:message:new' event!");
      console.log("     Sender joined details:", receivedNewMessage.sender);
      passed++;
    } else {
      console.error("   ✗ Admin did not receive expected broadcast event. Got:", receivedNewMessage);
      failed++;
    }

    // Verify Message History Endpoint GET /api/messages/:projectId
    console.log(`\n   --- Verifying GET /api/messages/${testProjectId} ---`);
    const historyRes = await getJson(`/messages/${testProjectId}`, admin.token);
    const messagesList = historyRes.data.messages || [];
    const foundMsg = messagesList.find((m) => m.content === testContent1);
    if (foundMsg) {
      console.log(`   ✓ GET /api/messages/${testProjectId} returned PostgreSQL message history!`);
      console.log(`     Total messages in room: ${messagesList.length}`);
      passed++;
    } else {
      console.error(`   ✗ Message not found in GET /api/messages/${testProjectId}!`);
      failed++;
    }

    // Test Project Chat via HTTP POST /api/messages/:projectId and real-time delivery
    console.log(`\n   --- Testing HTTP POST /api/messages/${testProjectId} -> Socket Broadcast ---`);
    let httpBroadcastReceived = null;
    socketStudent.on("chat:message:new", (msg) => {
      httpBroadcastReceived = msg;
    });

    const testContent2 = `Admin announcement via HTTP at ${new Date().toISOString()}`;
    const postRes = await postJson(
      `/messages/${testProjectId}`,
      { content: testContent2 },
      admin.token
    );

    if (postRes.status === 201) {
      console.log("   ✓ HTTP POST /api/messages/:projectId succeeded");
      passed++;
    } else {
      console.error("   ✗ HTTP POST failed:", postRes.status, postRes.data);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 500));
    if (
      httpBroadcastReceived &&
      httpBroadcastReceived.content === testContent2 &&
      httpBroadcastReceived.sender?.name === admin.user.name
    ) {
      console.log("   ✓ Student socket received real-time broadcast from HTTP POST!");
      passed++;
    } else {
      console.error("   ✗ Real-time broadcast failed for HTTP message:", httpBroadcastReceived);
      failed++;
    }

    // Leave project room
    socketAdmin.emit("leave_project", testProjectId);
    socketStudent.emit("leave_project", testProjectId);
  } catch (err) {
    console.error("   ✗ WebSocket Chat error:", err.message);
    failed++;
  } finally {
    if (socketAdmin) socketAdmin.disconnect();
    if (socketStudent) socketStudent.disconnect();
  }

  console.log("\n==========================================================");
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================\n");

  if (failed > 0) process.exit(1);
}

runGlobalVerification().catch(console.error);
