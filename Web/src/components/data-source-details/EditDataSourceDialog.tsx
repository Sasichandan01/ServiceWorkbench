import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DatasourceService } from "@/services/datasourceService";
import type { Datasource } from "@/services/datasourceService";

interface EditDataSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasource: {
    DatasourceId: string;
    DatasourceName: string;
    Description?: string;
    Tags?: string[];
  };
  onSuccess: () => void;
}

const EditDataSourceDialog = ({ open, onOpenChange, datasource, onSuccess }: EditDataSourceDialogProps) => {
  const [name, setName] = useState(datasource.DatasourceName);
  const [description, setDescription] = useState(datasource.Description || "");
  const [tags, setTags] = useState<string[]>(datasource.Tags || []);
  const [newTag, setNewTag] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loadingDatasources, setLoadingDatasources] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchDatasources();
    }
  }, [open]);

  const fetchDatasources = async () => {
    setLoadingDatasources(true);
    try {
      const response = await DatasourceService.getDatasources({ limit: 100 });
      setDatasources(response.Datasources);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load datasources",
        variant: "destructive",
      });
    } finally {
      setLoadingDatasources(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await DatasourceService.updateDatasource(datasource.DatasourceId, {
        DatasourceName: name,
        Description: description,
        Tags: tags,
      });

      toast({
        title: "Success",
        description: "Datasource updated successfully",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Datasource</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Reference Datasources</Label>
            <Select disabled={loadingDatasources}>
              <SelectTrigger>
                <SelectValue placeholder={loadingDatasources ? "Loading..." : "Browse existing datasources"} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {datasources.map((ds) => (
                  <SelectItem key={ds.DatasourceId} value={ds.DatasourceId} className="p-3">
                    <div className="flex items-start gap-3 w-full">
                      <Database className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{ds.DatasourceName}</div>
                        <div className="text-xs text-muted-foreground truncate">{ds.Description}</div>
                        {ds.Tags && ds.Tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {ds.Tags.slice(0, 3).map((tag, index) => (
                              <Badge key={index} variant="outline" className="text-xs px-1 py-0">
                                {tag}
                              </Badge>
                            ))}
                            {ds.Tags.length > 3 && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                +{ds.Tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              />
              <Button type="button" onClick={handleAddTag} variant="outline" size="sm">
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs flex items-center gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-destructive hover:text-destructive-foreground rounded-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditDataSourceDialog;