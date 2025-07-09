
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Eye, 
  Mail, 
  Calendar, 
  Shield, 
  Activity,
  Cloud
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string;
  workspaces: number;
  createdAt: string;
}

interface UserProfileDialogProps {
  user: User;
}

const UserProfileDialog = ({ user }: UserProfileDialogProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
          <DialogDescription>
            View detailed information about this user
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* User Header */}
          <div className="flex items-center space-x-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-blue-600 text-white text-lg">
                {user.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">{user.name}</h3>
              <p className="text-gray-600 flex items-center">
                <Mail className="w-4 h-4 mr-1" />
                {user.email}
              </p>
              <div className="flex items-center space-x-2 mt-2">
                <Badge className="bg-purple-100 text-purple-800">
                  <Shield className="w-3 h-3 mr-1" />
                  {user.role}
                </Badge>
                <Badge className={user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                  <Activity className="w-3 h-3 mr-1" />
                  {user.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* User Details Grid */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Account Created</label>
                <div className="flex items-center mt-1">
                  <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                  <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Last Login</label>
                <div className="flex items-center mt-1">
                  <Activity className="w-4 h-4 mr-2 text-gray-400" />
                  <span>{user.lastLogin}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Active Workspaces</label>
                <div className="flex items-center mt-1">
                  <Cloud className="w-4 h-4 mr-2 text-gray-400" />
                  <span>{user.workspaces} workspaces</span>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">User ID</label>
                <div className="mt-1">
                  <code className="bg-gray-100 px-2 py-1 rounded text-sm">{user.id}</code>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h4 className="font-medium mb-3">Recent Activity</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Logged in to workspace "Data Analytics"</span>
                <span className="text-gray-400">2 hours ago</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Created new data source "Customer DB"</span>
                <span className="text-gray-400">1 day ago</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Updated profile information</span>
                <span className="text-gray-400">3 days ago</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;
