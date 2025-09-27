import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log("Check 1");
    const repositoryData = await request.json();

    console.log("Received repository data:", {
      name: repositoryData.name,
      owner: repositoryData.owner,
      fileCount: repositoryData.files?.length || 0,
      directoryCount: repositoryData.directories?.length || 0,
    });

    // Here you would typically:
    // 1. Analyze the repository for outdated dependencies
    // 2. Check for security vulnerabilities
    // 3. Generate update recommendations
    // 4. Create pull requests or issues

    // For now, we'll simulate the analysis process
    const analysisResult = await analyzeRepository(repositoryData);

    return NextResponse.json({
      success: true,
      analysis: analysisResult,
      message: "Repository analysis completed successfully",
    });
  } catch (error) {
    console.error("Error processing repository data:", error);
    return NextResponse.json(
      { error: "Failed to process repository data" },
      { status: 500 }
    );
  }
}

async function analyzeRepository(repositoryData: any) {
  // Simulate analysis delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const analysis = {
    repository: {
      name: repositoryData.name,
      owner: repositoryData.owner,
    },
    dependencies: [],
    securityIssues: [],
    recommendations: [],
    summary: {
      totalFiles: repositoryData.files?.length || 0,
      analyzedFiles: 0,
      outdatedPackages: 0,
      securityVulnerabilities: 0,
    },
  };

  // Analyze each file for dependencies
  if (repositoryData.files) {
    for (const file of repositoryData.files) {
      if (file.content) {
        analysis.summary.analyzedFiles++;

        // Analyze based on file type
        if (file.name === "package.json") {
          const packageAnalysis = analyzePackageJson(file.content);
          analysis.dependencies.push(...packageAnalysis.dependencies);
          analysis.summary.outdatedPackages += packageAnalysis.outdatedCount;
        } else if (file.name === "requirements.txt") {
          const requirementsAnalysis = analyzeRequirementsTxt(file.content);
          analysis.dependencies.push(...requirementsAnalysis.dependencies);
          analysis.summary.outdatedPackages +=
            requirementsAnalysis.outdatedCount;
        }
        // Add more file type analyses as needed
      }
    }
  }

  // Generate recommendations
  analysis.recommendations = generateRecommendations(analysis.dependencies);

  // Simulate security issues
  analysis.securityIssues = generateSecurityIssues(analysis.dependencies);
  analysis.summary.securityVulnerabilities = analysis.securityIssues.length;

  return analysis;
}

function analyzePackageJson(content: string) {
  try {
    const packageJson = JSON.parse(content);
    const dependencies = [];
    let outdatedCount = 0;

    // Analyze dependencies
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    for (const [name, version] of Object.entries(allDeps)) {
      const isOutdated = Math.random() < 0.3; // 30% chance of being outdated
      if (isOutdated) outdatedCount++;

      dependencies.push({
        name,
        currentVersion: version as string,
        latestVersion: generateLatestVersion(version as string),
        isOutdated,
        type: packageJson.dependencies?.[name] ? "dependency" : "devDependency",
        file: "package.json",
      });
    }

    return { dependencies, outdatedCount };
  } catch (error) {
    console.error("Error parsing package.json:", error);
    return { dependencies: [], outdatedCount: 0 };
  }
}

function analyzeRequirementsTxt(content: string) {
  const dependencies = [];
  let outdatedCount = 0;

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const isOutdated = Math.random() < 0.4; // 40% chance of being outdated
      if (isOutdated) outdatedCount++;

      dependencies.push({
        name: trimmed.split("==")[0] || trimmed.split(">=")[0] || trimmed,
        currentVersion: trimmed,
        latestVersion: generateLatestVersion(trimmed),
        isOutdated,
        type: "dependency",
        file: "requirements.txt",
      });
    }
  }

  return { dependencies, outdatedCount };
}

function generateLatestVersion(currentVersion: string): string {
  // Simple version bump simulation
  const versionMatch = currentVersion.match(/(\d+)\.(\d+)\.(\d+)/);
  if (versionMatch) {
    const [, major, minor, patch] = versionMatch;
    return `${major}.${parseInt(minor) + 1}.${parseInt(patch) + 2}`;
  }
  return currentVersion;
}

function generateRecommendations(dependencies: any[]) {
  const recommendations = [];

  const outdatedDeps = dependencies.filter((dep) => dep.isOutdated);

  if (outdatedDeps.length > 0) {
    recommendations.push({
      type: "update_dependencies",
      priority: "high",
      title: `Update ${outdatedDeps.length} outdated dependencies`,
      description: `Found ${outdatedDeps.length} packages that can be updated to their latest versions`,
      actions: outdatedDeps.map((dep) => ({
        package: dep.name,
        from: dep.currentVersion,
        to: dep.latestVersion,
      })),
    });
  }

  return recommendations;
}

function generateSecurityIssues(dependencies: any[]) {
  const securityIssues = [];

  // Simulate some security issues
  const vulnerableDeps = dependencies.filter(() => Math.random() < 0.1); // 10% chance

  for (const dep of vulnerableDeps) {
    securityIssues.push({
      package: dep.name,
      version: dep.currentVersion,
      severity: ["low", "medium", "high"][Math.floor(Math.random() * 3)],
      description: `Security vulnerability in ${dep.name}`,
      cve: `CVE-${Math.floor(Math.random() * 9000) + 1000}-${
        Math.floor(Math.random() * 9000) + 1000
      }`,
      file: dep.file,
    });
  }

  return securityIssues;
}
