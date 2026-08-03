import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FolderKanban, MessageSquare, FileText,
  Link2, GraduationCap, Award, Wrench, Home, LogOut, Menu, X,
} from "lucide-react";
import { clearToken } from "@/lib/auth";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/hero", icon: Home, label: "Hero" },
  { to: "/admin/about", icon: FileText, label: "À Propos" },
  { to: "/admin/skills", icon: Wrench, label: "Compétences" },
  { to: "/admin/education", icon: GraduationCap, label: "Formation" },
  { to: "/admin/certificates", icon: Award, label: "Certificats" },
  { to: "/admin/projects", icon: FolderKanban, label: "Projets" },
  { to: "/admin/messages", icon: MessageSquare, label: "Messages" },
  { to: "/admin/links", icon: Link2, label: "Liens Sociaux" },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-card border-r border-border flex flex-col z-50 transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-sora font-bold text-lg">
            <span className="text-accent">Admin</span> Panel
          </h2>
          <button className="lg:hidden text-muted-foreground" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-accent/15 text-accent font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 w-full transition-colors"
          >
            <Home size={18} /> Voir le Site
          </button>
          <button
            onClick={() => {
              clearToken();
              navigate("/admin/login", { replace: true });
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 w-full transition-colors"
          >
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b border-border flex items-center px-4 lg:px-6 sticky top-0 bg-background/80 backdrop-blur-sm z-30">
          <button className="lg:hidden mr-3 text-muted-foreground" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="font-sora font-semibold text-sm text-muted-foreground">Portfolio Admin</span>
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
