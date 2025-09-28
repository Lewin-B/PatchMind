# codemod_agent_json.py
import os, re, json, time, hashlib, logging, difflib
from copy import deepcopy
from google.adk.agents import Agent
from pinecone import Pinecone

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("codemod_agent_json")

# ========= Pinecone / RAG (integrated embeddings) =========
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX", "")
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "docs")
PINECONE_INDEX_HOST = os.getenv("PINECONE_INDEX_HOST")
PINECONE_EMBED_MODEL = os.getenv("PINECONE_EMBED_MODEL", "llama-text-embed-v2")

# ========= State =========
_STATE = {
    "repo": {},                # in-memory repo JSON { files: [{path, content}, ...] }
    "repo_label": "",
    "artifacts": {},           # parser artifacts (plan + prioritized files + rag_guidance)
    "dry_run": True,
    "package_name": "",
    "current_version": "",
    "target_version": "",
    "last_guidance": {},       # compacted guidance extracted from RAG or artifacts.rag_guidance
    "custom_rules": [],        # user-supplied (regex -> replacement) rules
    "last_diffs": [],          # last generated diffs
    "modified_repo": None,     # repo after apply
}

CODE_EXT = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".cts", ".mts")

# ========= Helpers =========
def _pc():
    if not PINECONE_API_KEY:
        raise RuntimeError("PINECONE_API_KEY is not set")
    return Pinecone(api_key=PINECONE_API_KEY)

def _index(pc):
    host = PINECONE_INDEX_HOST
    if not host:
        desc = pc.describe_index(PINECONE_INDEX_NAME)
        host = desc["host"]
    return pc.Index(host=host)

def _rag_query(text, top_k=6, framework_hint=""):
    try:
        pc = _pc()
        idx = _index(pc)
        flt = {}
        if framework_hint:
            flt["framework"] = {"$eq": framework_hint}
        res = idx.query(
            namespace=PINECONE_NAMESPACE,
            top_k=int(top_k),
            text=text,
            include_metadata=True,
            **({"filter": flt} if flt else {})
        )
        out = []
        for m in res.get("matches", []):
            md = m.get("metadata", {}) or {}
            snippet = md.get("text", "")
            out.append({
                "score": m.get("score", 0.0),
                "title": md.get("title", ""),
                "url": md.get("url", ""),
                "framework": md.get("framework", ""),
                "chunk_index": md.get("chunk_index", -1),
                "snippet": (snippet[:400] + ("..." if len(snippet) > 400 else "")),
            })
        return out
    except Exception as e:
        log.error(f"RAG query failed: {e}")
        return []

def _is_code_file(path):
    return any(path.endswith(ext) for ext in CODE_EXT) or bool(re.search(r"next\.config\.m?js$", path))

def _file_list(repo):
    return [f for f in (repo.get("files") or []) if isinstance(f, dict) and "path" in f and "content" in f]

def _hash(s):
    return hashlib.sha256((s or "").encode("utf-8", errors="ignore")).hexdigest()[:10]

def _unified_diff(old_text, new_text, path):
    old = (old_text or "").splitlines(keepends=True)
    new = (new_text or "").splitlines(keepends=True)
    return "".join(difflib.unified_diff(old, new, fromfile=f"a/{path}", tofile=f"b/{path}", lineterm=""))

def _compact_guidance_from_artifacts(artifacts):
    """Turn rag_guidance into a topic->list[urls] map + keyword hints."""
    topics = {}
    for g in artifacts.get("rag_guidance", []):
        topic = g.get("topic", "misc")
        refs = g.get("references", [])
        urls = []
        hints = []
        for r in refs:
            u = r.get("url") or ""
            if u: urls.append(u)
            snip = (r.get("snippet") or "").lower()
            for kw in ["deprecated", "migration", "replace", "rename", "router", "app router", "config", "env", "server actions", "useRouter"]:
                if kw in snip:
                    hints.append(kw)
        topics[topic] = {
            "urls": list(dict.fromkeys(urls)),
            "hints": sorted(list(set(hints)))
        }
    return topics

# ========= Built-in codemod rules (safe, surgical) =========
class Rule:
    name = "base"
    description = "no-op"
    def applicable(self, path, content, context):  # context carries package_name, versions, hints
        return False
    def transform(self, path, content, context):
        return content, 0, []

