import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";

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

    // Call the planner agent
    const plannerResponse = await callPlannerAgent("next", repositoryData);
    console.log("Planner Response: ", plannerResponse);

    // Extract parser instructions from planner response
    if (plannerResponse.next_agent_instructions) {
      const parserResponse = await callParserAgent(
        repositoryData,
        plannerResponse.target?.package || "next",
        plannerResponse.target?.current || "unknown",
        plannerResponse.target?.latest_exact || "latest",
        plannerResponse.next_agent_instructions
      );
      console.log("Parser Response: ", parserResponse);

      // Call the codemod agent with parser results
      const modResponse = await callModAgent(
        repositoryData,
        parserResponse,
        plannerResponse.target?.package || "next",
        plannerResponse.target?.current || "unknown",
        plannerResponse.target?.latest_exact || "latest"
      );
      console.log("Codemod Response: ", modResponse);

      // Create GitHub PR with actual code changes from codemod results
      let prResult = null;
      try {
        prResult = await createUpgradePR(
          repositoryData,
          plannerResponse,
          parserResponse,
          modResponse
        );
        console.log("PR Created:", prResult);
      } catch (prError) {
        console.error("Failed to create PR:", prError);
        // Continue with response even if PR creation fails
      }

      return NextResponse.json({
        success: true,
        analysis: {
          planner: plannerResponse,
          parser: parserResponse,
          codemod: modResponse,
        },
        pr: prResult,
        message:
          "Repository analysis completed successfully using planner, parser, and codemod agents" +
          (prResult ? " and PR created" : ""),
      });
    }

    return NextResponse.json({
      success: true,
      analysis: plannerResponse,
      message: "Repository analysis completed successfully using planner agent",
    });
  } catch (error) {
    console.error("Error processing repository data:", error);
    return NextResponse.json(
      { error: "Failed to process repository data" },
      { status: 500 }
    );
  }
}

// utils/agents.ts
export async function callPlannerAgent(
  targetPackage: string,
  repoTreeJson: Record<string, unknown>,
  opts?: {
    appName?: string;
    userId?: string;
    sessionId?: string;
    baseUrl?: string;
  }
) {
  const {
    appName = "planner_botda",
    userId = "u_123",
    sessionId = "s_123",
    baseUrl = "http://localhost:8000",
  } = opts || {};

  const sessionUrl = `${baseUrl}/apps/${encodeURIComponent(
    appName
  )}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(
    sessionId
  )}`;

  // ---------- 1) Create/Update Session ----------
  const stateBody = {
    state: {
      target_package: targetPackage,
      repo_tree_json: repoTreeJson,
    },
  };

  let stateRes = await fetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stateBody),
  });

  if (!stateRes.ok) {
    const text = await stateRes.text().catch(() => "");
    if (
      stateRes.status === 400 &&
      text.includes(`Session already exists: ${sessionId}`)
    ) {
      console.warn(`Session ${sessionId} already exists — updating state.`);
      // Just update the state instead of creating new
      stateRes = await fetch(sessionUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stateBody),
      });
    } else {
      throw new Error(
        `Failed to set session state: ${stateRes.status} ${stateRes.statusText} ${text}`
      );
    }
  }

  const sessionInfo = await stateRes.json().catch(() => ({}));
  console.log("Session created/updated:", sessionInfo);

  // ---------- 2) Send the message to /run ----------
  const payload = {
    target_package: targetPackage,
    repo_tree_json: repoTreeJson,
  };

  const instruction =
    "Plan a single-package upgrade based on the inputs below.\n" +
    "Respond ONLY with the JSON object instructed in SYSTEM_INSTRUCTION.\n" +
    JSON.stringify(payload, null, 2);

  const runBody = {
    app_name: appName,
    user_id: userId,
    session_id: sessionId,
    new_message: {
      role: "user",
      parts: [{ text: instruction }],
    },
  };

  const runRes = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(runBody),
  });

  if (!runRes.ok) {
    const text = await runRes.text().catch(() => "");
    throw new Error(
      `Run call failed: ${runRes.status} ${runRes.statusText} ${text}`
    );
  }

  const result = await runRes.json().catch(async () => {
    const raw = await runRes.text();
    try {
      return JSON.parse(raw);
    } catch {
      return { rawResponse: raw };
    }
  });

  console.log("Planner run result:", result);

  // Handle the streaming response structure
  if (Array.isArray(result) && result.length > 0) {
    const lastResponse = result[result.length - 1];
    if (
      lastResponse.content &&
      lastResponse.content.parts &&
      lastResponse.content.parts.length > 0
    ) {
      const content = lastResponse.content.parts[0];

      // Try to extract JSON from the content
      try {
        // The content might be a string or an object with text property
        const textContent =
          typeof content === "string" ? content : content.text || content;

        // Try to find JSON in the response
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }

        // If no JSON found, return the text content
        return {
          message: textContent,
          rawResponse: result,
        };
      } catch (error) {
        console.error("Error parsing planner response content:", error);
        return {
          error: "Failed to parse planner agent response",
          rawResponse: result,
        };
      }
    }
  }

  return {
    error: "Unexpected response format from planner agent",
    rawResponse: result,
  };
}

