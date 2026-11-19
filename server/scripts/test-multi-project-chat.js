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
  return { token: data.token, user: data.user };
}

function createSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

async function testProjects() {
  console.log("=== MULTI-PROJECT REAL-TIME CHAT TEST ===");
  const mentor = await loginUser("paras.kothari@technonjr.org");
  const admin = await loginUser("director@technonjr.org");

  const sMentor = await createSocket(mentor.token);
  const sAdmin = await createSocket(admin.token);

  // Project 27 (Logic Legends, mentored by Dr. Paras Kothari)
  const pId = 27;
  console.log(`\nTesting Real-Time Chat in Project #${pId} (Mentored Project)...`);
  sMentor.emit("join_project", pId);
  sAdmin.emit("join_project", pId);
  await new Promise((r) => setTimeout(r, 200));

  let mentorReceived = null;
  sMentor.on("chat:message:new", (msg) => {
    mentorReceived = msg;
  });

  const msgText = `Mentor check-in at ${new Date().toLocaleTimeString()}`;
  await new Promise((resolve, reject) => {
    sAdmin.emit("send_message", { projectId: pId, content: msgText }, (res) => {
      if (res?.success) resolve(res);
      else reject(new Error(res?.message));
    });
  });

  await new Promise((r) => setTimeout(r, 400));
  if (mentorReceived && mentorReceived.content === msgText) {
    console.log(`✓ Real-time message delivered successfully to mentor in Project #${pId}!`);
    console.log(`  Content: "${mentorReceived.content}" | Sender: ${mentorReceived.sender.name} (${mentorReceived.sender.role})`);
  } else {
    throw new Error(`Real-time delivery failed: ${JSON.stringify(mentorReceived)}`);
  }

  // Verify history endpoint for Project 27
  const histRes = await fetch(`${BASE_URL}/messages/${pId}`, {
    headers: { Authorization: `Bearer ${mentor.token}` },
  });
  const histData = await histRes.json();
  console.log(`✓ GET /api/messages/${pId} verified: ${histData.messages?.length} message(s) loaded.`);

  sMentor.disconnect();
  sAdmin.disconnect();
  console.log("\n=== ALL MULTI-PROJECT TESTS COMPLETED SUCCESSFULLY ===");
}

testProjects().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
