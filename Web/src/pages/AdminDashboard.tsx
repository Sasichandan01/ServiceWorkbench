import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Shield, Database, Cloud, Activity, Settings, AlertTriangle, TrendingUp } from "lucide-react";
import AdminUsersTable from "@/components/admin/AdminUsersTable";
import AdminRolesManager from "@/components/admin/AdminRolesManager";
import AdminWorkspacesTable from "@/components/admin/AdminWorkspacesTable";
import { ProtectedContent } from "@/components/ui/protected-content";
import { usePermissions } from "@/hooks/usePermissions";
import AdminSystemOverview from "@/components/admin/AdminSystemOverview";
const AdminDashboard = () => {
  const {
    canView
  } = usePermissions();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tab = urlParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    } else {
      setActiveTab("overview");
    }
  }, [location.search]);
  const stats = [{
    title: "Total Users",
    value: "1,247",
    change: "+12% from last month",
    changeType: "positive",
    icon: Users
  }, {
    title: "Active Workspaces",
    value: "89",
    change: "+8% from last month",
    changeType: "positive",
    icon: Cloud
  }, {
    title: "Roles",
    value: "24",
    change: "+3 new roles",
    changeType: "positive",
    icon: Shield
  }, {
    title: "System Alerts",
    value: "3",
    change: "2 critical",
    changeType: "negative",
    icon: AlertTriangle
  }];
  return <div className="space-y-6">
      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsContent value="overview">
          <AdminSystemOverview />
        </TabsContent>
        <ProtectedContent resource="users" action="view">
          <TabsContent value="users">
            <AdminUsersTable />
          </TabsContent>
        </ProtectedContent>
        <ProtectedContent resource="roles" action="view">
          <TabsContent value="roles">
            <AdminRolesManager />
          </TabsContent>
        </ProtectedContent>
        <ProtectedContent resource="workspaces" action="view">
          <TabsContent value="workspaces">
            <AdminWorkspacesTable />
          </TabsContent>
        </ProtectedContent>
        {/* Audit logs tab removed as per request */}
      </Tabs>
    </div>;
};
export default AdminDashboard;