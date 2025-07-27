import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { CostService } from "@/services/costService";
import { WorkspaceService } from "@/services/workspaceService";
import { SolutionService } from "@/services/solutionService";
import { getUserInfo } from "@/lib/tokenUtils";

const CostDashboard = () => {
  const [selectedTimeRange, setSelectedTimeRange] = useState("7d");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  
  // New state for dropdowns
  const [groupBy, setGroupBy] = useState("workspaces");
  const [selectedItem, setSelectedItem] = useState("all");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [solutions, setSolutions] = useState<any[]>([]);
  const [pieChartData, setPieChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [solutionSearch, setSolutionSearch] = useState("");
  const [selectedWorkspaceForSolutions, setSelectedWorkspaceForSolutions] = useState<string>("");

  // Sample data for the cost trend chart
  const costTrendData = [
    { name: "Jan", cost: 2400 },
    { name: "Feb", cost: 1398 },
    { name: "Mar", cost: 9800 },
    { name: "Apr", cost: 3908 },
    { name: "May", cost: 4800 },
    { name: "Jun", cost: 3800 },
    { name: "Jul", cost: 4300 },
  ];

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

  const totalCost = pieChartData.reduce((sum, item) => sum + item.value, 0);

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

  // Fetch workspaces
  const fetchWorkspaces = async () => {
    try {
      const response = await WorkspaceService.getWorkspaces({ 
        limit: 10,
        filterBy: workspaceSearch.trim() || undefined
      });
      setWorkspaces(response?.Workspaces || []);
    } catch (err) {
      console.error('Error fetching workspaces:', err);
      setWorkspaces([]);
    }
  };

  // Fetch solutions for a specific workspace
  const fetchSolutions = async (workspaceId: string) => {
    try {
      const response = await SolutionService.getSolutions(workspaceId, { 
        limit: 10,
        filterBy: solutionSearch.trim() || undefined
      });
      setSolutions(response?.Solutions || []);
    } catch (err) {
      console.error('Error fetching solutions:', err);
      setSolutions([]);
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
      
      // Transform the API response to match our pie chart format
      const costs = response?.costs || [];
      const transformedData = costs.map((item, index) => ({
        ...item,
        gradient: `url(#gradient${index})`,
      }));
      
      setPieChartData(transformedData);
    } catch (err: any) {
      console.error('Error fetching cost data:', err);
      setError(err.message || 'Failed to fetch cost data');
      setPieChartData([]);
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
      {/* Enhanced Cost Distribution Pie Chart */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cost Distribution
            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></div>
          </CardTitle>
          <CardDescription>Real-time distribution of costs across workspaces</CardDescription>
        </CardHeader>
        <CardContent>
          {/* New Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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
                    {(workspaces || []).map((workspace) => (
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
                    {(workspaces || []).map((workspace) => (
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
                    {(solutions || []).map((solution) => (
                      <SelectItem key={solution.SolutionId} value={solution.SolutionId}>
                        {solution.SolutionName}
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
            ) : pieChartData.length === 0 ? (
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
                    {(pieChartData || []).map((entry, index) => (
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
                    data={pieChartData}
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
                    {(pieChartData || []).map((entry, index) => (
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
                        const entry = pieChartData[payload[0].payload.name === data.name ? 
                          pieChartData.findIndex(item => item.name === data.name) : 0];
                        const colorIndex = pieChartData.findIndex(item => item.name === data.name);
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
          {(pieChartData || []).length > 0 && (
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(pieChartData || []).map((entry, index) => (
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
    </div>
  );
};

export default CostDashboard;
