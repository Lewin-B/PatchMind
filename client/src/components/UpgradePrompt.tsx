"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { X, Package, FolderOpen } from "lucide-react";
import { RepositoryAnalysis } from "@/lib/github";
import { LoadingScreen } from "./LoadingScreen";

interface UpgradePromptProps {
  repository: RepositoryAnalysis;
  onClose: () => void;
  onSubmit: (targetPackage: string, targetPath: string) => void;
}

export function UpgradePrompt({
  repository,
  onClose,
  onSubmit,
}: UpgradePromptProps) {
  const [targetPackage, setTargetPackage] = useState("next");
  const [targetPath, setTargetPath] = useState("client");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Call the analyze API with the repository data and upgrade parameters
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...repository,
          targetPackage,
          targetPath,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`);
      }

      const result = await response.json();
      console.log("Analysis result:", result);

      // Call the onSubmit callback with the results
      onSubmit(targetPackage, targetPath);

      // Close the modal
      onClose();
    } catch (error) {
      console.error("Error during upgrade analysis:", error);
      // You might want to show an error message to the user here
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <LoadingScreen isVisible={isLoading} />
      {!isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-slate-800/95 border-slate-700 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="space-y-1">
                <CardTitle className="text-xl text-slate-200 flex items-center space-x-2">
                  <Package className="h-5 w-5 text-blue-400" />
                  <span>Upgrade Dependencies</span>
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Configure the upgrade for {repository.name}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="targetPackage"
                    className="text-slate-300 text-sm font-medium"
                  >
                    Target Package
                  </label>
                  <input
                    id="targetPackage"
                    value={targetPackage}
                    onChange={(e) => setTargetPackage(e.target.value)}
                    placeholder="e.g., next, react, typescript"
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-slate-200 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-slate-400">
                    The package you want to upgrade
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="targetPath"
                    className="text-slate-300 text-sm font-medium"
                  >
                    Target Directory
                  </label>
                  <div className="relative">
                    <FolderOpen className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="targetPath"
                      value={targetPath}
                      onChange={(e) => setTargetPath(e.target.value)}
                      placeholder="e.g., client, src, app"
                      className="w-full px-3 py-2 pl-10 bg-slate-700/50 border border-slate-600 rounded-md text-slate-200 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    Directory containing package.json
                  </p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-sm text-blue-300">
                    <strong>Note:</strong> The directory you choose must contain
                    a{" "}
                    <code className="bg-slate-700/50 px-1 rounded text-blue-200">
                      package.json
                    </code>{" "}
                    file for the upgrade to work properly.
                  </p>
                </div>

                <div className="flex space-x-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Analyzing...
                      </>
                    ) : (
                      "Start Upgrade"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
