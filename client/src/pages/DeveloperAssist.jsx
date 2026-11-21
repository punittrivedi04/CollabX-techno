import { useState } from "react";
import {
  Code2,
  ShieldCheck,
  Lightbulb,
  Search,
  Sparkles,
  Copy,
  Check,
  Terminal,
  BookOpen,
  ChevronRight,
  ChevronDown,
  FileCode2,
  Lock,
  GitBranch,
  Network,
  Server,
  KeyRound,
  Layers,
  Database,
  LoaderCircle,
  Boxes,
  SlidersHorizontal,
  Palette,
  Trash2,
  UploadCloud,
} from "lucide-react";

const tools = [
  {
    id: "git",
    title: "Git & Deployment Guide",
    description: "Essential Git commands & live deployment checklist.",
    icon: GitBranch,
  },
  {
    id: "debug",
    title: "Debugging Guide",
    description: "6-step systematic debugging workflow.",
    icon: Search,
  },
  {
    id: "review",
    title: "Code Review",
    description: "Pre-commit quality & clean code checklist.",
    icon: Code2,
  },
  {
    id: "security",
    title: "Security Check",
    description: "Essential auth, API & DB safety rules.",
    icon: ShieldCheck,
  },
];

const dailyGitCommands = [
  {
    step: "Step 01 · Status Check",
    command: "git status",
    description:
      "Inspect working tree: view modified, staged, and untracked files.",
  },
  {
    step: "Step 02 · Stage Changes",
    command: "git add .",
    description: "Stage all modified and new project files for the next commit.",
  },
  {
    step: "Step 03 · Commit",
    command: 'git commit -m "message"',
    description:
      "Record a descriptive snapshot of staged files into local repository history.",
  },
  {
    step: "Step 04 · Sync Remote",
    command: "git pull origin main",
    description:
      "Fetch and merge the latest remote commits to stay up to date before pushing.",
  },
  {
    step: "Step 05 · Publish",
    command: "git push origin main",
    description:
      "Upload local commits to the remote GitHub or team repository.",
  },
];

const branchingCommands = [
  {
    label: "New Feature Branch",
    command: "git checkout -b feature-name",
    description:
      "Create and immediately switch to a dedicated isolated branch for your new feature.",
  },
  {
    label: "Shelf Work (Stash)",
    command: "git stash",
    description:
      "Temporarily shelve uncommitted working directory changes to get a clean working tree.",
  },
  {
    label: "Restore Work (Pop)",
    command: "git stash pop",
    description:
      "Re-apply previously stashed changes back into your active working branch.",
  },
  {
    label: "Undo Last Commit",
    command: "git reset --soft HEAD~1",
    description:
      "Undo the last commit while keeping all your modified code staged and ready to edit.",
  },
];

const deploymentChecklist = [
  {
    title: "Environment Variables (.env) Configured",
    category: "Secrets & Security",
    description:
      "Add DATABASE_URL, JWT_SECRET, and CLIENT_URL in Vercel/Render dashboard. Never commit secrets to Git.",
    action: "DATABASE_URL=postgres://... JWT_SECRET=... CLIENT_URL=...",
    copyable: false,
  },
  {
    title: "Build Command Tested Locally",
    category: "Compile Verification",
    description:
      "Run npm run build locally to ensure zero syntax, JSX, or bundling errors before pushing code.",
    action: "npm --prefix client run build",
    copyable: true,
  },
  {
    title: "CORS Origin Updated",
    category: "Network & API Access",
    description:
      "Configure backend CORS middleware to accept your live deployed domain (e.g. https://collabx.vercel.app).",
    action:
      "app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))",
    copyable: true,
  },
  {
    title: "Live URL Verified for Leaderboard",
    category: "Deliverables & Showcase",
    description:
      "Verify that both PPT and Live Demo URLs are live and accessible for 100% completed Leaderboard projects.",
    action: "https://your-project.vercel.app (Live & Responsive)",
    copyable: false,
  },
];

