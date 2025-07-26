import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Database, CheckCircle, AlertCircle, Clock, Loader2 } from "lucide-react";

interface DataSource {
  id: string | number;
  name: string;
  description: string;
  type: string;
  status: string;
  connectionString: string;
  lastSync: string;
  records: string;
  workspaces: string[];
  tags: string[];
  creationTime: string;
  lastModifiedTime: string;
}

interface DataSourcesTableProps {
  dataSources: DataSource[];
  onDataSourceClick: (id: string | number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  loading?: boolean;
}

const DataSourcesTable = ({ dataSources, onDataSourceClick, currentPage, totalPages, onPageChange, searchTerm, setSearchTerm, loading }: DataSourcesTableProps) => {
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

  // Filter data sources by search term
  const filteredDataSources = dataSources.filter(ds =>
    ds.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ds.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Data Sources</CardTitle>
        <CardDescription>
          {filteredDataSources.length} data source{filteredDataSources.length !== 1 ? 's' : ''} on this page
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Search Bar */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search data sources by name or description..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data Source Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Creation Time</TableHead>
              <TableHead>Last Modified Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading data sources...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredDataSources.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  No datasources found
                </TableCell>
              </TableRow>
            ) : (
              filteredDataSources.map((dataSource) => (
                <TableRow key={dataSource.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onDataSourceClick(dataSource.id)}>
                  <TableCell>
                    <div className="font-medium text-gray-900 hover:text-blue-600">
                      {dataSource.name}
                    </div>
                  </TableCell>
                  <TableCell>{dataSource.description}</TableCell>
                  <TableCell>
                    {dataSource.tags && dataSource.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {dataSource.tags.map((tag: any, idx: number) => (
                          <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {typeof tag === 'string' ? tag : tag?.Value || tag?.Key || 'Unknown'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">No tags</span>
                    )}
                  </TableCell>
                  <TableCell>{dataSource.creationTime}</TableCell>
                  <TableCell>{dataSource.lastModifiedTime}</TableCell>
                </TableRow>
              ))
            )}
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
