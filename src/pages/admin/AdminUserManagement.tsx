import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, ChevronDown, ChevronUp, FileText, Loader2,
  MessageSquare, Search, X,
} from "lucide-react";
import { adminData, AppUser, ChatMessage, UserCV } from "@/lib/admin-data";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── CVs popup — lists the user's CV sessions ─────────────────────────────────

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
            <h2 className="font-sora font-semibold">CVs — {user.fullName || user.email}</h2>
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
          {cvs.map((cv, i) => (
            <div key={cv.id} className="rounded-lg border border-border px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">CV #{cvs.length - i}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cv.pdfVersion > 0 ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"}`}>
                  {cv.pdfVersion > 0 ? `Generated · v${cv.pdfVersion}` : "Draft"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {cv.style} · {cv.language.toUpperCase()} · {fmtDate(cv.createdAt)} · {fmtTokens(cv.totalTokens)} tokens · {cv.messageCount} messages
              </p>
            </div>
          ))}
        </div>

        <p className="shrink-0 text-[11px] text-muted-foreground border-t border-border/50 pt-3">
          PDFs are generated on demand and not stored server-side, so there's no
          file to download here — the CV is regenerated from its draft when the
          visitor requests it.
        </p>
      </div>
    </div>
  );
};

// ── Chats popup — sessions list, then transcript on "Open" ────────────────────

const ChatsModal = ({ user, onClose }: { user: AppUser; onClose: () => void }) => {
  const [sessions, setSessions] = useState<UserCV[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // transcript view
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);

  useEffect(() => {
    adminData
      .getUserCVs(user.id)
      .then(setSessions)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user.id]);

  const openChat = (id: string) => {
    setOpenId(id);
    setMsgLoading(true);
    setMsgError(null);
    adminData
      .getSessionMessages(id)
      .then(setMessages)
      .catch((e: Error) => setMsgError(e.message))
      .finally(() => setMsgLoading(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {openId && (
              <button
                onClick={() => setOpenId(null)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Back to sessions"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="font-sora font-semibold truncate">
                {openId ? "Transcript" : `Chats — ${user.fullName || user.email}`}
              </h2>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {/* Sessions list */}
          {!openId && (
            <>
              {loading && (
                <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {!loading && !error && sessions.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-10">No chat sessions yet.</p>
              )}
              {sessions.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">Session #{sessions.length - i}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(s.createdAt)} · {s.messageCount} messages
                    </p>
                  </div>
                  <button
                    onClick={() => openChat(s.id)}
                    className="ml-3 shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/70 transition-colors"
                  >
                    Open
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Transcript */}
          {openId && (
            <>
              {msgLoading && (
                <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading transcript…
                </div>
              )}
              {msgError && <p className="text-sm text-destructive">{msgError}</p>}
              {!msgLoading && !msgError && messages.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-10">This session has no messages.</p>
              )}
              {messages
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => (
                  <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-foreground/90"
                      }`}
                    >
                      {m.content || <span className="italic opacity-60">(empty)</span>}
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = keyof Pick<
  AppUser,
  "fullName" | "email" | "createdAt" | "lastLoginAt" | "totalCvsCreated" | "totalTokens"
>;

const AdminUserManagement = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);

  const [cvsFor, setCvsFor] = useState<AppUser | null>(null);
  const [chatsFor, setChatsFor] = useState<AppUser | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setUsers(await adminData.getUsers());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
        (u.fullName ?? "").toLowerCase().includes(q) ||
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
          <p className="text-xs text-muted-foreground">
            If this says the function doesn't exist, run{" "}
            <code className="rounded bg-secondary/60 px-1">supabase/admin-user-functions.sql</code>{" "}
            in the Supabase SQL editor.
          </p>
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/20">
              <tr>
                {th("Full Name", "fullName")}
                {th("Email", "email")}
                {th("User ID")}
                {th("Created", "createdAt")}
                {th("Last Login", "lastLoginAt")}
                {th("CVs", "totalCvsCreated")}
                {th("Tokens", "totalTokens")}
                {th("Actions")}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{u.fullName || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {u.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(u.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-center font-medium">{u.totalCvsCreated}</td>
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
                  <td colSpan={8} className="py-16 text-center text-sm text-muted-foreground">
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
