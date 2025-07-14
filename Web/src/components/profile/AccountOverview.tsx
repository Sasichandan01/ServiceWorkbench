
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Users, Database, Zap, DollarSign } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";

const AccountOverview = () => {
  const user = useAppSelector((state) => state.auth.user);
  // Determine active roles count
  let activeRoles = 0;
  if (user && Array.isArray((user as any).Role)) {
    activeRoles = (user as any).Role.length;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-gray-900">Account Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Roles */}
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600 mb-1">{activeRoles}</div>
          <div className="text-sm text-gray-600">Active Roles</div>
        </div>
        
        <Separator />
        
        {/* Key Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-3">
            <Database className="w-5 h-5 text-blue-500" />
            <div>
              <div className="font-semibold text-gray-900">8</div>
              <div className="text-xs text-gray-600">Data Sources</div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <Zap className="w-5 h-5 text-yellow-500" />
            <div>
              <div className="font-semibold text-gray-900">24</div>
              <div className="text-xs text-gray-600">Solutions</div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <Users className="w-5 h-5 text-green-500" />
            <div>
              <div className="font-semibold text-gray-900">2.1 TB</div>
              <div className="text-xs text-gray-600">Storage</div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <DollarSign className="w-5 h-5 text-green-600" />
            <div>
              <div className="font-semibold text-green-600">$342</div>
              <div className="text-xs text-gray-600">This Month</div>
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* Quick Info */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Member since</span>
            <span className="font-medium text-gray-900">Jan 2024</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Last login</span>
            <span className="font-medium text-gray-900">2 hours ago</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountOverview;