// Call Parser Agent function
export async function callParserAgent(
  repositoryData: Record<string, unknown>,
  dependencyName: string,
  currentVersion: string,
  targetVersion: string,
  instructions: Record<string, unknown>,
  opts?: {
    appName?: string;
    userId?: string;
    sessionId?: string;
    baseUrl?: string;
  }
) {
  const {
    appName = "parser_botda",
    userId = "u_123",
    sessionId = "s_123",
    baseUrl = "http://localhost:8000",
  } = opts || {};

  const sessionUrl = `${baseUrl}/apps/${encodeURIComponent(
    appName
  )}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(
    sessionId
  )}`;

  const stateBody = {
    state: {
      repository_data: repositoryData,
      dependency_name: dependencyName,
      current_version: currentVersion,
      target_version: targetVersion,
      instructions: instructions,
    },
  };

  let stateRes = await fetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stateBody),
  });

  if (!stateRes.ok) {
    const text = await stateRes.text().catch(() => "");
    if (
      stateRes.status === 400 &&
      text.includes(`Session already exists: ${sessionId}`)
    ) {
      console.warn(`Session ${sessionId} already exists — updating state.`);
      // Just update the state instead of creating new
      stateRes = await fetch(sessionUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stateBody),
      });
    } else {
      throw new Error(
        `Failed to set session state: ${stateRes.status} ${stateRes.statusText} ${text}`
      );
    }
  }

  const sessionInfo = await stateRes.json().catch(() => ({}));
  console.log("Parser session created/updated:", sessionInfo);

  // ---------- 2) Send the message to /run ----------
  const instruction = `Parse the repository and analyze the impact of updating ${dependencyName} from ${currentVersion} to ${targetVersion}.\n\nInstructions from planner:\n${JSON.stringify(
    instructions,
    null,
    2
  )}\n\nRepository data:\n${JSON.stringify(repositoryData, null, 2)}`;

  const runBody = {
    app_name: appName,
    user_id: userId,
    session_id: sessionId,
    new_message: {
      role: "user",
      parts: [{ text: instruction }],
    },
  };

  const runRes = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(runBody),
  });

  if (!runRes.ok) {
    const text = await runRes.text().catch(() => "");
    throw new Error(
      `Parser run call failed: ${runRes.status} ${runRes.statusText} ${text}`
    );
  }

  const result = await runRes.json().catch(async () => {
    const raw = await runRes.text();
    try {
      return JSON.parse(raw);
    } catch {
      return { rawResponse: raw };
    }
  });

  console.log("Parser run result:", result);

  // Handle the streaming response structure
  if (Array.isArray(result) && result.length > 0) {
    const lastResponse = result[result.length - 1];
    if (
      lastResponse.content &&
      lastResponse.content.parts &&
      lastResponse.content.parts.length > 0
    ) {
      const content = lastResponse.content.parts[0];

      // Try to extract JSON from the content
      try {
        // The content might be a string or an object with text property
        const textContent =
          typeof content === "string" ? content : content.text || content;

        // Try to find JSON in the response
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }

        // If no JSON found, return the text content
        return {
          message: textContent,
          rawResponse: result,
        };
      } catch (error) {
        console.error("Error parsing parser response content:", error);
        return {
          error: "Failed to parse parser agent response",
          rawResponse: result,
        };
      }
    }
  }

  return {
    error: "Unexpected response format from parser agent",
    rawResponse: result,
  };
}

