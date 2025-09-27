"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface UpdateButtonProps {
  repoName: string;
  repoOwner: string;
  repoFullName: string;
}

type UpdateStatus = "idle" | "loading" | "success" | "error";

export function UpdateButton({
  repoName,
  repoOwner,
  repoFullName,
}: UpdateButtonProps) {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async () => {
    setStatus("loading");
    setError(null);
    setAnalysisResult(null);

    try {
      // Step 1: Fetch repository contents
      console.log(`Fetching contents for ${repoFullName}...`);
      const contentsResponse = await fetch("/api/repositories/contents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoName,
          repoOwner,
        }),
      });

      if (!contentsResponse.ok) {
        throw new Error(
          `Failed to fetch repository contents: ${contentsResponse.status}`
        );
      }

      const contentsData = await contentsResponse.json();
      console.log("Repository contents fetched:", contentsData);

      // Step 2: Send to analysis backend
      console.log("Sending repository data for analysis...");
      const analysisResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(contentsData.data),
      });

      if (!analysisResponse.ok) {
        throw new Error(`Analysis failed: ${analysisResponse.status}`);
      }

      const analysisData = await analysisResponse.json();
      console.log("Analysis completed:", analysisData);

      setAnalysisResult(analysisData);
      setStatus("success");
    } catch (err) {
      console.error("Update failed:", err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
      setStatus("error");
    }
  };

  const getButtonContent = () => {
    switch (status) {
      case "loading":
        return (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Analyzing...</span>
          </>
        );
      case "success":
        return (
          <>
            <CheckCircle className="h-4 w-4" />
            <span>Analysis Complete</span>
          </>
        );
      case "error":
        return (
          <>
            <AlertCircle className="h-4 w-4" />
            <span>Retry</span>
          </>
        );
      default:
        return (
          <>
            <RefreshCw className="h-4 w-4" />
            <span>Update Now</span>
          </>
        );
    }
  };

  return (
    <div className="space-y-4">
      <Button
        size="sm"
        className="flex items-center space-x-2"
        onClick={handleUpdate}
        disabled={status === "loading"}
      >
        {getButtonContent()}
      </Button>

      {status === "error" && error && (
        <Card className="bg-card border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive text-sm">
              Analysis Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm">{error}</CardDescription>
          </CardContent>
        </Card>
      )}

      {status === "success" && analysisResult && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-primary text-sm">
              Analysis Results
            </CardTitle>
            <CardDescription>
              Analysis completed for {analysisResult.analysis.repository.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Files Analyzed:</span>
                <span className="ml-2">
                  {analysisResult.analysis.summary.analyzedFiles}
                </span>
              </div>
              <div>
                <span className="font-medium">Outdated Packages:</span>
                <span className="ml-2 text-primary">
                  {analysisResult.analysis.summary.outdatedPackages}
                </span>
              </div>
              <div>
                <span className="font-medium">Security Issues:</span>
                <span className="ml-2 text-destructive">
                  {analysisResult.analysis.summary.securityVulnerabilities}
                </span>
              </div>
              <div>
                <span className="font-medium">Recommendations:</span>
                <span className="ml-2">
                  {analysisResult.analysis.recommendations.length}
                </span>
              </div>
            </div>

            {analysisResult.analysis.recommendations.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Recommendations:</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {analysisResult.analysis.recommendations.map(
                    (rec: any, index: number) => (
                      <li key={index} className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-primary rounded-full"></span>
                        <span>{rec.title}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {analysisResult.analysis.securityIssues.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2 text-destructive">
                  Security Issues:
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {analysisResult.analysis.securityIssues.map(
                    (issue: any, index: number) => (
                      <li key={index} className="flex items-center space-x-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            issue.severity === "high"
                              ? "bg-destructive"
                              : issue.severity === "medium"
                              ? "bg-yellow-500"
                              : "bg-green-500"
                          }`}
                        ></span>
                        <span>
                          {issue.package} ({issue.severity})
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
