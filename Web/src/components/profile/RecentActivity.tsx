
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

const RecentActivity = () => {
  const recentActivity = [
    { action: "Created workspace", target: "Analytics Workspace", time: "2 hours ago" },
    { action: "Connected data source", target: "Customer Database", time: "5 hours ago" },
    { action: "Executed ETL job", target: "Sales Report Generation", time: "1 day ago" },
    { action: "Updated profile", target: "Security settings", time: "3 days ago" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-gray-900">
          <Activity className="w-5 h-5 text-blue-600" />
          <span>Recent Activity</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentActivity.map((activity, index) => (
            <div key={index} className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {activity.action}
                </p>
                <p className="text-sm text-gray-600 truncate">{activity.target}</p>
                <p className="text-xs text-gray-500">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecentActivity;
