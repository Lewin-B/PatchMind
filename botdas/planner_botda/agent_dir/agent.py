from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import google_search
from google.genai import types
import json
from typing import Dict, Any, Optional

APP_NAME = "google_search_agent"
USER_ID = "user1234"
SESSION_ID = "1234"

SYSTEM_INSTRUCTION = (
    "You are an upgrade planner that ONLY has the google_search tool.\n"
    "\n"
    "You receive TWO inputs:\n"
    "  1) target_package: a string naming the package to upgrade (e.g., 'next', 'react', 'typescript').\n"
    "  2) repo_tree_json: a JSON object representing the repository's files/dirs. It WILL include the contents of one or more package.json files somewhere in the tree.\n"
    "\n"
    "Your job:\n"
    "  A) Parse repo_tree_json to locate ALL manifest files (package.json, package-lock.json, pnpm-lock.yaml, yarn.lock). Extract current versions for target_package and any related packages.\n"
    "  B) Use google_search to find the **latest STABLE** version of target_package and authoritative info about **peer/compat** requirements that upgrading it will introduce.\n"
    "     Run targeted queries like:\n"
    "       - '<target> latest stable version site:github.com OR site:npmjs.com OR site:docs.* OR site:<vendor domain>'\n"
    "       - '<target> peer dependencies <react|typescript|eslint|babel|vitest|jest|webpack|next|node> compatibility'\n"
    "       - '<target> migration guide'  '<target> breaking changes'\n"
    "  C) From results, infer if additional packages MUST/SHOULD be upgraded for compatibility (e.g., Next.js -> React & TypeScript, ESLint core ↔ eslint-plugin-* versions, Jest/Vitest, ts-jest, Babel SWC, Node engine).\n"
    "  D) Output a concise JSON object with this exact shape (no extra keys):\n"
    "     {\n"
    "       \"target\": {\"package\": \"...\", \"current\": \"x.y.z\"|null, \"latest_exact\": \"x.y.z\"|null},\n"
    "       \"updates\": [\n"
    "          {\"package\":\"...\",\"from\":\"x.y.z\"|null,\"to\":\"^a.b.c\"|\"latest\",\"reason\":\"...\",\n"
    "           \"citations\":[{\"title\":\"...\",\"link\":\"...\"}]}\n"
    "       ],\n"
    "       \"next_agent_instructions\": {\n"
    "         \"goal\": \"prepare codebase for codemod agent by isolating surfaces touched by the upgrade\",\n"
    "         \"files_likely_affected\": [\"paths...\"],\n"
    "         \"checks\": [\"e.g., ensure Node engine >= required\", \"update tsconfig target\", \"replace deprecated APIs\"],\n"
    "         \"search_terms\": [\"APIs to grep for based on migration notes\"],\n"
    "         \"build_and_test_plan\": [\"exact commands to run\"],\n"
    "         \"assumptions\": [\"only if not contradicted by citations\"]\n"
    "       }\n"
    "     }\n"
    "\n"
    "Rules:\n"
    "  - Prefer official docs, GitHub releases, vendor blogs. Avoid speculative sources.\n"
    "  - Do NOT invent versions; include citations (1–3 strong links) for each update rationale.\n"
    "  - Keep output *tight and complete* for a single cohesive PR.\n"
    "  - If multiple package.json files exist (monorepo), include workspace-specific paths inside 'files_likely_affected'.\n"
)

root_agent = Agent(
    name="basic_search_agent",
    model="gemini-2.0-flash",
    description="Agent to plan an upgrade for one target package and any required companion updates using ONLY Google Search.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[google_search]
)

def make_user_message(target_package: str, repo_tree_json: Dict[str, Any]) -> types.Content:
    """
    Formats the two inputs for the agent. The agent instruction explains how to parse them.
    - target_package: e.g., 'next'
    - repo_tree_json: a tree-like JSON (paths -> content OR nested dicts). Include any package.json contents.
    """
    payload = {
        "target_package": target_package,
        "repo_tree_json": repo_tree_json
    }
    return types.Content.text(
        "Plan a single-package upgrade based on the inputs below.\n"
        "Respond ONLY with the JSON object instructed in SYSTEM_INSTRUCTION.\n"
        + json.dumps(payload, ensure_ascii=False)
    )

if __name__ == "__main__":
    example_repo_tree = {
        "package.json": {
            "name": "root",
            "private": True,
            "packageManager": "pnpm@9.0.0",
            "devDependencies": {
                "typescript": "4.9.5",
                "eslint": "8.42.0",
                "eslint-config-next": "13.4.0",
                "@types/node": "18.17.0"
            }
        },
        "apps": {
            "web": {
                "package.json": {
                    "name": "web",
                    "dependencies": {
                        "next": "13.4.0",
                        "react": "18.2.0",
                        "react-dom": "18.2.0"
                    },
                    "devDependencies": {
                        "@testing-library/react": "14.0.0",
                        "jest": "29.7.0"
                    }
                }
            }
        },
    }

    target_pkg = "next"  # <— variable 1
    repo_tree_json = example_repo_tree  # <— variable 2

    runner = Runner(app_name=APP_NAME, root_agent=root_agent)
    sessions = InMemorySessionService()
    session = sessions.get_or_create_session(USER_ID, SESSION_ID)

    user_msg = make_user_message(target_pkg, repo_tree_json)
    result = runner.run(app_name=APP_NAME, user_id=USER_ID, session=session, content=user_msg)
    print(result.text)
