import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Play } from "lucide-react";
import { ExecutionService } from "@/services/executionService";
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
  StartTime: string;
  Duration: string;
  ExecutionStatus: string;
  Message: string;
}

const ExecutionHistory = ({ workspaceId, solutionId, onRunSolution, isReadySolution }: ExecutionHistoryProps) => {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const response = await ExecutionService.getExecutions(workspaceId, solutionId);
      setExecutions(response.ExecutionHistory || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch execution history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
  }, [workspaceId, solutionId]);

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

  const formatDateTime = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
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
            <Button variant="outline" size="sm" onClick={fetchExecutions} disabled={loading}>
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
                    <td className="p-3">{execution.ExecutedBy}</td>
                    <td className="p-3">{formatDateTime(execution.StartTime)}</td>
                    <td className="p-3">{execution.Duration}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(execution.ExecutionStatus)}`}>
                        {execution.ExecutionStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExecutionHistory;