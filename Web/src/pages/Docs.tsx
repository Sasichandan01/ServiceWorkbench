import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Shield, Cloud, Database, BarChart3, Users, Cog, Brain, DollarSign, User, HelpCircle, BookOpen } from "lucide-react";

const sections = [
  { id: "introduction", label: "Introduction", icon: BookOpen },
  { id: "getting-started", label: "Getting Started", icon: Cloud },
  { id: "authentication", label: "Authentication & Roles", icon: Shield },
  { id: "workspaces", label: "Workspaces", icon: Cloud },
  { id: "solutions", label: "Solutions & AI Generation", icon: Brain },
  { id: "data-sources", label: "Data Sources", icon: Database },
  { id: "cost-analytics", label: "Cost Analytics", icon: DollarSign },
  { id: "admin", label: "Admin Features", icon: Users },
  { id: "profile", label: "Profile & Account", icon: User },
  { id: "faq", label: "FAQ", icon: HelpCircle },
  { id: "support", label: "Support", icon: HelpCircle },
];

const Docs = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex">
      {/* Sidebar Navigation */}
      <aside className="hidden md:block w-64 bg-white/80 border-r border-gray-200 p-6 sticky top-0 h-screen overflow-y-auto">
        <nav className="space-y-2">
          {sections.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} className="flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-blue-100 transition-colors font-medium">
              <Icon className="w-5 h-5 text-blue-600" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>
      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto p-6 space-y-10">
        {/* Introduction */}
        <section id="introduction">
          <Card>
            <CardHeader>
              <CardTitle>Service Workbench Documentation</CardTitle>
              <CardDescription>
                Welcome to the official documentation for Service Workbench. This guide covers all features, modules, and best practices for using the platform to build, manage, and optimize AWS-based solutions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-gray-700">
                Service Workbench is a modern cloud platform for designing, deploying, and managing AWS solutions with intelligent automation, AI-powered architecture generation, and enterprise-grade access control.
              </p>
              <p className="text-gray-700">
                Use the sidebar to navigate through the documentation. For quick access to the app, <Link to="/" className="text-blue-600 underline">return to the home page</Link>.
              </p>
            </CardContent>
          </Card>
        </section>
        {/* Getting Started */}
        <section id="getting-started">
          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>How to sign up, log in, and begin using Service Workbench.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal pl-6 space-y-2 text-gray-700">
                <li>Go to the <Link to="/signup" className="text-blue-600 underline">Sign Up</Link> page and create your account.</li>
                <li>Verify your email address if prompted.</li>
                <li>Sign in using your credentials on the <Link to="/login" className="text-blue-600 underline">Sign In</Link> page.</li>
                <li>Wait for an administrator to assign your role if required. Once assigned, you will have access to the platform's features based on your permissions.</li>
              </ol>
            </CardContent>
          </Card>
        </section>
        {/* Authentication & Roles */}
        <section id="authentication">
          <Card>
            <CardHeader>
              <CardTitle>Authentication & Role-Based Access Control</CardTitle>
              <CardDescription>Secure sign-in, role assignment, and permission management.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Authentication is handled via AWS Cognito with support for SSO and secure token management.</li>
                <li>Users are assigned roles (e.g., ITAdmin, Default, custom roles) that determine their permissions.</li>
                <li>Role-based access control (RBAC) ensures users only see and manage resources they are authorized for.</li>
                <li>Admins can create, edit, and assign roles with granular permissions for workspaces, solutions, data sources, and AWS services.</li>
                <li>Permissions are mapped to API endpoints and actions for fine-grained control.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        {/* Workspaces */}
        <section id="workspaces">
          <Card>
            <CardHeader>
              <CardTitle>Workspaces</CardTitle>
              <CardDescription>Collaborative, isolated environments for your team projects.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Create, view, and manage cloud-based workspaces for different teams or projects.</li>
                <li>Each workspace can have multiple members, solutions, and data sources.</li>
                <li>Admins and users with appropriate permissions can add or remove users, set workspace types (public/private), and manage tags.</li>
                <li>Workspace dashboards provide key stats: active users, solutions, monthly cost, and more.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        {/* Solutions & AI Generation */}
        <section id="solutions">
          <Card>
            <CardHeader>
              <CardTitle>Solutions & AI Generation</CardTitle>
              <CardDescription>Design, implement, and optimize solutions with AI assistance.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Create solutions within workspaces to solve business problems or implement workflows.</li>
                <li>Use the AI Solution Generator to get architecture diagrams, code snippets, and implementation guidance.</li>
                <li>Interact with the advanced AI chat to refine requirements, ask for code, or troubleshoot issues.</li>
                <li>Manage solution details, tags, datasources, and execution history from a unified interface.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        {/* Data Sources */}
        <section id="data-sources">
          <Card>
            <CardHeader>
              <CardTitle>Data Sources</CardTitle>
              <CardDescription>Connect, manage, and monitor data sources for your solutions.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Add and configure data sources (e.g., S3, databases) for use in workspaces and solutions.</li>
                <li>View data source details, tags, and last activity.</li>
                <li>Monitor connection status and resolve errors.</li>
                <li>Admins can manage all data sources; users can access those permitted by their role.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        {/* Cost Analytics */}
        <section id="cost-analytics">
          <Card>
            <CardHeader>
              <CardTitle>Cost Analytics</CardTitle>
              <CardDescription>Track and optimize cloud costs across workspaces and solutions.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>View cost trends, breakdowns by service, and real-time analytics.</li>
                <li>Get AI-powered recommendations for cost optimization (e.g., idle resources, reserved instances).</li>
                <li>Filter analytics by workspace, time range, and service.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        {/* Admin Features */}
        <section id="admin">
          <Card>
            <CardHeader>
              <CardTitle>Admin Features</CardTitle>
              <CardDescription>Manage users, roles, workspaces, and audit logs.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Access the Admin Dashboard to view system stats, manage users, roles, and workspaces.</li>
                <li>Create and assign custom roles with specific permissions for platform and AWS services.</li>
                <li>Review audit logs for security and compliance.</li>
                <li>Handle user status (active, inactive, suspended) and permissions.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        {/* Profile & Account */}
        <section id="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile & Account</CardTitle>
              <CardDescription>Manage your personal information, security, and notifications.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Update your profile details, password, and notification preferences.</li>
                <li>View account overview, recent activity, and assigned roles.</li>
                <li>Admins can view and edit user profiles and permissions.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        {/* FAQ */}
        <section id="faq">
          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
              <CardDescription>Common questions and troubleshooting tips.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>How do I get access to more features?</strong> Ask your admin to assign you a role with the required permissions.</li>
                <li><strong>How do I reset my password?</strong> Use the "Forgot Password" link on the sign-in page.</li>
                <li><strong>Why can't I see certain workspaces or solutions?</strong> Your role may not have the necessary permissions. Contact your admin.</li>
                <li><strong>How do I contact support?</strong> See the Support section below.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        {/* Support */}
        <section id="support">
          <Card>
            <CardHeader>
              <CardTitle>Support</CardTitle>
              <CardDescription>How to get help and report issues.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-gray-700">For help, feedback, or to report a bug, contact your administrator or email <a href="mailto:support@serviceworkbench.com" className="text-blue-600 underline">support@serviceworkbench.com</a>.</p>
              <p className="text-gray-700">For more resources, visit the <a href="https://docs.aws.amazon.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">AWS Documentation</a>.</p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default Docs; 