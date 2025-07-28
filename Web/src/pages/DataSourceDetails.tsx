import { useParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import DataSourceBreadcrumb from "@/components/DataSourceBreadcrumb";
import DataSourceInfo from "@/components/data-source-details/DataSourceInfo";
import FolderFileManager from "@/components/data-source-details/FolderFileManager";
import EditDataSourceDialog from "@/components/data-source-details/EditDataSourceDialog";
import DeleteDataSourceDialog from "@/components/data-source-details/DeleteDataSourceDialog";
import { DatasourceService } from "../services/datasourceService";
import type { DatasourceDetails } from "../services/datasourceService";
import WorkspaceAuditLogs from "@/components/WorkspaceAuditLogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, Loader2, Mail, Search } from "lucide-react";
import { useShareResourceMutation, useDeleteShareResourceMutation } from "../services/apiSlice";
import { useToast } from "@/hooks/use-toast";
import { useAppSelector } from "@/hooks/useAppSelector";

const DataSourceDetails = () => {
  const { id } = useParams();
  const [dataSource, setDataSource] = useState<DatasourceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [shareResource, { isLoading: isSharing }] = useShareResourceMutation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("files");
  const [usersSearch, setUsersSearch] = useState("");
  // Assume dataSource.Users is an array of user objects if provided by backend
  const users = (dataSource as any)?.Users || [];
  const filteredUsers = usersSearch
    ? users.filter((user: any) =>
        user.Username?.toLowerCase().includes(usersSearch.toLowerCase()) ||
        user.Email?.toLowerCase().includes(usersSearch.toLowerCase()) ||
        user.Access?.toLowerCase().includes(usersSearch.toLowerCase())
      )
    : users;
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [userToRevoke, setUserToRevoke] = useState<any>(null);
  const [deleteShareResource, { isLoading: isRevoking }] = useDeleteShareResourceMutation();
  const loggedInUser = useAppSelector(state => state.auth.user);

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

  const handleShare = async () => {
    if (!shareEmail.trim()) {
      toast({
        title: "Error",
        description: "Email is required.",
        variant: "destructive",
      });
      return;
    }
    try {
      await shareResource({
        Username: shareEmail,
        ResourceType: 'datasource',
        ResourceId: dataSource.Datasource.DatasourceId,
        AccessType: shareRole as 'owner' | 'read-only' | 'editor',
      }).unwrap();
      toast({
        title: "Success",
        description: `Access granted!`,
      });
      setShareEmail("");
      setShareRole("viewer");
      setIsShareDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.data?.message || error?.message || (typeof error === 'string' ? error : 'An error occurred.'),
        variant: "destructive",
      });
    }
  };

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
      <div className="flex justify-between items-center">
        <DataSourceBreadcrumb dataSourceName={dataSource.Datasource.DatasourceName} />
        {/* Remove Share button from here */}
      </div>
      {/* Always show details and activity logs above the tabs */}
      <div className="grid grid-cols-1 xl:grid-cols-4 lg:grid-cols-3 gap-6">
        <div className="xl:col-span-3 lg:col-span-2 space-y-6">
          <DataSourceInfo 
            datasource={dataSource.Datasource}
            totalFiles={totalFiles}
            totalSize={dataSource.TotalSize}
            onEdit={() => setEditDialogOpen(true)}
            onDelete={() => setDeleteDialogOpen(true)}
            deleteMode={deleteMode}
          />
        </div>
        <div className="space-y-6">
          <WorkspaceAuditLogs 
            datasourceId={dataSource.Datasource.DatasourceId}
            title="Data Source Activity"
          />
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="files">Files and Objects</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="space-y-6">
          {/* Only show the folder/file manager here */}
          {dataSource.Folders && (
            <FolderFileManager 
              datasourceId={dataSource.Datasource.DatasourceId}
              folders={dataSource.Folders}
              onRefresh={fetchDataSource}
              deleteMode={deleteMode}
              setDeleteMode={setDeleteMode}
            />
          )}
        </TabsContent>
        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage users and their permissions for this data source</CardDescription>
                </div>
                <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Share
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Share Data Source</DialogTitle>
                      <DialogDescription>
                        Invite a user to access this data source by entering their email address or user ID.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Username <span className="text-red-500">*</span></Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="enter email or userid"
                          value={shareEmail}
                          onChange={(e) => setShareEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Access Level <span className="text-red-500">*</span></Label>
                        <Select value={shareRole} onValueChange={setShareRole}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="read-only">ReadOnly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleShare} disabled={isSharing}>
                        {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Grant Access"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search users by name, email, or role..."
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {/* Users Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Access Level</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                          No users found for this data source.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user: any, idx: number) => (
                        <TableRow key={user.UserId || idx}>
                          <TableCell>
                            <div className="font-medium text-gray-900">{user.Username}</div>
                            <div className="text-sm text-gray-600 flex items-center space-x-1">
                              <Mail className="w-3 h-3" />
                              <span>{user.Email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-800 border-gray-200">
                              {user.Access}
                            </span>
                          </TableCell>
                          <TableCell>{user.Joined || "-"}</TableCell>
                          <TableCell>
                            {user.UserId !== loggedInUser?.username && (
                              <Dialog open={revokeDialogOpen && userToRevoke?.UserId === user.UserId} onOpenChange={open => { setRevokeDialogOpen(open); if (!open) setUserToRevoke(null); }}>
                                <DialogTrigger asChild>
                                  <Button variant="destructive" size="sm" onClick={() => { setUserToRevoke(user); setRevokeDialogOpen(true); }}>
                                    Revoke
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Revoke Access</DialogTitle>
                                    <DialogDescription>
                                      User access will be revoked and they will no longer be able to access this datasource.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>Cancel</Button>
                                    <Button variant="destructive" onClick={async () => {
                                      try {
                                        await deleteShareResource({
                                          Username: user.Username,
                                          ResourceType: 'datasource',
                                          ResourceId: dataSource.Datasource.DatasourceId,
                                        }).unwrap();
                                        toast({ title: 'Access Revoked', description: 'User access has been revoked.' });
                                        setRevokeDialogOpen(false);
                                        setUserToRevoke(null);
                                      } catch (e: any) {
                                        toast({ title: 'Error', description: e?.data?.message || e?.message || (typeof e === 'string' ? e : 'An error occurred.'), variant: 'destructive' });
                                      }
                                    }} disabled={isRevoking}>
                                      {isRevoking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
