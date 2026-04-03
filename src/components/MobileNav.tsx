import { Home, User, Code, FolderOpen, Mail, GraduationCap } from "lucide-react";

const navItems = [
  { name: "Home", icon: Home, href: "#home" },
  { name: "About", icon: User, href: "#about" },
  { name: "Skills", icon: Code, href: "#skills" },
  { name: "Education", icon: GraduationCap, href: "#education" },
  { name: "Projects", icon: FolderOpen, href: "#projects" },
  { name: "Contact", icon: Mail, href: "#contact" },
];

const MobileNav = () => {
  const handleClick = (href: string) => {
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 xl:hidden">
      <div className="flex items-center justify-around py-3 px-2 bg-secondary/90 backdrop-blur-md border-t border-border/30">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => handleClick(item.href)}
            className="flex flex-col items-center gap-1 text-foreground/60 hover:text-accent transition-colors"
          >
            <item.icon size={18} />
            <span className="text-[10px]">{item.name}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default MobileNav;
