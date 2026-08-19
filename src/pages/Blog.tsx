import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowLeft, Clock, Tag } from "lucide-react";
import { getAllPosts } from "@/lib/blog-data";
import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";

const Blog = () => {
  const posts = getAllPosts();

  useEffect(() => {
    document.title = "Blog — Yassine Sinif";
    return () => {
      document.title = "Yassine Sinif — AI & Data Engineer | Portfolio";
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="grid-overlay" />
      <Navigation />
      <MobileNav />

      <main className="mx-auto max-w-3xl px-6 py-24 md:py-32">
        {/* Back to portfolio */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-10"
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors"
          >
            <ArrowLeft size={14} /> Back to Portfolio
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="font-sora text-xs font-semibold uppercase tracking-widest text-accent mb-3">
            Writing
          </p>
          <h1 className="font-playfair text-4xl md:text-5xl font-bold mb-4">
            Blog
          </h1>
          <p className="text-muted-foreground text-base mb-14 max-w-xl">
            Reflections on AI engineering, data systems, and building real products —
            written from engineering studies at EMSI Casablanca and a live internship at Aptiv.
          </p>
        </motion.div>

        <div className="space-y-5">
          {posts.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
            >
              <Link
                to={`/blog/${post.slug}`}
                className="group block glass-card p-6 hover:border-accent/50 transition-all duration-200"
              >
                {/* Top row: date + read time */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-medium uppercase tracking-widest text-accent/70">
                    {new Date(post.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock size={10} />
                    {post.readingTime} min read
                  </span>
                </div>

                {/* Title */}
                <h2 className="font-sora text-[17px] font-bold mb-2 leading-snug group-hover:text-accent transition-colors">
                  {post.title}
                </h2>

                {/* Summary */}
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2">
                  {post.summary}
                </p>

                {/* Tags + arrow */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent/80"
                      >
                        <Tag size={8} />
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Read <ArrowRight size={12} />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-20 text-center text-xs text-muted-foreground">
          More articles coming soon.
        </div>
      </main>
    </div>
  );
};

export default Blog;
