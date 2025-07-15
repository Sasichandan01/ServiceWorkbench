
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Database, Clock, Link as LinkIcon, Activity } from "lucide-react";

interface DataSource {
  id: number;
  name: string;
  description: string;
  type: string;
  status: string;
  connectionString: string;
  lastSync: string;
  records: string;
  workspaces: string[];
  tags: string[];
}

interface DataSourceOverviewProps {
  dataSource: DataSource;
}

const DataSourceOverview = ({ dataSource }: DataSourceOverviewProps) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Connected": return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "Error": return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return <Database className="w-5 h-5 text-blue-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Connected": return "bg-green-100 text-green-700 border-green-200";
      case "Error": return "bg-red-100 text-red-700 border-red-200";
      case "Syncing": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "S3": return "bg-green-100 text-green-700 border-green-200";
      case "DynamoDB": return "bg-orange-100 text-orange-700 border-orange-200";
      case "RDS": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Redshift": return "bg-purple-100 text-purple-700 border-purple-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{dataSource.name}</h1>
              <p className="text-gray-600">{dataSource.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Badge className={`${getTypeColor(dataSource.type)} border`}>
              {dataSource.type}
            </Badge>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Records/Size</p>
                <p className="text-lg font-bold">{dataSource.records}</p>
              </div>
              <Database className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Workspaces</p>
                <p className="text-lg font-bold">{dataSource.workspaces.length}</p>
              </div>
              <LinkIcon className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Last Sync</p>
                <p className="text-lg font-bold">{dataSource.lastSync}</p>
              </div>
              <Clock className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Details</CardTitle>
          <CardDescription>Configuration and connection information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Connection String</label>
            <p className="text-sm bg-gray-50 p-3 rounded-md font-mono">{dataSource.connectionString}</p>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-600">Workspaces</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {dataSource.workspaces.map((workspace, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {workspace}
                </Badge>
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-600">Tags</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {dataSource.tags.map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default DataSourceOverview;
