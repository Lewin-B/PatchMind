import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Github, RefreshCw, Shield, AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  fetchUserRepositories,
  analyzeRepository,
  RepositoryAnalysis,
} from "@/lib/github";
import { RefreshButton } from "@/components/RefreshButton";
import { UpdateButton } from "@/components/UpdateButton";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need to be signed in to access the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button>Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  let repositories: RepositoryAnalysis[] = [];
  let error: string | null = null;

  try {
    const githubRepos = await fetchUserRepositories();
    repositories = await Promise.all(
      githubRepos.map((repo) => analyzeRepository(repo))
    );
    repositories.map((repo) => {
      console.log("Repository: ", repo);
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to fetch repositories";
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-2xl font-bold text-primary">
                PatchMind
              </Link>
              <span className="text-sm text-muted-foreground">Dashboard</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">
                Welcome, {session.user?.name}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <Button variant="outline" type="submit">
                  Sign Out
                </Button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Repository Dashboard
          </h1>
          <p className="text-muted-foreground">
            Select repositories to update dependencies and address security
            issues.
          </p>
        </div>

        {error ? (
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-destructive">
                Error Loading Repositories
              </CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                This might be due to GitHub API rate limits or authentication
                issues. Please try refreshing the page or signing out and back
                in.
              </p>
              <div className="flex space-x-2">
                <RefreshButton />
                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <Button variant="outline" type="submit">
                    Sign Out & Retry
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Repositories
                  </CardTitle>
                  <Github className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {repositories.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {repositories.filter((r) => r.isPrivate).length} private,{" "}
                    {repositories.filter((r) => !r.isPrivate).length} public
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Outdated Packages
                  </CardTitle>
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {repositories.reduce(
                      (sum, r) => sum + r.outdatedPackages,
                      0
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across all repositories
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Security Issues
                  </CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {repositories.reduce((sum, r) => sum + r.securityIssues, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Require immediate attention
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Repository List */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">
                Your Repositories
              </h2>

              {repositories.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="text-center py-8">
                    <Github className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      No Repositories Found
                    </h3>
                    <p className="text-muted-foreground">
                      You dont have any repositories yet, or they couldnt be
                      loaded.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                repositories.map((repo) => (
                  <Card
                    key={repo.id}
                    className="bg-card border-border hover:border-primary/50 transition-colors"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg flex items-center space-x-2">
                            <span>{repo.name}</span>
                            {repo.isPrivate && (
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                                Private
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription>{repo.description}</CardDescription>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span>{repo.language}</span>
                            <span>•</span>
                            <span>Updated {repo.lastUpdated}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {repo.securityIssues > 0 && (
                            <div className="flex items-center space-x-1 text-destructive">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                {repo.securityIssues}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1 text-primary">
                            <RefreshCw className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              {repo.outdatedPackages}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            {repo.outdatedPackages} outdated packages
                            {repo.securityIssues > 0 && (
                              <span className="text-destructive ml-2">
                                • {repo.securityIssues} security issues
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                          <UpdateButton
                            repoName={repo.name}
                            repoOwner={repo.fullName.split("/")[0] || ""}
                            repoFullName={repo.fullName}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Bulk Actions */}
            {repositories.length > 0 && (
              <div className="mt-8 p-6 border border-border rounded-lg bg-card">
                <h3 className="text-lg font-semibold mb-4">Bulk Actions</h3>
                <div className="flex flex-wrap gap-4">
                  <Button className="flex items-center space-x-2">
                    <RefreshCw className="h-4 w-4" />
                    <span>Update All Repositories</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Shield className="h-4 w-4" />
                    <span>Fix Security Issues Only</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <Github className="h-4 w-4" />
                    <span>Refresh Repository List</span>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
