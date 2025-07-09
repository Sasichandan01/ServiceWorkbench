
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { 
  Search, 
  FileText, 
  Filter,
  Download,
  Eye,
  Shield,
  User,
  Database,
  Settings
} from "lucide-react";

interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  category: 'auth' | 'user' | 'workspace' | 'role' | 'system';
  status: 'success' | 'failed' | 'warning';
  ipAddress: string;
  userAgent: string;
  details: string;
}

const AdminAuditLogs = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Mock audit log data
  const auditLogs: AuditLog[] = [
    {
      id: "1",
      timestamp: "2024-07-08T10:30:00Z",
      user: "john.doe@example.com",
      action: "User login",
      resource: "Authentication System",
      category: "auth",
      status: "success",
      ipAddress: "192.168.1.100",
      userAgent: "Mozilla/5.0 (Chrome)",
      details: "Successful login with 2FA"
    },
    {
      id: "2",
      timestamp: "2024-07-08T10:25:00Z",
      user: "admin@example.com", 
      action: "Role created",
      resource: "Data Analyst",
      category: "role",
      status: "success",
      ipAddress: "192.168.1.101",
      userAgent: "Mozilla/5.0 (Firefox)",
      details: "Created custom role with data analysis permissions"
    },
    {
      id: "3",
      timestamp: "2024-07-08T10:20:00Z",
      user: "jane.smith@example.com",
      action: "Workspace deleted",
      resource: "Legacy Dashboard",
      category: "workspace",
      status: "success",
      ipAddress: "192.168.1.102",
      userAgent: "Mozilla/5.0 (Safari)",
      details: "Permanently deleted workspace and associated data"
    },
    {
      id: "4",
      timestamp: "2024-07-08T10:15:00Z",
      user: "unknown",
      action: "Failed login attempt",
      resource: "Authentication System",
      category: "auth",
      status: "failed",
      ipAddress: "203.0.113.42",
      userAgent: "curl/7.68.0",
      details: "Multiple failed login attempts detected"
    }
  ];

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.resource.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || log.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'auth':
        return <Shield className="w-4 h-4 text-blue-500" />;
      case 'user':
        return <User className="w-4 h-4 text-green-500" />;
      case 'workspace':
        return <Database className="w-4 h-4 text-purple-500" />;
      case 'role':
        return <Shield className="w-4 h-4 text-orange-500" />;
      case 'system':
        return <Settings className="w-4 h-4 text-gray-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800">Success</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleExport = () => {
    console.log("Exporting audit logs...");
    // In real app, this would generate and download a CSV/PDF
  };

  return (
    <div className="w-full">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Audit Logs</span>
              </CardTitle>
              <CardDescription>
                Track all system activities and user actions
              </CardDescription>
            </div>
            <Button onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export Logs
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by user, action, or resource..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="auth">Authentication</SelectItem>
                <SelectItem value="user">User Management</SelectItem>
                <SelectItem value="workspace">Workspaces</SelectItem>
                <SelectItem value="role">Roles</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Audit Logs Table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[200px]">User</TableHead>
                    <TableHead className="w-[180px]">Action</TableHead>
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[140px]">IP Address</TableHead>
                    <TableHead className="min-w-[200px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm w-[180px]">
                        {formatTimestamp(log.timestamp)}
                      </TableCell>
                      <TableCell className="w-[200px]">
                        <div className="flex items-center space-x-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-gray-100 text-xs">
                              {log.user.split('@')[0].substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium truncate">{log.user}</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-[180px]">
                        <div>
                          <div className="font-medium text-sm truncate">{log.action}</div>
                          <div className="text-xs text-gray-500 truncate">{log.resource}</div>
                        </div>
                      </TableCell>
                      <TableCell className="w-[120px]">
                        <div className="flex items-center space-x-2">
                          {getCategoryIcon(log.category)}
                          <span className="text-sm capitalize">{log.category}</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-[100px]">{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="text-sm font-mono w-[140px]">
                        {log.ipAddress}
                      </TableCell>
                      <TableCell className="min-w-[200px]">
                        <div className="max-w-[300px]">
                          <p className="text-sm text-gray-600 truncate" title={log.details}>
                            {log.details}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) setCurrentPage(currentPage - 1);
                    }}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      href="#"
                      isActive={page === currentPage}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(page);
                      }}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuditLogs;
