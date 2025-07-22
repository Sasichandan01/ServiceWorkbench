
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
import { Search, FileText, Download } from "lucide-react";
import { useGetActivityLogsQuery } from "@/services/apiSlice";

const DEFAULT_RESOURCE_TYPE = "workspace";
const DEFAULT_RESOURCE_ID = "all";

const AdminAuditLogs = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [resourceType, setResourceType] = useState(DEFAULT_RESOURCE_TYPE);
  const [resourceId, setResourceId] = useState(DEFAULT_RESOURCE_ID);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch logs from API
  const { data, isLoading, isError, refetch } = useGetActivityLogsQuery({
    resourceType,
    resourceId,
    limit: itemsPerPage,
    offset: currentPage,
  }, { skip: !resourceType || !resourceId });

  const logs = data?.ActivityLogs || [];
  const totalCount = data?.Pagination?.TotalCount || 0;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const handleExport = () => {
    // Implement export logic if needed
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
            <Button onClick={handleExport} disabled>
              <Download className="w-4 h-4 mr-2" />
              Export Logs
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Resource Type/ID Selection */}
          <div className="flex flex-col sm:flex-row gap-4 mb-2">
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Resource Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace">Workspace</SelectItem>
                <SelectItem value="solution">Solution</SelectItem>
                <SelectItem value="datasource">Datasource</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="role">Role</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Resource ID (or 'all')"
              value={resourceId}
              onChange={e => setResourceId(e.target.value)}
              className="w-40"
            />
            {/* Search bar removed as per request */}
          </div>

          {/* Audit Logs Table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Event Time</TableHead>
                    <TableHead className="w-[200px]">User</TableHead>
                    <TableHead className="w-[180px]">Action</TableHead>
                    <TableHead className="w-[200px]">Resource</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead className="w-[100px]">Log ID</TableHead>
                    <TableHead className="min-w-[200px]">Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Loading logs...
                      </TableCell>
                    </TableRow>
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-red-500">
                        Failed to load logs. Please try again.
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs
                      .filter(log =>
                        !searchTerm ||
                        log.UserId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        log.Message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        log.ResourceName?.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map((log) => (
                        <TableRow key={log.LogId}>
                          <TableCell className="text-sm w-[180px]">
                            {log.EventTime ? new Date(log.EventTime).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="w-[200px]">
                            <div className="flex items-center space-x-2">
                              <Avatar className="w-6 h-6">
                                <AvatarFallback className="bg-gray-100 text-xs">
                                  {log.UserId ? log.UserId.substring(0, 2).toUpperCase() : "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium truncate">{log.UserId || "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="w-[180px]">
                            <div>
                              <div className="font-medium text-sm truncate">{log.Action || "-"}</div>
                            </div>
                          </TableCell>
                          <TableCell className="w-[200px]">
                            <div>
                              <div className="font-medium text-sm truncate">{log.ResourceName || "-"}</div>
                              <div className="text-xs text-gray-500 truncate">{log.ResourceId || "-"}</div>
                            </div>
                          </TableCell>
                          <TableCell className="w-[120px]">
                            <span className="text-sm capitalize">{log.ResourceType || "-"}</span>
                          </TableCell>
                          <TableCell className="w-[100px] font-mono">
                            {log.LogId || "-"}
                          </TableCell>
                          <TableCell className="min-w-[200px]">
                            <div className="max-w-[300px]">
                              <p className="text-sm text-gray-600 truncate" title={log.Message}>
                                {log.Message || "-"}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
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
                    onClick={e => {
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
                      onClick={e => {
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
                    onClick={e => {
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
