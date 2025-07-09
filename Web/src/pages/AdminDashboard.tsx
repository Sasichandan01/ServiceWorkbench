
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  Shield, 
  Database, 
  Cloud, 
  Activity,
  Settings,
  AlertTriangle,
  TrendingUp
} from "lucide-react";
import AdminUsersTable from "@/components/admin/AdminUsersTable";
import AdminRolesManager from "@/components/admin/AdminRolesManager";
import AdminWorkspacesTable from "@/components/admin/AdminWorkspacesTable";
import AdminSystemOverview from "@/components/admin/AdminSystemOverview";
import AdminAuditLogs from "@/components/admin/AdminAuditLogs";

const AdminDashboard = () => {
  const stats = [
    {
      title: "Total Users",
      value: "1,247",
      change: "+12% from last month",
      changeType: "positive",
      icon: Users
    },
    {
      title: "Active Workspaces",
      value: "89",
      change: "+8% from last month", 
      changeType: "positive",
      icon: Cloud
    },
    {
      title: "Custom Roles",
      value: "24",
      change: "+3 new roles",
      changeType: "positive",
      icon: Shield
    },
    {
      title: "System Alerts",
      value: "3",
      change: "2 critical",
      changeType: "negative",
      icon: AlertTriangle
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600">Manage users, roles, and system settings</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          <Settings className="w-4 h-4 mr-1" />
          Administrator
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${
                stat.changeType === 'negative' ? 'text-red-500' : 'text-gray-400'
              }`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className={`text-xs mt-1 ${
                stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
              }`}>
                {stat.change}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <AdminSystemOverview />
        </TabsContent>

        <TabsContent value="users">
          <AdminUsersTable />
        </TabsContent>

        <TabsContent value="roles">
          <AdminRolesManager />
        </TabsContent>

        <TabsContent value="workspaces">
          <AdminWorkspacesTable />
        </TabsContent>

        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
              <CardDescription>Configure global system settings and preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-500">
                System settings panel - Coming soon
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <AdminAuditLogs />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