# 1) next/router => next/navigation (named import)
class NextRouterNamedToNavigation(Rule):
    name = "next-router-named-import"
    description = "Replace `import { useRouter } from 'next/router'` with next/navigation."

    PATTERN = re.compile(r"""import\s*\{\s*useRouter\s*\}\s*from\s*['"]next/router['"];?""")

    def applicable(self, path, content, context):
        return context["package_name"].startswith("next") and bool(self.PATTERN.search(content))

    def transform(self, path, content, context):
        new = self.PATTERN.sub("import { useRouter } from 'next/navigation';", content)
        cnt = 1 if new != content else 0
        notes = []
        if cnt:
            notes.append("Switched useRouter import to next/navigation (App Router).")
        return new, cnt, notes

# 2) next/router default import -> warn + scaffold (non-breaking assist)
class NextRouterDefaultToNavigationWarning(Rule):
    name = "next-router-default-import-warning"
    description = "Flag default Router import and add TODO with suggested migration."

    PATTERN = re.compile(r"""import\s+Router\s+from\s+['"]next/router['"];?""")

    def applicable(self, path, content, context):
        return context["package_name"].startswith("next") and bool(self.PATTERN.search(content))

    def transform(self, path, content, context):
        if "// TODO(next-migrate)" in content:
            return content, 0, []
        note = (
            "// TODO(next-migrate): `import Router from 'next/router'` is legacy (Pages Router).\n"
            "// Consider refactoring to App Router APIs from 'next/navigation' (e.g., `useRouter`, `redirect`).\n"
        )
        new = note + content
        return new, 1, ["Annotated legacy default Router import; manual refactor recommended."]

# 3) next/legacy/image -> next/image
class NextLegacyImageToImage(Rule):
    name = "next-legacy-image"
    description = "Replace next/legacy/image with next/image."

    PATTERN = re.compile(r"""from\s+['"]next/legacy/image['"]""")

    def applicable(self, path, content, context):
        return context["package_name"].startswith("next") and bool(self.PATTERN.search(content))

    def transform(self, path, content, context):
        new = self.PATTERN.sub("from 'next/image'", content)
        cnt = 1 if new != content else 0
        notes = ["Replaced next/legacy/image with next/image."] if cnt else []
        return new, cnt, notes

# 4) next.config.js experimental -> add TODO note (don’t mutate settings blindly)
class NextConfigExperimentalNote(Rule):
    name = "next-config-experimental-note"
    description = "Add TODO note on experimental flags that commonly shift across versions."

    PATTERN = re.compile(r"next\.config\.m?js$")

    def applicable(self, path, content, context):
        return context["package_name"].startswith("next") and bool(self.PATTERN.search(path))

    def transform(self, path, content, context):
        if "experimental" in content and "// TODO(next-config)" not in content:
            note = (
                "// TODO(next-config): Check experimental flags against target version "
                f"{context['target_version']}. Confirm replacements/renames in docs.\n"
            )
            return note + content, 1, [f"Annotated experimental flags for Next {context['target_version']}."]
        return content, 0, []

# 5) React default -> createRoot hint (non-breaking, comment only)
class ReactCreateRootNote(Rule):
    name = "react-create-root-note"
    description = "Advise migration to createRoot if applicable (comment)."

    PATTERN = re.compile(r"ReactDOM\.render\(", re.MULTILINE)

    def applicable(self, path, content, context):
        return context["package_name"].startswith("react") and bool(self.PATTERN.search(content))

    def transform(self, path, content, context):
        if "// TODO(react-migrate)" in content:
            return content, 0, []
        note = (
            "// TODO(react-migrate): ReactDOM.render is legacy. Consider migrate to React 18 `createRoot` API.\n"
        )
        return note + content, 1, ["Annotated ReactDOM.render usage with createRoot guidance."]

# ========= Rule Engine =========
_BUILTIN_RULES = [
    NextRouterNamedToNavigation(),
    NextRouterDefaultToNavigationWarning(),
    NextLegacyImageToImage(),
    NextConfigExperimentalNote(),
    ReactCreateRootNote(),
]

def _should_consider_file(path, artifacts):
    pri = artifacts.get("prioritized_files", {}) or {}
    risky = set(pri.get("risky_first", []) or [])
    all_pkg = set(pri.get("all_package_files", []) or [])
    if risky or all_pkg:
        return (path in risky) or (path in all_pkg)
    # fallback: consider all code files
    return _is_code_file(path)

def _context():
    return {
        "package_name": _STATE.get("package_name",""),
        "current_version": _STATE.get("current_version",""),
        "target_version": _STATE.get("target_version",""),
        "hints": _STATE.get("last_guidance", {}),
    }

