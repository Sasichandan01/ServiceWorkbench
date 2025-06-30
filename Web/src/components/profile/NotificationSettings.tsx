
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Bell } from "lucide-react";

const NotificationSettings = () => {
  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bell className="w-5 h-5 text-blue-600" />
          <span className="text-gray-900">Notifications</span>
        </CardTitle>
        <CardDescription>Choose how you want to be notified</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Email Notifications</p>
            <p className="text-sm text-gray-600">Receive updates via email</p>
          </div>
          <Switch defaultChecked className="data-[state=checked]:bg-blue-600" />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Cost Alerts</p>
            <p className="text-sm text-gray-600">Alerts when costs exceed thresholds</p>
          </div>
          <Switch defaultChecked className="data-[state=checked]:bg-blue-600" />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Security Alerts</p>
            <p className="text-sm text-gray-600">Notifications for security events</p>
          </div>
          <Switch defaultChecked className="data-[state=checked]:bg-blue-600" />
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
