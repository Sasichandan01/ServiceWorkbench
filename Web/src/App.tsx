
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Verification from "./pages/Verification";
import Dashboard from "./pages/Dashboard";
import Workspaces from "./pages/Workspaces";
import WorkspaceDetails from "./pages/WorkspaceDetails";
import CreateSolution from "./pages/CreateSolution";
import SolutionDetails from "./pages/SolutionDetails";
import AIGenerator from "./pages/AIGenerator";
import DataSources from "./pages/DataSources";
import DataSourceDetails from "./pages/DataSourceDetails";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import Layout from "./components/Layout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verification" element={<Verification />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/workspaces/:id" element={<WorkspaceDetails />} />
            <Route path="/workspaces/:workspaceId/solutions/:solutionId" element={<SolutionDetails />} />
            <Route path="/workspaces/:workspaceId/solutions/:solutionId/ai-generator" element={<AIGenerator />} />
            <Route path="/data-sources" element={<DataSources />} />
            <Route path="/data-sources/:id" element={<DataSourceDetails />} />
            <Route path="/cost-analytics" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
