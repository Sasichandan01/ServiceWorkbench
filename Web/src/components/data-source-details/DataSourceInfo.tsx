import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

interface DataSourceInfoProps {
  datasource: {
    DatasourceId: string;
    DatasourceName: string;
    Description?: string;
    CreatedBy: string;
    CreationTime: string;
    LastUpdatedBy: string;
    LastUpdationTime: string;
    Tags?: string[];
    DatasourceStatus: string;
  };
  totalFiles: number;
  totalSize?: number;
  onEdit: () => void;
  onDelete: () => void;
  deleteMode?: boolean;
}

const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null) return 'N/A';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const DataSourceInfo = ({ datasource, totalFiles, totalSize, onEdit, onDelete, deleteMode }: DataSourceInfoProps) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-xl font-semibold">Datasource Information</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={deleteMode}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleteMode}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Name</label>
            <p className="text-sm font-semibold">{datasource.DatasourceName}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Created By</label>
            <p className="text-sm">{datasource.CreatedBy}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Total Size</label>
            <p className="text-sm font-semibold">{formatBytes(totalSize)}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Total Files</label>
            <p className="text-sm font-semibold">{totalFiles}</p>
          </div>
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Created</label>
              <p className="text-sm">{formatDate(datasource.CreationTime)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
              <p className="text-sm">{formatDate(datasource.LastUpdationTime)}</p>
            </div>
          </div>
        </div>
        {datasource.Description && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Description</label>
            <p className="text-sm">{datasource.Description}</p>
          </div>
        )}
        {datasource.Tags && datasource.Tags.length > 0 && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Tags</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {datasource.Tags.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DataSourceInfo;