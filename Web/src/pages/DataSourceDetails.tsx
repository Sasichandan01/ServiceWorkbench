import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import DataSourceBreadcrumb from "@/components/DataSourceBreadcrumb";
import DataSourceOverview from "@/components/data-source-details/DataSourceOverview";
import S3FileManager from "@/components/data-source-details/S3FileManager";
import DynamoDBManager from "@/components/data-source-details/DynamoDBManager";
import { DatasourceService } from "../services/datasourceService";

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
  const [dataSource, setDataSource] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    DatasourceService.getDatasource(id)
      .then((response) => {
        setDataSource(response);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load data source details.");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <DataSourceBreadcrumb />
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900">Loading...</h2>
        </div>
      </div>
    );
  }

  if (error || !dataSource) {
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

  return (
    <div className="space-y-6">
      <DataSourceBreadcrumb dataSourceName={dataSource.DatasourceName} />
      
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
