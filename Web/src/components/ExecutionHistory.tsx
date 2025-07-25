import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { RefreshCw, Play, ArrowLeft, Download, Loader2 } from "lucide-react";
import { ExecutionService, ExecutionListResponse, ExecutionDetail } from "@/services/executionService";
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
  const [selectedExecution, setSelectedExecution] = useState<ExecutionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logs, setLogs] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [generatingLogs, setGeneratingLogs] = useState(false);
  const limit = 10;
  const { toast } = useToast();
  // Controls if the refresh button is enabled after generate logs is clicked
  const [canRefreshLogs, setCanRefreshLogs] = useState(false);

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
      case "succeeded": 
      case "success": 
      case "completed": 
        return "bg-green-100 text-green-800 border-green-200";
      case "failed": 
      case "error": 
        return "bg-red-100 text-red-800 border-red-200";
      case "running": 
      case "in_progress": 
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: 
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const handleExecutionClick = async (executionId: string) => {
    setDetailLoading(true);
    try {
      const detail = await ExecutionService.getExecution(workspaceId, solutionId, executionId);
      setSelectedExecution(detail);
      setLogs(""); // Reset logs when viewing new execution
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to fetch execution details",
        variant: "destructive"
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGenerateLogs = async () => {
    if (!selectedExecution) return;
    setGeneratingLogs(true);
    setCanRefreshLogs(false);
    try {
      await ExecutionService.generateLogs(workspaceId, solutionId, selectedExecution.ExecutionId);
      toast({
        title: "Success",
        description: "Log generation started"
      });
      // Refresh execution details to get updated LogsStatus
      handleRefreshLogsStatus();
      setCanRefreshLogs(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to generate logs",
        variant: "destructive"
      });
    } finally {
      setGeneratingLogs(false);
    }
  };

  const handleRefreshLogsStatus = async () => {
    if (!selectedExecution) return;
    setDetailLoading(true);
    try {
      const detail = await ExecutionService.getExecution(workspaceId, solutionId, selectedExecution.ExecutionId);
      setSelectedExecution(detail);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to refresh execution details",
        variant: "destructive"
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewLogs = async () => {
    if (!selectedExecution) return;
    setLogsLoading(true);
    try {
      const logsResponse = await ExecutionService.getLogsStatus(workspaceId, solutionId, selectedExecution.ExecutionId);
      if (logsResponse.PresignedURL) {
        const logsContent = await ExecutionService.fetchLogs(logsResponse.PresignedURL);
        setLogs(logsContent);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to fetch logs",
        variant: "destructive"
      });
    } finally {
      setLogsLoading(false);
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

  if (selectedExecution) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedExecution(null)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
              </Button>
              <CardTitle>Execution Details</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {detailLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading execution details...
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Execution ID</label>
                    <p className="text-sm font-mono">{selectedExecution.ExecutionId}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Executed By</label>
                    <p className="text-sm">{selectedExecution.ExecutedBy}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div className="mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(selectedExecution.ExecutionStatus)}`}>
                        {selectedExecution.ExecutionStatus}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Start Time</label>
                    <p className="text-sm">{formatDateTime(selectedExecution.StartTime)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">End Time</label>
                    <p className="text-sm">{formatDateTime(selectedExecution.EndTime)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Duration</label>
                    <p className="text-sm">{getDuration(selectedExecution.StartTime, selectedExecution.EndTime)}</p>
                  </div>
                </div>
              </div>
              
              {selectedExecution.Message && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Message</label>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-lg">{selectedExecution.Message}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-medium">Execution Logs</h4>
                  <div className="flex items-center space-x-2">
                    {selectedExecution.LogsStatus === "Generated" ? (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleViewLogs}
                        disabled={logsLoading}
                      >
                        {logsLoading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        View Logs
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleGenerateLogs}
                        disabled={generatingLogs}
                        size="sm"
                      >
                        {generatingLogs ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Generate Logs
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRefreshLogsStatus}
                      disabled={!canRefreshLogs || generatingLogs || detailLoading}
                    >
                      {generatingLogs ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Logs...
                        </>
                      ) : (
                        <>
                          <RefreshCw className={`w-4 h-4 ${detailLoading ? 'animate-spin' : ''}`} /> Refresh
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                
                {logs && (
                  <div className="mt-4">
                    <pre className="bg-black text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                      {logs}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

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
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Executed By</th>
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Start Time</th>
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Duration</th>
                  <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr 
                    key={execution.ExecutionId} 
                    className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleExecutionClick(execution.ExecutionId)}
                  >
                    <td className="py-4 px-4 text-sm">{execution.ExecutedBy || "-"}</td>
                    <td className="py-4 px-4 text-sm">{formatDateTime(execution.StartTime)}</td>
                    <td className="py-4 px-4 text-sm">{getDuration(execution.StartTime, execution.EndTime) || "-"}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass(execution.ExecutionStatus || "")}`}>
                        {execution.ExecutionStatus || "Unknown"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalCount > limit && (
            <div className="flex justify-center mt-6">
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