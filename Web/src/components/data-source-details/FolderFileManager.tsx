import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { 
  Upload, 
  FolderPlus, 
  Trash2,
  FileText,
  Folder,
  ArrowLeft,
  Calendar,
  MoreVertical,
  Download
} from "lucide-react";
import { DatasourceService } from "@/services/datasourceService";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FolderStructure, S3File } from "@/services/datasourceService";

interface FolderFileManagerProps {
  datasourceId: string;
  folders: FolderStructure;
  onRefresh: () => void;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
}

interface DisplayItem {
  name: string;
  type: 'folder' | 'file';
  size: string;
  lastModified: string;
  s3Key?: string;
  isFolder?: boolean;
}

const FolderFileManager = ({ datasourceId, folders, onRefresh }: FolderFileManagerProps) => {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const itemsPerPage = 10;
  const { toast } = useToast();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Get current folder data
  const getCurrentFolderData = (): DisplayItem[] => {
    if (currentFolder === "") {
      // Root level - show all folders + root files
      const items: DisplayItem[] = [];
      
      // Add folders (excluding Root)
      Object.keys(folders).forEach(folderName => {
        if (folderName !== "Root") {
          items.push({
            name: folderName,
            type: 'folder',
            size: '-',
            lastModified: '-',
            isFolder: true
          });
        }
      });

      // Add root files
      if (folders.Root?.Files) {
        folders.Root.Files.forEach(file => {
          items.push({
            name: file.FileName,
            type: 'file',
            size: formatFileSize(file.Size),
            lastModified: new Date(file.LastModified).toLocaleDateString(),
            s3Key: file.S3Key
          });
        });
      }

      return items;
    } else {
      // Inside a specific folder
      const folderData = folders[currentFolder];
      if (!folderData?.Files) return [];
      
      return folderData.Files.map(file => ({
        name: file.FileName,
        type: 'file' as const,
        size: formatFileSize(file.Size),
        lastModified: new Date(file.LastModified).toLocaleDateString(),
        s3Key: file.S3Key
      }));
    }
  };

  const currentItems = getCurrentFolderData();
  const totalPages = Math.ceil(currentItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = currentItems.slice(startIndex, startIndex + itemsPerPage);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    if (uploadedFiles.length > 10) {
      toast({
        title: "Error",
        description: "Maximum 10 files can be uploaded at once",
        variant: "destructive",
      });
      return;
    }

    // Validate file types
    const allowedTypes = ['csv', 'json', 'txt'];
    const invalidFiles = Array.from(uploadedFiles).filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return !extension || !allowedTypes.includes(extension);
    });

    if (invalidFiles.length > 0) {
      toast({
        title: "Error",
        description: `Only CSV, JSON, and TXT files are allowed. Invalid files: ${invalidFiles.map(f => f.name).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const files = Array.from(uploadedFiles);
    
    // Initialize progress tracking
    const initialProgress = files.map(file => ({
      fileName: file.name,
      progress: 0,
      status: 'uploading' as const
    }));
    setUploadProgress(initialProgress);

    try {
      // Step 1: Get presigned URLs
      const fileData = files.map(file => ({
        FileName: file.name,
        Type: file.name.split('.').pop()?.toLowerCase() || ''
      }));

      const response = await DatasourceService.getPresignedUrls(datasourceId, fileData);
      
      // Step 2: Upload files to S3 with progress tracking
      const uploadPromises = files.map(async (file) => {
        const presignedData = response.PreSignedURL.find(p => p.FileName === file.name);
        if (!presignedData) {
          throw new Error(`No presigned URL found for ${file.name}`);
        }

        return new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = (e.loaded / e.total) * 100;
              setUploadProgress(prev => 
                prev.map(p => 
                  p.fileName === file.name 
                    ? { ...p, progress: percentComplete }
                    : p
                )
              );
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
              setUploadProgress(prev => 
                prev.map(p => 
                  p.fileName === file.name 
                    ? { ...p, progress: 100, status: 'completed' }
                    : p
                )
              );
              resolve();
            } else {
              setUploadProgress(prev => 
                prev.map(p => 
                  p.fileName === file.name 
                    ? { ...p, status: 'error' }
                    : p
                )
              );
              reject(new Error(`Upload failed for ${file.name}`));
            }
          });

          xhr.addEventListener('error', () => {
            setUploadProgress(prev => 
              prev.map(p => 
                p.fileName === file.name 
                  ? { ...p, status: 'error' }
                  : p
              )
            );
            reject(new Error(`Upload failed for ${file.name}`));
          });

          xhr.open('PUT', presignedData.Url);
          xhr.send(file);
        });
      });

      await Promise.all(uploadPromises);
      
      toast({
        title: "Success",
        description: `${files.length} file(s) uploaded successfully`,
      });
      
      onRefresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress([]), 3000); // Clear progress after 3 seconds
    }

    // Clear the input
    event.target.value = '';
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a folder name.",
        variant: "destructive",
      });
      return;
    }

    // Check if folder already exists
    const folderExists = Object.keys(folders).some(
      folderName => folderName.toLowerCase() === newFolderName.trim().toLowerCase()
    );

    if (folderExists) {
      toast({
        title: "Error",
        description: `Folder "${newFolderName}" already exists`,
        variant: "destructive",
      });
      return;
    }

    try {
      await DatasourceService.createFolder(datasourceId, newFolderName.trim());
      toast({
        title: "Success",
        description: `Folder "${newFolderName}" created successfully`,
      });
      setNewFolderName("");
      setIsCreateFolderOpen(false);
      onRefresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Error",
        description: "Please select files to delete.",
        variant: "destructive",
      });
      return;
    }

    try {
      const deletePromises = selectedFiles.map(s3Key => 
        DatasourceService.deleteFile(datasourceId, s3Key)
      );
      
      await Promise.all(deletePromises);
      
      toast({
        title: "Success",
        description: `${selectedFiles.length} file(s) deleted successfully!`,
      });
      
      setSelectedFiles([]);
      onRefresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete files. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    const fileItems = paginatedItems.filter(item => item.type === 'file' && item.s3Key);
    if (checked) {
      const newSelections = fileItems.map(item => item.s3Key!).filter(s3Key => !selectedFiles.includes(s3Key));
      setSelectedFiles([...selectedFiles, ...newSelections]);
    } else {
      const fileS3Keys = fileItems.map(item => item.s3Key!);
      setSelectedFiles(selectedFiles.filter(s3Key => !fileS3Keys.includes(s3Key)));
    }
  };

  const handleSelectFile = (s3Key: string, checked: boolean) => {
    if (checked) {
      setSelectedFiles([...selectedFiles, s3Key]);
    } else {
      setSelectedFiles(selectedFiles.filter(key => key !== s3Key));
    }
  };

  const handleFolderClick = (folderName: string) => {
    setCurrentFolder(folderName);
    setCurrentPage(1);
    setSelectedFiles([]);
  };

  const handleBackToRoot = () => {
    setCurrentFolder("");
    setCurrentPage(1);
    setSelectedFiles([]);
  };

  const getFileIcon = (item: DisplayItem) => {
    if (item.type === 'folder') {
      return <Folder className="w-5 h-5 text-primary" />;
    }
    return <FileText className="w-5 h-5 text-muted-foreground" />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              {currentFolder && (
                <Button variant="ghost" size="sm" onClick={handleBackToRoot}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              Files & Objects
              {currentFolder && (
                <span className="text-muted-foreground">/ {currentFolder}</span>
              )}
            </CardTitle>
            <CardDescription>
              {currentFolder 
                ? `Managing files in ${currentFolder} folder`
                : "Manage files and folders in your datasource"
              }
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <FolderPlus className="w-4 h-4 mr-2" />
                  Create Folder
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Folder</DialogTitle>
                  <DialogDescription>
                    Enter a name for the new folder. It will be created in the current location.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateFolder}>
                    Create Folder
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <input
              type="file"
              multiple
              accept=".csv,.json,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={isUploading}
            />
            <label htmlFor="file-upload">
              <Button className="cursor-pointer" disabled={isUploading}>
                <Upload className="w-4 h-4 mr-2" />
                {isUploading ? "Uploading..." : "Upload Files"}
              </Button>
            </label>
            
            {selectedFiles.length > 0 && (
              <Button variant="destructive" onClick={handleDeleteSelected}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedFiles.length})
              </Button>
            )}
          </div>
        </div>
        
        {/* Upload Progress */}
        {uploadProgress.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium">Upload Progress</h4>
            {uploadProgress.map((progress) => (
              <div key={progress.fileName} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{progress.fileName}</span>
                  <span className={
                    progress.status === 'completed' ? 'text-green-600' :
                    progress.status === 'error' ? 'text-red-600' : 'text-blue-600'
                  }>
                    {progress.status === 'completed' ? '✓ Complete' :
                     progress.status === 'error' ? '✗ Error' : 
                     `${Math.round(progress.progress)}%`}
                  </span>
                </div>
                <Progress 
                  value={progress.progress} 
                  className="h-2"
                />
              </div>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {currentItems.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 pb-4 border-b">
              <Checkbox 
                id="select-all"
                checked={
                  paginatedItems.filter(item => item.type === 'file').length > 0 &&
                  paginatedItems.filter(item => item.type === 'file' && item.s3Key).every(item => selectedFiles.includes(item.s3Key!))
                }
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                Select All Files ({paginatedItems.filter(item => item.type === 'file').length} files)
              </label>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((item, index) => (
                  <TableRow key={startIndex + index} className="hover:bg-muted/50">
                    <TableCell>
                      {item.type === 'file' && item.s3Key && (
                        <Checkbox 
                          id={`item-${index}`}
                          checked={selectedFiles.includes(item.s3Key)}
                          onCheckedChange={(checked) => handleSelectFile(item.s3Key!, checked as boolean)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div 
                        className={`flex items-center space-x-3 ${item.type === 'folder' ? 'cursor-pointer hover:text-primary' : ''}`}
                        onClick={item.type === 'folder' ? () => handleFolderClick(item.name) : undefined}
                      >
                        {getFileIcon(item)}
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>
                      {item.lastModified !== '-' && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{item.lastModified}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.type === 'file' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem>
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => item.s3Key && handleSelectFile(item.s3Key, true)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No files found</h3>
            <p className="text-muted-foreground mb-4">
              {currentFolder 
                ? `No files in ${currentFolder} folder yet`
                : "Upload your first files to get started"
              }
            </p>
            <div className="flex gap-2 justify-center">
              <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <FolderPlus className="w-4 h-4 mr-2" />
                    Create Folder
                  </Button>
                </DialogTrigger>
              </Dialog>
              <label htmlFor="file-upload-empty">
                <input
                  type="file"
                  multiple
                  accept=".csv,.json,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload-empty"
                  disabled={isUploading}
                />
                <Button className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Files
                </Button>
              </label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FolderFileManager;