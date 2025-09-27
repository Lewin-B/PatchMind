import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { Octokit } from "@octokit/rest";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repoName, repoOwner } = await request.json();

    if (!repoName || !repoOwner) {
      return NextResponse.json(
        { error: "Repository name and owner are required" },
        { status: 400 }
      );
    }

    // Initialize Octokit with the user's access token
    const octokit = new Octokit({
      auth: session.accessToken,
    });

    // Fetch repository contents recursively
    const repositoryData = await fetchRepositoryContents(
      octokit,
      repoOwner,
      repoName,
      "", // Start from root
      0 // Initial depth
    );

    return NextResponse.json({
      success: true,
      data: repositoryData,
    });
  } catch (error) {
    console.error("Error fetching repository contents:", error);
    return NextResponse.json(
      { error: "Failed to fetch repository contents" },
      { status: 500 }
    );
  }
}

async function fetchRepositoryContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string = "",
  depth: number = 0
): Promise<any> {
  // Prevent infinite recursion with depth limit
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    console.warn(
      `Maximum depth ${MAX_DEPTH} reached for ${owner}/${repo}/${path}`
    );
    return {
      name: repo,
      owner: owner,
      path: path || "/",
      files: [],
      directories: [],
      error: `Maximum depth ${MAX_DEPTH} reached`,
    };
  }

  console.log(
    `Fetching contents for ${owner}/${repo}${
      path ? `/${path}` : ""
    } (depth: ${depth})`
  );

  try {
    const { data: contents } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path: path || "",
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    console.log("Found: ", contents);

    const repositoryData = {
      name: repo,
      owner: owner,
      path: path || "/",
      depth: depth,
      files: [],
      directories: [],
      totalFiles: 0,
      totalDirectories: 0,
    };

    // Handle single file vs directory
    if (Array.isArray(contents)) {
      // Directory contents - process each item
      for (const item of contents) {
        if (item.type === "file") {
          // Only fetch content for relevant files
          if (isRelevantFile(item.name)) {
            try {
              const fileContent = await fetchFileContent(
                octokit,
                owner,
                repo,
                item.path
              );
              repositoryData.files.push({
                name: item.name,
                path: item.path,
                size: item.size,
                content: fileContent,
                sha: item.sha,
                url: item.url,
                html_url: item.html_url,
                download_url: item.download_url,
              });
            } catch (error) {
              console.warn(`Failed to fetch content for ${item.path}:`, error);
              repositoryData.files.push({
                name: item.name,
                path: item.path,
                size: item.size,
                content: null,
                sha: item.sha,
                url: item.url,
                html_url: item.html_url,
                download_url: item.download_url,
                error: "Failed to fetch content",
              });
            }
          } else {
            repositoryData.files.push({
              name: item.name,
              path: item.path,
              size: item.size,
              content: null,
              sha: item.sha,
              url: item.url,
              html_url: item.html_url,
              download_url: item.download_url,
            });
          }
        } else if (item.type === "dir") {
          // Recursively fetch directory contents
          try {
            const subDirectoryData = await fetchRepositoryContents(
              octokit,
              owner,
              repo,
              item.path,
              depth + 1
            );
            repositoryData.directories.push({
              name: item.name,
              path: item.path,
              sha: item.sha,
              url: item.url,
              html_url: item.html_url,
              files: subDirectoryData.files,
              directories: subDirectoryData.directories,
              totalFiles: subDirectoryData.totalFiles,
              totalDirectories: subDirectoryData.totalDirectories,
            });
          } catch (error) {
            console.warn(`Failed to fetch directory ${item.path}:`, error);
            repositoryData.directories.push({
              name: item.name,
              path: item.path,
              sha: item.sha,
              url: item.url,
              html_url: item.html_url,
              files: [],
              directories: [],
              totalFiles: 0,
              totalDirectories: 0,
              error: "Failed to fetch directory contents",
            });
          }
        }
      }
    } else {
      // Single file
      if (isRelevantFile(contents.name)) {
        try {
          const fileContent = await fetchFileContent(
            octokit,
            owner,
            repo,
            contents.path
          );
          repositoryData.files.push({
            name: contents.name,
            path: contents.path,
            size: contents.size,
            content: fileContent,
            sha: contents.sha,
            url: contents.url,
            html_url: contents.html_url,
            download_url: contents.download_url,
          });
        } catch (error) {
          console.warn(`Failed to fetch content for ${contents.path}:`, error);
          repositoryData.files.push({
            name: contents.name,
            path: contents.path,
            size: contents.size,
            content: null,
            sha: contents.sha,
            url: contents.url,
            html_url: contents.html_url,
            download_url: contents.download_url,
            error: "Failed to fetch content",
          });
        }
      }
    }

    // Calculate totals including subdirectories
    repositoryData.totalFiles = repositoryData.files.length;
    repositoryData.totalDirectories = repositoryData.directories.length;

    for (const dir of repositoryData.directories) {
      repositoryData.totalFiles += dir.totalFiles || 0;
      repositoryData.totalDirectories += dir.totalDirectories || 0;
    }

    console.log("repository data: ", repositoryData);
    return repositoryData;
  } catch (error) {
    console.error(
      `Error fetching contents for ${owner}/${repo}/${path}:`,
      error
    );
    throw error;
  }
}

async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const { data: fileData } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if ("content" in fileData && fileData.content) {
      // Decode base64 content
      return Buffer.from(fileData.content, "base64").toString("utf-8");
    }

    return null;
  } catch (error) {
    console.error(
      `Error fetching file content for ${owner}/${repo}/${path}:`,
      error
    );
    throw error;
  }
}

function isRelevantFile(filename: string): boolean {
  const relevantExtensions = [
    ".json", // package.json, composer.json, etc.
    ".txt", // requirements.txt, etc.
    ".yaml",
    ".yml", // docker-compose.yml, etc.
    ".toml", // pyproject.toml, Cargo.toml, etc.
    ".lock", // package-lock.json, yarn.lock, etc.
    ".gradle", // build.gradle
    ".xml", // pom.xml
    ".rb", // Gemfile
    ".go", // go.mod
    ".rs", // Cargo.toml
    ".php", // composer.json
  ];

  const relevantFiles = [
    "package.json",
    "package-lock.json",
    "yarn.lock",
    "requirements.txt",
    "pyproject.toml",
    "composer.json",
    "composer.lock",
    "Gemfile",
    "Gemfile.lock",
    "go.mod",
    "go.sum",
    "Cargo.toml",
    "Cargo.lock",
    "pom.xml",
    "build.gradle",
    "docker-compose.yml",
    "Dockerfile",
  ];

  return (
    relevantFiles.includes(filename) ||
    relevantExtensions.some((ext) => filename.endsWith(ext))
  );
}