const debuggingCards = [
  {
    title: "Inspect Network Tab First",
    description:
      "Check HTTP status codes (400, 401, 404, 500), request payloads, and response headers in DevTools before assuming frontend code is broken.",
    icon: Network,
  },
  {
    title: "Trace the Exact Stack Line",
    description:
      "Read the top-most file and line number in the error stack trace (file.jsx:line) to isolate where undefined or null originated.",
    icon: FileCode2,
  },
  {
    title: "Verify Backend & Port Sync",
    description:
      "Confirm both Vite frontend and Express/Node backend servers are running, .env URLs match, and CORS origins allow localhost.",
    icon: Server,
  },
  {
    title: "Auth & JWT Token Check",
    description:
      "Inspect localStorage tokens, Authorization headers (Bearer <token>), and backend middleware when protected routes fail with 401/403.",
    icon: KeyRound,
  },
  {
    title: "Isolate React State & Renders",
    description:
      "Log state transitions and useEffect dependencies to catch stale closures, missing keys, or infinite re-render loops.",
    icon: Layers,
  },
  {
    title: "Database & Schema Validation",
    description:
      "Verify PostgreSQL/DB connection status, required table columns, and foreign keys when POST/PUT requests fail silently.",
    icon: Database,
  },
];

const codeReviewCards = [
  {
    title: "Graceful Loading & Error States",
    description:
      "Every API call must handle loading spinners, empty states, and user-friendly error alerts—never leave blank screens.",
    icon: LoaderCircle,
  },
  {
    title: "Modular Functions & Components",
    description:
      "Keep React components focused and move repeated API calls, helpers, and validation logic into dedicated utility/service files.",
    icon: Boxes,
  },
  {
    title: "API Pagination & Query Limits",
    description:
      "Use limit and skip/offset on list endpoints and avoid fetching unbounded database collections in production.",
    icon: SlidersHorizontal,
  },
  {
    title: "Strict Git & .env Hygiene",
    description:
      "Never commit .env secrets, API keys, or node_modules/; keep .gitignore updated and write clear commit messages.",
    icon: GitBranch,
  },
  {
    title: "Consistent Theme & Responsiveness",
    description:
      "Keep soft mint-green, pearl-ivory, and forest emerald styling consistent across mobile and desktop screens.",
    icon: Palette,
  },
  {
    title: "Clean Imports & Dead Code Removal",
    description:
      "Remove unused variables, commented-out blocks, and leftover console.log statements before pushing to the team repo.",
    icon: Trash2,
  },
];

const securityItems = [
  {
    title: "Password Security",
    description:
      "Hash passwords with bcrypt. Never store plain-text passwords.",
    icon: Lock,
  },
  {
    title: "JWT Protection",
    description:
      "Use secure secrets, token expiration, and protected backend routes.",
    icon: ShieldCheck,
  },
  {
    title: "Input Validation",
    description: "Validate and sanitize incoming data on the server.",
    icon: Check,
  },
  {
    title: "Database Security",
    description:
      "Use environment variables and avoid exposing database credentials.",
    icon: Terminal,
  },
  {
    title: "Authorization",
    description:
      "Check resource ownership and user permissions on every protected action.",
    icon: GitBranch,
  },
  {
    title: "HTTP Security",
    description:
      "Use Helmet, HTTPS in production, and carefully configured CORS.",
    icon: ShieldCheck,
  },
];

const nextSteps = [
  {
    title: "Rate Limiting & DDoS Protection",
    description:
      "Implement IP and user-based rate limiting on authentication and chat endpoints to prevent brute-force attacks.",
    tag: "Security",
    priority: "High",
  },
  {
    title: "Real-Time WebSocket Resilience",
    description:
      "Add automatic socket reconnection strategies, JWT handshake validation, and room-based event synchronization.",
    tag: "Architecture",
    priority: "High",
  },
  {
    title: "Database Indexing & Query Optimization",
    description:
      "Setup indexes on foreign keys and search columns for fast project searching, filtering, and query optimization.",
    tag: "Database",
    priority: "Medium",
  },
  {
    title: "Centralized Error Tracking & Logging",
    description:
      "Integrate structured JSON logging and global exception handlers across the backend API.",
    tag: "DevOps",
    priority: "Medium",
  },
];

const resources = [
  {
    title: "React Documentation",
    description: "Components, hooks, state and application architecture.",
    url: "https://react.dev/learn",
    tag: "Frontend",
  },
  {
    title: "Node.js Documentation",
    description: "Runtime, modules, APIs and asynchronous programming.",
    url: "https://nodejs.org/docs/latest/api/",
    tag: "Backend",
  },
  {
    title: "Express Documentation",
    description: "Routing, middleware, error handling and APIs.",
    url: "https://expressjs.com/",
    tag: "Backend",
  },
  {
    title: "PostgreSQL Documentation",
    description: "Queries, indexes, aggregation and schema design.",
    url: "https://www.postgresql.org/docs/",
    tag: "Database",
  },
  {
    title: "OWASP Top 10",
    description:
      "Learn about the most important web application security risks.",
    url: "https://owasp.org/www-project-top-ten/",
    tag: "Security",
  },
  {
    title: "MDN JavaScript Guide",
    description: "Core JavaScript concepts and language fundamentals.",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
    tag: "JavaScript",
  },
];

