import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ProtectedButton } from "@/components/ui/protected-button";
import DataSourceBreadcrumb from "@/components/DataSourceBreadcrumb";
import DataSourcesHeader from "@/components/data-sources/DataSourcesHeader";
import DataSourcesSummary from "@/components/data-sources/DataSourcesSummary";
import DataSourcesFilters from "@/components/data-sources/DataSourcesFilters";
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
          type: ds.S3Path ? "S3" : "RDS", // Mock type based on S3Path
          status: ds.DatasourceStatus,
          connectionString: ds.S3Path || "connection-string",
          lastSync: formatLastActivity(ds.LastUpdationTime),
          records: "N/A", // Mock data
          workspaces: [], // Mock data
          tags: ds.Tags || []
        }));
        setDataSources(transformedDataSources);
        setTotalCount(response.Pagination?.TotalCount || transformedDataSources.length);
      } else {
        setDataSources([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error fetching datasources:', error);
      toast({
        title: "Error",
        description: "Failed to fetch datasources. Please try again.",
        variant: "destructive"
      });
      setDataSources([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const formatLastActivity = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes} minutes ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)} hours ago`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)} days ago`;
    }
  };

  useEffect(() => {
    fetchDataSources();
  }, [currentPage, searchTerm]);

  const handleCreateDataSource = async (name: string, description: string, type: string) => {
    try {
      const createData = {
        DatasourceName: name,
        Description: description,
        Tags: [type] // Use type as initial tag
      };

      const response = await DatasourceService.createDatasource(createData);

      toast({
        title: "Success",
        description: `Data source "${name}" created successfully!`,
      });

      // Refresh datasources list
      await fetchDataSources();
    } catch (error) {
      console.error('Error creating datasource:', error);
      toast({
        title: "Error",
        description: "Failed to create datasource. Please try again.",
        variant: "destructive"
      });
    }
  };

  const filteredDataSources = dataSources.filter(dataSource => {
    const matchesSearch = dataSource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         dataSource.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || dataSource.type.toLowerCase() === typeFilter;
    return matchesSearch && matchesType;
  });

  // Pagination logic
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDataSources = filteredDataSources.slice(startIndex, startIndex + itemsPerPage);

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
      <DataSourceBreadcrumb />
      
      <DataSourcesHeader onCreateDataSource={handleCreateDataSource} />

      <DataSourcesSummary 
        totalDataSources={totalDataSources}
        connectedDataSources={connectedDataSources}
        errorDataSources={errorDataSources}
        syncingDataSources={syncingDataSources}
      />

      <DataSourcesFilters 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
      />

      {filteredDataSources.length > 0 ? (
        <DataSourcesTable 
          dataSources={paginatedDataSources}
          onDataSourceClick={handleDataSourceClick}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      ) : (
        <DataSourcesEmpty 
          searchTerm={searchTerm}
          typeFilter={typeFilter}
          isCreateDialogOpen={isCreateDialogOpen}
          setIsCreateDialogOpen={setIsCreateDialogOpen}
        />
      )}
    </div>
  );
};

export default DataSources;