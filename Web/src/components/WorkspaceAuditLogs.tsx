import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { WorkspaceService, ActivityLog } from "../services/workspaceService";
import { SolutionService } from "../services/solutionService";
import { DatasourceService } from "../services/datasourceService";

interface AuditLogProps {
  workspaceId?: string;
  datasourceId?: string;
  solutionId?: string;
  userId?: string;
  title?: string;
}

const WorkspaceAuditLogs = ({ workspaceId, datasourceId, solutionId, userId, title = "Workspace Logs" }: AuditLogProps) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const fetchLogs = async () => {
      if (workspaceId) {
        setLoading(true);
        setError(null);
        try {
          const res = await WorkspaceService.getWorkspaceActivityLogs(workspaceId);
          if (!ignore) setLogs(res.ActivityLogs);
        } catch (err: any) {
          if (!ignore) setError(err.message || "Failed to load logs");
        } finally {
          if (!ignore) setLoading(false);
        }
        return;
      }
      if (datasourceId) {
        setLoading(true);
        setError(null);
        try {
          const res = await DatasourceService.getDatasourceActivityLogs(datasourceId);
          if (!ignore) setLogs(res.ActivityLogs);
        } catch (err: any) {
          if (!ignore) setError(err.message || "Failed to load logs");
        } finally {
          if (!ignore) setLoading(false);
        }
        return;
      }
      if (solutionId) {
        setLoading(true);
        setError(null);
        try {
          const res = await SolutionService.getSolutionActivityLogs(solutionId);
          if (!ignore) setLogs(res.ActivityLogs);
        } catch (err: any) {
          if (!ignore) setError(err.message || "Failed to load logs");
        } finally {
          if (!ignore) setLoading(false);
        }
        return;
      }
      // fallback to mock data for other types
      setLogs(getAuditLogs());
    };
    fetchLogs();
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, datasourceId, solutionId, userId]);

  // Mock data for non-workspace logs
  const getAuditLogs = () => {
    if (datasourceId) {
      return [
        { action: "Data uploaded", target: "customer_data.csv", user: "data.engineer@company.com", time: "15 minutes ago" },
        { action: "Schema updated", target: "Table structure", user: "john.doe@company.com", time: "1 hour ago" },
        { action: "Access granted", target: "analytics team", user: "admin@company.com", time: "3 hours ago" },
        { action: "Backup created", target: "Full backup", user: "system", time: "6 hours ago" },
        { action: "Connection tested", target: "Database link", user: "data.engineer@company.com", time: "1 day ago" }
      ];
    }
    if (solutionId) {
      return [
        { action: "Code deployed", target: "Production environment", user: "dev.team@company.com", time: "20 minutes ago" },
        { action: "Test executed", target: "Unit tests", user: "john.doe@company.com", time: "45 minutes ago" },
        { action: "Configuration updated", target: "Environment variables", user: "admin@company.com", time: "2 hours ago" },
        { action: "Pipeline started", target: "Data processing", user: "system", time: "4 hours ago" },
        { action: "Solution archived", target: "Old version", user: "admin@company.com", time: "1 day ago" }
      ];
    }
    if (userId) {
      return [
        { action: "Profile updated", target: "Contact information", user: "self", time: "10 minutes ago" },
        { action: "Password changed", target: "Security settings", user: "self", time: "2 days ago" },
        { action: "Role assigned", target: "Data Analyst", user: "admin@company.com", time: "1 week ago" },
        { action: "Login attempt", target: "Failed authentication", user: "self", time: "2 weeks ago" },
        { action: "Account created", target: "Initial setup", user: "admin@company.com", time: "1 month ago" }
      ];
    }
    return [];
  };

  const getActionColor = (action: string) => {
    if (action.includes("create") || action.includes("invited")) return "bg-green-600";
    if (action.includes("update")) return "bg-blue-600";
    if (action.includes("delete") || action.includes("removed")) return "bg-red-600";
    return "bg-gray-600";
  };

  return (
    <Card className="w-full min-w-[320px]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-base">
          <FileText className="w-4 h-4 text-primary" />
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading logs...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No logs found.</div>
        ) : (
          <div className="space-y-3">
            {logs.map((log: any, index: number) => (
              <div key={index} className="flex items-start space-x-3">
                <div className={`w-2 h-2 ${getActionColor(log.Action || log.action)} rounded-full mt-2 flex-shrink-0`}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">
                    {log.Action || log.action}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight break-words">{log.ResourceName || log.target}</p>
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <p className="text-xs text-muted-foreground truncate flex-1">{log.UserId || log.user}</p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{log.EventTime || log.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WorkspaceAuditLogs;
export type { AuditLogProps };