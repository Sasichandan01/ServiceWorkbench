import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, Cloud, Database, DollarSign, AlertTriangle, BarChart3 } from "lucide-react";
import CostDashboard from "@/components/CostDashboard";
import { CostService } from "@/services/costService";
import { getUserInfo } from "@/lib/tokenUtils";

const Dashboard = () => {
  const [monthlyCost, setMonthlyCost] = useState<number>(0);
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState<string | null>(null);

  // Fetch monthly cost data
  const fetchMonthlyCost = async () => {
    setCostLoading(true);
    setCostError(null);
    
    try {
      const userInfo = getUserInfo();
      if (!userInfo?.sub) {
        throw new Error('User information not available');
      }

      // For now, use a default workspace ID
      // In a real implementation, you would get this from the current workspace context
      // or from URL parameters, or from user preferences
      const workspaceId = 'default'; // This should be replaced with actual workspace ID
      const response = await CostService.getCostByWorkspaceId(workspaceId);
      setMonthlyCost(response.cost);
    } catch (err: any) {
      console.error('Error fetching monthly cost:', err);
      setCostError(err.message || 'Failed to fetch cost data');
      setMonthlyCost(0);
    } finally {
      setCostLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyCost();
  }, []);

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
      value: costLoading ? "Loading..." : costError ? "Error" : `$${monthlyCost.toLocaleString()}`,
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
          <h1 className="text-3xl font-bold text-gray-900">Cost Dashboard</h1>
          <p className="text-gray-600">Monitor your costs and get optimization insights</p>
        </div>
      </div>

      {/* Monthly Cost Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Monthly Cost
            </CardTitle>
            <DollarSign className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {costLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span>Loading...</span>
                </div>
              ) : costError ? (
                <span className="text-red-600">Error</span>
              ) : (
                `$${monthlyCost.toLocaleString()}`
              )}
            </div>
          </CardContent>
        </Card>
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
