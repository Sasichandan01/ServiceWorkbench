import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Database, FileText, Settings2, CheckCircle, AlertCircle } from "lucide-react";
import { ApiClient } from "@/lib/apiClient";

const SystemSettings = () => {
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
          ? "Documentation sync initiated successfully."
          : action === "app"
          ? "Application data sync initiated successfully."
          : "Full system sync initiated successfully."
      );
    } catch (e) {
      let errMsg = (e as Error)?.message || "Sync operation failed";
      // Try to extract message from JSON string
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed && typeof parsed === 'object' && parsed.message) {
          errMsg = parsed.message;
        }
      } catch {}
      setError(errMsg);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Settings2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">System Settings</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Manage RAG knowledge base synchronization and system operations
          </p>
        </div>

        {message && (
          <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="font-medium">{message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="font-medium">{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">Sync Operations</CardTitle>
                </div>
                <CardDescription>
                  Manually trigger synchronization of knowledge base components
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg border border-border bg-card/50">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-foreground">Documentation Sync</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Synchronize AWS documentation, CloudFormation templates, and Boto3 references
                        </p>
                      </div>
                      <Button
                        onClick={() => handleSync("docs")}
                        disabled={loading !== null}
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        {loading === "docs" ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <FileText className="mr-2 h-4 w-4" />
                            Sync Documentation
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-border bg-card/50">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-secondary/50">
                      <Database className="h-5 w-5 text-secondary-foreground" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-foreground">Application Data Sync</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Synchronize internal application data, configurations, and metadata
                        </p>
                      </div>
                      <Button
                        onClick={() => handleSync("app")}
                        disabled={loading !== null}
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        {loading === "app" ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Database className="mr-2 h-4 w-4" />
                            Sync App Data
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="p-4 rounded-lg border border-border bg-card/50">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <RefreshCw className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-foreground">Complete System Sync</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Perform a comprehensive synchronization of all knowledge base components
                        </p>
                      </div>
                      <Button
                        onClick={() => handleSync()}
                        disabled={loading !== null}
                        className="w-full sm:w-auto"
                      >
                        {loading === "both" ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Syncing All...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Sync Everything
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">

            <Card className="shadow-sm border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Important Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <span>Sync operations may take several minutes to hours to complete</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <span>Only IT administrators can perform these operations</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
};

export default SystemSettings;