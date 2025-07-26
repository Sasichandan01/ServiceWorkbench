
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  Settings,
  DollarSign
} from "lucide-react";
import { CostService } from "@/services/costService";
import { WorkspaceService } from "@/services/workspaceService";
import { SolutionService } from "@/services/solutionService";
import { getUserInfo } from "@/lib/tokenUtils";

const AdminSystemOverview = () => {
  const systemHealth = [
    { name: "API Services", status: "healthy", uptime: "99.9%", icon: Server },
    { name: "Database", status: "healthy", uptime: "99.8%", icon: Database },
    { name: "Authentication", status: "warning", uptime: "98.5%", icon: Shield },
    { name: "File Storage", status: "healthy", uptime: "99.9%", icon: HardDrive },
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

  // New state for cost listing table
  const [groupBy, setGroupBy] = useState("workspaces");
  const [selectedItem, setSelectedItem] = useState("all");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [solutions, setSolutions] = useState<any[]>([]);
  const [costData, setCostData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkspaceForSolutions, setSelectedWorkspaceForSolutions] = useState<string>("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [solutionSearch, setSolutionSearch] = useState("");

  // Fetch workspaces
  const fetchWorkspaces = async () => {
    try {
      const response = await WorkspaceService.getWorkspaces({ 
        limit: 10,
        filterBy: workspaceSearch.trim() || undefined
      });
      setWorkspaces(response.Workspaces || []);
    } catch (err) {
      console.error('Error fetching workspaces:', err);
    }
  };

  // Fetch solutions for a specific workspace
  const fetchSolutions = async (workspaceId: string) => {
    try {
      const response = await SolutionService.getSolutions(workspaceId, { 
        limit: 10,
        filterBy: solutionSearch.trim() || undefined
      });
      setSolutions(response.Solutions || []);
    } catch (err) {
      console.error('Error fetching solutions:', err);
    }
  };

  // Fetch cost data
  const fetchCostData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const userInfo = getUserInfo();
      if (!userInfo?.sub) {
        throw new Error('User ID not found');
      }

      const response = await CostService.getCosts(groupBy, userInfo.sub);
      setCostData(response.costs || []);
    } catch (err: any) {
      console.error('Error fetching cost data:', err);
      setError(err.message || 'Failed to fetch cost data');
      setCostData([]);
    } finally {
      setLoading(false);
    }
  };

  // Load initial data
  useEffect(() => {
    fetchWorkspaces();
  }, [workspaceSearch]);

  // Fetch cost data when groupBy or selectedItem changes
  useEffect(() => {
    fetchCostData();
  }, [groupBy, selectedItem]);

  // Fetch solutions when workspace or search changes
  useEffect(() => {
    if (selectedWorkspaceForSolutions && selectedWorkspaceForSolutions !== "all") {
      fetchSolutions(selectedWorkspaceForSolutions);
    }
  }, [selectedWorkspaceForSolutions, solutionSearch]);

  // Handle groupBy change
  const handleGroupByChange = (value: string) => {
    setGroupBy(value);
    setSelectedItem("all");
    setSolutions([]);
    setSelectedWorkspaceForSolutions("");
  };

  // Handle selected item change
  const handleSelectedItemChange = (value: string) => {
    setSelectedItem(value);
    if (groupBy === "solutions" && value !== "all") {
      fetchSolutions(value);
    }
  };

  // Handle workspace selection for solutions
  const handleWorkspaceForSolutionsChange = (value: string) => {
    setSelectedWorkspaceForSolutions(value);
    setSelectedItem("all");
    if (value !== "all") {
      fetchSolutions(value);
    } else {
      setSolutions([]);
    }
  };

  const totalCost = costData.reduce((sum, item) => sum + item.value, 0);

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

      {/* Cost Listing Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            <span>Cost Analysis</span>
          </CardTitle>
          <CardDescription>Detailed cost breakdown by {groupBy}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <Select value={groupBy} onValueChange={handleGroupByChange}>
                <SelectTrigger className="border-2 hover:border-blue-300 transition-colors">
                  <SelectValue placeholder="Group by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspaces">Workspaces</SelectItem>
                  <SelectItem value="solutions">Solutions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Second dropdown logic */}
            {groupBy === "workspaces" ? (
              <div>
                <Select value={selectedItem} onValueChange={handleSelectedItemChange}>
                  <SelectTrigger className="border-2 hover:border-blue-300 transition-colors">
                    <SelectValue placeholder="Select workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <input
                        placeholder="Search workspaces..."
                        value={workspaceSearch}
                        onChange={(e) => setWorkspaceSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <SelectItem value="all">All Workspaces</SelectItem>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.WorkspaceId} value={workspace.WorkspaceId}>
                        {workspace.WorkspaceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex gap-2">
                {/* First: select workspace for solutions */}
                <Select value={selectedWorkspaceForSolutions} onValueChange={handleWorkspaceForSolutionsChange}>
                  <SelectTrigger className="border-2 hover:border-blue-300 transition-colors">
                    <SelectValue placeholder="Select workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <input
                        placeholder="Search workspaces..."
                        value={workspaceSearch}
                        onChange={(e) => setWorkspaceSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <SelectItem value="all">All Workspaces</SelectItem>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.WorkspaceId} value={workspace.WorkspaceId}>
                        {workspace.WorkspaceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Then: select solution for that workspace */}
                <Select value={selectedItem} onValueChange={handleSelectedItemChange} disabled={!selectedWorkspaceForSolutions || selectedWorkspaceForSolutions === "all"}>
                  <SelectTrigger className="border-2 hover:border-blue-300 transition-colors">
                    <SelectValue placeholder="Select solution" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <input
                        placeholder="Search solutions..."
                        value={solutionSearch}
                        onChange={(e) => setSolutionSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <SelectItem value="all">All Solutions</SelectItem>
                    {solutions.map((solution) => (
                      <SelectItem key={solution.SolutionId} value={solution.SolutionId}>
                        {solution.SolutionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Cost Table */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-gray-600">Loading cost data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <p className="text-red-600 mb-2">Error loading cost data</p>
                <p className="text-gray-600 text-sm">{error}</p>
              </div>
            </div>
          ) : costData.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <p className="text-gray-600">No cost data available</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Total Cost Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-800">Total Cost</p>
                    <p className="text-2xl font-bold text-blue-900">${totalCost.toLocaleString()}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              {/* Cost Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold text-right">Cost</TableHead>
                    <TableHead className="font-semibold text-right">Percentage</TableHead>
                    <TableHead className="font-semibold">Distribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costData.map((item, index) => {
                    const percentage = totalCost > 0 ? (item.value / totalCost) * 100 : 0;
                    return (
                      <TableRow key={index} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          <div>
                            <p className="font-semibold">{item.name}</p>
                            <p className="text-sm text-gray-500">{item.description || 'No description'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${item.value.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-gray-600">
                          {percentage.toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Metrics Grid */}
    </div>
  );
};

export default AdminSystemOverview;
