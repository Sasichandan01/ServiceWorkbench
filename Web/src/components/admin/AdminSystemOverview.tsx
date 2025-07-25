
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Server, 
  Database, 
  Cpu,
  HardDrive,
  Wifi,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Cloud,
  Settings
} from "lucide-react";

const AdminSystemOverview = () => {
  const systemHealth = [
    { name: "API Services", status: "healthy", uptime: "99.9%", icon: Server },
    { name: "Database", status: "healthy", uptime: "99.8%", icon: Database },
    { name: "Authentication", status: "warning", uptime: "98.5%", icon: Shield },
    { name: "File Storage", status: "healthy", uptime: "99.9%", icon: HardDrive },
  ];

  const resourceUsage = [
    { name: "CPU Usage", value: 65, color: "bg-blue-500" },
    { name: "Memory Usage", value: 78, color: "bg-green-500" },
    { name: "Storage Usage", value: 45, color: "bg-purple-500" },
    { name: "Network I/O", value: 32, color: "bg-orange-500" },
  ];

  const recentAlerts = [
    { 
      id: "1", 
      type: "warning", 
      message: "High memory usage detected on server-02", 
      time: "5 minutes ago" 
    },
    { 
      id: "2", 
      type: "info", 
      message: "Scheduled maintenance completed successfully", 
      time: "2 hours ago" 
    },
    { 
      id: "3", 
      type: "error", 
      message: "Authentication service experienced brief downtime", 
      time: "6 hours ago" 
    }
  ];

  const stats = [
    {
      title: "Total Users",
      value: "12",
      changeType: "positive",
      icon: Users
    },
    {
      title: "Active Workspaces",
      value: "10",
      changeType: "positive",
      icon: Cloud
    },
    {
      title: "Roles",
      value: "5",
      changeType: "positive",
      icon: Shield
    }
  ];

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'info':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600">Manage users, roles, and system settings</p>
        </div>
      </div>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.changeType === 'negative' ? 'text-red-500' : 'text-gray-400'}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resource Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Cpu className="w-5 h-5" />
              <span>Resource Usage</span>
            </CardTitle>
            <CardDescription>Current system resource utilization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {resourceUsage.map((resource, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{resource.name}</span>
                  <span className="font-medium">{resource.value}%</span>
                </div>
                <Progress value={resource.value} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="w-5 h-5" />
              <span>Recent Alerts</span>
            </CardTitle>
            <CardDescription>Latest system notifications and alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Metrics Grid */}
    </div>
  );
};

export default AdminSystemOverview;
