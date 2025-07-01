
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const AccountSummary = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Account Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">12</div>
          <div className="text-sm text-gray-600">Active Workspaces</div>
        </div>
        
        <Separator />
        
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Member since:</span>
            <span className="font-medium">Jan 2024</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Last login:</span>
            <span className="font-medium">2 hours ago</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total jobs run:</span>
            <span className="font-medium">1,247</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountSummary;
