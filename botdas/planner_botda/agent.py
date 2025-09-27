from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import google_search
from google.genai import types

APP_NAME = "google_search_agent"
USER_ID = "user1234"
SESSION_ID = "1234"

SYSTEM_INSTRUCTION = (
    "You are an upgrade planner. You ONLY have the google_search tool. "
    "Given a repo JSON (workspace -> package.json), you must:\n"
    "1) Parse dependencies across all workspaces.\n"
    "2) For each package, run google_search for:\n"
    "   - '<pkg> latest stable version release notes'\n"
    "   - '<pkg> migration guide'\n"
    "   - '<pkg> breaking changes'\n"
    "3) From search results, extract likely latest STABLE versions and key migration notes. "
    "   Prefer official sources (framework docs, GitHub releases, vendor blogs). "
    "4) Output a concise JSON object with:\n"
    '   {\n'
    '     "overview": {"package_manager": "...", "packages": [...]},\n'
    '     "actions": [\n'
    '       {"package":"...", "current":"...", "target":"^x.y.z"|"latest", "latest_exact":"x.y.z"|null,\n'
    '        "rationale":"from release notes", "citations":[{"title":"...","link":"..."}]}\n'
    '     ],\n'
    '     "instructions": {\n'
    '       "resolver_agent": {"goal":"verify versions from citations and normalize \'latest\'"},\n'
    '       "manifest_update_agent": {"goal":"apply ^ ranges & align React/TS majors"},\n'
    '       "installer_agent": {"goal":"install and refresh lockfile"},\n'
    '       "codemod_agent": {"goal":"apply breaking-change codemods from cited guides"},\n'
    '       "build_test_agent": {"goal":"run build/tests and report"}\n'
    '     }\n'
    '   }\n'
    "Rules: keep output tight; do not invent versions without evidence; cite top 3 authoritative links per package."
)

root_agent = Agent(
    name="basic_search_agent",
    model="gemini-2.0-flash",
    description="Agent to devise upgrade plans using ONLY Google Search results.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[google_search] 
)

# Optional: quick wiring to run the agent locally via the ADK Runner.
if __name__ == "__main__":
    runner = Runner(app_name=APP_NAME, root_agent=root_agent)
    sessions = InMemorySessionService()
    session = sessions.get_or_create_session(USER_ID, SESSION_ID)

    # Example prompt (paste your repo JSON as shown):
    user_msg = types.Content.text(
        "Plan upgrades for this repo_json (package_manager=pnpm): "
        '{"": {"dependencies":{"next":"13.4.0","react":"18.2.0"},'
        '"devDependencies":{"typescript":"4.9.5","eslint":"8.42.0"}}}'
    )

    result = runner.run(app_name=APP_NAME, user_id=USER_ID, session=session, content=user_msg)
    print(result.text)
