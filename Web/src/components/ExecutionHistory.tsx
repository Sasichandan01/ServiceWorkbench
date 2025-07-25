import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { RefreshCw, Play } from "lucide-react";
import { ExecutionService, ExecutionListResponse } from "@/services/executionService";
import { useToast } from "@/hooks/use-toast";

interface ExecutionHistoryProps {
  workspaceId: string;
  solutionId: string;
  onRunSolution: () => void;
  isReadySolution: boolean;
}

interface Execution {
  ExecutionId: string;
  ExecutedBy: string;
  StartTime?: string;
  EndTime?: string;
  ExecutionStatus?: string;
  [key: string]: any;
}

const ExecutionHistory = ({ workspaceId, solutionId, onRunSolution, isReadySolution }: ExecutionHistoryProps) => {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [count, setCount] = useState(0);
  const [nextAvailable, setNextAvailable] = useState(false);
  const limit = 10;
  const { toast } = useToast();

  const fetchExecutions = async (pageNum = page) => {
    setLoading(true);
    try {
      const offset = pageNum; // offset is the page number, not (page-1)*limit
      const response: ExecutionListResponse & { Execution?: any[] } = await ExecutionService.getExecutions(workspaceId, solutionId, { limit, offset });
      const responseExecutions = response.ExecutionHistory || response.Execution || [];
      setExecutions(responseExecutions);
      setCount(response.Pagination?.Count || 0);
      setTotalCount(response.Pagination?.TotalCount || 0);
      setNextAvailable(!!response.Pagination?.NextAvailable);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.data?.message || error?.message || (typeof error === 'string' ? error : 'An error occurred.'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [workspaceId, solutionId]);

  useEffect(() => {
    fetchExecutions(page);
  }, [page]);

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "success": 
      case "completed": 
        return "bg-green-100 text-green-800 border-green-200";
      case "failed": 
      case "error": 
        return "bg-red-100 text-red-800 border-red-200";
      case "running": 
      case "in_progress": 
        return "bg-blue-100 text-blue-800 border-blue-200";
      default: 
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? "" : date.toLocaleString();
  };

  const getDuration = (start?: string, end?: string) => {
    if (!start || !end) return "";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = endDate.getTime() - startDate.getTime();
    if (isNaN(diff) || diff < 0) return "";
    const seconds = Math.floor(diff / 1000) % 60;
    const minutes = Math.floor(diff / 60000) % 60;
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Execution History</CardTitle>
          <div className="flex items-center space-x-2">
            <Button onClick={onRunSolution} disabled={!isReadySolution}>
              <Play className="w-4 h-4 mr-2" />
              Run Solution
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchExecutions()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && executions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading execution history...
          </div>
        ) : executions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No executions found. Run the solution to see execution history.
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Executed By</th>
                  <th className="text-left p-3 font-medium">Start Time</th>
                  <th className="text-left p-3 font-medium">Duration</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr key={execution.ExecutionId} className="border-b hover:bg-muted/50">
                    <td className="p-3">{execution.ExecutedBy || ""}</td>
                    <td className="p-3">{formatDateTime(execution.StartTime)}</td>
                    <td className="p-3">{getDuration(execution.StartTime, execution.EndTime)}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(execution.ExecutionStatus || "")}`}>
                        {execution.ExecutionStatus || ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls (Workspaces style) */}
          {totalCount > limit && (
            <div className="flex justify-center mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage(Math.max(1, page - 1))}
                      className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.ceil(totalCount / limit) }, (_, i) => i + 1).map((pg) => (
                    <PaginationItem key={pg}>
                      <PaginationLink
                        onClick={() => setPage(pg)}
                        isActive={page === pg}
                        className="cursor-pointer"
                      >
                        {pg}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage(Math.min(Math.ceil(totalCount / limit), page + 1))}
                      className={page === Math.ceil(totalCount / limit) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ExecutionHistory;