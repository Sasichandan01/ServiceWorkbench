
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const UsageStats = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Usage Stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Data Sources</span>
            <span className="font-medium">8</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">ETL Jobs</span>
            <span className="font-medium">24</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Storage Used</span>
            <span className="font-medium">2.1 TB</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">This Month Cost</span>
            <span className="font-medium text-green-600">$342</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UsageStats;
