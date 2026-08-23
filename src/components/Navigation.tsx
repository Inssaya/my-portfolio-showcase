import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, User, Code, FolderOpen, Mail, GraduationCap, Briefcase, BookOpen, FileText, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

const navItems = [
  { name: "Home", icon: Home, href: "#home" },
  { name: "About", icon: User, href: "#about" },
  { name: "Experience", icon: Briefcase, href: "#experience" },
  { name: "Skills", icon: Code, href: "#skills" },
  { name: "Education", icon: GraduationCap, href: "#education" },
  { name: "Projects", icon: FolderOpen, href: "#projects" },
  { name: "Contact", icon: Mail, href: "#contact" },
];

const Navigation = () => {
  const [active, setActive] = useState("#home");
  const { theme, toggle } = useTheme();

  const handleClick = (href: string) => {
    setActive(href);
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="fixed right-4 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col items-center gap-y-4">
      <div className="flex flex-col items-center gap-y-6 py-8 px-3 bg-foreground/5 backdrop-blur-sm rounded-full">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => handleClick(item.href)}
            className="relative group flex items-center"
          >
            <div className="absolute right-full mr-4 hidden group-hover:flex items-center">
              <div className="bg-foreground text-background text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap">
                {item.name}
              </div>
              <div className="border-l-foreground border-l-8 border-y-transparent border-y-[5px] border-r-0" />
            </div>
            <motion.div
              whileHover={{ scale: 1.2 }}
              className={`text-xl transition-colors duration-300 ${
                active === item.href ? "text-accent" : "text-foreground/60 hover:text-accent"
              }`}
            >
              <item.icon size={20} />
            </motion.div>
          </button>
        ))}

        {/* Blog — navigates to /blog, outside the scroll-section model */}
        <Link to="/blog" className="relative group flex items-center">
          <div className="absolute right-full mr-4 hidden group-hover:flex items-center">
            <div className="bg-foreground text-background text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap">
              Blog
            </div>
            <div className="border-l-foreground border-l-8 border-y-transparent border-y-[5px] border-r-0" />
          </div>
          <motion.div
            whileHover={{ scale: 1.2 }}
            className="text-xl transition-colors duration-300 text-foreground/60 hover:text-accent"
          >
            <BookOpen size={20} />
          </motion.div>
        </Link>

        {/* CV Builder — same route-navigation pattern as Blog */}
        <Link to="/cv-builder" className="relative group flex items-center">
          <div className="absolute right-full mr-4 hidden group-hover:flex items-center">
            <div className="bg-foreground text-background text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap">
              CV Builder
            </div>
            <div className="border-l-foreground border-l-8 border-y-transparent border-y-[5px] border-r-0" />
          </div>
          <motion.div
            whileHover={{ scale: 1.2 }}
            className="text-xl transition-colors duration-300 text-foreground/60 hover:text-accent"
          >
            <FileText size={20} />
          </motion.div>
        </Link>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="relative group flex items-center"
        >
          <div className="absolute right-full mr-4 hidden group-hover:flex items-center">
            <div className="bg-foreground text-background text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </div>
            <div className="border-l-foreground border-l-8 border-y-transparent border-y-[5px] border-r-0" />
          </div>
          <motion.div
            whileHover={{ scale: 1.2 }}
            className="text-xl transition-colors duration-300 text-foreground/60 hover:text-accent"
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </motion.div>
        </button>
      </div>
    </nav>
  );
};

export default Navigation;
