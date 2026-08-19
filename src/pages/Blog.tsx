import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Tag } from "lucide-react";
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="font-sora text-xs font-semibold uppercase tracking-widest text-accent mb-3">
            Blog
          </p>
          <h1 className="font-playfair text-4xl md:text-5xl font-bold mb-4">
            Writing
          </h1>
          <p className="text-muted-foreground text-base mb-14 max-w-xl">
            Thoughts on software engineering, AI, and building real systems —
            written for engineers and optimized for machines.
          </p>
        </motion.div>

        <div className="space-y-6">
          {posts.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
            >
              <Link
                to={`/blog/${post.slug}`}
                className="group block glass-card p-6 hover:border-accent/40 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock size={11} />
                    {post.readingTime} min read
                  </span>
                </div>

                <h2 className="font-sora text-xl font-bold mb-2 group-hover:text-accent transition-colors">
                  {post.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {post.summary}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    {post.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground"
                      >
                        <Tag size={9} />
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                    Read <ArrowRight size={13} />
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
