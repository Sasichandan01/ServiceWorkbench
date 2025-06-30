
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import PersonalInfo from "@/components/profile/PersonalInfo";
import SecuritySettings from "@/components/profile/SecuritySettings";
import NotificationSettings from "@/components/profile/NotificationSettings";
import AccountOverview from "@/components/profile/AccountOverview";
import RecentActivity from "@/components/profile/RecentActivity";

const Profile = () => {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-gray-600">Manage your account and preferences</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Left Column - Main Profile Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Profile Information */}
          <PersonalInfo />

          {/* Two Column Layout for Security and Notifications */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex">
              <SecuritySettings />
            </div>
            <div className="flex">
              <NotificationSettings />
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <AccountOverview />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
};

export default Profile;
