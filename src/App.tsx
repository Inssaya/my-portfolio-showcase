import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import ProjectDetail from "./pages/ProjectDetail.tsx";
import NotFound from "./pages/NotFound.tsx";
import AdminLayout from "./components/admin/AdminLayout.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminProjects from "./pages/admin/AdminProjects.tsx";
import AdminMessages from "./pages/admin/AdminMessages.tsx";
import AdminHero from "./pages/admin/AdminHero.tsx";
import AdminAbout from "./pages/admin/AdminAbout.tsx";
import AdminSkills from "./pages/admin/AdminSkills.tsx";
import AdminEducation from "./pages/admin/AdminEducation.tsx";
import AdminCertificates from "./pages/admin/AdminCertificates.tsx";
import AdminLinks from "./pages/admin/AdminLinks.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/projects/:slug" element={<ProjectDetail />} />
          <Route path="/admin" element={<AdminLayout />}>
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
