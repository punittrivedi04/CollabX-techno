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

async function runDualChannelVerification() {
  console.log("==========================================================");
  console.log("  DUAL GROUP CHAT (OFFICIAL VS UNOFFICIAL) VERIFICATION   ");
  console.log("==========================================================");
  let passed = 0;
  let failed = 0;

  // 1. Authenticate Users
  console.log("\n[1] Authenticating Test Users...");
  const student = await loginUser("punittrivedi699@gmail.com");
  const mentor = await loginUser("paras.kothari@technonjr.org");
  const admin = await loginUser("director@technonjr.org");
  console.log(`   ✓ Student: ${student.user.name} (${student.user.email})`);
  console.log(`   ✓ Mentor: ${mentor.user.name} (${mentor.user.email})`);
  console.log(`   ✓ Admin: ${admin.user.name} (${admin.user.email})`);
  passed += 3;

  // 2. Member Count & Deduplication in Thinkflux
  console.log("\n[2] Verifying Thinkflux (Project #40) Member Count...");
  const projRes = await getJson("/projects", student.token);
  const thinkflux = projRes.data.projects?.find((p) => p.id === 40);
  if (!thinkflux) {
    console.error("   ✗ Thinkflux not found in student projects!");
    failed++;
  } else {
    console.log(`   Found Thinkflux: Title="${thinkflux.title}", owner_id=${thinkflux.owner_id}`);
    console.log(`   members count=${thinkflux.members?.length}, memberCount field=${thinkflux.memberCount}`);
    if (thinkflux.memberCount === 6) {
      console.log("   ✓ Exactly 6 members reported by backend (deduplicated)!");
      passed++;
    } else {
      console.error(`   ✗ Expected memberCount === 6, got ${thinkflux.memberCount}`);
      failed++;
    }

    const hasOwnerInMembers = (thinkflux.members || []).some(
      (m) => String(m.id || m._id) === String(thinkflux.owner_id)
    );
    if (!hasOwnerInMembers) {
      console.log("   ✓ Owner is NOT in members list (zero double counting)!");
      passed++;
    } else {
      console.error("   ✗ Owner found inside members list!");
      failed++;
    }
  }

  // 3. Channel Separation: Posting & Reading
  console.log("\n[3] Testing Dual Channels (Official vs Unofficial) via REST API...");
  const timestamp = Date.now();
  const officialContent = `Official announcement #${timestamp}`;
  const unofficialContent = `Unofficial student chat #${timestamp}`;

  // Post to official channel
  const postOffRes = await postJson("/messages/40", { content: officialContent, channel: "official" }, student.token);
  if (postOffRes.status === 201 && postOffRes.data?.data?.channel === "official") {
    console.log("   ✓ POST /api/messages/40 to 'official' channel succeeded");
    passed++;
  } else {
    console.error("   ✗ Failed to post to official channel:", postOffRes.status, postOffRes.data);
    failed++;
  }

  // Post to unofficial channel
  const postUnoffRes = await postJson("/messages/40", { content: unofficialContent, channel: "unofficial" }, student.token);
  if (postUnoffRes.status === 201 && postUnoffRes.data?.data?.channel === "unofficial") {
    console.log("   ✓ POST /api/messages/40 to 'unofficial' channel succeeded");
    passed++;
  } else {
    console.error("   ✗ Failed to post to unofficial channel:", postUnoffRes.status, postUnoffRes.data);
    failed++;
  }

  // Read official channel
  const getOffRes = await getJson("/messages/40?channel=official", student.token);
  const offMsgs = getOffRes.data.messages || [];
  const foundInOfficial = offMsgs.some((m) => m.content === officialContent);
  const leakInOfficial = offMsgs.some((m) => m.content === unofficialContent);

  if (foundInOfficial && !leakInOfficial) {
    console.log("   ✓ Official channel strictly contains official messages (zero leakage)!");
    passed++;
  } else {
    console.error(`   ✗ Channel isolation failure! found=${foundInOfficial}, leaked=${leakInOfficial}`);
    failed++;
  }

  // Read unofficial channel
  const getUnoffRes = await getJson("/messages/40?channel=unofficial", student.token);
  const unoffMsgs = getUnoffRes.data.messages || [];
  const foundInUnofficial = unoffMsgs.some((m) => m.content === unofficialContent);
  const leakInUnofficial = unoffMsgs.some((m) => m.content === officialContent);

  if (foundInUnofficial && !leakInUnofficial) {
    console.log("   ✓ Unofficial channel strictly contains unofficial messages (zero leakage)!");
    passed++;
  } else {
    console.error(`   ✗ Channel isolation failure! found=${foundInUnofficial}, leaked=${leakInUnofficial}`);
    failed++;
  }

  // 4. Strict Role Access Control: Mentor Access
  console.log("\n[4] Testing Strict Role Access Control for Mentors...");
  // Mentor reading unofficial channel -> MUST BE 403 FORBIDDEN
  const mentorUnoffGet = await getJson("/messages/40?channel=unofficial", mentor.token);
  if (mentorUnoffGet.status === 403) {
    console.log("   ✓ Mentor GET /api/messages/40?channel=unofficial returns 403 Forbidden!");
    console.log("     Message:", mentorUnoffGet.data?.message);
    passed++;
  } else {
    console.error("   ✗ Mentor unexpectedly accessed unofficial messages:", mentorUnoffGet.status, mentorUnoffGet.data);
    failed++;
  }

  // Mentor posting to unofficial channel -> MUST BE 403 FORBIDDEN
  const mentorUnoffPost = await postJson("/messages/40", { content: "Intruder attempt", channel: "unofficial" }, mentor.token);
  if (mentorUnoffPost.status === 403) {
    console.log("   ✓ Mentor POST /api/messages/40 with channel='unofficial' returns 403 Forbidden!");
    passed++;
  } else {
    console.error("   ✗ Mentor unexpectedly allowed to post to unofficial channel:", mentorUnoffPost.status, mentorUnoffPost.data);
    failed++;
  }

  // 5. Real-Time Socket.io Dual-Channel Isolation
  console.log("\n[5] Testing Real-Time WebSocket Dual-Channel Communication...");
  let sStudent = null;
  let sAdmin = null;
  let sMentor = null;

  try {
    sStudent = await createSocket(student.token);
    sAdmin = await createSocket(admin.token);
    sMentor = await createSocket(mentor.token);
    console.log("   ✓ Sockets connected for Student, Admin, and Mentor");
    passed++;

    // Student and Admin join official & unofficial rooms
    sStudent.emit("join_project", { projectId: 40, channel: "unofficial" });
    sAdmin.emit("join_project", { projectId: 40, channel: "unofficial" });

    // Mentor attempts to join unofficial room
    sMentor.emit("join_project", { projectId: 40, channel: "unofficial" });
    await new Promise((r) => setTimeout(r, 200));

    let adminReceivedUnofficial = null;
    let mentorReceivedUnofficial = null;

    sAdmin.on("chat:message:new", (msg) => {
      adminReceivedUnofficial = msg;
    });
    sMentor.on("chat:message:new", (msg) => {
      mentorReceivedUnofficial = msg;
    });

    // Student sends real-time unofficial message
    const wsUnofficialMsg = `Secret student ping #${Date.now()}`;
    await new Promise((resolve, reject) => {
      sStudent.emit(
        "send_message",
        { projectId: 40, channel: "unofficial", content: wsUnofficialMsg },
        (res) => {
          if (res?.success) resolve(res);
          else reject(new Error(res?.message || "Failed send_message"));
        }
      );
    });

    await new Promise((r) => setTimeout(r, 400));

    // Admin should receive it because Admin is in the room
    if (adminReceivedUnofficial && adminReceivedUnofficial.content === wsUnofficialMsg) {
      console.log("   ✓ Real-time message delivered to authorized member in 'project_40_unofficial'!");
      passed++;
    } else {
      console.error("   ✗ Real-time delivery to authorized member failed:", adminReceivedUnofficial);
      failed++;
    }

    // Mentor MUST NOT receive it
    if (!mentorReceivedUnofficial) {
      console.log("   ✓ Mentor WebSocket was completely excluded from 'unofficial' broadcast!");
      passed++;
    } else {
      console.error("   ✗ SECURITY BREACH: Mentor received unofficial message via WebSocket!", mentorReceivedUnofficial);
      failed++;
    }

    // Mentor joins official room
    sMentor.emit("join_project", { projectId: 40, channel: "official" });
    sStudent.emit("join_project", { projectId: 40, channel: "official" });
    await new Promise((r) => setTimeout(r, 200));

    let mentorReceivedOfficial = null;
    sMentor.on("chat:message:new", (msg) => {
      mentorReceivedOfficial = msg;
    });

    const wsOfficialMsg = `Official meeting update #${Date.now()}`;
    await new Promise((resolve, reject) => {
      sStudent.emit(
        "send_message",
        { projectId: 40, channel: "official", content: wsOfficialMsg },
        (res) => {
          if (res?.success) resolve(res);
          else reject(new Error(res?.message || "Failed send_message"));
        }
      );
    });

    await new Promise((r) => setTimeout(r, 400));
    if (mentorReceivedOfficial && mentorReceivedOfficial.content === wsOfficialMsg) {
      console.log("   ✓ Mentor successfully received official broadcast in 'project_40_official'!");
      passed++;
    } else {
      console.error("   ✗ Real-time official broadcast failed to reach mentor:", mentorReceivedOfficial);
      failed++;
    }
  } catch (err) {
    console.error("   ✗ Socket test error:", err.message);
    failed++;
  } finally {
    if (sStudent) sStudent.disconnect();
    if (sAdmin) sAdmin.disconnect();
    if (sMentor) sMentor.disconnect();
  }

  console.log("\n==========================================================");
  console.log(`  VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================\n");

  if (failed > 0) process.exit(1);
}

runDualChannelVerification().catch(console.error);
