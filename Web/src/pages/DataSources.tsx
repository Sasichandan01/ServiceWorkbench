import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ProtectedButton } from "@/components/ui/protected-button";
import DataSourceBreadcrumb from "@/components/DataSourceBreadcrumb";
import DataSourcesHeader from "@/components/data-sources/DataSourcesHeader";
import DataSourcesSummary from "@/components/data-sources/DataSourcesSummary";
import DataSourcesTable from "@/components/data-sources/DataSourcesTable";
import DataSourcesEmpty from "@/components/data-sources/DataSourcesEmpty";
import { DatasourceService, type Datasource } from "../services/datasourceService";

const DataSources = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 10;
  const { toast } = useToast();

  const fetchDataSources = async () => {
    setLoading(true);
    try {
      const searchParams: any = {
        limit: itemsPerPage,
        offset: currentPage,
      };

      if (searchTerm.trim()) {
        searchParams.filter = searchTerm.trim();
      }

      const response = await DatasourceService.getDatasources(searchParams);
      
      if (response && response.Datasources && Array.isArray(response.Datasources)) {
        // Transform API data to match existing UI expectations
        const transformedDataSources = response.Datasources.map(ds => ({
          id: ds.DatasourceId,
          name: ds.DatasourceName,
          description: ds.Description || "No description available",
          tags: ds.Tags || [],
          creationTime: formatLastActivity(ds.CreationTime),
          lastModifiedTime: formatLastActivity(ds.LastUpdationTime),
        }));
        setDataSources(transformedDataSources);
        setTotalCount(response.Pagination?.TotalCount || 0);
      } else {
        setDataSources([]);
        setTotalCount(0);
      }
    } catch (error: any) {
      console.error('Error fetching datasources:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
      setDataSources([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const formatLastActivity = (timestamp: string): string => {
    if (!timestamp) return "Unknown";
    let isoTimestamp = timestamp;
    // If timestamp is in 'YYYY-MM-DD HH:mm:ss' format, convert to ISO and treat as UTC
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      isoTimestamp = timestamp.replace(' ', 'T') + 'Z';
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      // If ISO without timezone, treat as UTC
      isoTimestamp = timestamp + 'Z';
    } else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(timestamp)) {
      // If no timezone info, treat as UTC
      isoTimestamp = timestamp + 'Z';
    }
    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) return "Unknown";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "Just now";
    const diffInMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffInMinutes < 1) {
      return "Just now";
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else {
      const days = Math.floor(diffInMinutes / 1440);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
  };

  useEffect(() => {
    fetchDataSources();
  }, [currentPage, searchTerm]);

  const handleCreateDataSource = async (name: string, tags: string[], description: string) => {
    try {
      const createData = {
        DatasourceName: name,
        Tags: tags,
        Description: description
      };

      const response = await DatasourceService.createDatasource(createData);

      toast({
        title: "Success",
        description: `Data source "${name}" created successfully!`,
      });

      // Refresh datasources list
      await fetchDataSources();
    } catch (error: any) {
      console.error('Error creating datasource:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const paginatedDataSources = dataSources;

  // Calculate data source statistics
  const totalDataSources = dataSources.length;
  const connectedDataSources = dataSources.filter(ds => ds.status === "Connected").length;
  const errorDataSources = dataSources.filter(ds => ds.status === "Error").length;
  const syncingDataSources = dataSources.filter(ds => ds.status === "Syncing").length;

  const handleDataSourceClick = (dataSourceId: string | number) => {
    console.log(`Opening data source details for data source ${dataSourceId}`);
    navigate(`/data-sources/${dataSourceId}`);
  };

  return (
    <div className="space-y-6">
      <DataSourcesHeader onCreateDataSource={handleCreateDataSource} />
      <DataSourcesSummary 
        totalDataSources={totalDataSources}
        connectedDataSources={0}
        errorDataSources={0}
        syncingDataSources={0}
      />
      <DataSourcesTable 
        dataSources={paginatedDataSources}
        onDataSourceClick={handleDataSourceClick}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        loading={loading}
      />
    </div>
  );
};

export default DataSources;