def _apply_rules_to_file(path, content):
    ctx = _context()
    changes = 0
    notes = []
    new_content = content
    for rule in _BUILTIN_RULES:
        if rule.applicable(path, new_content, ctx):
            new_content, c, n = rule.transform(path, new_content, ctx)
            changes += c
            notes.extend(n)
    # custom rules (regex -> replacement)
    for cr in _STATE["custom_rules"]:
        try:
            pat = re.compile(cr["pattern"], re.MULTILINE)
            before = new_content
            new_content = pat.sub(cr["replacement"], new_content)
            if new_content != before:
                changes += 1
                notes.append(f"Custom rule applied: {cr['name']}")
        except Exception as e:
            notes.append(f"Custom rule error ({cr.get('name','unnamed')}): {e}")
    return new_content, changes, notes

# ========= RAG steering from artifacts + optional live queries =========
def _harvest_guidance():
    art = _STATE.get("artifacts", {}) or {}
    compact = _compact_guidance_from_artifacts(art)
    # optionally supplement with a live high-level query
    pkg = _STATE.get("package_name","")
    tv = _STATE.get("target_version","")
    cv = _STATE.get("current_version") or "current"
    if pkg and tv:
        q = f"{pkg} migration {cv} to {tv} quick summary key API renames"
        extra = _rag_query(q, top_k=4, framework_hint="nextjs" if pkg.startswith("next") else "react" if pkg.startswith("react") else "")
        if extra:
            urls = list(dict.fromkeys([m.get("url") for m in extra if m.get("url")]))
            compact["supplemental"] = {"urls": urls, "hints": ["migration","api","rename"]}
    _STATE["last_guidance"] = compact
    return compact

# ========= Tools (plain-string IO) =========
def load_repo_json(repo_json_str: str):
    """
    Load entire repo JSON (same shape as parser's input).
    """
    try:
        repo = json.loads(repo_json_str)
        if not isinstance(repo, dict) or "files" not in repo:
            return json.dumps({"status":"error","message":"repo JSON must include 'files'"})
        _STATE["repo"] = repo
        _STATE["repo_label"] = repo.get("label","")
        return json.dumps({"status":"ok","files":len(_file_list(repo)),"label":_STATE["repo_label"]})
    except Exception as e:
        return json.dumps({"status":"error","message":str(e)})

def load_parser_artifacts(artifacts_json_str: str):
    """
    Load parser artifacts (parser_plan.json content).
    """
    try:
        art = json.loads(artifacts_json_str)
        if not isinstance(art, dict):
            return json.dumps({"status":"error","message":"artifacts JSON must be an object"})
        _STATE["artifacts"] = art
        _STATE["package_name"] = art.get("package","")
        _STATE["current_version"] = art.get("current_version","")
        _STATE["target_version"] = art.get("target_version","")
        _harvest_guidance()
        return json.dumps({
            "status":"ok",
            "package":_STATE["package_name"],
            "current_version":_STATE["current_version"],
            "target_version":_STATE["target_version"],
            "topics": list((_STATE["last_guidance"] or {}).keys())
        }, indent=2)
    except Exception as e:
        return json.dumps({"status":"error","message":str(e)})

def set_dry_run(flag_str: str):
    """
    "true" or "false" to toggle dry-run. Dry-run = generate diffs only.
    """
    flag = str(flag_str).strip().lower() in ["1","true","yes","y","on"]
    _STATE["dry_run"] = flag
    return json.dumps({"status":"ok","dry_run":_STATE["dry_run"]})

def add_custom_rule(rule_json_str: str):
    """
    Add a custom rule e.g.:
      {"name":"rename-foo","pattern":"from 'lib/foo'","replacement":"from 'lib/bar'"}
    """
    try:
        r = json.loads(rule_json_str)
        if not all(k in r for k in ["name","pattern","replacement"]):
            return json.dumps({"status":"error","message":"rule must have name, pattern, replacement"})
        _STATE["custom_rules"].append(r)
        return json.dumps({"status":"ok","custom_rules":len(_STATE['custom_rules'])})
    except Exception as e:
        return json.dumps({"status":"error","message":str(e)})

def suggest_changes():
    """
    Analyze repo against guidance and report *where* we intend to modify.
    """
    if not _STATE.get("repo"):
        return json.dumps({"status":"error","message":"load_repo_json first"})
    if not _STATE.get("artifacts"):
        return json.dumps({"status":"error","message":"load_parser_artifacts first"})

    files = _file_list(_STATE["repo"])
    consider = []
    for f in files:
        if _should_consider_file(f["path"], _STATE["artifacts"]) and _is_code_file(f["path"]):
            consider.append(f["path"])

    summary = {
        "status":"ok",
        "considering_files": consider[:2000],
        "rules": [r.name for r in _BUILTIN_RULES] + (["custom:"+r["name"] for r in _STATE["custom_rules"]] if _STATE["custom_rules"] else []),
        "guidance_hints": _STATE.get("last_guidance", {}),
        "dry_run": _STATE["dry_run"]
    }
    return json.dumps(summary, indent=2)

