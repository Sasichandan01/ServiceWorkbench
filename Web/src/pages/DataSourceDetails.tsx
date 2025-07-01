import { useParams } from "react-router-dom";
import { useState } from "react";
import DataSourceBreadcrumb from "@/components/DataSourceBreadcrumb";
import DataSourceOverview from "@/components/data-source-details/DataSourceOverview";
import S3FileManager from "@/components/data-source-details/S3FileManager";
import DynamoDBManager from "@/components/data-source-details/DynamoDBManager";

interface S3File {
  name: string;
  size: string;
  lastModified: string;
  type: string;
}

interface DynamoRecord {
  id: string;
  [key: string]: any;
}

const DataSourceDetails = () => {
  const { id } = useParams();
  
  // Mock data based on the ID from URL params
  const getDataSourceById = (dataSourceId: string) => {
    const dataSources = {
      "1": {
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
      "2": {
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
      "3": {
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
      "4": {
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
      "5": {
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
    };
    
    return dataSources[dataSourceId as keyof typeof dataSources] || null;
  };

  const [dataSource] = useState(() => getDataSourceById(id || "1"));

  const [files, setFiles] = useState<S3File[]>([
    { name: "customer_data_01.csv", size: "2.3 MB", lastModified: "2024-01-20", type: "text/csv" },
    { name: "customer_data_02.csv", size: "2.5 MB", lastModified: "2024-01-22", type: "text/csv" },
    { name: "customer_data_03.csv", size: "2.7 MB", lastModified: "2024-01-25", type: "text/csv" }
  ]);

  const [records, setRecords] = useState<DynamoRecord[]>([
    { id: "1", userId: "user123", eventType: "login", timestamp: "2024-01-26T10:00:00Z" },
    { id: "2", userId: "user456", eventType: "logout", timestamp: "2024-01-26T10:15:00Z" },
    { id: "3", userId: "user123", eventType: "purchase", timestamp: "2024-01-26T10:30:00Z" }
  ]);

  if (!dataSource) {
    return (
      <div className="space-y-6">
        <DataSourceBreadcrumb />
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900">Data Source Not Found</h2>
          <p className="text-gray-600 mt-2">The requested data source could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DataSourceBreadcrumb dataSourceName={dataSource.name} />
      
      <DataSourceOverview dataSource={dataSource} />

      {dataSource.type === "S3" ? (
        <S3FileManager 
          files={files}
          onFilesChange={setFiles}
        />
      ) : dataSource.type === "DynamoDB" ? (
        <DynamoDBManager 
          records={records}
          onRecordsChange={setRecords}
        />
      ) : (
        <div className="text-center py-12">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Data Source Type Not Supported</h3>
          <p className="text-gray-600">This data source type is not yet supported for management.</p>
        </div>
      )}
    </div>
  );
};

export default DataSourceDetails;
