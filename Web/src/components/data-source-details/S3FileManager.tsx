
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, FileText, Download, Calendar, Folder, FolderOpen } from "lucide-react";

interface S3File {
  name: string;
  size: string;
  lastModified: string;
  type: string;
}

interface S3FileManagerProps {
  files: S3File[];
  onFilesChange: (files: S3File[]) => void;
}

const S3FileManager = ({ files, onFilesChange }: S3FileManagerProps) => {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPath, setCurrentPath] = useState<string>("");
  const itemsPerPage = 10;
  const { toast } = useToast();

  // Mock folder structure
  const [folders] = useState([
    { name: "logs/", type: "folder", size: "-", lastModified: "2024-01-20" },
    { name: "data/", type: "folder", size: "-", lastModified: "2024-01-22" },
    { name: "backups/", type: "folder", size: "-", lastModified: "2024-01-25" }
  ]);

  // Combine folders and files for display
  const allItems = [...folders, ...files.map(file => ({ ...file, type: file.type || 'file' }))];

  // Pagination logic
  const totalPages = Math.ceil(allItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = allItems.slice(startIndex, startIndex + itemsPerPage);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (uploadedFiles) {
      const newFiles = Array.from(uploadedFiles).map(file => ({
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        lastModified: new Date().toISOString().split('T')[0],
        type: file.type || 'unknown'
      }));

      onFilesChange([...files, ...newFiles]);
      
      toast({
        title: "Success",
        description: `${newFiles.length} file(s) uploaded successfully!`,
      });
    }
    event.target.value = '';
  };

  const handleDeleteSelected = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Error",
        description: "Please select files to delete.",
        variant: "destructive",
      });
      return;
    }

    const remainingFiles = files.filter(file => !selectedFiles.includes(file.name));
    onFilesChange(remainingFiles);
    setSelectedFiles([]);

    toast({
      title: "Success",
      description: `${selectedFiles.length} file(s) deleted successfully!`,
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const fileNames = paginatedItems.filter(item => item.type !== 'folder').map(item => item.name);
      setSelectedFiles([...selectedFiles, ...fileNames.filter(name => !selectedFiles.includes(name))]);
    } else {
      const fileNames = paginatedItems.filter(item => item.type !== 'folder').map(item => item.name);
      setSelectedFiles(selectedFiles.filter(name => !fileNames.includes(name)));
    }
  };

  const handleSelectFile = (fileName: string, checked: boolean) => {
    if (checked) {
      setSelectedFiles([...selectedFiles, fileName]);
    } else {
      setSelectedFiles(selectedFiles.filter(name => name !== fileName));
    }
  };

  const getFileIcon = (item: any) => {
    if (item.type === 'folder') {
      return <Folder className="w-5 h-5 text-blue-600" />;
    }
    return <FileText className="w-5 h-5 text-gray-600" />;
  };

  const formatSize = (size: string) => {
    return size === '-' ? '-' : size;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Files & Objects</CardTitle>
            <CardDescription>Manage files stored in your S3 bucket</CardDescription>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <Button className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Upload Files
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
      </CardHeader>
      <CardContent>
        {allItems.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 pb-4 border-b">
              <Checkbox 
                id="select-all"
                checked={paginatedItems.filter(item => item.type !== 'folder').every(item => selectedFiles.includes(item.name)) && paginatedItems.filter(item => item.type !== 'folder').length > 0}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                Select All Files ({paginatedItems.filter(item => item.type !== 'folder').length} files)
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
                  <TableRow key={startIndex + index} className="hover:bg-gray-50">
                    <TableCell>
                      {item.type !== 'folder' && (
                        <Checkbox 
                          id={`item-${index}`}
                          checked={selectedFiles.includes(item.name)}
                          onCheckedChange={(checked) => handleSelectFile(item.name, checked as boolean)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        {getFileIcon(item)}
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatSize(item.size)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{item.lastModified}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.type !== 'folder' && (
                        <Button variant="ghost" size="sm">
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
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
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No files found</h3>
            <p className="text-gray-600 mb-4">Upload your first files to get started</p>
            <label htmlFor="file-upload">
              <Button className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Upload Files
              </Button>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default S3FileManager;
