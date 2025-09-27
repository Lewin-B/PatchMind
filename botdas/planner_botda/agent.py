from google.adk.agents import Agent
import os, glob, json, re

# 1) Simple return type: dict
def scan_repo(repo_path: str = ".") -> dict:
    """Scan the repo and return workspaces found (JSON-serializable dict)."""
    workspaces = []
    for p in glob.glob(os.path.join(repo_path, "**/package.json"), recursive=True):
        if "node_modules" in p:
            continue
        rel = os.path.relpath(os.path.dirname(p), repo_path)
        workspaces.append("" if rel == "." else rel)
    # de-dup while preserving order
    seen, dedup = set(), []
    for w in workspaces:
        if w not in seen:
            seen.add(w); dedup.append(w)
    if not dedup:
        dedup = [""]

    return {"status": "success", "workspaces": dedup}

# 2) Placeholder RAG that returns a dict
def retrieve_migration_docs(prev_version: str, next_version: str, top_k: int = 5) -> dict:
    """Placeholder retrieval; returns a dict with a docs list."""
    return {
        "status": "success",
        "docs": [
            {
                "text": f"Example migration note for {prev_version} → {next_version}.",
                "source": "https://example.com/migration-guide"
            }
        ]
    }

# 3) Synthesis takes ONLY primitives (JSON strings for complex data)
def synthesize_upgrade_plan(prev_version: str,
                            next_version: str,
                            workspaces_json: str,
                            docs_json: str) -> dict:
    """
    Build a plan using simple primitive inputs.
    - workspaces_json: JSON string of list[str]
    - docs_json: JSON string of list[{'text': str, 'source': str}]
    """
    try:
        workspaces = json.loads(workspaces_json)
    except Exception:
        workspaces = [""]

    try:
        docs = json.loads(docs_json)
    except Exception:
        docs = []

    first_ws = workspaces[0] if workspaces else ""

    return {
        "status": "success",
        "plan": {
            "target_versions": {"next": next_version},
            "workspaces": workspaces,
            "rules": [
                {
                    "id": "bump-next",
                    "type": "deps",
                    "scope": first_ws,
                    "priority": "high",
                    "summary": f"Upgrade Next.js from {prev_version} to {next_version}",
                    "citations": [docs[0]["source"]] if docs else []
                }
            ],
            "gates": {"type_errors": 0, "test_failures": 0, "new_lint_errors": 0}
        }
    }

# 4) Orchestrator tool sticks to primitives & dict return
def build_upgrade_plan(prev_version: str,
                       next_version: str,
                       repo_path: str = ".") -> dict:
    """End-to-end: scan -> (placeholder) retrieve -> synthesize; returns dict plan."""
    repo = scan_repo(repo_path)
    if repo.get("status") != "success":
        return repo

    docs = retrieve_migration_docs(prev_version, next_version)
    if docs.get("status") != "success":
        return docs

    workspaces_json = json.dumps(repo["workspaces"])
    docs_json = json.dumps(docs["docs"])
    return synthesize_upgrade_plan(prev_version, next_version, workspaces_json, docs_json)

root_agent = Agent(
    name="planner_agent",
    model="gemini-2.0-flash",
    description="Creates an upgrade plan to go from a previous version to a next version (placeholder RAG).",
    instruction="Given prev_version and next_version, scan the repo and output a JSON upgrade plan.",
    tools=[scan_repo, retrieve_migration_docs, synthesize_upgrade_plan, build_upgrade_plan]
)
