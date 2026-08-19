import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowLeft, Clock, Search, SlidersHorizontal, X } from "lucide-react";
import { getAllPosts } from "@/lib/blog-data";
import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";

const Blog = () => {
  const posts = getAllPosts();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Blog — Yassine Sinif";
    return () => {
      document.title = "Yassine Sinif — AI & Data Engineer | Portfolio";
    };
  }, []);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const topics = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of posts) {
      const t = p.tags[0];
      if (t && !seen.has(t)) {
        seen.add(t);
        result.push(t);
      }
    }
    return result;
  }, [posts]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((p) => {
      const matchesTopic = !selectedTopic || p.tags[0] === selectedTopic;
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q);
      return matchesTopic && matchesSearch;
    });
  }, [posts, searchQuery, selectedTopic]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="grid-overlay" />
      <Navigation />
      <MobileNav />

      {/* Sticky topbar */}
      <div className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
          {/* Back link */}
          <Link
            to="/"
            className="shrink-0 text-muted-foreground hover:text-accent transition-colors"
            aria-label="Back to Portfolio"
          >
            <ArrowLeft size={16} />
          </Link>

          {/* Blog title */}
          <span className="font-sora font-bold text-sm tracking-wide shrink-0">
            Blog
          </span>

          <span className="text-border/40 text-xs shrink-0">·</span>

          {/* Search */}
          <div className="flex-1 relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search articles…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary/40 border border-border/40 rounded-lg outline-none focus:border-accent/50 focus:bg-secondary/60 transition-colors placeholder:text-muted-foreground/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Topic filter button */}
          <div className="relative shrink-0" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              aria-label="Filter by topic"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                selectedTopic
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-border/40 bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-border/70"
              }`}
            >
              <SlidersHorizontal size={12} />
              <span className="hidden sm:inline">
                {selectedTopic ?? "Topic"}
              </span>
            </button>

            <AnimatePresence>
              {filterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border/50 bg-background/95 backdrop-blur-md shadow-xl p-2 z-50"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 pb-1.5">
                    Filter by topic
                  </p>
                  <button
                    onClick={() => { setSelectedTopic(null); setFilterOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                      !selectedTopic
                        ? "bg-accent/15 text-accent font-semibold"
                        : "hover:bg-secondary/50 text-muted-foreground"
                    }`}
                  >
                    All topics
                  </button>
                  {topics.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => { setSelectedTopic(topic); setFilterOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                        selectedTopic === topic
                          ? "bg-accent/15 text-accent font-semibold"
                          : "hover:bg-secondary/50 text-muted-foreground"
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Active filter pill */}
        {selectedTopic && (
          <div className="mx-auto max-w-3xl px-4 pb-2 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Showing:</span>
            <button
              onClick={() => setSelectedTopic(null)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
            >
              {selectedTopic} <X size={9} />
            </button>
          </div>
        )}
      </div>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Result count */}
        <p className="text-[11px] text-muted-foreground mb-5">
          {filtered.length === posts.length
            ? `${posts.length} articles`
            : `${filtered.length} of ${posts.length} articles`}
        </p>

        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              No articles match your search.
            </div>
          ) : (
            filtered.map((post, i) => (
              <motion.div
                key={post.slug}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
              >
                <Link
                  to={`/blog/${post.slug}`}
                  className="group block glass-card p-5 hover:border-accent/50 transition-all duration-200"
                >
                  {/* Top row: topic + date + read time */}
                  <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80 bg-accent/10 px-2 py-0.5 rounded-full">
                      {post.tags[0]}
                    </span>
                    <span className="text-border/40 text-[10px]">·</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(post.date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-border/40 text-[10px]">·</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock size={9} />
                      {post.readingTime} min
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="font-sora text-[15px] font-bold mb-1.5 leading-snug group-hover:text-accent transition-colors">
                    {post.title}
                  </h2>

                  {/* Summary */}
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">
                    {post.summary}
                  </p>

                  {/* Arrow */}
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                    Read <ArrowRight size={11} />
                  </span>
                </Link>
              </motion.div>
            ))
          )}
        </div>

        <div className="mt-16 text-center text-xs text-muted-foreground">
          More articles coming soon.
        </div>
      </main>
    </div>
  );
};

export default Blog;
