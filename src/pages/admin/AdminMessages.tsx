import { useCallback, useEffect, useState } from "react";
import { adminData, Message } from "@/lib/admin-data";
import { Loader2, Mail, MailOpen, Trash2, X } from "lucide-react";

const AdminMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setMessages(await adminData.getMessages());
    } catch (err) {
      // Most common cause: RLS refused the read because the session expired.
      // Surface it so the admin knows to re-log rather than staring at an
      // empty inbox thinking nobody wrote.
      console.error("Failed to load messages", err);
      setError("Couldn't load messages. Try refreshing or sign in again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markRead = async (id: string) => {
    // Optimistic UI: flip the flag locally so the read state feels instant,
    // then confirm on the server. If it fails, revert.
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, read: true } : m)));
    try {
      await adminData.markMessageRead(id);
    } catch (err) {
      console.error("markMessageRead failed", err);
      await refresh();
    }
  };

  const remove = async (id: string) => {
    const previous = messages;
    setMessages((current) => current.filter((m) => m.id !== id));
    if (selected?.id === id) setSelected(null);
    try {
      await adminData.deleteMessage(id);
    } catch (err) {
      console.error("deleteMessage failed", err);
      setMessages(previous); // Rollback the UI to reality.
    }
  };

  const open = (m: Message) => {
    setSelected(m);
    if (!m.read) void markRead(m.id);
  };

  return (
    <div className="space-y-6">
      <h1 className="font-sora text-2xl font-bold">Messages</h1>

      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sora font-semibold truncate">{selected.subject || "Sans sujet"}</h2>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">De:</span> {selected.name} ({selected.email})</p>
              <p><span className="text-muted-foreground">Date:</span> {new Date(selected.date).toLocaleString("fr-FR")}</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">{selected.message}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">Chargement…</span>
        </div>
      )}

      {error && !loading && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`glass-card p-4 flex items-center gap-4 cursor-pointer hover:border-accent/30 transition-colors ${!m.read ? "border-accent/20" : ""}`}
              onClick={() => open(m)}
            >
              {m.read ? <MailOpen size={18} className="text-muted-foreground shrink-0" /> : <Mail size={18} className="text-accent shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm truncate ${!m.read ? "font-semibold" : ""}`}>{m.name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(m.date).toLocaleDateString("fr-FR")}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{m.subject || m.message}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); void remove(m.id); }} className="p-2 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {messages.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Aucun message reçu.</p>}
        </div>
      )}
    </div>
  );
};

export default AdminMessages;
