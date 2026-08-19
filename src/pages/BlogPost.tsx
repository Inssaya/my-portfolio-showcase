import { useParams, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { getPostBySlug } from "@/lib/blog-data";
import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = getPostBySlug(slug ?? "");

  if (!post) return <Navigate to="/blog" replace />;

  const formattedDate = new Date(post.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="grid-overlay" />
      <Navigation />
      <MobileNav />

      <main className="mx-auto max-w-2xl px-6 py-20 md:py-28">
        {/* Back */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-10"
        >
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors"
          >
            <ArrowLeft size={14} /> Blog
          </Link>
        </motion.div>

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <p className="font-sora text-xs font-semibold uppercase tracking-widest text-accent mb-4">
            {post.tags[0]}
          </p>
          <h1 className="font-playfair text-3xl md:text-4xl font-bold leading-snug mb-4">
            {post.title}
          </h1>
          <p className="text-muted-foreground text-base mb-6">{post.subtitle}</p>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-y border-border/40 py-4">
            <span className="font-semibold text-foreground">{post.author}</span>
            <span className="hidden sm:block text-border">·</span>
            <span>{post.authorRole}</span>
            <span className="hidden sm:block text-border">·</span>
            <span>{formattedDate}</span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {post.readingTime} min read
            </span>
          </div>
        </motion.header>

        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-10 rounded-xl border border-border/50 bg-secondary/30 px-5 py-4 text-sm text-muted-foreground italic"
        >
          This article reflects my personal experience and perspective as someone
          currently learning and working in software engineering. My views will
          continue to evolve as I gain experience. Take what is useful, question
          what you disagree with.
        </motion.div>

        {/* TL;DR */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mb-12 rounded-xl border border-accent/25 bg-accent/5 px-5 py-5"
        >
          <p className="font-sora text-xs font-bold uppercase tracking-widest text-accent mb-3">
            TL;DR
          </p>
          <ul className="space-y-2">
            {post.tldr.map((point, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="text-accent font-bold shrink-0">→</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Article sections */}
        <article className="space-y-10">
          {post.sections.map((section, i) => (
            <motion.section
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }}
            >
              {section.heading && (
                <h2 className="font-sora text-lg font-bold mb-4">
                  {section.heading}
                </h2>
              )}
              <div className="space-y-4 text-[15px] leading-relaxed text-foreground/85">
                {section.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
              {section.pullQuote && (
                <blockquote className="my-6 border-l-2 border-accent pl-5 py-1">
                  <p className="font-playfair text-lg italic text-foreground/90 leading-relaxed">
                    &ldquo;{section.pullQuote}&rdquo;
                  </p>
                </blockquote>
              )}
            </motion.section>
          ))}
        </article>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-16"
        >
          <h2 className="font-sora text-lg font-bold mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {post.faq.map((item, i) => (
              <FAQItem key={i} question={item.question} answer={item.answer} />
            ))}
          </div>
        </motion.div>

        {/* Author card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mt-16 glass-card p-6 flex flex-col sm:flex-row gap-4"
        >
          <div className="h-12 w-12 shrink-0 rounded-full bg-accent/15 flex items-center justify-center font-sora font-bold text-accent text-lg">
            Y
          </div>
          <div>
            <p className="font-sora font-semibold text-sm">{post.author}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{post.authorRole}</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Building AI-powered and full-stack systems, from RAG pipelines to
              production web apps. Writing about what I learn along the way.
            </p>
          </div>
        </motion.div>

        {/* Tags */}
        <div className="mt-10 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-medium px-3 py-1 rounded-full bg-secondary/60 text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-12">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors"
          >
            <ArrowLeft size={14} /> Back to Blog
          </Link>
        </div>
      </main>
    </div>
  );
};

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold hover:bg-secondary/30 transition-colors"
        aria-expanded={open}
      >
        <span>{question}</span>
        {open ? (
          <ChevronUp size={15} className="text-muted-foreground shrink-0 ml-3" />
        ) : (
          <ChevronDown size={15} className="text-muted-foreground shrink-0 ml-3" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/30 pt-4">
          {answer}
        </div>
      )}
    </div>
  );
}

export default BlogPost;
