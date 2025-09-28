import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { RepositoryAnalysis } from "@/lib/github";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Fetch user repositories from GitHub API
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100",
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repos = await response.json();

    // Analyze each repository
    const analyzedRepos: RepositoryAnalysis[] = await Promise.all(
      repos.map(async (repo: any) => {
        return await analyzeRepository({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          language: repo.language,
          isPrivate: repo.private,
          lastUpdated: new Date(repo.updated_at).toLocaleDateString(),
          outdatedPackages: Math.floor(Math.random() * 10), // Mock data for now
          securityIssues: Math.floor(Math.random() * 3), // Mock data for now
          owner: {
            login: repo.owner.login,
          },
        });
      })
    );

    return NextResponse.json({
      success: true,
      repositories: analyzedRepos,
    });
  } catch (error) {
    console.error("Error fetching repositories:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch repositories",
      },
      { status: 500 }
    );
  }
}

async function analyzeRepository(
  repo: RepositoryAnalysis
): Promise<RepositoryAnalysis> {
  // For now, return the repository as-is with mock data
  // In a real implementation, this would analyze package.json, requirements.txt, etc.
  return repo;
}
