
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

const SecuritySettings = () => {
  const permissions = [
    "Create Workspaces",
    "Manage Data Sources", 
    "View Cost Analytics",
    "Execute ETL Jobs",
    "Manage User Access"
  ];

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <span className="text-gray-900">Security & Access</span>
        </CardTitle>
        <CardDescription>Manage your security settings</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between">
        <div>
          <h4 className="text-sm font-medium mb-3 text-gray-900">Permissions</h4>
          <div className="space-y-3">
            {permissions.slice(0, 3).map((permission, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                <span className="text-sm text-gray-600">{permission}</span>
              </div>
            ))}
            <div className="text-sm text-gray-500 font-medium">+{permissions.length - 3} more permissions</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SecuritySettings;