// Call Codemod Agent function
export async function callModAgent(
  repositoryData: Record<string, unknown>,
  parserResponse: Record<string, unknown>,
  dependencyName: string,
  currentVersion: string,
  targetVersion: string,
  opts?: {
    appName?: string;
    userId?: string;
    sessionId?: string;
    baseUrl?: string;
  }
) {
  const {
    appName = "codemod_botda",
    userId = "u_123",
    sessionId = "s_123",
    baseUrl = "http://localhost:8000",
  } = opts || {};

  const sessionUrl = `${baseUrl}/apps/${encodeURIComponent(
    appName
  )}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(
    sessionId
  )}`;

  // ---------- 1) Create/Update Session ----------
  const stateBody = {
    state: {
      repository_data: repositoryData,
      parser_response: parserResponse,
      dependency_name: dependencyName,
      current_version: currentVersion,
      target_version: targetVersion,
    },
  };

  let stateRes = await fetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stateBody),
  });

  if (!stateRes.ok) {
    const text = await stateRes.text().catch(() => "");
    if (
      stateRes.status === 400 &&
      text.includes(`Session already exists: ${sessionId}`)
    ) {
      console.warn(`Session ${sessionId} already exists — updating state.`);
      // Just update the state instead of creating new
      stateRes = await fetch(sessionUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stateBody),
      });
    } else {
      throw new Error(
        `Failed to set session state: ${stateRes.status} ${stateRes.statusText} ${text}`
      );
    }
  }

  const sessionInfo = await stateRes.json().catch(() => ({}));
  console.log("Codemod session created/updated:", sessionInfo);

  // ---------- 2) Send the message to /run ----------
  const instruction = `Generate code modifications for updating ${dependencyName} from ${currentVersion} to ${targetVersion}.\n\nParser analysis:\n${JSON.stringify(
    parserResponse,
    null,
    2
  )}\n\nRepository data:\n${JSON.stringify(
    repositoryData,
    null,
    2
  )}\n\nPlease use the full_codemod tool to generate safe code modifications.`;

  const runBody = {
    app_name: appName,
    user_id: userId,
    session_id: sessionId,
    new_message: {
      role: "user",
      parts: [{ text: instruction }],
    },
  };

  const runRes = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(runBody),
  });

  if (!runRes.ok) {
    const text = await runRes.text().catch(() => "");
    throw new Error(
      `Codemod run call failed: ${runRes.status} ${runRes.statusText} ${text}`
    );
  }

  const result = await runRes.json().catch(async () => {
    const raw = await runRes.text();
    try {
      return JSON.parse(raw);
    } catch {
      return { rawResponse: raw };
    }
  });

  console.log("Codemod run result:", result);

  // Handle the streaming response structure
  if (Array.isArray(result) && result.length > 0) {
    const lastResponse = result[result.length - 1];
    if (
      lastResponse.content &&
      lastResponse.content.parts &&
      lastResponse.content.parts.length > 0
    ) {
      const content = lastResponse.content.parts[0];

      // Try to extract JSON from the content
      try {
        // The content might be a string or an object with text property
        const textContent =
          typeof content === "string" ? content : content.text || content;

        // Try to find JSON in the response
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }

        // If no JSON found, return the text content
        return {
          message: textContent,
          rawResponse: result,
        };
      } catch (error) {
        console.error("Error parsing codemod response content:", error);
        return {
          error: "Failed to parse codemod agent response",
          rawResponse: result,
        };
      }
    }
  }

  return {
    error: "Unexpected response format from codemod agent",
    rawResponse: result,
  };
}

