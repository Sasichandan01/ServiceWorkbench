import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ProtectedButton } from "@/components/ui/protected-button";
import DataSourceBreadcrumb from "@/components/DataSourceBreadcrumb";
import DataSourcesHeader from "@/components/data-sources/DataSourcesHeader";
import DataSourcesSummary from "@/components/data-sources/DataSourcesSummary";
import DataSourcesFilters from "@/components/data-sources/DataSourcesFilters";
import DataSourcesTable from "@/components/data-sources/DataSourcesTable";
import DataSourcesEmpty from "@/components/data-sources/DataSourcesEmpty";

const DataSources = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { toast } = useToast();

  const [dataSources, setDataSources] = useState([
    {
      id: 1,
      name: "Customer Database",
      description: "Primary customer data from production RDS",
      type: "RDS",
      status: "Connected",
      connectionString: "prod-customer-db.amazonaws.com",
      lastSync: "2 minutes ago",
      records: "2.5M",
      workspaces: ["Analytics Workspace", "Customer Analytics"],
      tags: ["production", "customer", "pii"]
    },
    {
      id: 2,
      name: "Sales Data Warehouse",
      description: "Historical sales data in Redshift",
      type: "Redshift",
      status: "Connected",
      connectionString: "sales-warehouse.redshift.amazonaws.com",
      lastSync: "15 minutes ago",
      records: "8.7M",
      workspaces: ["Analytics Workspace", "Data Lake Processing"],
      tags: ["sales", "warehouse", "historical"]
    },
    {
      id: 3,
      name: "Application Logs",
      description: "Real-time application logs from S3",
      type: "S3",
      status: "Connected",
      connectionString: "s3://app-logs-bucket/",
      lastSync: "1 minute ago",
      records: "150GB",
      workspaces: ["Development Sandbox", "Data Lake Processing"],
      tags: ["logs", "real-time", "monitoring"]
    },
    {
      id: 4,
      name: "User Activity Stream",
      description: "User behavior tracking data",
      type: "DynamoDB",
      status: "Error",
      connectionString: "user-activity-table",
      lastSync: "2 hours ago",
      records: "12.3M",
      workspaces: ["ML Training Environment"],
      tags: ["user-behavior", "streaming", "ml"]
    },
    {
      id: 5,
      name: "Marketing Data",
      description: "Campaign performance and attribution data",
      type: "S3",
      status: "Syncing",
      connectionString: "s3://marketing-data/",
      lastSync: "Syncing...",
      records: "45.2K",
      workspaces: ["Customer Analytics"],
      tags: ["marketing", "campaigns", "attribution"]
    }
  ]);

  const handleCreateDataSource = (name: string, description: string, type: string) => {
    const newDataSource = {
      id: Math.max(...dataSources.map(ds => ds.id)) + 1,
      name,
      description,
      type,
      status: "Connected",
      connectionString: "new-connection-string",
      lastSync: "Just now",
      records: "0",
      workspaces: [],
      tags: []
    };

    setDataSources([newDataSource, ...dataSources]);

    console.log("Creating data source:", { name, description, type });

    toast({
      title: "Success",
      description: `Data source "${name}" created successfully!`,
    });
  };

  const filteredDataSources = dataSources.filter(dataSource => {
    const matchesSearch = dataSource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         dataSource.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || dataSource.type.toLowerCase() === typeFilter;
    return matchesSearch && matchesType;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredDataSources.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDataSources = filteredDataSources.slice(startIndex, startIndex + itemsPerPage);

  // Calculate data source statistics
  const totalDataSources = dataSources.length;
  const connectedDataSources = dataSources.filter(ds => ds.status === "Connected").length;
  const errorDataSources = dataSources.filter(ds => ds.status === "Error").length;
  const syncingDataSources = dataSources.filter(ds => ds.status === "Syncing").length;

  const handleDataSourceClick = (dataSourceId: number) => {
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
