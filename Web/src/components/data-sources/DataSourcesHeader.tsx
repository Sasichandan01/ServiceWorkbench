
import { Button } from "@/components/ui/button";
import { ProtectedButton } from "@/components/ui/protected-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { useState } from "react";

interface DataSourcesHeaderProps {
  onCreateDataSource: (name: string, description: string, type: string) => void;
}

const DataSourcesHeader = ({ onCreateDataSource }: DataSourcesHeaderProps) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [dataSourceName, setDataSourceName] = useState("");
  const [dataSourceDescription, setDataSourceDescription] = useState("");
  const [dataSourceType, setDataSourceType] = useState("");
  const { toast } = useToast();

  const handleCreateDataSource = () => {
    if (!dataSourceName.trim()) {
      toast({
        title: "Error",
        description: "Data source name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!dataSourceDescription.trim()) {
      toast({
        title: "Error",
        description: "Data source description is required.",
        variant: "destructive",
      });
      return;
    }

    if (!dataSourceType) {
      toast({
        title: "Error",
        description: "Data source type is required.",
        variant: "destructive",
      });
      return;
    }

    onCreateDataSource(dataSourceName, dataSourceDescription, dataSourceType);
    resetForm();
    setIsCreateDialogOpen(false);
  };

  const resetForm = () => {
    setDataSourceName("");
    setDataSourceDescription("");
    setDataSourceType("");
  };

  return (
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Data Sources</h1>
        <p className="text-gray-600">Manage connections to your data repositories</p>
      </div>
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <ProtectedButton 
            resource="datasources" 
            action="manage"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Data Source
          </ProtectedButton>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Data Source</DialogTitle>
            <DialogDescription>
              Connect a new data source to your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dataSourceName">Data Source Name <span className="text-red-500">*</span></Label>
              <Input
                id="dataSourceName"
                placeholder="Enter data source name"
                value={dataSourceName}
                onChange={(e) => setDataSourceName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataSourceDescription">Description <span className="text-red-500">*</span></Label>
              <Input
                id="dataSourceDescription"
                placeholder="Describe your data source"
                value={dataSourceDescription}
                onChange={(e) => setDataSourceDescription(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataSourceType">Type <span className="text-red-500">*</span></Label>
              <Select value={dataSourceType} onValueChange={setDataSourceType} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select data source type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S3">S3</SelectItem>
                  <SelectItem value="DynamoDB">DynamoDB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                resetForm();
                setIsCreateDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateDataSource} className="bg-blue-600 hover:bg-blue-700">
              Add Data Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DataSourcesHeader;