def generate_diffs():
    """
    Generate unified diffs for all files we intend to touch using the rule engine.
    Does not mutate repo (even if dry_run=false); apply_diffs handles mutation.
    """
    if not _STATE.get("repo"):
        return json.dumps({"status":"error","message":"load_repo_json first"})
    if not _STATE.get("artifacts"):
        return json.dumps({"status":"error","message":"load_parser_artifacts first"})

    diffs = []
    for f in _file_list(_STATE["repo"]):
        p = f["path"]
        if not (_should_consider_file(p, _STATE["artifacts"]) and _is_code_file(p)):
            continue
        before = f.get("content") or ""
        after, changes, notes = _apply_rules_to_file(p, before)
        if changes > 0 and after != before:
            patch = _unified_diff(before, after, p)
            diffs.append({
                "file": p,
                "before_hash": _hash(before),
                "after_hash": _hash(after),
                "changes": changes,
                "notes": notes,
                "patch": patch
            })

    _STATE["last_diffs"] = diffs
    return json.dumps({
        "status":"ok",
        "diff_count": len(diffs),
        "files_changed": [d["file"] for d in diffs],
        "preview": diffs[:5]  # include first few patches inline for visibility
    }, indent=2)

def apply_diffs():
    """
    Apply the last generated diffs to the in-memory repo (unless dry_run=True).
    Returns the list of applied files.
    """
    if _STATE["dry_run"]:
        return json.dumps({"status":"error","message":"dry_run is true; set_dry_run false to apply"})
    if not _STATE.get("last_diffs"):
        return json.dumps({"status":"error","message":"no diffs; run generate_diffs first"})

    new_repo = deepcopy(_STATE["repo"])
    idx = {f["path"]: i for i, f in enumerate(_file_list(new_repo))}
    applied = []
    for d in _STATE["last_diffs"]:
        path = d["file"]
        i = idx.get(path)
        if i is None:
            continue
        # Recompute transform (to ensure consistency) instead of patch-apply; safer for small files
        before = new_repo["files"][i]["content"]
        after, changes, _ = _apply_rules_to_file(path, before)
        if after != before:
            new_repo["files"][i]["content"] = after
            applied.append(path)

    _STATE["modified_repo"] = new_repo
    return json.dumps({"status":"ok","applied_files":applied,"count":len(applied)} , indent=2)

def export_repo_json(path_str: str):
    """
    Export the modified repo to disk as JSON (optional). Returns path written.
    """
    try:
        import pathlib
        repo = _STATE.get("modified_repo") or _STATE.get("repo")
        if not repo:
            return json.dumps({"status":"error","message":"no repo loaded"})
        out = pathlib.Path(path_str.strip() or "./codemod_repo.json")
        out.write_text(json.dumps(repo, indent=2))
        return json.dumps({"status":"ok","written":str(out),"files":len(_file_list(repo))}, indent=2)
    except Exception as e:
        return json.dumps({"status":"error","message":str(e)})

def full_codemod(repo_json_str: str, artifacts_json_str: str, dry_run_str: str):
    """
    Convenience: load -> artifacts -> set_dry_run -> suggest -> generate -> (maybe apply)
    """
    load_repo_json(repo_json_str)
    load_parser_artifacts(artifacts_json_str)
    set_dry_run(dry_run_str)
    suggest_changes()
    diffs = generate_diffs()
    if not _STATE["dry_run"]:
        apply_diffs()
    return diffs

root_agent = Agent(
    name="repo_codemod_agent_json",
    model="gemini-2.0-flash",
    description="Uses RAG + rule-based codemods to safely modify a repo provided as JSON.",
    instruction=(
        "Given repo JSON and parser artifacts, generate safe code modifications guided by RAG. "
        "Prefer surgical, deterministic transforms. If ambiguous, add a TODO comment with links "
        "instead of unsafe edits. Keep tool inputs as plain strings."
        "IF THE PARESER SIGNIFIES NOTHING NEEDS TO BE DONE DON'T MAKE ANY CHANGES"
    ),
    tools=[
        load_repo_json,
        load_parser_artifacts,
        set_dry_run,
        add_custom_rule,
        suggest_changes,
        generate_diffs,
        apply_diffs,
        export_repo_json,
        full_codemod
    ]
)

if __name__ == "__main__":
    print(json.dumps({"usage":"load_repo_json -> load_parser_artifacts -> set_dry_run('true'|'false') -> suggest_changes -> generate_diffs -> apply_diffs -> export_repo_json"}, indent=2))
