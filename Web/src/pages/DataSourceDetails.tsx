import { useParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import DataSourceBreadcrumb from "@/components/DataSourceBreadcrumb";
import DataSourceInfo from "@/components/data-source-details/DataSourceInfo";
import FolderFileManager from "@/components/data-source-details/FolderFileManager";
import EditDataSourceDialog from "@/components/data-source-details/EditDataSourceDialog";
import DeleteDataSourceDialog from "@/components/data-source-details/DeleteDataSourceDialog";
import { DatasourceService } from "../services/datasourceService";
import type { DatasourceDetails } from "../services/datasourceService";

const DataSourceDetails = () => {
  const { id } = useParams();
  const [dataSource, setDataSource] = useState<DatasourceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);

  const fetchDataSource = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await DatasourceService.getDatasource(id);
      setDataSource(response);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDataSource();
  }, [fetchDataSource]);

  if (loading) {
    return (
      <div className="space-y-6">
        <DataSourceBreadcrumb />
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold">Loading...</h2>
        </div>
      </div>
    );
  }

  if (error || !dataSource) {
    return (
      <div className="space-y-6">
        <DataSourceBreadcrumb />
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold">Data Source Not Found</h2>
          <p className="text-muted-foreground mt-2">The requested data source could not be found.</p>
        </div>
      </div>
    );
  }

  // Calculate total files
  const totalFiles = Object.values(dataSource.Folders || {}).reduce(
    (total, folder) => total + (folder.Files?.length || 0), 
    0
  );

  return (
    <div className="space-y-6">
      <DataSourceBreadcrumb dataSourceName={dataSource.Datasource.DatasourceName} />
      
      <DataSourceInfo 
        datasource={dataSource.Datasource}
        totalFiles={totalFiles}
        totalSize={dataSource.TotalSize}
        onEdit={() => setEditDialogOpen(true)}
        onDelete={() => setDeleteDialogOpen(true)}
        deleteMode={deleteMode}
      />

      {dataSource.Folders && (
        <FolderFileManager 
          datasourceId={dataSource.Datasource.DatasourceId}
          folders={dataSource.Folders}
          onRefresh={fetchDataSource}
          deleteMode={deleteMode}
          setDeleteMode={setDeleteMode}
        />
      )}

      <EditDataSourceDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        datasource={dataSource.Datasource}
        onSuccess={fetchDataSource}
      />

      <DeleteDataSourceDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        datasourceId={dataSource.Datasource.DatasourceId}
        datasourceName={dataSource.Datasource.DatasourceName}
      />
    </div>
  );
};

export default DataSourceDetails;
