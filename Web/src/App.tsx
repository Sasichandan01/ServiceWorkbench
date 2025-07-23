
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./components/auth/AuthProvider";
import { ProtectedContent } from "./components/ui/protected-content";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Verification from "./pages/Verification";
import Dashboard from "./pages/Dashboard";
import Welcome from "./pages/Welcome";
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
import Docs from "./pages/Docs";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Login isSignupDefault={true} />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/docs" element={<Docs />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/workspaces" element={
              <ProtectedContent resource="workspaces" action="view">
                <Workspaces />
              </ProtectedContent>
            } />
            <Route path="/workspaces/:id" element={
              <ProtectedContent resource="workspaces" action="view">
                <WorkspaceDetails />
              </ProtectedContent>
            } />
            <Route path="/workspaces/:workspaceId/solutions/:solutionId" element={
              <ProtectedContent resource="solutions" action="view">
                <SolutionDetails />
              </ProtectedContent>
            } />
            <Route path="/workspaces/:workspaceId/solutions/:solutionId/ai-generator" element={
              <ProtectedContent resource="solutions" action="view">
                <AIGenerator />
              </ProtectedContent>
            } />
            <Route path="/data-sources" element={
              <ProtectedContent resource="datasources" action="view">
                <DataSources />
              </ProtectedContent>
            } />
            <Route path="/data-sources/:id" element={
              <ProtectedContent resource="datasources" action="view">
                <DataSourceDetails />
              </ProtectedContent>
            } />
            <Route path="/cost-analytics" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={
              <ProtectedContent resource="users" action="manage">
                <AdminDashboard />
              </ProtectedContent>
            } />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
