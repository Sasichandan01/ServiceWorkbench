import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { DatasourceService } from "@/services/datasourceService";
import { useNavigate } from "react-router-dom";

interface DeleteDataSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasourceId: string;
  datasourceName: string;
}

const DeleteDataSourceDialog = ({ open, onOpenChange, datasourceId, datasourceName }: DeleteDataSourceDialogProps) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      await DatasourceService.deleteDatasource(datasourceId);
      
      toast({
        title: "Success",
        description: "Datasource deleted successfully",
      });

      navigate("/data-sources");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.data?.message || error?.message || (typeof error === 'string' ? error : 'An error occurred.'),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              This action cannot be undone. This will permanently delete the datasource 
              <strong className="font-semibold"> "{datasourceName}" </strong>
              and remove all associated files from our servers.
            </p>
            <p className="text-destructive font-medium">
              All files will be deleted and this action is irreversible.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete Datasource"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteDataSourceDialog;