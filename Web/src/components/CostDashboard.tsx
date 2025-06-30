import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";

const CostDashboard = () => {
  const [selectedWorkspace, setSelectedWorkspace] = useState("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState("7d");
  const [pieSelectedWorkspace, setPieSelectedWorkspace] = useState("all");
  const [pieSelectedTimeRange, setPieSelectedTimeRange] = useState("7d");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  // Enhanced pie chart data with modern gradient colors
  const pieChartData = [
    { 
      name: "Compute", 
      value: 1580, 
      color: '#6366F1', 
      hoverColor: '#4F46E5',
      gradient: 'url(#computeGradient)',
      description: 'Virtual machines & containers'
    },
    { 
      name: "Storage", 
      value: 680, 
      color: '#10B981', 
      hoverColor: '#059669',
      gradient: 'url(#storageGradient)',
      description: 'Data storage & backups'
    },
    { 
      name: "Network", 
      value: 420, 
      color: '#F59E0B', 
      hoverColor: '#D97706',
      gradient: 'url(#networkGradient)',
      description: 'Bandwidth & CDN'
    },
    { 
      name: "Database", 
      value: 880, 
      color: '#EF4444', 
      hoverColor: '#DC2626',
      gradient: 'url(#databaseGradient)',
      description: 'SQL & NoSQL databases'
    },
    { 
      name: "Analytics", 
      value: 320, 
      color: '#8B5CF6', 
      hoverColor: '#7C3AED',
      gradient: 'url(#analyticsGradient)',
      description: 'Data processing & insights'
    },
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
      {/* Cost Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Trend</CardTitle>
          <CardDescription>Monthly cost trends over time</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Workspace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workspaces</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="1m">Last 1 month</SelectItem>
                  <SelectItem value="3m">Last 3 months</SelectItem>
                  <SelectItem value="6m">Last 6 months</SelectItem>
                  <SelectItem value="1y">Last 1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ChartContainer config={chartConfig} className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={costTrendData}>
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="cost" 
                  stroke="#2563eb" 
                  strokeWidth={2}
                  dot={{ fill: "#2563eb", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: "#2563eb", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Enhanced Cost Distribution Pie Chart */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cost Distribution
            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></div>
          </CardTitle>
          <CardDescription>Real-time distribution of costs across different services</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div>
              <Select value={pieSelectedWorkspace} onValueChange={setPieSelectedWorkspace}>
                <SelectTrigger className="border-2 hover:border-blue-300 transition-colors">
                  <SelectValue placeholder="Filter by Workspace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workspaces</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={pieSelectedTimeRange} onValueChange={setPieSelectedTimeRange}>
                <SelectTrigger className="border-2 hover:border-blue-300 transition-colors">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="1m">Last 1 month</SelectItem>
                  <SelectItem value="3m">Last 3 months</SelectItem>
                  <SelectItem value="6m">Last 6 months</SelectItem>
                  <SelectItem value="1y">Last 1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Enhanced Pie Chart Container */}
          <div className="relative flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 rounded-2xl p-12 shadow-inner border border-slate-200">
            {/* Decorative background elements */}
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/20 to-transparent rounded-2xl"></div>
            <div className="absolute top-4 right-4 w-16 h-16 bg-gradient-to-br from-blue-200/30 to-purple-200/30 rounded-full blur-xl"></div>
            <div className="absolute bottom-6 left-6 w-12 h-12 bg-gradient-to-br from-green-200/30 to-blue-200/30 rounded-full blur-lg"></div>
            
            <ChartContainer config={chartConfig} className="h-[500px] w-full max-w-3xl relative z-10">
              <PieChart>
                <defs>
                  {/* Gradient definitions for each segment */}
                  <linearGradient id="computeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#4F46E5" />
                  </linearGradient>
                  <linearGradient id="storageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="networkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#D97706" />
                  </linearGradient>
                  <linearGradient id="databaseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#EF4444" />
                    <stop offset="100%" stopColor="#DC2626" />
                  </linearGradient>
                  <linearGradient id="analyticsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8B5CF6" />
                    <stop offset="100%" stopColor="#7C3AED" />
                  </linearGradient>
                  
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
                  {pieChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={activeIndex === index ? entry.hoverColor : entry.gradient}
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
                      const entry = pieChartData[payload[0].payload.name === pieChartData[0].name ? 0 : 
                                                 payload[0].payload.name === pieChartData[1].name ? 1 :
                                                 payload[0].payload.name === pieChartData[2].name ? 2 :
                                                 payload[0].payload.name === pieChartData[3].name ? 3 : 4];
                      return (
                        <div className="bg-white/95 backdrop-blur-sm p-4 border border-gray-200 rounded-xl shadow-lg border-l-4" 
                             style={{ borderLeftColor: entry.color }}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                            <p className="font-bold text-gray-800">{data.name}</p>
                          </div>
                          <p className="text-2xl font-bold text-blue-600 mb-1">${data.value?.toLocaleString()}</p>
                          <p className="text-gray-600 text-sm mb-1">{entry.description}</p>
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
          </div>
          
          {/* Enhanced Legend with Cards */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {pieChartData.map((entry, index) => (
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
                    ? `linear-gradient(135deg, ${entry.color}08 0%, ${entry.color}12 100%)` 
                    : 'white'
                }}
              >
                {/* Colored top border */}
                <div 
                  className="h-1 w-full" 
                  style={{ backgroundColor: entry.color }}
                />
                
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className="w-5 h-5 rounded-full shadow-sm ring-2 ring-white" 
                      style={{ backgroundColor: activeIndex === index ? entry.hoverColor : entry.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">
                        {entry.name}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xl font-bold" style={{ color: entry.color }}>
                      ${entry.value.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {entry.description}
                    </div>
                    <div className="text-xs font-medium text-gray-600">
                      {((entry.value / totalCost) * 100).toFixed(1)}% of total
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CostDashboard;
