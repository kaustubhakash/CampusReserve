import { Database, Server, ShieldCheck, Activity, Layers, CheckCircle2, Clock, CalendarDays } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                CampusReserve
              </span>
              <span className="ml-2 text-xs font-mono uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v1.0-alpha
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/api/health"
              target="_blank"
              className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              API Health
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 w-full flex flex-col justify-between">
        <div>
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-indigo-300 mb-6">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              DBMS Mini-Project &bull; Transactional & Conflict-Free
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
              Campus Resource Booking &{" "}
              <span className="bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
                Waitlist Management
              </span>
            </h1>
            <p className="text-base sm:text-lg text-slate-400 leading-relaxed mb-8">
              A high-integrity academic DBMS solution combining relational consistency with NoSQL event streaming. Powered by MySQL 8 InnoDB transactions, stored procedures, triggers, and MongoDB audit logging.
            </p>
          </div>

          {/* System Architecture Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-10">
            {/* Relational Layer Card */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-indigo-500/40 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">MySQL 8 Relational Core</h3>
              <p className="text-sm text-slate-400 mb-4">
                Structured storage for users, resources, reservations, and waitlists. Enforces strict ACID compliance, interval conflict prevention, triggers, and stored procedures.
              </p>
              <div className="flex items-center gap-2 text-xs font-mono text-indigo-300 bg-indigo-950/40 px-3 py-1.5 rounded-md border border-indigo-800/40">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>mysql2 / InnoDB Connection Ready</span>
              </div>
            </div>

            {/* NoSQL Audit Layer Card */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">MongoDB Audit Store</h3>
              <p className="text-sm text-slate-400 mb-4">
                Unstructured and immutable event logging: booking activity trails, cancellation history, and administrative audit streams with aggregation pipeline support.
              </p>
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-300 bg-emerald-950/40 px-3 py-1.5 rounded-md border border-emerald-800/40">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Official Driver Pool Ready</span>
              </div>
            </div>

            {/* Application Layer Card */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-sky-500/40 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-4">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Next.js App Router</h3>
              <p className="text-sm text-slate-400 mb-4">
                Unified TypeScript architecture with secure server-side Route Handlers, role-based access control (Student & Administrator), and responsive Tailwind CSS UI.
              </p>
              <div className="flex items-center gap-2 text-xs font-mono text-sky-300 bg-sky-950/40 px-3 py-1.5 rounded-md border border-sky-800/40">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Next.js API & SSR Ready</span>
              </div>
            </div>
          </div>

          {/* Verification Status Endpoints */}
          <div className="mt-8 p-6 rounded-2xl bg-slate-900 border border-slate-800">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Direct Database Health Probes
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <a
                href="/api/health"
                target="_blank"
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition group"
              >
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-indigo-300">System Probe</div>
                  <div className="text-xs text-slate-400">/api/health</div>
                </div>
                <Clock className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
              </a>

              <a
                href="/api/health/mysql"
                target="_blank"
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition group"
              >
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-indigo-300">MySQL 8 Health</div>
                  <div className="text-xs text-slate-400">/api/health/mysql</div>
                </div>
                <Database className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
              </a>

              <a
                href="/api/health/mongodb"
                target="_blank"
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition group"
              >
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-indigo-300">MongoDB Health</div>
                  <div className="text-xs text-slate-400">/api/health/mongodb</div>
                </div>
                <Layers className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-800/60 text-center text-xs text-slate-500">
          Academic DBMS Mini-Project &bull; Campus Resource Booking &amp; Waitlist Management System
        </footer>
      </main>
    </div>
  );
}
