import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, Cloud, Database, AlertTriangle, BarChart3 } from "lucide-react";
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

  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cost Dashboard</h1>
          <p className="text-gray-600">Monitor your costs and get optimization insights</p>
        </div>
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
                <BarChart3 className="w-5 h-5 text-green-600" />
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
