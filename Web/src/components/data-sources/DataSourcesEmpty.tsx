
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Database, Plus } from "lucide-react";

interface DataSourcesEmptyProps {
  searchTerm: string;
  typeFilter: string;
  isCreateDialogOpen: boolean;
  setIsCreateDialogOpen: (open: boolean) => void;
}

const DataSourcesEmpty = ({ 
  searchTerm, 
  typeFilter, 
  isCreateDialogOpen, 
  setIsCreateDialogOpen 
}: DataSourcesEmptyProps) => {
  return (
    <Card>
      <CardContent className="text-center py-12">
        <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No data sources</h3>
        <p className="text-gray-600 mb-4">
          {searchTerm || typeFilter !== "all" 
            ? "Try adjusting your filters" 
            : "Add your first data source to get started"
          }
        </p>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Data Source
            </Button>
          </DialogTrigger>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default DataSourcesEmpty;
