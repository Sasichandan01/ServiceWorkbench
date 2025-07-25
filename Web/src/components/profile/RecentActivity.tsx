
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { UserService } from "@/services/userService";

interface ActivityLog {
  Action?: string;
  action?: string;
  ResourceName?: string;
  target?: string;
  EventTime?: string;
  time?: string;
}

interface ActivityLogsResponse {
  ActivityLogs: ActivityLog[];
}

interface RecentActivityProps {
  userId: string;
}

const RecentActivity = ({ userId }: RecentActivityProps) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const res: any = await UserService.getUserActivityLogs(userId) || {};
        if (!ignore) setLogs((res.ActivityLogs ?? []) as ActivityLog[]);
      } catch (err: any) {
        if (!ignore) setError(err.message || "Failed to load activity logs");
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    if (userId) fetchLogs();
    return () => { ignore = true; };
  }, [userId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-gray-900">
          <Activity className="w-5 h-5 text-blue-600" />
          <span>Recent Activity</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading activity...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No recent activity found.</div>
        ) : (
          <div className="space-y-4">
            {logs
              .slice(0, 4)
              .map((activity, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {activity.Action || activity.action}
                    </p>
                    <p className="text-sm text-gray-600 truncate">{activity.ResourceName || activity.target}</p>
                    <p className="text-xs text-gray-500">{activity.EventTime || activity.time}</p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentActivity;
