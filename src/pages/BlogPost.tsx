import { useParams, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, ChevronDown, ChevronUp, Home } from "lucide-react";
import { useState, useEffect } from "react";
import { getPostBySlug } from "@/lib/blog-data";
import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = getPostBySlug(slug ?? "");

  useEffect(() => {
    if (!post) return;
    const base = "https://yassine-sinif.vercel.app";
    const url = `${base}/blog/${post.slug}`;

    document.title = `${post.title} — Yassine Sinif`;

    const schema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": url,
      "headline": post.title,
      "description": post.summary,
      "datePublished": post.date,
      "dateModified": post.date,
      "url": url,
      "mainEntityOfPage": url,
      "image": `${base}/og.jpg`,
      "inLanguage": "en",
      "keywords": post.tags.join(", "),
      "author": {
        "@type": "Person",
        "@id": `${base}/#person`,
        "name": post.author,
        "url": base,
        "jobTitle": post.authorRole,
      },
      "publisher": {
        "@type": "Person",
        "@id": `${base}/#person`,
        "name": post.author,
        "url": base,
      },
      "isPartOf": {
        "@type": "Blog",
        "@id": `${base}/blog`,
        "name": "Yassine Sinif — Writing",
        "url": `${base}/blog`,
      },
    };

    const existing = document.getElementById("__blog-post-schema");
    if (existing) existing.remove();
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = "__blog-post-schema";
    el.text = JSON.stringify(schema);
    document.head.appendChild(el);

    return () => {
      document.getElementById("__blog-post-schema")?.remove();
      document.title = "Yassine Sinif — AI & Data Engineer | Portfolio";
    };
  }, [post]);

  if (!post) return <Navigate to="/blog" replace />;

  const formattedDate = new Date(post.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <Navigation />
      <MobileNav />

      <main className="mx-auto max-w-2xl px-6 py-20 md:py-28">
        {/* Navigation breadcrumb */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-10 flex items-center gap-4"
        >
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors"
          >
            <Home size={13} /> Portfolio
          </Link>
          <span className="text-border/60 text-xs">/</span>
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors"
          >
            <ArrowLeft size={13} /> Blog
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

        {/* TL;DR — collapsible. Content stays in the DOM for AI crawlers (AEO). */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mb-12"
        >
          <details className="group rounded-xl border border-accent/25 bg-accent/5 overflow-hidden [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 select-none hover:bg-accent/10 transition-colors">
              <div className="flex items-center gap-3">
                <span className="font-sora text-xs font-bold uppercase tracking-widest text-accent">
                  TL;DR
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {post.tldr.length} key takeaways
                </span>
              </div>
              <ChevronDown
                size={15}
                className="text-accent shrink-0 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <ul className="space-y-2 px-5 pb-5 pt-2 border-t border-accent/15">
              {post.tldr.map((point, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="text-accent font-bold shrink-0">→</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </details>
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
          className="mt-16 rounded-xl border border-border/50 bg-secondary/20 p-6 flex flex-col sm:flex-row gap-4"
        >
          <div className="h-12 w-12 shrink-0 rounded-full bg-accent/15 flex items-center justify-center font-sora font-bold text-accent text-lg">
            Y
          </div>
          <div>
            <p className="font-sora font-semibold text-sm">{post.author}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{post.authorRole}</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Building AI-powered and full-stack systems — from RAG pipelines and maintenance platforms
              to production web apps. Writing about what I learn along the way.
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

        {/* Optional author's note (only for personal reflections) */}
        {post.authorNote && (
          <p className="mt-10 text-xs text-muted-foreground/70 italic leading-relaxed border-t border-border/30 pt-6">
            <span className="font-semibold text-muted-foreground not-italic">Author&rsquo;s note — </span>
            {post.authorNote}
          </p>
        )}

        {/* Bottom nav */}
        <div className="mt-12 flex items-center gap-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors"
          >
            <Home size={14} /> Back to Portfolio
          </Link>
          <span className="text-border/40">·</span>
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors"
          >
            <ArrowLeft size={14} /> All Articles
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
