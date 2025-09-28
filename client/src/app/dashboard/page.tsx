"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  RefreshCw,
  Shield,
  AlertTriangle,
  ChevronDown,
  Package,
} from "lucide-react";
import Link from "next/link";
import { RepositoryAnalysis } from "@/lib/github";
import { RefreshButton } from "@/components/RefreshButton";
import { UpgradePrompt } from "@/components/UpgradePrompt";

export default function Dashboard() {
  const [repositories, setRepositories] = useState<RepositoryAnalysis[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<RepositoryAnalysis | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  useEffect(() => {
    loadRepositories();
  }, []);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/repositories");

      if (!response.ok) {
        if (response.status === 401) {
          // Redirect to home if not authenticated
          window.location.href = "/";
          return;
        }
        throw new Error(`Failed to fetch repositories: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch repositories");
      }

      setRepositories(data.repositories);
      if (data.repositories.length > 0) {
        setSelectedRepo(data.repositories[0]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch repositories"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeClick = () => {
    setShowUpgradePrompt(true);
  };

  const handleUpgradeSubmit = (targetPackage: string, targetPath: string) => {
    console.log("Upgrade submitted:", { targetPackage, targetPath });
    setShowUpgradePrompt(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white flex items-center justify-center">
        {/* Animated background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-emerald-500/10"></div>

        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700 backdrop-blur-sm relative">
          <CardContent className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-slate-200">
              Loading Repositories
            </h3>
            <p className="text-slate-400">
              Fetching your GitHub repositories...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-emerald-500/10"></div>

      {/* Navigation */}
      <nav className="relative border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600">
                  <Package className="h-5 w-5 text-white" />
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  PatchMind
                </span>
              </Link>
              <span className="text-sm text-slate-400">Dashboard</span>
            </div>
            <div className="flex items-center space-x-4">
              <RefreshButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-200 mb-2">
            Repository Dashboard
          </h1>
          <p className="text-slate-400">
            Select a repository to analyze and upgrade dependencies.
          </p>
        </div>

        {error ? (
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm mb-8">
            <CardHeader>
              <CardTitle className="text-red-400">
                Error Loading Repositories
              </CardTitle>
              <CardDescription className="text-slate-300">
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-400 mb-4">
                This might be due to GitHub API rate limits or authentication
                issues. Please try refreshing the page.
              </p>
              <Button
                onClick={loadRepositories}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Repository Selector */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-slate-200 mb-4">
                Select Repository
              </h2>
              <div className="relative">
                <select
                  value={selectedRepo?.id?.toString() || ""}
                  onChange={(e) => {
                    const repo = repositories.find(
                      (r) => r.id.toString() === e.target.value
                    );
                    setSelectedRepo(repo || null);
                  }}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-800/50 text-slate-200 appearance-none pr-10 backdrop-blur-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {repositories.map((repo) => (
                    <option
                      key={repo.id}
                      value={repo.id.toString()}
                      className="bg-slate-800 text-slate-200"
                    >
                      {repo.fullName} {repo.isPrivate ? "(Private)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Selected Repository Details */}
            {selectedRepo && (
              <div className="space-y-6">
                {/* Repository Info Card */}
                <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-2xl flex items-center space-x-2 text-slate-200">
                          <span>{selectedRepo.name}</span>
                          {selectedRepo.isPrivate && (
                            <span className="text-xs bg-slate-700/50 text-slate-400 px-2 py-1 rounded">
                              Private
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-base text-slate-300">
                          {selectedRepo.description}
                        </CardDescription>
                        <div className="flex items-center space-x-4 text-sm text-slate-400">
                          <span>{selectedRepo.language}</span>
                          <span>•</span>
                          <span>Updated {selectedRepo.lastUpdated}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {selectedRepo.securityIssues > 0 && (
                          <div className="flex items-center space-x-1 text-red-400">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              {selectedRepo.securityIssues}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center space-x-1 text-blue-400">
                          <RefreshCw className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {selectedRepo.outdatedPackages}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm text-slate-400">
                          {selectedRepo.outdatedPackages} outdated packages
                          {selectedRepo.securityIssues > 0 && (
                            <span className="text-red-400 ml-2">
                              • {selectedRepo.securityIssues} security issues
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        onClick={handleUpgradeClick}
                        className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span>Upgrade Dependencies</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-slate-300">
                        Issues Found
                      </CardTitle>
                      <AlertTriangle className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-slate-200">
                        {selectedRepo.outdatedPackages +
                          selectedRepo.securityIssues}
                      </div>
                      <p className="text-xs text-slate-400">
                        Total issues to address
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-slate-300">
                        Outdated Packages
                      </CardTitle>
                      <RefreshCw className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-400">
                        {selectedRepo.outdatedPackages}
                      </div>
                      <p className="text-xs text-slate-400">Need updates</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-slate-300">
                        Security Issues
                      </CardTitle>
                      <Shield className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-400">
                        {selectedRepo.securityIssues}
                      </div>
                      <p className="text-xs text-slate-400">
                        Require attention
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Upgrade Prompt Modal */}
            {showUpgradePrompt && selectedRepo && (
              <UpgradePrompt
                repository={selectedRepo}
                onClose={() => setShowUpgradePrompt(false)}
                onSubmit={handleUpgradeSubmit}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
