import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Cloud, 
  Database, 
  DollarSign, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight,
  Plus,
  AlertTriangle,
  BarChart3
} from "lucide-react";
import CostDashboard from "@/components/CostDashboard";

const Dashboard = () => {
  const stats = [
    {
      title: "Active Workspaces",
      value: "12",
      change: "+2 from last week",
      changeType: "positive",
      icon: Cloud
    },
    {
      title: "Data Sources",
      value: "28",
      change: "+4 from last week",
      changeType: "positive",
      icon: Database
    },
    {
      title: "Monthly Cost",
      value: "$2,847",
      change: "-12% from last month",
      changeType: "positive",
      icon: DollarSign
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Monitor your workspaces, data sources, and costs</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="flex items-center text-xs text-gray-600 mt-1">
                {stat.changeType === 'positive' ? (
                  <ArrowUpRight className="w-3 h-3 text-green-500 mr-1" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-red-500 mr-1" />
                )}
                {stat.change}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cost Dashboard */}
      <CostDashboard />

      {/* Cost Optimization */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Optimization Insights</CardTitle>
          <CardDescription>AI-powered recommendations to reduce costs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <span className="font-medium text-yellow-800">Idle Resources</span>
              </div>
              <p className="text-sm text-yellow-700">
                3 workspaces have been idle for over 48 hours. Consider stopping them to save $45/day.
              </p>
            </div>
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-800">Usage Patterns</span>
              </div>
              <p className="text-sm text-blue-700">
                Peak usage is 2-6 PM. Schedule jobs during off-peak hours for 30% cost savings.
              </p>
            </div>
            
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800">Reserved Instances</span>
              </div>
              <p className="text-sm text-green-700">
                Switch to reserved instances for 40% savings on long-running workspaces.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
