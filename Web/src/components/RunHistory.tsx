
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface RunHistory {
  id: number;
  runId: string;
  status: string;
  startTime: string;
  duration: string;
  triggeredBy: string;
  type: string;
}

interface RunHistoryProps {
  allRunHistory: RunHistory[];
  getStatusBadgeClass: (status: string) => string;
}

const RunHistory = ({ allRunHistory, getStatusBadgeClass }: RunHistoryProps) => {
  const [runHistorySearch, setRunHistorySearch] = useState("");
  const [runHistoryPage, setRunHistoryPage] = useState(1);
  const itemsPerPage = 10;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Success": return <CheckCircle className="w-4 h-4" />;
      case "Failed": return <XCircle className="w-4 h-4" />;
      case "Running": return <AlertCircle className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  // Filter and paginate run history
  const filteredRunHistory = allRunHistory.filter(run =>
    run.runId.toLowerCase().includes(runHistorySearch.toLowerCase()) ||
    run.triggeredBy.toLowerCase().includes(runHistorySearch.toLowerCase()) ||
    run.type.toLowerCase().includes(runHistorySearch.toLowerCase())
  );
  const totalRunHistoryPages = Math.ceil(filteredRunHistory.length / itemsPerPage);
  const paginatedRunHistory = filteredRunHistory.slice(
    (runHistoryPage - 1) * itemsPerPage,
    runHistoryPage * itemsPerPage
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Run History</CardTitle>
            <CardDescription>Track all solution executions and their results</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search runs by ID, user, or type..."
              value={runHistorySearch}
              onChange={(e) => {
                setRunHistorySearch(e.target.value);
                setRunHistoryPage(1);
              }}
              className="pl-10"
            />
          </div>

          {/* Run History Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Triggered By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRunHistory.map((run) => (
                <TableRow key={run.id} className="cursor-pointer hover:bg-gray-50 transition-colors">
                  <TableCell>
                    <div className="font-medium text-gray-900">{run.runId}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(run.status)}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{run.startTime}</TableCell>
                  <TableCell className="text-gray-600">{run.duration}</TableCell>
                  <TableCell className="text-gray-600">{run.triggeredBy}</TableCell>
                </TableRow>
              ))}
              {paginatedRunHistory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No run history found matching your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Run History Pagination */}
          {totalRunHistoryPages > 1 && (
            <div className="flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setRunHistoryPage(Math.max(1, runHistoryPage - 1))}
                      className={runHistoryPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {[...Array(totalRunHistoryPages)].map((_, i) => (
                    <PaginationItem key={i + 1}>
                      <PaginationLink
                        onClick={() => setRunHistoryPage(i + 1)}
                        isActive={runHistoryPage === i + 1}
                        className="cursor-pointer"
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setRunHistoryPage(Math.min(totalRunHistoryPages, runHistoryPage + 1))}
                      className={runHistoryPage === totalRunHistoryPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RunHistory;
