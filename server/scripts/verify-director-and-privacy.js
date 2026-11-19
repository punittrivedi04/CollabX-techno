import http from "http";
import { io } from "../../client/node_modules/socket.io-client/build/esm/index.js";

const API_BASE = "http://localhost:5000";

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const reqOptions = {
            method: options.method || "GET",
            headers: options.headers || {},
        };

        const req = http.request(url, reqOptions, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                let json;
                try {
                    json = JSON.parse(data);
                } catch {
                    json = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, data: json });
            });
        });

        req.on("error", reject);

        if (options.body) {
            req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

async function login(email, password = "123456") {
    const res = await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { email, password },
    });
    if (res.status !== 200) {
        // Try fallback password
        const fallback = await request("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: { email, password: "password123" },
        });
        if (fallback.status === 200) return fallback.data.token;
        throw new Error(`Login failed for ${email}: status ${res.status} - ${JSON.stringify(res.data)}`);
    }
    return res.data.token;
}

async function run() {
    console.log("=== STARTING GLOBAL VERIFICATION SUITE ===\n");
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`[PASS] ${message}`);
            passed++;
        } else {
            console.error(`[FAIL] ${message}`);
            failed++;
        }
    }

    try {
        // 1. Director Verification
        console.log("\n--- 1. Testing Director Account (director@technonjr.org) ---");
        const directorToken = await login("director@technonjr.org");
        assert(!!directorToken, "Director logged in successfully");

        // Director reading messages
        const dirMsgRes = await request("/api/messages/40", {
            headers: { Authorization: `Bearer ${directorToken}` },
        });
        assert(dirMsgRes.status === 403, `Director reading chat blocked with 403 (Got: ${dirMsgRes.status})`);

        // Director sending messages
        const dirSendRes = await request("/api/messages/40", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${directorToken}`,
                "Content-Type": "application/json",
            },
            body: { content: "Unauthorized message", channel: "official" },
        });
        assert(dirSendRes.status === 403, `Director sending chat message blocked with 403 (Got: ${dirSendRes.status})`);

        // Director accessing tasks
        const dirTaskRes = await request("/api/tasks", {
            headers: { Authorization: `Bearer ${directorToken}` },
        });
        assert(dirTaskRes.status === 403, `Director accessing tasks blocked with 403 (Got: ${dirTaskRes.status})`);

        // Director creating project
        const dirProjMutRes = await request("/api/projects", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${directorToken}`,
                "Content-Type": "application/json",
            },
            body: { name: "Director Blocked Project" },
        });
        assert(dirProjMutRes.status === 403, `Director creating project blocked with 403 (Got: ${dirProjMutRes.status})`);

        // Director team mutation
        const dirTeamMutRes = await request("/api/team/40/invitations", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${directorToken}`,
                "Content-Type": "application/json",
            },
            body: { email: "someuser@test.com" },
        });
        assert(dirTeamMutRes.status === 403, `Director team mutation blocked with 403 (Got: ${dirTeamMutRes.status})`);

        // Director read-only projects list
        const dirProjGet = await request("/api/projects", {
            headers: { Authorization: `Bearer ${directorToken}` },
        });
        assert(dirProjGet.status === 200 && Array.isArray(dirProjGet.data.projects), `Director executive read-only GET /api/projects succeeds with 200 (Total: ${dirProjGet.data.projects?.length})`);

        // Director read-only team list
        const dirTeamGet = await request("/api/team/40", {
            headers: { Authorization: `Bearer ${directorToken}` },
        });
        assert(dirTeamGet.status === 200 && !!dirTeamGet.data.team, `Director executive read-only GET /api/team/40 succeeds with 200`);

        // 2. Admin Verification (aaditya@technonjr.org)
        console.log("\n--- 2. Testing Non-Director Admin (aaditya@technonjr.org) ---");
        const adminToken = await login("aaditya@technonjr.org");
        assert(!!adminToken, "Admin logged in successfully");

        // Admin accessing official channel
        const adminOffRes = await request("/api/messages/40?channel=official", {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(adminOffRes.status === 200, `Admin reading official channel succeeds with 200 (Got: ${adminOffRes.status})`);

        // Admin accessing unofficial channel -> MUST BE 403 FORBIDDEN
        const adminUnoffRes = await request("/api/messages/40?channel=unofficial", {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(adminUnoffRes.status === 403, `Admin reading unofficial channel blocked with 403 (Got: ${adminUnoffRes.status})`);

        // Admin sending to unofficial channel -> MUST BE 403 FORBIDDEN
        const adminUnoffSend = await request("/api/messages/40", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${adminToken}`,
                "Content-Type": "application/json",
            },
            body: { content: "Admin attempting unofficial chat", channel: "unofficial" },
        });
        assert(adminUnoffSend.status === 403, `Admin sending message to unofficial channel blocked with 403 (Got: ${adminUnoffSend.status})`);

        // Admin tasks access
        const adminTaskRes = await request("/api/tasks", {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(adminTaskRes.status === 200, `Admin accessing tasks succeeds with 200 (Got: ${adminTaskRes.status})`);

        // 3. Mentor Verification (paras.kothari@technonjr.org)
        console.log("\n--- 3. Testing Mentor (paras.kothari@technonjr.org) ---");
        const mentorToken = await login("paras.kothari@technonjr.org");
        assert(!!mentorToken, "Mentor logged in successfully");

        // Mentor unofficial channel reading -> MUST BE 403 FORBIDDEN
        const mentorUnoffRes = await request("/api/messages/40?channel=unofficial", {
            headers: { Authorization: `Bearer ${mentorToken}` },
        });
        assert(mentorUnoffRes.status === 403, `Mentor reading unofficial channel blocked with 403 (Got: ${mentorUnoffRes.status})`);

        // Mentor unofficial channel sending -> MUST BE 403 FORBIDDEN
        const mentorUnoffSend = await request("/api/messages/40", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${mentorToken}`,
                "Content-Type": "application/json",
            },
            body: { content: "Mentor attempting unofficial chat", channel: "unofficial" },
        });
        assert(mentorUnoffSend.status === 403, `Mentor sending message to unofficial channel blocked with 403 (Got: ${mentorUnoffSend.status})`);

        // 4. Student Team Member Verification (punittrivedi699@gmail.com)
        console.log("\n--- 4. Testing Student Team Member (punittrivedi699@gmail.com) ---");
        const studentToken = await login("punittrivedi699@gmail.com");
        assert(!!studentToken, "Student logged in successfully");

        // Student reading unofficial channel -> MUST BE 200 OK
        const studentUnoffRes = await request("/api/messages/40?channel=unofficial", {
            headers: { Authorization: `Bearer ${studentToken}` },
        });
        assert(studentUnoffRes.status === 200, `Student reading unofficial channel succeeds with 200 (Got: ${studentUnoffRes.status})`);

        // Student sending to unofficial channel -> MUST BE 201 Created
        const studentUnoffSend = await request("/api/messages/40", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${studentToken}`,
                "Content-Type": "application/json",
            },
            body: { content: `Test unofficial message ${Date.now()}`, channel: "unofficial" },
        });
        assert(studentUnoffSend.status === 201, `Student sending message to unofficial channel succeeds with 201 (Got: ${studentUnoffSend.status})`);

        // Student reading official channel -> MUST BE 200 OK
        const studentOffRes = await request("/api/messages/40?channel=official", {
            headers: { Authorization: `Bearer ${studentToken}` },
        });
        assert(studentOffRes.status === 200, `Student reading official channel succeeds with 200 (Got: ${studentOffRes.status})`);

        // 5. Socket.io Real-Time Verification
        console.log("\n--- 5. Testing Socket.io Real-Time Dual Channels & Restrictions ---");
        
        // Connect Director socket
        await new Promise((resolve) => {
            const socketDir = io(API_BASE, { auth: { token: directorToken } });
            socketDir.on("connect", () => {
                socketDir.emit("join_project", { projectId: 40, channel: "official" });
            });
            socketDir.on("error", (err) => {
                assert(err.message.includes("Director account does not have access"), `Director Socket.io denied joining chat: ${err.message}`);
                socketDir.disconnect();
                resolve();
            });
        });

        // Connect Admin socket attempting unofficial room
        await new Promise((resolve) => {
            const socketAdmin = io(API_BASE, { auth: { token: adminToken } });
            socketAdmin.on("connect", () => {
                socketAdmin.emit("join_project", { projectId: 40, channel: "unofficial" });
            });
            socketAdmin.on("error", (err) => {
                assert(err.message.includes("strictly private to student team members"), `Admin Socket.io denied joining unofficial room: ${err.message}`);
                socketAdmin.disconnect();
                resolve();
            });
        });

        // Connect Mentor socket attempting unofficial room
        await new Promise((resolve) => {
            const socketMentor = io(API_BASE, { auth: { token: mentorToken } });
            socketMentor.on("connect", () => {
                socketMentor.emit("join_project", { projectId: 40, channel: "unofficial" });
            });
            socketMentor.on("error", (err) => {
                assert(err.message.includes("strictly private to student team members"), `Mentor Socket.io denied joining unofficial room: ${err.message}`);
                socketMentor.disconnect();
                resolve();
            });
        });

        // Connect Student socket to unofficial room
        await new Promise((resolve) => {
            const socketStudent = io(API_BASE, { auth: { token: studentToken } });
            let joined = false;
            socketStudent.on("connect", () => {
                socketStudent.emit("join_project", { projectId: 40, channel: "unofficial" });
                setTimeout(() => {
                    if (!joined) {
                        assert(true, "Student Socket.io joined unofficial room without error");
                        socketStudent.disconnect();
                        resolve();
                    }
                }, 500);
            });
            socketStudent.on("error", (err) => {
                joined = true;
                assert(false, `Student Socket.io failed to join unofficial room: ${err.message}`);
                socketStudent.disconnect();
                resolve();
            });
        });

        console.log(`\n========================================`);
        console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log(`========================================\n`);

        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        console.error("Verification error:", error);
        process.exit(1);
    }
}

run();
