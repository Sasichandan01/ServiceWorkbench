
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [groupBy, setGroupBy] = useState("all-workspaces");
  const [selectedWorkspace, setSelectedWorkspace] = useState("all");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [solutions, setSolutions] = useState<any[]>([]);
  const [costData, setCostData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [solutionSearch, setSolutionSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
      let response;
      let groupByParam: 'workspace' | 'solution' | 'user' = 'workspace';
      let identifier: string | undefined;
      
      if (groupBy === 'all-workspaces') {
        groupByParam = 'workspace';
        // If a specific workspace is selected, pass the workspace ID
        if (selectedWorkspace !== 'all') {
          identifier = selectedWorkspace;
        }
      } else if (groupBy === 'users') {
        groupByParam = 'user';
      }
      
      response = await CostService.getCosts(groupByParam, identifier);
      
      // Transform the response to match the expected format
      if (Array.isArray(response)) {
        const transformedData = response.map((item: any, index: number) => {
          if (groupByParam === 'workspace') {
            return {
              name: item.WorkspaceName || `Workspace ${index + 1}`,
              value: item.Cost || 0,
              description: `Workspace: ${item.WorkspaceName}`,
              gradient: `url(#gradient${index})`,
              id: item.WorkspaceId,
            };
          } else {
            return {
              name: item.UserName || `User ${index + 1}`,
              value: item.Cost || 0,
              description: `User: ${item.UserName}`,
              gradient: `url(#gradient${index})`,
              id: item.UserId,
            };
          }
        });
        setCostData(transformedData);
      } else {
        setCostData([]);
      }
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

  // Initialize workspace from URL query parameter
  useEffect(() => {
    const workspaceIdFromUrl = searchParams.get('workspaceid');
    if (workspaceIdFromUrl && workspaceIdFromUrl !== selectedWorkspace) {
      setSelectedWorkspace(workspaceIdFromUrl);
      fetchSolutions(workspaceIdFromUrl);
    }
  }, []);

  // Fetch cost data when groupBy or selectedWorkspace changes
  useEffect(() => {
    fetchCostData();
  }, [groupBy, selectedWorkspace]);

  // Fetch solutions when workspace or search changes
  useEffect(() => {
    if (selectedWorkspace && selectedWorkspace !== "all") {
      fetchSolutions(selectedWorkspace);
    }
  }, [selectedWorkspace, solutionSearch]);

  // Handle groupBy change
  const handleGroupByChange = (value: string) => {
    setGroupBy(value);
    setSelectedWorkspace("all");
    setSolutions([]);
  };

  // Handle workspace selection
  const handleWorkspaceChange = (value: string) => {
    setSelectedWorkspace(value);
    
    // Update query string parameter
    if (value !== "all") {
      setSearchParams({ workspaceid: value });
      fetchSolutions(value);
    } else {
      // Remove workspaceid parameter if "all" is selected
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('workspaceid');
      setSearchParams(newSearchParams);
      setSolutions([]);
    }
  };

  const totalCost = costData.reduce((sum, item) => sum + item.value, 0);

  const chartConfig = {
    cost: {
      label: "Cost ($)",
      color: "#2563eb",
    },
    value: {
      label: "Cost ($)",
      color: "#2563eb",
    },
  };

  // Color palette for pie chart segments
  const colors = [
    { color: '#6366F1', hoverColor: '#4F46E5' },
    { color: '#10B981', hoverColor: '#059669' },
    { color: '#F59E0B', hoverColor: '#D97706' },
    { color: '#EF4444', hoverColor: '#DC2626' },
    { color: '#8B5CF6', hoverColor: '#7C3AED' },
    { color: '#06B6D4', hoverColor: '#0891B2' },
    { color: '#84CC16', hoverColor: '#65A30D' },
    { color: '#F97316', hoverColor: '#EA580C' },
  ];

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius * 0.7;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.08) return null;

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="font-bold text-sm drop-shadow-lg"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
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
          {/* Enhanced Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* First dropdown: All Workspaces or Users */}
            <div>
              <Select value={groupBy} onValueChange={handleGroupByChange}>
                <SelectTrigger className="border-2 hover:border-blue-300 transition-colors">
                  <SelectValue placeholder="Group by" />
                </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all-workspaces">Workspaces</SelectItem>
                   <SelectItem value="users">Users</SelectItem>
                 </SelectContent>
              </Select>
            </div>

            {/* Second dropdown: Workspace selection (only show if All Workspaces is selected) */}
            {groupBy === "all-workspaces" && (
              <div>
                <Select value={selectedWorkspace} onValueChange={handleWorkspaceChange}>
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
                    {(workspaces || []).map((workspace) => (
                      <SelectItem key={workspace.WorkspaceId} value={workspace.WorkspaceId}>
                        {workspace.WorkspaceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Enhanced Pie Chart Container */}
          <div className="relative flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 rounded-2xl p-12 shadow-inner border border-slate-200">
            {/* Decorative background elements */}
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/20 to-transparent rounded-2xl"></div>
            <div className="absolute top-4 right-4 w-16 h-16 bg-gradient-to-br from-blue-200/30 to-purple-200/30 rounded-full blur-xl"></div>
            <div className="absolute bottom-6 left-6 w-12 h-12 bg-gradient-to-br from-green-200/30 to-blue-200/30 rounded-full blur-lg"></div>
            
            {loading ? (
              <div className="flex items-center justify-center h-[500px]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading cost data...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-[500px]">
                <div className="text-center">
                  <p className="text-red-600 mb-2">Error loading cost data</p>
                  <p className="text-gray-600 text-sm">{error}</p>
                </div>
              </div>
            ) : costData.length === 0 ? (
              <div className="flex items-center justify-center h-[500px]">
                <div className="text-center">
                  <p className="text-gray-600">No cost data available</p>
                </div>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[500px] w-full max-w-3xl relative z-10">
                <PieChart>
                  <defs>
                    {/* Dynamic gradient definitions */}
                    {(costData || []).map((entry, index) => (
                      <linearGradient key={index} id={`gradient${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={colors[index % colors.length].color} />
                        <stop offset="100%" stopColor={colors[index % colors.length].hoverColor} />
                      </linearGradient>
                    ))}
                    
                    {/* Drop shadow filter */}
                    <filter id="dropshadow" height="130%">
                      <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="rgba(0,0,0,0.15)"/>
                    </filter>
                  </defs>
                  
                  <Pie
                    data={costData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={CustomLabel}
                    outerRadius={180}
                    paddingAngle={2}
                    dataKey="value"
                    onMouseEnter={onPieEnter}
                    onMouseLeave={onPieLeave}
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={3}
                    filter="url(#dropshadow)"
                  >
                    {(costData || []).map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={activeIndex === index ? colors[index % colors.length].hoverColor : entry.gradient}
                        className="transition-all duration-500 ease-out cursor-pointer"
                        style={{
                          transform: activeIndex === index ? 'scale(1.05)' : 'scale(1)',
                          transformOrigin: 'center',
                          filter: activeIndex === index 
                            ? 'brightness(1.1) drop-shadow(0 8px 16px rgba(0,0,0,0.25))' 
                            : 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))'
                        }}
                      />
                    ))}
                  </Pie>
                  
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        const entry = costData[payload[0].payload.name === data.name ? 
                          costData.findIndex(item => item.name === data.name) : 0];
                        const colorIndex = costData.findIndex(item => item.name === data.name);
                        const color = colors[colorIndex % colors.length].color;
                        
                        return (
                          <div className="bg-white/95 backdrop-blur-sm p-4 border border-gray-200 rounded-xl shadow-lg border-l-4" 
                               style={{ borderLeftColor: color }}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                              <p className="font-bold text-gray-800">{data.name}</p>
                            </div>
                            <p className="text-2xl font-bold text-blue-600 mb-1">${data.value?.toLocaleString()}</p>
                            <p className="text-gray-600 text-sm mb-1">{entry?.description || 'No description'}</p>
                            <p className="text-gray-500 text-xs">
                              {((data.value as number / totalCost) * 100).toFixed(1)}% of total cost
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }} 
                  />
                </PieChart>
              </ChartContainer>
            )}
          </div>
          
          {/* Enhanced Legend with Cards */}
          {(costData || []).length > 0 && (
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(costData || []).map((entry, index) => (
                <div 
                  key={index} 
                  className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 cursor-pointer transform hover:scale-105 ${
                    activeIndex === index 
                      ? 'border-gray-300 shadow-lg bg-white' 
                      : 'border-gray-100 hover:border-gray-200 bg-white hover:shadow-md'
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  style={{
                    background: activeIndex === index 
                      ? `linear-gradient(135deg, ${colors[index % colors.length].color}08 0%, ${colors[index % colors.length].color}12 100%)` 
                      : 'white'
                  }}
                >
                  {/* Colored top border */}
                  <div 
                    className="h-1 w-full" 
                    style={{ backgroundColor: colors[index % colors.length].color }}
                  />
                  
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div 
                        className="w-5 h-5 rounded-full shadow-sm ring-2 ring-white" 
                        style={{ backgroundColor: activeIndex === index ? colors[index % colors.length].hoverColor : colors[index % colors.length].color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">
                          {entry.name}
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-xl font-bold" style={{ color: colors[index % colors.length].color }}>
                        ${entry.value.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {entry.description || 'No description'}
                      </div>
                      <div className="text-xs font-medium text-gray-600">
                        {((entry.value / totalCost) * 100).toFixed(1)}% of total
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}


        </CardContent>
      </Card>

      {/* System Metrics Grid */}
    </div>
  );
};

export default AdminSystemOverview;
