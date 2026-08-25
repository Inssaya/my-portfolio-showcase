import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown, ChevronUp, Download, Eye, EyeOff,
  FileText, Loader2, MessageSquare, Search, X,
} from "lucide-react";
import { adminData, AppUser, ChatSession, UserCV } from "@/lib/admin-data";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtTime(ms: number) {
  if (!ms) return "0m";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── CVs popup ────────────────────────────────────────────────────────────────

const CVsModal = ({ user, onClose }: { user: AppUser; onClose: () => void }) => {
  const [cvs, setCVs] = useState<UserCV[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminData
      .getUserCVs(user.id)
      .then(setCVs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-sora font-semibold">CVs — {user.fullName}</h2>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && cvs.length === 0 && (
            <p className="text-sm text-center text-muted-foreground py-10">No CVs created yet.</p>
          )}
          {cvs.map((cv) => (
            <div key={cv.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{cv.title}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(cv.createdAt)}</p>
              </div>
              {cv.fileUrl ? (
                <a
                  href={cv.fileUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 shrink-0 flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                >
                  <Download size={12} /> Download
                </a>
              ) : (
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">No file</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Chats popup ───────────────────────────────────────────────────────────────

const ChatsModal = ({ user, onClose }: { user: AppUser; onClose: () => void }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminData
      .getUserChats(user.id)
      .then(setSessions)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-sora font-semibold">Chat sessions — {user.fullName}</h2>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && sessions.length === 0 && (
            <p className="text-sm text-center text-muted-foreground py-10">No chat sessions yet.</p>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(s.createdAt)} · {s.messageCount} messages
                  {s.lastMessageAt ? ` · last ${fmtDate(s.lastMessageAt)}` : ""}
                </p>
              </div>
              <a
                href={`/admin/chats/${s.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 shrink-0 flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/70 transition-colors"
              >
                Open
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = keyof Pick<
  AppUser,
  "fullName" | "email" | "createdAt" | "lastLoginAt" | "totalCvsCreated" | "totalTimeSpentMs" | "totalTokens"
>;

const AdminUserManagement = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);

  // modals
  const [cvsFor, setCvsFor] = useState<AppUser | null>(null);
  const [chatsFor, setChatsFor] = useState<AppUser | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setUsers(await adminData.getUsers());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp size={13} className="inline ml-0.5" /> : <ChevronDown size={13} className="inline ml-0.5" />
      : null;

  const filtered = users
    .filter((u) => {
      const q = search.toLowerCase();
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortAsc ? cmp : -cmp;
    });

  const th = (label: string, key?: SortKey) => (
    <th
      scope="col"
      onClick={key ? () => toggleSort(key) : undefined}
      className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide ${key ? "cursor-pointer select-none hover:text-foreground" : ""}`}
    >
      {label}{key && <SortIcon k={key} />}
    </th>
  );

  return (
    <div className="space-y-6">
      {cvsFor && <CVsModal user={cvsFor} onClose={() => setCvsFor(null)} />}
      {chatsFor && <ChatsModal user={chatsFor} onClose={() => setChatsFor(null)} />}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-sora text-2xl font-bold">User Management</h1>
        <span className="text-sm text-muted-foreground">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or ID…"
          className="w-full rounded-lg border border-border bg-secondary/40 py-2 pl-9 pr-4 text-sm outline-none focus:border-accent/50 focus:bg-secondary/70 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading users…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-4 space-y-2">
          <p className="text-sm text-destructive font-medium">Failed to load users</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">Required Supabase tables</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-secondary/40 p-3 text-[11px] leading-relaxed">{`-- Run once in Supabase SQL editor:

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  total_cvs_created INT DEFAULT 0,
  total_time_spent_ms BIGINT DEFAULT 0,
  total_tokens INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cvs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Untitled CV',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  file_url TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Chat session',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  message_count INT DEFAULT 0
);`}</pre>
          </details>
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/20">
              <tr>
                {th("Full Name", "fullName")}
                {th("Email", "email")}
                {th("Password")}
                {th("User ID")}
                {th("Created", "createdAt")}
                {th("Last Login", "lastLoginAt")}
                {th("CVs", "totalCvsCreated")}
                {th("Time Spent", "totalTimeSpentMs")}
                {th("Tokens", "totalTokens")}
                {th("Actions")}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{u.fullName || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs">
                        {revealId === u.id ? u.password || "—" : "••••••••"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRevealId(revealId === u.id ? null : u.id)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={revealId === u.id ? "Hide password" : "Show password"}
                      >
                        {revealId === u.id ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {u.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(u.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-center font-medium">{u.totalCvsCreated}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtTime(u.totalTimeSpentMs)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtTokens(u.totalTokens)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCvsFor(u)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors"
                      >
                        <FileText size={11} /> CVs
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatsFor(u)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors"
                      >
                        <MessageSquare size={11} /> Chats
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-sm text-muted-foreground">
                    {search ? "No users match your search." : "No users yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminUserManagement;
