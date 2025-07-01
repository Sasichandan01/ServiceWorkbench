import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Database, CheckCircle, AlertCircle, Clock } from "lucide-react";

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

interface DataSourcesTableProps {
  dataSources: DataSource[];
  onDataSourceClick: (id: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const DataSourcesTable = ({ dataSources, onDataSourceClick, currentPage, totalPages, onPageChange }: DataSourcesTableProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Connected": return "default";
      case "Error": return "destructive";
      case "Syncing": return "secondary";
      default: return "outline";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Connected": return <CheckCircle className="w-4 h-4" />;
      case "Error": return <AlertCircle className="w-4 h-4" />;
      default: return <Database className="w-4 h-4" />;
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "Connected": return "text-green-700";
      case "Error": return "text-red-700";
      case "Syncing": return "text-blue-700";
      default: return "text-gray-700";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "RDS": return "bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200";
      case "S3": return "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200";
      case "Redshift": return "bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-200";
      case "DynamoDB": return "bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200";
      default: return "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200";
    }
  };

  const getRowColor = (status: string) => {
    switch (status) {
      case "Connected": return "hover:bg-green-50";
      case "Error": return "hover:bg-red-50 bg-red-25";
      case "Syncing": return "hover:bg-blue-50 bg-blue-25";
      default: return "hover:bg-gray-50";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Data Sources</CardTitle>
        <CardDescription>
          {dataSources.length} data source{dataSources.length !== 1 ? 's' : ''} on this page
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Records</TableHead>
              <TableHead className="text-center">Workspaces</TableHead>
              <TableHead>Last Sync</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataSources.map((dataSource) => (
              <TableRow key={dataSource.id} className={`${getRowColor(dataSource.status)} cursor-pointer`}>
                <TableCell>
                  <div 
                    className="flex items-center space-x-3"
                    onClick={() => onDataSourceClick(dataSource.id)}
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Database className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                        {dataSource.name}
                      </div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {dataSource.description}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`${getTypeColor(dataSource.type)} transition-colors cursor-pointer`}>
                    {dataSource.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className={`flex items-center space-x-1 ${getStatusTextColor(dataSource.status)}`}>
                    {getStatusIcon(dataSource.status)}
                    <span className="font-medium">{dataSource.status}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-medium">{dataSource.records}</span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-medium">{dataSource.workspaces.length}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{dataSource.lastSync}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => onPageChange(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DataSourcesTable;
