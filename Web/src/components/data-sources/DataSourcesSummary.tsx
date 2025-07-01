
import { Card, CardContent } from "@/components/ui/card";
import { Database, CheckCircle, AlertCircle, LinkIcon } from "lucide-react";

interface DataSourcesSummaryProps {
  totalDataSources: number;
  connectedDataSources: number;
  errorDataSources: number;
  syncingDataSources: number;
}

const DataSourcesSummary = ({ 
  totalDataSources, 
  connectedDataSources, 
  errorDataSources, 
  syncingDataSources 
}: DataSourcesSummaryProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Sources</p>
              <p className="text-2xl font-bold">{totalDataSources}</p>
            </div>
            <Database className="h-8 w-8 text-blue-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Connected</p>
              <p className="text-2xl font-bold text-green-600">{connectedDataSources}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Errors</p>
              <p className="text-2xl font-bold text-red-600">{errorDataSources}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Syncs</p>
              <p className="text-2xl font-bold text-blue-600">{syncingDataSources}</p>
            </div>
            <LinkIcon className="h-8 w-8 text-blue-600" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataSourcesSummary;
