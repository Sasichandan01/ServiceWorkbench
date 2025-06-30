
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Upload, Trash2, Edit, Database } from "lucide-react";

interface DynamoRecord {
  id: string;
  [key: string]: any;
}

interface DynamoDBManagerProps {
  records: DynamoRecord[];
  onRecordsChange: (records: DynamoRecord[]) => void;
}

const DynamoDBManager = ({ records, onRecordsChange }: DynamoDBManagerProps) => {
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DynamoRecord | null>(null);
  const [newRecord, setNewRecord] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Get all unique column names from records
  const getAllColumns = () => {
    const columns = new Set<string>();
    records.forEach(record => {
      Object.keys(record).forEach(key => columns.add(key));
    });
    return Array.from(columns);
  };

  const columns = getAllColumns();

  const handleJSONUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target?.result as string);
          const newRecords = Array.isArray(jsonData) ? jsonData : [jsonData];
          
          const recordsWithIds = newRecords.map((record, index) => ({
            id: record.id || `record_${Date.now()}_${index}`,
            ...record
          }));

          onRecordsChange([...records, ...recordsWithIds]);
          
          toast({
            title: "Success",
            description: `${recordsWithIds.length} record(s) uploaded successfully!`,
          });
        } catch (error) {
          toast({
            title: "Error",
            description: "Invalid JSON file format.",
            variant: "destructive",
          });
        }
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  const handleAddRecord = () => {
    if (Object.keys(newRecord).length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one field.",
        variant: "destructive",
      });
      return;
    }

    const recordWithId = {
      id: `record_${Date.now()}`,
      ...newRecord
    };

    onRecordsChange([...records, recordWithId]);
    setNewRecord({});
    setIsAddDialogOpen(false);

    toast({
      title: "Success",
      description: "Record added successfully!",
    });
  };

  const handleEditRecord = () => {
    if (!editingRecord) return;

    const updatedRecords = records.map(record => 
      record.id === editingRecord.id ? editingRecord : record
    );

    onRecordsChange(updatedRecords);
    setEditingRecord(null);
    setIsEditDialogOpen(false);

    toast({
      title: "Success",
      description: "Record updated successfully!",
    });
  };

  const handleDeleteSelected = () => {
    if (selectedRecords.length === 0) {
      toast({
        title: "Error",
        description: "Please select records to delete.",
        variant: "destructive",
      });
      return;
    }

    const remainingRecords = records.filter(record => !selectedRecords.includes(record.id));
    onRecordsChange(remainingRecords);
    setSelectedRecords([]);

    toast({
      title: "Success",
      description: `${selectedRecords.length} record(s) deleted successfully!`,
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRecords(records.map(record => record.id));
    } else {
      setSelectedRecords([]);
    }
  };

  const handleSelectRecord = (recordId: string, checked: boolean) => {
    if (checked) {
      setSelectedRecords([...selectedRecords, recordId]);
    } else {
      setSelectedRecords(selectedRecords.filter(id => id !== recordId));
    }
  };

  const openEditDialog = (record: DynamoRecord) => {
    setEditingRecord({ ...record });
    setIsEditDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Table Records</CardTitle>
            <CardDescription>Manage records in your DynamoDB table</CardDescription>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".json"
              onChange={handleJSONUpload}
              className="hidden"
              id="json-upload"
            />
            <label htmlFor="json-upload">
              <Button variant="outline" className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Upload JSON
              </Button>
            </label>
            
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Record
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Record</DialogTitle>
                  <DialogDescription>Add a new record to the table</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Add Fields (Key-Value pairs)</Label>
                    <div className="space-y-2">
                      {Object.entries(newRecord).map(([key, value], index) => (
                        <div key={index} className="flex gap-2">
                          <Input 
                            placeholder="Key" 
                            value={key}
                            onChange={(e) => {
                              const oldKey = key;
                              const newKey = e.target.value;
                              const updatedRecord = { ...newRecord };
                              delete updatedRecord[oldKey];
                              updatedRecord[newKey] = value;
                              setNewRecord(updatedRecord);
                            }}
                          />
                          <Input 
                            placeholder="Value" 
                            value={value}
                            onChange={(e) => setNewRecord({...newRecord, [key]: e.target.value})}
                          />
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              const updatedRecord = { ...newRecord };
                              delete updatedRecord[key];
                              setNewRecord(updatedRecord);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button 
                        variant="outline" 
                        onClick={() => setNewRecord({...newRecord, '': ''})}
                      >
                        Add Field
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddRecord}>Add Record</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {selectedRecords.length > 0 && (
              <Button variant="destructive" onClick={handleDeleteSelected}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedRecords.length})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {records.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 pb-4 border-b">
              <Checkbox 
                id="select-all-records"
                checked={selectedRecords.length === records.length}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all-records" className="text-sm font-medium">
                Select All ({records.length} records)
              </label>
            </div>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    {columns.map((column) => (
                      <TableHead key={column} className="font-medium">
                        {column}
                      </TableHead>
                    ))}
                    <TableHead className="w-12">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record, index) => (
                    <TableRow key={record.id} className="hover:bg-gray-50">
                      <TableCell>
                        <Checkbox 
                          id={`record-${index}`}
                          checked={selectedRecords.includes(record.id)}
                          onCheckedChange={(checked) => handleSelectRecord(record.id, checked as boolean)}
                        />
                      </TableCell>
                      {columns.map((column) => (
                        <TableCell key={`${record.id}-${column}`} className="max-w-xs">
                          <div className="truncate" title={String(record[column] || '')}>
                            {String(record[column] || '-')}
                          </div>
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openEditDialog(record)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No records found</h3>
            <p className="text-gray-600 mb-4">Add your first record to get started</p>
            <div className="flex gap-2 justify-center">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Record
                  </Button>
                </DialogTrigger>
              </Dialog>
              <label htmlFor="json-upload">
                <Button variant="outline" className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload JSON
                </Button>
              </label>
            </div>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Record</DialogTitle>
              <DialogDescription>Modify the record fields</DialogDescription>
            </DialogHeader>
            {editingRecord && (
              <div className="space-y-4 max-h-96 overflow-auto">
                {Object.entries(editingRecord).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <Label>{key}</Label>
                    <Input 
                      value={String(value)}
                      onChange={(e) => setEditingRecord({
                        ...editingRecord,
                        [key]: e.target.value
                      })}
                      disabled={key === 'id'}
                    />
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditRecord}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default DynamoDBManager;
