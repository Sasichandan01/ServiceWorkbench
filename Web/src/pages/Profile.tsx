import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "@/components/ui/button";
import { Save, User } from "lucide-react";
import PersonalInfo from "@/components/profile/PersonalInfo";
import SecuritySettings from "@/components/profile/SecuritySettings";
import NotificationSettings from "@/components/profile/NotificationSettings";
import AccountOverview from "@/components/profile/AccountOverview";
import RecentActivity from "@/components/profile/RecentActivity";
import UserProfileDialog from "@/components/admin/UserProfileDialog";
import { useAppSelector } from "@/hooks/useAppSelector";
import { UserService } from "@/services/userService";
import { setAuth } from "@/store/slices/authSlice";
import { getUserInfo } from "@/lib/tokenUtils";

const Profile = () => {
  const dispatch = useDispatch();
  const reduxUser = useAppSelector((state) => state.auth.user);
  const [user, setUser] = useState<any>(reduxUser);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      try {
        const tokenUser = getUserInfo();
        const userId = tokenUser?.username || reduxUser?.username;
        if (userId) {
          const userData = await UserService.getUser(userId);
          // Normalize fields for local profile display only
          const backendUser = userData as any;
          let roles: string[] = [];
          if (Array.isArray(backendUser.Roles)) {
            roles = backendUser.Roles;
          } else if (Array.isArray(backendUser.Role)) {
            roles = backendUser.Role;
          } else if (typeof backendUser.Roles === 'string') {
            roles = [backendUser.Roles];
          } else if (typeof backendUser.Role === 'string') {
            roles = [backendUser.Role];
          }
          const normalizedUser = {
            ...userData,
            Roles: roles,
            LastLoginTime: backendUser.LastLoginTime || backendUser.LastLogin || backendUser.LastAccessedTime || ""
          };
          setUser(normalizedUser);
          // Do NOT update global auth state here; only update local state for profile display
        }
      } catch (e) {
        // Optionally handle error
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-gray-600">Manage your account and preferences</p>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center items-center py-10">
          <span className="text-lg text-gray-500">Loading profile...</span>
        </div>
      ) : (
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Left Column - Main Profile Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Profile Information */}
            <PersonalInfo user={user || {}} />
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
            <AccountOverview user={user || {}} />
            <RecentActivity />
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
