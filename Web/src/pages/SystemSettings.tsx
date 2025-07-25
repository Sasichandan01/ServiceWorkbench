import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ApiClient } from "../lib/apiClient";

const SystemSettings: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async (action?: "docs" | "app") => {
    setLoading(action || "both");
    setMessage(null);
    setError(null);
    try {
      const response = await ApiClient.ragSync(action);
      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || "Sync failed");
      }
      setMessage(
        action === "docs"
          ? "Docs sync started successfully."
          : action === "app"
          ? "Application data sync started successfully."
          : "Full sync started successfully."
      );
    } catch (e: any) {
      setError(e.message || "Sync failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-8">
      <Card>
        <CardHeader>
          <CardTitle>System Settings</CardTitle>
          <CardDescription>
            ITAdmin can manually trigger RAG knowledge base syncs for documentation and application data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4">
            <Button
              onClick={() => handleSync("docs")}
              disabled={loading !== null}
              variant="secondary"
            >
              {loading === "docs" ? "Syncing Docs..." : "Sync AWS Docs, CFTs, Boto3, etc."}
            </Button>
            <Button
              onClick={() => handleSync("app")}
              disabled={loading !== null}
              variant="secondary"
            >
              {loading === "app" ? "Syncing App Data..." : "Sync Application Data"}
            </Button>
            <Button
              onClick={() => handleSync()}
              disabled={loading !== null}
              variant="default"
            >
              {loading === "both" ? "Syncing All..." : "Sync Both (Docs + App Data)"}
            </Button>
          </div>
          {message && <div className="text-green-600 font-medium">{message}</div>}
          {error && <div className="text-red-600 font-medium">{error}</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemSettings; 