// GitHub PR Creation Function using actual codemod results
async function createUpgradePR(
  repositoryData: { owner?: { login?: string } | string; name: string },
  plannerResponse: Record<string, unknown>,
  parserResponse: Record<string, unknown>,
  codemodResponse: Record<string, unknown>
) {
  try {
    // Initialize GitHub API client
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    // Extract repository information
    const repoOwner =
      typeof repositoryData.owner === "string"
        ? repositoryData.owner
        : repositoryData.owner?.login;
    const repoName = repositoryData.name;
    const branchName = `upgrade-${Date.now()}`;

    if (!repoOwner || !repoName) {
      throw new Error("Repository owner and name are required");
    }

    console.log(`Creating PR for ${repoOwner}/${repoName}`);

    // 1. Create a new branch
    console.log("📝 Creating new branch...");
    const mainBranch = await octokit.repos.getBranch({
      owner: repoOwner,
      repo: repoName,
      branch: "main",
    });

    await octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: mainBranch.data.commit.sha,
    });

    // 2. Apply codemod changes to files
    console.log("🔧 Applying codemod changes...");

    // Extract file changes from codemod response
    const fileChanges = extractFileChangesFromCodemod(codemodResponse);

    // Apply each file change
    for (const fileChange of fileChanges) {
      try {
        await applyFileChange(
          octokit,
          repoOwner,
          repoName,
          branchName,
          fileChange
        );
      } catch (error) {
        console.warn(`Could not apply change to ${fileChange.path}:`, error);
      }
    }

    // 3. Create migration documentation
    console.log("📚 Creating migration documentation...");
    const migrationDoc = createMigrationDocumentation(
      plannerResponse,
      parserResponse,
      codemodResponse
    );

    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path: "UPGRADE_MIGRATION.md",
      message: "docs: add upgrade migration guide",
      content: Buffer.from(migrationDoc).toString("base64"),
      branch: branchName,
    });

    // 4. Create the Pull Request
    console.log("🔀 Creating Pull Request...");
    const pr = await octokit.pulls.create({
      owner: repoOwner,
      repo: repoName,
      title: "🚀 Automated Dependency Upgrade",
      head: branchName,
      base: "main",
      body: createPRDescription(
        plannerResponse,
        parserResponse,
        codemodResponse,
        fileChanges
      ),
      labels: ["enhancement", "dependencies", "upgrade", "automated"],
    });

    console.log(`✅ Pull Request created successfully!`);
    console.log(`🔗 PR URL: ${pr.data.html_url}`);
    console.log(`📝 PR Number: #${pr.data.number}`);

    return {
      success: true,
      prUrl: pr.data.html_url,
      prNumber: pr.data.number,
      branchName: branchName,
      message: "Pull request created successfully",
      filesChanged: fileChanges.length,
    };
  } catch (error) {
    console.error("❌ Error creating upgrade PR:", error);
    throw error;
  }
}

// Extract file changes from codemod response
function extractFileChangesFromCodemod(
  codemodResponse: Record<string, unknown>
): Array<{
  path: string;
  content: string;
  message: string;
}> {
  const changes: Array<{ path: string; content: string; message: string }> = [];

  // Check if codemod response contains file changes
  if (codemodResponse.files && Array.isArray(codemodResponse.files)) {
    for (const file of codemodResponse.files as Array<
      Record<string, unknown>
    >) {
      if (file.path && file.content) {
        changes.push({
          path: file.path as string,
          content: file.content as string,
          message: (file.message as string) || `Update ${file.path}`,
        });
      }
    }
  }

  // If no specific file changes, create default package.json update
  if (changes.length === 0) {
    // Extract target package info from planner response
    const targetPackage =
      ((codemodResponse?.target as Record<string, unknown>)
        ?.package as string) || "next";
    const targetVersion =
      ((codemodResponse?.target as Record<string, unknown>)
        ?.latest_exact as string) || "latest";

    changes.push({
      path: "package.json",
      content: createUpdatedPackageJson(targetPackage, targetVersion),
      message: `Update ${targetPackage} to ${targetVersion}`,
    });
  }

  return changes;
}

