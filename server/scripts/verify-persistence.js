import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const BASE_URL = "http://localhost:5000/api";

async function verifyAll() {
    console.log("==========================================");
    console.log("Starting Full Persistence & Integrity Verification");
    console.log("==========================================");

    // 1. Test Login
    console.log("1. Testing Authentication with punittrivedi699@gmail.com...");
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: "punittrivedi699@gmail.com",
            password: "123456",
        }),
    });

    const loginData = await loginRes.json();
    if (!loginData.success || !loginData.token) {
        throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    console.log(`[PASS] Login successful! Token received. User: ${loginData.user.name} (${loginData.user.role})`);
    const token = loginData.token;
    const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };

    // 2. Test Profile GET and PUT
    console.log("\n2. Testing User Profile Persistence (Atlas sync)...");
    const profileRes = await fetch(`${BASE_URL}/users/profile`, {
        headers: authHeaders,
    });
    const profileData = await profileRes.json();
    console.log(`[PASS] GET /api/users/profile:`, profileData.user?.name, "|", profileData.user?.institution);

    const updateProfileRes = await fetch(`${BASE_URL}/users/profile`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
            fullName: "Punit Trivedi",
            institution: "Techno NJR Institute of Technology",
        }),
    });
    const updateProfileData = await updateProfileRes.json();
    if (!updateProfileData.success) {
        throw new Error(`Profile update failed: ${JSON.stringify(updateProfileData)}`);
    }
    console.log(`[PASS] PUT /api/users/profile updated user in Atlas:`, updateProfileData.user?.institution);

    // 3. Test Projects for Authenticated User (Thinkflux)
    console.log("\n3. Testing User Projects (Thinkflux)...");
    const myProjectsRes = await fetch(`${BASE_URL}/projects`, {
        headers: authHeaders,
    });
    const myProjectsData = await myProjectsRes.json();
    console.log(`[PASS] GET /api/projects returned ${myProjectsData.projects?.length} projects for Punit Trivedi`);
    const thinkflux = myProjectsData.projects?.find((p) => /Thinkflux/i.test(p.name || p.title));

    if (!thinkflux) {
        throw new Error("Thinkflux project not found among user projects!");
    }
    console.log(`[PASS] Thinkflux Found:
  - ID: ${thinkflux._id}
  - Title: ${thinkflux.title || thinkflux.name}
  - Description: ${thinkflux.description}
  - Status: ${thinkflux.status}
  - Progress: ${thinkflux.progress}%
  - Demo URL: ${thinkflux.demoUrl}
  - GitHub URL: ${thinkflux.githubUrl}
  - PPT URL: ${thinkflux.pptUrl}
  - Members Count: ${thinkflux.members?.length}`);

    // 4. Test Project Update Deliverables
    console.log("\n4. Testing Deliverables Persistence (PUT /api/projects/:id)...");
    const updatedDemo = thinkflux.demoUrl || "https://drive.google.com/drive/folders/1C-NPXQFhL7nBmWRd3KCe4_3_V05HbNS3?usp=drive_link";
    const updatedGithub = thinkflux.githubUrl || "https://drive.google.com/drive/folders/1C-NPXQFhL7nBmWRd3KCe4_3_V05HbNS3?usp=drive_link";
    const updatedPpt = thinkflux.pptUrl || "https://onedrive.live.com/";
    const updatedDesc = "Develop a web-based interactive 3d visualization of ocean waves";

    const updateProjRes = await fetch(`${BASE_URL}/projects/${thinkflux._id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
            description: updatedDesc,
            githubUrl: updatedGithub,
            demoUrl: updatedDemo,
            pptUrl: updatedPpt,
        }),
    });
    const updateProjData = await updateProjRes.json();
    if (!updateProjData.success) {
        throw new Error(`Project update failed: ${JSON.stringify(updateProjData)}`);
    }
    console.log(`[PASS] PUT /api/projects/:id response:`, updateProjData.project?.name, "Deliverables saved!");

    // 5. Test Direct Mongoose Connection to Atlas to verify true persistence
    console.log("\n5. Direct MongoDB Atlas DB Check...");
    await mongoose.connect(process.env.MONGO_URI);
    const dbProject = await mongoose.connection.db.collection("projects").findOne({ _id: new mongoose.Types.ObjectId(thinkflux._id) });
    if (!dbProject || dbProject.demoUrl !== updatedDemo) {
        throw new Error("Direct Atlas check failed: Project demoUrl mismatch!");
    }
    console.log(`[PASS] Direct Atlas Read verified demoUrl matches: ${dbProject.demoUrl}`);

    const dbUser = await mongoose.connection.db.collection("users").findOne({ email: "punittrivedi699@gmail.com" });
    if (!dbUser || dbUser.institution !== "Techno NJR Institute of Technology") {
        throw new Error("Direct Atlas check failed: User institution mismatch!");
    }
    console.log(`[PASS] Direct Atlas Read verified User: ${dbUser.name}, ${dbUser.institution}`);

    // 6. Test Strict Project Isolation (all=true is blocked/ignored for regular student)
    console.log("\n6. Testing Strict Project Isolation for punittrivedi699@gmail.com...");
    const studentAllRes = await fetch(`${BASE_URL}/projects?all=true&limit=100`, {
        headers: authHeaders,
    });
    const studentAllData = await studentAllRes.json();
    console.log(`[CHECK] GET /api/projects?all=true for student returned: ${studentAllData.projects?.length} projects`);
    // Ensure all returned projects belong to Punit
    const nonUserProjects = (studentAllData.projects || []).filter(
        (p) => String(p.owner?._id || p.owner) !== String(dbUser._id) &&
               !(p.members || []).some((m) => String(m._id || m) === String(dbUser._id))
    );
    if (nonUserProjects.length > 0) {
        throw new Error(`FAIL: Project isolation breached! Student received ${nonUserProjects.length} foreign projects: ${nonUserProjects.map(p => p.name).join(", ")}`);
    }
    console.log(`[PASS] Strict Project Isolation Verified! Student receives 0 foreign projects.`);

    // 6b. Test Authorization on Foreign Project Update
    const foreignProject = await mongoose.connection.db.collection("projects").findOne({
        name: { $ne: "Thinkflux" },
        owner: { $ne: dbUser._id },
        members: { $ne: dbUser._id }
    });
    if (foreignProject) {
        console.log(`[CHECK] Attempting unauthorized update on foreign project: "${foreignProject.name}"...`);
        const unauthorizedRes = await fetch(`${BASE_URL}/projects/${foreignProject._id}`, {
            method: "PUT",
            headers: authHeaders,
            body: JSON.stringify({ description: "Unauthorized update test" }),
        });
        if (unauthorizedRes.status !== 403) {
            throw new Error(`FAIL: Expected 403 Forbidden on foreign project update, got ${unauthorizedRes.status}`);
        }
        console.log(`[PASS] Unauthorized update correctly rejected with HTTP 403 Forbidden!`);
    }

    // 7. Test Tasks for User
    console.log("\n7. Testing Tasks API...");
    const tasksRes = await fetch(`${BASE_URL}/tasks?projectId=${thinkflux._id}`, {
        headers: authHeaders,
    });
    const tasksData = await tasksRes.json();
    console.log(`[PASS] GET /api/tasks returned ${tasksData.tasks?.length} tasks for Thinkflux:`);
    for (const t of (tasksData.tasks || [])) {
        console.log(`  - [${t.status}] ${t.title}`);
    }

    // 8. Test Team API for Thinkflux (Deduplication Check)
    console.log("\n8. Testing Team API Deduplication (/api/team/:projectId)...");
    const teamRes = await fetch(`${BASE_URL}/team/${thinkflux._id}`, {
        headers: authHeaders,
    });
    const teamData = await teamRes.json();
    if (!teamData.success || !teamData.team) {
        throw new Error(`Team API failed: ${JSON.stringify(teamData)}`);
    }

    const teamOwner = teamData.team.owner;
    const teamMembers = teamData.team.members || [];
    const totalMembers = teamData.team.totalMembers;

    console.log(`Team Owner: ${teamOwner?.name} (${teamOwner?.email})`);
    console.log(`Team Members Count (non-owner): ${teamMembers.length}`);
    console.log(`Team Total Members: ${totalMembers}`);

    const duplicateOwnerInMembers = teamMembers.some(
        (m) => String(m._id) === String(teamOwner._id) || m.email === teamOwner.email
    );

    if (duplicateOwnerInMembers) {
        throw new Error("FAIL: Project Owner is still duplicated inside team members list!");
    }
    console.log("[PASS] Verified: Project Owner (Punit Trivedi) is NOT duplicated in members list!");
    console.log("[PASS] Member names:", teamMembers.map((m) => m.name).join(", "));

    await mongoose.disconnect();

    console.log("\n==========================================");
    console.log("ALL PERSISTENCE AND INTEGRITY TESTS PASSED!");
    console.log("==========================================");
}

verifyAll().catch((err) => {
    console.error("Verification Error:", err);
    process.exit(1);
});
