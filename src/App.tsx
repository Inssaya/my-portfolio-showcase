import { Suspense, lazy } from "react";
import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";

// The portfolio is the entry point and stays in the main bundle so the first
// paint isn't waiting on a chunk. Everything else is split: reading the
// portfolio should never download the admin panel, and the tour player should
// not weigh down that first paint either.
const Experience = lazy(() => import("./pages/Experience.tsx"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail.tsx"));
const Blog = lazy(() => import("./pages/Blog.tsx"));
const BlogPost = lazy(() => import("./pages/BlogPost.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const AdminLayout = lazy(() => import("./components/admin/AdminLayout.tsx"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminProjects = lazy(() => import("./pages/admin/AdminProjects.tsx"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages.tsx"));
const AdminHero = lazy(() => import("./pages/admin/AdminHero.tsx"));
const AdminAbout = lazy(() => import("./pages/admin/AdminAbout.tsx"));
const AdminSkills = lazy(() => import("./pages/admin/AdminSkills.tsx"));
const AdminEducation = lazy(() => import("./pages/admin/AdminEducation.tsx"));
const AdminCertificates = lazy(() => import("./pages/admin/AdminCertificates.tsx"));
const AdminLinks = lazy(() => import("./pages/admin/AdminLinks.tsx"));
const ProtectedRoute = lazy(() => import("./components/admin/ProtectedRoute.tsx"));

const queryClient = new QueryClient();

/** Deliberately blank: a spinner that flashes for 80ms is worse than nothing. */
const RouteFallback = () => <div className="min-h-[100svh] bg-background" />;

/**
 * `reducedMotion="user"` makes every framer-motion animation on the site obey
 * the visitor's OS "reduce motion" setting.
 *
 * The CSS block in index.css already neutralises CSS animations, but it cannot
 * touch framer-motion, which drives transforms from JavaScript — the portrait's
 * rotating ring, the orbiting dots and the marquee all kept spinning for
 * visitors who had explicitly asked the system for less movement. Perpetual
 * motion in the periphery is a common source of "this page is tiring to look
 * at", and it is exactly what that setting exists to switch off.
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <MotionConfig reducedMotion="user">
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* /classic was the old routing when a gate stood at /. Redirect
                any bookmarks to the portfolio, which is what it always meant. */}
            <Route path="/classic" element={<Navigate to="/" replace />} />
            <Route path="/experience" element={<Experience />} />
            <Route path="/projects/:slug" element={<ProjectDetail />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />

            {/* Login sits outside the guard — otherwise a bounced visitor
                would ping-pong between /admin and /admin/login forever. */}
            <Route path="/admin/login" element={<AdminLogin />} />

            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="projects" element={<AdminProjects />} />
              <Route path="messages" element={<AdminMessages />} />
              <Route path="hero" element={<AdminHero />} />
              <Route path="about" element={<AdminAbout />} />
              <Route path="skills" element={<AdminSkills />} />
              <Route path="education" element={<AdminEducation />} />
              <Route path="certificates" element={<AdminCertificates />} />
              <Route path="links" element={<AdminLinks />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </MotionConfig>
  </QueryClientProvider>
);

export default App;