// Apply a single file change
async function applyFileChange(
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  branchName: string,
  fileChange: { path: string; content: string; message: string }
) {
  try {
    // Try to get existing file content
    let sha: string | null = null;

    try {
      const fileContent = await octokit.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        path: fileChange.path,
        ref: branchName,
      });

      if (
        !Array.isArray(fileContent.data) &&
        fileContent.data.type === "file"
      ) {
        sha = fileContent.data.sha;
      }
    } catch {
      // File doesn't exist, we'll create it
      console.log(`Creating new file: ${fileChange.path}`);
    }

    // Create or update the file
    await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      path: fileChange.path,
      message: fileChange.message,
      content: Buffer.from(fileChange.content).toString("base64"),
      branch: branchName,
      sha: sha || undefined, // Convert null to undefined
    });

    console.log(`✅ Applied changes to ${fileChange.path}`);
  } catch (error) {
    console.error(`❌ Failed to apply changes to ${fileChange.path}:`, error);
    throw error;
  }
}

// Create updated package.json content
function createUpdatedPackageJson(
  targetPackage: string,
  targetVersion: string
): string {
  // This is a simplified example - in practice, you'd want to parse and update the actual package.json
  return JSON.stringify(
    {
      name: "project",
      version: "1.0.0",
      dependencies: {
        [targetPackage]: targetVersion,
      },
      devDependencies: {
        "@types/node": "^20",
        typescript: "^5",
      },
      engines: {
        node: ">=18.18.0",
      },
    },
    null,
    2
  );
}

// Create migration documentation
function createMigrationDocumentation(
  plannerResponse: Record<string, unknown>,
  parserResponse: Record<string, unknown>,
  codemodResponse: Record<string, unknown>
): string {
  return `# Automated Dependency Upgrade

## Overview
This PR was automatically generated by PatchMind's AI agents to upgrade your dependencies.

## Changes Made

### AI Agent Analysis
- **Planner Agent**: ${JSON.stringify(plannerResponse, null, 2)}
- **Parser Agent**: ${JSON.stringify(parserResponse, null, 2)}
- **Codemod Agent**: ${JSON.stringify(codemodResponse, null, 2)}

## Files Modified
${
  codemodResponse.files
    ? (codemodResponse.files as Array<Record<string, unknown>>)
        .map((f) => `- ${f.path}`)
        .join("\n")
    : "- package.json"
}

## Testing Instructions
1. Review the changes carefully
2. Run \`npm install\` to install updated dependencies
3. Run \`npm run build\` to ensure everything compiles
4. Run your test suite to verify functionality

## Rollback Plan
If issues arise, revert this PR and run \`npm install\` to restore previous versions.
`;
}

// Create PR description
function createPRDescription(
  plannerResponse: Record<string, unknown>,
  parserResponse: Record<string, unknown>,
  codemodResponse: Record<string, unknown>,
  fileChanges: Array<{ path: string; content: string; message: string }>
): string {
  return `## 🚀 Automated Dependency Upgrade

### Overview
This PR was automatically generated by PatchMind's AI agents to upgrade your dependencies safely and efficiently.

### ✅ Changes Made

#### Files Modified (${fileChanges.length})
${fileChanges.map((f) => `- **${f.path}**: ${f.message}`).join("\n")}

#### AI Agent Analysis

**Planner Agent Results:**
\`\`\`json
${JSON.stringify(plannerResponse, null, 2)}
\`\`\`

**Parser Agent Results:**
\`\`\`json
${JSON.stringify(parserResponse, null, 2)}
\`\`\`

**Codemod Agent Results:**
\`\`\`json
${JSON.stringify(codemodResponse, null, 2)}
\`\`\`

### 🧪 Testing Instructions

#### Before Merging
\`\`\`bash
# Install dependencies
npm install

# Run build
npm run build

# Run tests
npm test
\`\`\`

### 🔄 Rollback Plan
If issues arise, revert this PR and run \`npm install\` to restore previous versions.

---

**🤖 Generated by PatchMind AI Agents**

This PR was created automatically using our multi-agent system for safe dependency upgrades.`;
}