function SectionHeading({ eyebrow, title, description }) {
  return (
    <div className="mb-5">
      <span className="inline-block rounded-full border border-[#D4DFD7] bg-[#EFF4F0] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#42504B] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-300">
        {eyebrow}
      </span>
      <h2 className="mt-2 text-xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100 sm:text-2xl">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-[#5C6B66] dark:text-[#94A89D]">
          {description}
        </p>
      )}
    </div>
  );
}

export default function DeveloperAssist() {
  const [activeTool, setActiveTool] = useState("git");
  const [copiedCommand, setCopiedCommand] = useState("");

  const activeToolObj = tools.find((tool) => tool.id === activeTool);

  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(id || text);
      setTimeout(() => setCopiedCommand(""), 1800);
    } catch {
      setCopiedCommand("");
    }
  };

  const renderToolContent = () => {
    if (activeTool === "git") {
      return (
        <div className="space-y-8">
          {/* Daily Git Workflow */}
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E3F3EB] text-[#1E6B4B] dark:bg-[#13291E] dark:text-[#6EE7B7]">
                  <Terminal size={16} strokeWidth={1.85} />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold uppercase tracking-wider text-[#141A18] dark:text-slate-100">
                    Daily Git Workflow
                  </h4>
                  <p className="text-xs text-[#5C6B66] dark:text-[#94A89D]">
                    Standard sequence for synchronizing, staging, and committing
                    code
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#E3F3EB] px-2.5 py-0.5 text-[11px] font-bold text-[#1E6B4B] dark:bg-[#13291E] dark:text-[#6EE7B7]">
                5 Commands
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dailyGitCommands.map((item) => (
                <div
                  key={item.command}
                  className="group flex flex-col justify-between rounded-2xl border border-[#E4ECE6] bg-[#FAFBF9] p-4 transition hover:border-[#1E2422]/30 hover:bg-white dark:border-[#1F2C26] dark:bg-[#111815] dark:hover:bg-[#1E2A24]"
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-block rounded-md bg-[#EFF4F0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#42504B] dark:bg-[#0C120F] dark:text-slate-300">
                        {item.step}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.command, item.command)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#D5E0D8] bg-white px-2.5 py-1 text-[11px] font-bold text-[#141A18] transition hover:border-[#2E8B63] hover:text-[#2E8B63] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:text-[#A3E635]"
                        title="Copy command"
                      >
                        {copiedCommand === item.command ? (
                          <>
                            <Check
                              size={12}
                              strokeWidth={2}
                              className="text-[#2E8B63] dark:text-[#4ADE80]"
                            />
                            <span className="text-[#2E8B63] dark:text-[#4ADE80]">
                              Copied
                            </span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} strokeWidth={1.85} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <code className="block overflow-x-auto rounded-xl bg-[#1E2422] p-2.5 font-mono text-xs font-bold text-[#BEF264] dark:bg-[#090D0B] dark:ring-1 dark:ring-[#2E4237]">
                      {item.command}
                    </code>
                  </div>
                  <p className="mt-2.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Branching & Conflict Fixes */}
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E3F3EB] text-[#1E6B4B] dark:bg-[#13291E] dark:text-[#6EE7B7]">
                  <GitBranch size={16} strokeWidth={1.85} />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold uppercase tracking-wider text-[#141A18] dark:text-slate-100">
                    Branching &amp; Conflict Fixes
                  </h4>
                  <p className="text-xs text-[#5C6B66] dark:text-[#94A89D]">
                    Feature branch isolation, stashing uncommitted work, and
                    undoing commits
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#E3F3EB] px-2.5 py-0.5 text-[11px] font-bold text-[#1E6B4B] dark:bg-[#13291E] dark:text-[#6EE7B7]">
                4 Commands
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {branchingCommands.map((item) => (
                <div
                  key={item.command}
                  className="group flex flex-col justify-between rounded-2xl border border-[#E4ECE6] bg-[#FAFBF9] p-4 transition hover:border-[#1E2422]/30 hover:bg-white dark:border-[#1F2C26] dark:bg-[#111815] dark:hover:bg-[#1E2A24]"
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-block rounded-md bg-[#EFF4F0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#42504B] dark:bg-[#0C120F] dark:text-slate-300">
                        {item.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.command, item.command)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#D5E0D8] bg-white px-2.5 py-1 text-[11px] font-bold text-[#141A18] transition hover:border-[#2E8B63] hover:text-[#2E8B63] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:text-[#A3E635]"
                        title="Copy command"
                      >
                        {copiedCommand === item.command ? (
                          <>
                            <Check
                              size={12}
                              strokeWidth={2}
                              className="text-[#2E8B63] dark:text-[#4ADE80]"
                            />
                            <span className="text-[#2E8B63] dark:text-[#4ADE80]">
                              Copied
                            </span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} strokeWidth={1.85} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <code className="block overflow-x-auto rounded-xl bg-[#1E2422] p-2.5 font-mono text-xs font-bold text-[#BEF264] dark:bg-[#090D0B] dark:ring-1 dark:ring-[#2E4237]">
                      {item.command}
                    </code>
                  </div>
                  <p className="mt-2.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Live Deployment Checklist */}
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E3F3EB] text-[#1E6B4B] dark:bg-[#13291E] dark:text-[#6EE7B7]">
                  <UploadCloud size={16} strokeWidth={1.85} />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold uppercase tracking-wider text-[#141A18] dark:text-slate-100">
                    Live Deployment Checklist (Vercel &amp; Render)
                  </h4>
                  <p className="text-xs text-[#5C6B66] dark:text-[#94A89D]">
                    4-point essential verification for seamless hosting and
                    Leaderboard qualification
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#E3F3EB] px-2.5 py-0.5 text-[11px] font-bold text-[#1E6B4B] dark:bg-[#13291E] dark:text-[#6EE7B7]">
                4 Verification Checks
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {deploymentChecklist.map((item, index) => (
                <div
                  key={item.title}
                  className="flex flex-col justify-between rounded-2xl border border-[#E4ECE6] bg-[#FAFBF9] p-4.5 transition hover:border-[#1E2422]/30 hover:bg-white dark:border-[#1F2C26] dark:bg-[#111815] dark:hover:bg-[#1E2A24]"
                >
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E6B4B] text-[11px] font-extrabold text-white dark:bg-[#BEF264] dark:text-[#090D0B]">
                        0{index + 1}
                      </span>
                      <span className="rounded-full bg-[#EFF4F0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#42504B] dark:bg-[#0C120F] dark:text-slate-300">
                        {item.category}
                      </span>
                    </div>

                    <h5 className="text-sm font-extrabold text-[#141A18] dark:text-slate-100">
                      {item.title}
                    </h5>

                    <p className="mt-1 text-xs leading-5 text-[#5C6B66] dark:text-[#94A89D]">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-3.5 flex items-center justify-between rounded-xl border border-[#D5E0D8] bg-[#EFF4F0] px-3 py-2 font-mono text-xs text-[#1E6B4B] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-[#A3E635]">
                    <span className="truncate">{item.action}</span>
                    {item.copyable && (
                      <button
                        type="button"
                        onClick={() => handleCopy(item.action, item.action)}
                        className="ml-2 shrink-0 cursor-pointer text-[#5C6B66] hover:text-[#141A18] dark:text-[#94A89D] dark:hover:text-slate-100"
                        title="Copy snippet"
                      >
                        {copiedCommand === item.action ? (
                          <Check
                            size={13}
                            strokeWidth={2}
                            className="text-[#2E8B63] dark:text-[#4ADE80]"
                          />
                        ) : (
                          <Copy size={13} strokeWidth={1.85} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const list =
      activeTool === "debug"
        ? debuggingCards
        : activeTool === "review"
          ? codeReviewCards
          : securityItems;

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="rounded-2xl border border-[#E4ECE6] bg-[#FAFBF9] p-5 transition hover:border-[#1E2422]/30 hover:bg-white dark:border-[#1F2C26] dark:bg-[#111815] dark:hover:bg-[#1E2A24]"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#D4DFD7] bg-white text-[#141A18] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100">
                <Icon size={18} strokeWidth={1.85} />
              </div>

              <h3 className="mb-1.5 text-sm font-bold text-[#141A18] dark:text-slate-100">
                {item.title}
              </h3>

              <p className="text-xs leading-6 text-[#5C6B66] dark:text-[#94A89D]">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-7 text-[#141A18] dark:text-slate-100">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-[28px] border border-[#DDDAD0] bg-[#F2F0E9] p-7 shadow-2xs dark:border-[#2D362B] dark:bg-[#1B201A] sm:p-9">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#DDDAD0] bg-white px-3.5 py-1.5 text-xs font-bold text-[#42504B] dark:border-[#2D362B] dark:bg-[#0C120F] dark:text-slate-300">
            <Sparkles
              size={14}
              strokeWidth={1.85}
              className="text-[#2E8B63] dark:text-[#4ADE80]"
            />
            <span>YOUR DEVELOPMENT TOOLKIT</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100 sm:text-4xl">
            Build smarter.{" "}
            <span className="underline decoration-[#2E8B63] decoration-4 underline-offset-4">
              Debug faster.
            </span>
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#42504B] dark:text-slate-300 sm:text-base">
            A dedicated space for debugging, code quality, security awareness,
            and clean full-stack development practices.
          </p>

          <button
            type="button"
            onClick={() => {
              setActiveTool("git");
              document
                .getElementById("developer-tools")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#141A17] px-6 py-3 text-sm font-bold text-white shadow-xs transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B]"
          >
            <span>Explore Developer Tools</span>
            <ChevronRight
              size={17}
              strokeWidth={1.85}
              className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]"
            />
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-8 hidden text-[#141A18]/8 dark:text-slate-100/8 lg:block">
          <Code2 size={180} strokeWidth={1} />
        </div>
      </section>

      {/* Quick Stats */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Developer Tools", value: "04", icon: Code2 },
          {
            label: "Review Standards",
            value: String(codeReviewCards.length).padStart(2, "0"),
            icon: Check,
          },
          {
            label: "Security Topics",
            value: String(securityItems.length).padStart(2, "0"),
            icon: ShieldCheck,
          },
          {
            label: "Learning Resources",
            value: String(resources.length).padStart(2, "0"),
            icon: BookOpen,
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] p-5 shadow-2xs dark:border-[#1F2C26] dark:bg-[#111815]"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                  {stat.label}
                </p>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D4DFD7] bg-[#EFF4F0] text-[#141A18] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100">
                  <Icon size={17} strokeWidth={1.85} />
                </div>
              </div>

              <p className="text-3xl font-extrabold text-[#141A18] dark:text-slate-100">
                {stat.value}
              </p>
            </div>
          );
        })}
      </section>

      {/* UNIFIED CONNECTED WORKSPACE */}
      <section id="developer-tools">
        <SectionHeading
          eyebrow="Developer Workspace"
          title="What do you want to work on?"
          description="Select a tool tab below — the interactive workspace updates right underneath."
        />

        <div className="overflow-hidden rounded-[28px] border border-[#D4DFD7] bg-white shadow-2xs dark:border-[#1F2C26] dark:bg-[#111815]">
          {/* Top Connected Tab Strip */}
          <div className="grid grid-cols-1 divide-y divide-[#D4DFD7] border-b border-[#D4DFD7] bg-[#EFF4F0]/75 dark:divide-[#1F2C26] dark:border-[#24322B] dark:bg-[#141D19] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;

              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveTool(tool.id)}
                  className={`relative flex cursor-pointer flex-col justify-between p-5 text-left transition ${
                    isActive
                      ? "bg-white text-[#141A18] dark:bg-[#0C120F] dark:text-slate-100"
                      : "text-[#5C6B66] hover:bg-white/60 hover:text-[#141A18] dark:text-[#94A89D] dark:hover:bg-[#1A2520]/80 dark:hover:text-slate-100"
                  }`}
                >
                  {isActive && (
                    <span className="absolute inset-x-0 top-0 h-1 bg-[#2E8B63]" />
                  )}

                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                          isActive
                            ? "bg-[#2E8B63] text-white"
                            : "border border-[#D4DFD7] bg-white text-[#42504B] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-300"
                        }`}
                      >
                        <Icon size={18} strokeWidth={1.85} />
                      </div>

                      {isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#2E8B63]/30 bg-[#E3F3EB] px-2.5 py-0.5 text-[11px] font-bold text-[#1E6B4B] dark:border-[#22C55E]/40 dark:bg-[#13291E] dark:text-[#6EE7B7]">
                          <span>Selected</span>
                          <ChevronDown size={13} strokeWidth={2} />
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-[#6B7B75] dark:text-[#869B90]">
                          Switch
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-extrabold text-[#141A18] dark:text-slate-100">
                      {tool.title}
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-[#5C6B66] dark:text-[#94A89D]">
                      {tool.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Connected Workspace Body */}
          <div className="bg-white p-6 dark:bg-[#0C120F] sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#E4ECE6] pb-4 dark:border-[#1F2C26]">
              <div className="flex items-center gap-3">
                {activeToolObj && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E3F3EB] text-[#1E6B4B] dark:bg-[#13291E] dark:text-[#6EE7B7]">
                    <activeToolObj.icon size={19} strokeWidth={1.85} />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-extrabold text-[#141A18] dark:text-slate-100">
                    {activeToolObj?.title}
                  </h3>
                  <p className="text-xs text-[#5C6B66] dark:text-[#94A89D]">
                    {activeToolObj?.description}
                  </p>
                </div>
              </div>

              <span className="rounded-full border border-[#D4DFD7] bg-[#EFF4F0] px-3 py-1 text-[11px] font-bold text-[#42504B] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-300">
                Active Workspace View
              </span>
            </div>

            {renderToolContent()}
          </div>
        </div>
      </section>

      {/* Project Next Steps */}
      <section>
        <SectionHeading
          eyebrow="Development Roadmap"
          title="Recommended next steps"
          description="Practical improvements to make your CollabX build production-ready."
        />

        <div className="grid gap-4 md:grid-cols-2">
          {nextSteps.map((step, index) => (
            <div
              key={step.title}
              className="flex gap-4 rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] p-5 shadow-2xs dark:border-[#1F2C26] dark:bg-[#111815]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D4DFD7] bg-white text-xs font-extrabold text-[#141A18] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100">
                0{index + 1}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-[#141A18] dark:text-slate-100">
                    {step.title}
                  </h3>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      step.priority === "High"
                        ? "border border-[#1E2422]/25 bg-[#1E2422]/8 text-[#141A18] dark:text-slate-100"
                        : "border border-[#D4DFD7] bg-[#EFF4F0] text-[#42504B] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-300"
                    }`}
                  >
                    {step.priority}
                  </span>
                </div>

                <p className="text-xs leading-6 text-[#5C6B66] dark:text-[#94A89D]">
                  {step.description}
                </p>

                <span className="mt-3 inline-block rounded-full border border-[#E4ECE6] bg-white px-3 py-1 text-[10px] font-bold text-[#42504B] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-300">
                  {step.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Learning Resources */}
      <section>
        <SectionHeading
          eyebrow="Keep Learning"
          title="Developer resources"
          description="Official documentation and trusted references for your development journey."
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {resources.map((resource) => (
            <a
              key={resource.title}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] p-5 shadow-2xs transition hover:border-[#1E2422]/40 hover:bg-white dark:border-[#1F2C26] dark:bg-[#111815] dark:hover:bg-[#1E2A24]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D4DFD7] bg-[#EFF4F0] text-[#141A18] transition group-hover:bg-[#1E2422] group-hover:text-white dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100">
                  <BookOpen size={16} strokeWidth={1.85} />
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={1.85}
                  className="text-[#5C6B66] transition group-hover:translate-x-1 group-hover:text-[#141A18] dark:text-[#94A89D]"
                />
              </div>

              <h3 className="text-sm font-bold text-[#141A18] dark:text-slate-100">
                {resource.title}
              </h3>

              <p className="mt-1.5 text-xs leading-5 text-[#5C6B66] dark:text-[#94A89D]">
                {resource.description}
              </p>

              <span className="mt-3 inline-block rounded-full border border-[#E4ECE6] bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#42504B] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-300">
                {resource.tag}
              </span>
            </a>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-2.5 rounded-2xl border border-[#DDDAD0] bg-[#F2F0E9] p-4 text-xs font-medium text-[#42504B] dark:border-[#2D362B] dark:bg-[#1B201A] dark:text-slate-300">
        <Lightbulb
          size={17}
          strokeWidth={1.85}
          className="shrink-0 text-[#141A18] dark:text-slate-100"
        />
        <span>
          Developer Assist uses built-in guides and checklists locally without
          sending your code externally.
        </span>
      </div>
    </div>
  );
}