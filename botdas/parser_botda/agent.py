import os
import json
import hashlib
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# Agent framework
from google.adk.agents import Agent
from pinecone import Pinecone

# Embeddings
from sentence_transformers import SentenceTransformer

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ===== Pinecone Config =====
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX", "")
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "docs")
PINECONE_INDEX_HOST = os.getenv("PINECONE_INDEX_HOST")

# ===== Analysis Config =====
CHUNK_MAX_CHARS = 1200
CHUNK_OVERLAP_CHARS = 150
SIMILARITY_THRESHOLD = 0.7
MAX_SEARCH_RESULTS = 10

# ===== Embedding Config (ensure your index was built with the same model/dim) =====
EMBED_MODEL_NAME = "llama-text-embed-v2"
_embedder = None

def _get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBED_MODEL_NAME)
    return _embedder


class RepositoryParser:
    def __init__(self, config=None):
        self.config = config or self._default_config()
        self.pc = self._init_pinecone()
    
    def _default_config(self):
        return {
            'supported_extensions': {
                '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.mdx',
                '.css', '.scss', '.sass', '.less', '.py', '.yml', '.yaml'
            },
            'max_file_size_mb': 5,
            'max_workers': 4,
            'exclude_dirs': {
                'node_modules', '.git', '.next', 'dist', 'build', 
                'coverage', '.nyc_output', 'logs', 'tmp', '.cache'
            },
            'exclude_patterns': {
                '*.min.js', '*.bundle.js', '*.map', 
                '*.d.ts', '*.test.*', '*.spec.*'
            }
        }
        
    def _init_pinecone(self):
        if not PINECONE_API_KEY:
            raise RuntimeError("PINECONE_API_KEY is not set")
        return Pinecone(api_key=PINECONE_API_KEY)
    
    def parse_repository_json(self, repo_json):
        try:
            repo_data = json.loads(repo_json) if isinstance(repo_json, str) else repo_json
            
            if isinstance(repo_data, dict):
                if 'files' in repo_data:
                    files_data = repo_data['files']
                    repo_name = repo_data.get('name', 'unknown')
                else:
                    files_data = repo_data
                    repo_name = 'unknown'
            elif isinstance(repo_data, list):
                files_data = repo_data
                repo_name = 'unknown'
            else:
                raise ValueError("Invalid repository JSON structure")
            
            logger.info("Parsing repository '%s' with %d files", repo_name, len(files_data))
            parsed_files = []
            
            if isinstance(files_data, dict):
                file_items = files_data.items()
            elif isinstance(files_data, list):
                file_items = [(f.get('path', f.get('file_path', str(i))), f) for i, f in enumerate(files_data)]
            else:
                raise ValueError("Files data must be dict or list")
            
            with ThreadPoolExecutor(max_workers=self.config['max_workers']) as executor:
                future_to_file = {
                    executor.submit(self._parse_file_from_json, file_path, file_data): file_path 
                    for file_path, file_data in file_items
                }
                
                for future in as_completed(future_to_file):
                    file_path = future_to_file[future]
                    try:
                        parsed_file = future.result()
                        if parsed_file:
                            parsed_files.append(parsed_file)
                    except Exception as e:
                        logger.error("Failed to parse %s: %s", file_path, e)
            
            return parsed_files
            
        except json.JSONDecodeError as e:
            raise ValueError("Invalid JSON format: %s" % e)
        except Exception as e:
            raise ValueError("Error parsing repository JSON: %s" % e)
    
    def _parse_file_from_json(self, file_path, file_data):
        try:
            if isinstance(file_data, str):
                content = file_data
            elif isinstance(file_data, dict):
                content = file_data.get('content', file_data.get('code', ''))
            else:
                return None
            
            if not content:
                return None
            
            file_ext = '.' + file_path.split('.')[-1] if '.' in file_path else ''
            if file_ext not in self.config['supported_extensions']:
                return None
            
            file_type = self._determine_file_type(file_path)
            imports = self._extract_imports(content, file_type)
            exports = self._extract_exports(content, file_type)
            dependencies = self._extract_dependencies(content, file_type)
            api_usage = self._extract_api_usage(content, file_type)
            syntax_version = self._detect_syntax_version(content, file_type)
            
            return {
                'path': file_path,
                'content': content,
                'file_type': file_type,
                'size': len(content),
                'imports': imports,
                'exports': exports,
                'dependencies': dependencies,
                'api_usage': api_usage,
                'syntax_version': syntax_version,
                'last_modified': time.time(),
                'content_hash': hashlib.sha256(content.encode()).hexdigest()[:16]
            }
            
        except Exception as e:
            logger.error("Error parsing file %s: %s", file_path, e)
            return None
    
    def _determine_file_type(self, file_path):
        if '.' not in file_path:
            return 'unknown'
            
        extension = '.' + file_path.split('.')[-1].lower()
        
        type_mapping = {
            '.js': 'javascript',
            '.jsx': 'jsx', 
            '.ts': 'typescript',
            '.tsx': 'tsx',
            '.json': 'json',
            '.md': 'markdown',
            '.mdx': 'mdx',
            '.css': 'css',
            '.scss': 'scss',
            '.sass': 'sass', 
            '.less': 'less',
            '.py': 'python',
            '.yml': 'yaml',
            '.yaml': 'yaml'
        }
        
        return type_mapping.get(extension, 'unknown')
    
    def _extract_imports(self, content, file_type):
        imports = []
        
        if file_type in ['javascript', 'jsx', 'typescript', 'tsx']:
            es6_pattern = r'import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+[\'"]([^\'"]+)[\'"]'
            imports.extend(re.findall(es6_pattern, content))
            
            cjs_pattern = r'require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)'
            imports.extend(re.findall(cjs_pattern, content))
            
            dynamic_pattern = r'import\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)'
            imports.extend(re.findall(dynamic_pattern, content))
            
        elif file_type == 'python':
            import_pattern = r'(?:from\s+(\S+)\s+import|import\s+(\S+))'
            matches = re.findall(import_pattern, content)
            imports.extend([m[0] or m[1] for m in matches])
        
        return list(set(imports))
    
    def _extract_exports(self, content, file_type):
        exports = []
        
        if file_type in ['javascript', 'jsx', 'typescript', 'tsx']:
            named_pattern = r'export\s+(?:const|let|var|function|class)\s+(\w+)'
            exports.extend(re.findall(named_pattern, content))
            
            export_pattern = r'export\s+\{([^}]+)\}'
            matches = re.findall(export_pattern, content)
            for match in matches:
                exports.extend([name.strip() for name in match.split(',')])
            
            default_pattern = r'export\s+default\s+(?:class\s+(\w+)|function\s+(\w+)|(\w+))'
            matches = re.findall(default_pattern, content)
            exports.extend([m[0] or m[1] or m[2] for m in matches if any(m)])
        
        return list(set(exports))
    
    def _extract_dependencies(self, content, file_type):
        dependencies = set()
        
        if 'React' in content or 'react' in content.lower():
            dependencies.add('react')
        if 'useState' in content or 'useEffect' in content:
            dependencies.add('react-hooks')
        if 'Component' in content and 'render' in content:
            dependencies.add('react-class-components')
            
        if 'next/' in content:
            dependencies.add('nextjs')
        if 'getServerSideProps' in content or 'getStaticProps' in content:
            dependencies.add('nextjs-ssr')
        if 'useRouter' in content:
            dependencies.add('nextjs-router')
            
        if 'styled-components' in content:
            dependencies.add('styled-components')
        if '@emotion' in content:
            dependencies.add('emotion')
        if 'axios' in content:
            dependencies.add('axios')
            
        return list(dependencies)
    
    def _extract_api_usage(self, content, file_type):
        api_usage = []
        
        function_calls = re.findall(r'(\w+)\s*\([^)]]*\)', content)
        for call in function_calls[:20]:
            api_usage.append({
                'type': 'function_call',
                'name': call,
                'context': 'unknown'
            })
        
        method_calls = re.findall(r'(\w+)\.(\w+)\s*\([^)]]*\)', content)
        for obj, method in method_calls[:20]:
            api_usage.append({
                'type': 'method_call',
                'object': obj,
                'method': method,
                'context': 'unknown'
            })
        
        return api_usage
    
    def _detect_syntax_version(self, content, file_type):
        if file_type in ['javascript', 'jsx', 'typescript', 'tsx']:
            features = []
            if 'async/await' in content or re.search(r'\basync\s+\w+', content):
                features.append('es2017')
            if '=>' in content:
                features.append('es6-arrow-functions')
            if 'const ' in content or 'let ' in content:
                features.append('es6-variables')
            if 'class ' in content:
                features.append('es6-classes')
            if '`' in content and '${' in content:
                features.append('es6-template-literals')
            if '...' in content:
                features.append('es6-spread-operator')
            return ', '.join(features) if features else 'es5'
        return 'unknown'
    
    def analyze_for_update(self, parsed_files, dependency_name, current_version, target_version):
        logger.info(
            "Analyzing %d files for %s update: %s -> %s",
            len(parsed_files), dependency_name, current_version, target_version
        )
        
        relevant_files = [
            f for f in parsed_files 
            if dependency_name in f['dependencies'] or 
               any(dependency_name in imp for imp in f['imports'])
        ]
        
        logger.info("Found %d files using %s", len(relevant_files), dependency_name)
        
        analysis_results = []
        for file_info in relevant_files:
            try:
                analysis = self._analyze_file_for_update(
                    file_info, dependency_name, current_version, target_version
                )
                if analysis:
                    analysis_results.append(analysis)
            except Exception as e:
                logger.error("Failed to analyze %s: %s", file_info['path'], e)
        
        return analysis_results
    
    def _analyze_file_for_update(self, parsed_file, dependency_name, current_version, target_version):
        search_queries = self._generate_search_queries(parsed_file, dependency_name, target_version)
        
        breaking_changes = []
        usage_patterns = []
        recommended_changes = []
        confidence_score = 0.0
        
        for query in search_queries:
            try:
                search_results = self._search_documentation(query, dependency_name)
                for result in search_results:
                    analysis = self._analyze_search_result(
                        result, parsed_file, dependency_name, target_version
                    )
                    if analysis['breaking_changes']:
                        breaking_changes.extend(analysis['breaking_changes'])
                    if analysis['usage_patterns']:
                        usage_patterns.extend(analysis['usage_patterns'])
                    if analysis['recommendations']:
                        recommended_changes.extend(analysis['recommendations'])
                    confidence_score = max(confidence_score, analysis['confidence'])
            except Exception as e:
                logger.error("Error in RAG search for '%s': %s", query, e)
        
        requires_manual_review = (
            len(breaking_changes) > 0 or 
            confidence_score < SIMILARITY_THRESHOLD or
            any('deprecated' in str(usage).lower() for usage in usage_patterns)
        )
        
        return {
            'file_path': parsed_file['path'],
            'dependency_name': dependency_name,
            'current_version': current_version,
            'target_version': target_version,
            'usage_patterns': usage_patterns,
            'breaking_changes': breaking_changes,
            'recommended_changes': recommended_changes,
            'confidence_score': confidence_score,
            'requires_manual_review': requires_manual_review
        }
    
    def _generate_search_queries(self, parsed_file, dependency_name, target_version):
        queries = []
        queries.append(dependency_name + " " + target_version + " breaking changes")
        queries.append(dependency_name + " " + target_version + " migration guide")
        
        for api in parsed_file['api_usage'][:5]:
            if api['type'] == 'function_call':
                queries.append(dependency_name + " " + api['name'] + " " + target_version)
            elif api['type'] == 'method_call':
                queries.append(dependency_name + " " + api['object'] + "." + api['method'] + " " + target_version)
        
        for imp in parsed_file['imports']:
            if dependency_name in imp:
                queries.append(imp + " " + target_version + " changes")
        
        return queries
    
    # ===== Vector-based search using llama-text-embed-v2 =====
    def _search_documentation(self, query: str, framework: str) -> list:
        """
        Vector search against Pinecone using locally-computed embeddings (llama-text-embed-v2).
        """
        if not PINECONE_INDEX_HOST:
            logger.warning("No Pinecone index host configured")
            return []
        try:
            index = self.pc.Index(host=PINECONE_INDEX_HOST)

            # Build query embedding
            embedder = _get_embedder()
            q_vec = embedder.encode([query])[0].tolist()  # list[float]

            # Pinecone vector query
            resp = index.query(
                vector=q_vec,
                top_k=MAX_SEARCH_RESULTS,
                include_metadata=True,
                namespace=PINECONE_NAMESPACE,
                filter={"framework": {"$eq": framework}} if framework else None
            )

            # Handle SDK response shapes
            matches = []
            if hasattr(resp, "matches") and resp.matches is not None:
                matches = resp.matches
            elif hasattr(resp, "results") and resp.results:
                matches = resp.results[0].matches or []

            out = []
            for m in matches:
                score = getattr(m, "score", 0.0)
                if score >= SIMILARITY_THRESHOLD:
                    md = getattr(m, "metadata", {}) or {}
                    out.append({
                        "id": getattr(m, "id", ""),
                        "score": score,
                        "metadata": md,
                        "text": md.get("text", "")
                    })
            return out

        except Exception as e:
            logger.error("Error searching documentation: %s", e)
            return []
    
    def _analyze_search_result(self, result, parsed_file, dependency_name, target_version):
        text = (result.get('text', '') or '').lower()
        score = result.get('score', 0.0)
        
        breaking_changes = []
        usage_patterns = []
        recommendations = []
        
        breaking_indicators = [
            'breaking change', 'removed', 'deprecated', 'no longer', 
            'replaced with', 'migration required', 'breaking:'
        ]
        
        if any(indicator in text for indicator in breaking_indicators):
            breaking_changes.append({
                'type': 'potential_breaking_change',
                'description': (result.get('text', '') or '')[:200] + '...',
                'source': result.get('metadata', {}).get('url', ''),
                'confidence': score
            })
        
        for api in parsed_file['api_usage']:
            api_name = api.get('name', '').lower()
            if api_name and api_name in text:
                usage_patterns.append({
                    'api': api_name,
                    'type': api.get('type'),
                    'documentation': (result.get('text', '') or '')[:100] + '...',
                    'relevance_score': score
                })
        
        if 'use instead' in text or 'replace with' in text:
            recommendations.append({
                'type': 'replacement',
                'description': (result.get('text', '') or '')[:200] + '...',
                'source': result.get('metadata', {}).get('url', ''),
                'priority': 'high' if score > 0.8 else 'medium'
            })
        
        return {
            'breaking_changes': breaking_changes,
            'usage_patterns': usage_patterns,
            'recommendations': recommendations,
            'confidence': score
        }
    
    def generate_update_report(self, analysis_results):
        total_files = len(analysis_results)
        files_with_breaking_changes = len([r for r in analysis_results if r['breaking_changes']])
        files_requiring_review = len([r for r in analysis_results if r['requires_manual_review']])
        avg_confidence = sum(r['confidence_score'] for r in analysis_results) / total_files if total_files > 0 else 0
        
        breaking_changes_summary = {}
        for result in analysis_results:
            for change in result['breaking_changes']:
                change_type = change.get('type', 'unknown')
                if change_type not in breaking_changes_summary:
                    breaking_changes_summary[change_type] = []
                breaking_changes_summary[change_type].append({
                    'file': result['file_path'],
                    'description': change.get('description', '')
                })
        
        return {
            'summary': {
                'total_files_analyzed': total_files,
                'files_with_breaking_changes': files_with_breaking_changes,
                'files_requiring_manual_review': files_requiring_review,
                'average_confidence_score': round(avg_confidence, 3),
                'analysis_timestamp': time.time()
            },
            'breaking_changes_by_type': breaking_changes_summary,
            'detailed_results': [
                {
                    'file_path': r['file_path'],
                    'breaking_changes_count': len(r['breaking_changes']),
                    'usage_patterns_count': len(r['usage_patterns']),
                    'recommended_changes_count': len(r['recommended_changes']),
                    'confidence_score': r['confidence_score'],
                    'requires_manual_review': r['requires_manual_review']
                }
                for r in analysis_results
            ],
            'high_priority_files': [
                r['file_path'] for r in analysis_results 
                if r['requires_manual_review'] and r['confidence_score'] > SIMILARITY_THRESHOLD
            ]
        }


# ========== Exported Agent Tools (simple built-in type hints) ==========
parser = RepositoryParser()

def parse_repository(repo_path: str, dependency_name: str, current_version: str, target_version: str) -> str:
    """
    Parse a repository (JSON string) and analyze the impact of updating a dependency.
    All parameters are strings; returns a JSON string with the analysis report or error.
    """
    try:
        logger.info("Starting repository analysis")
        parsed_files = parser.parse_repository_json(repo_path)
        if not parsed_files:
            return json.dumps({
                "error": "No supported files found in repository",
                "dependency": dependency_name
            }, indent=2)

        analysis_results = parser.analyze_for_update(
            parsed_files, dependency_name, current_version, target_version
        )
        if not analysis_results:
            return json.dumps({
                "message": "No files using the dependency were found",
                "dependency": dependency_name
            }, indent=2)

        report = parser.generate_update_report(analysis_results)
        return json.dumps(report, indent=2)

    except Exception as e:
        logger.error("Error in parse_repository: %s", e)
        return json.dumps({"error": "Error analyzing repository: " + str(e)}, indent=2)


def search_documentation(query: str, framework: str = "") -> str:
    """
    Vector search against the documentation index using llama-text-embed-v2.
    Returns a JSON string with a 'results' list (possibly empty).
    """
    try:
        results = parser._search_documentation(query, framework)
        formatted = []
        for r in results:
            md = r.get("metadata", {}) or {}
            txt = r.get("text", "") or ""
            formatted.append({
                "score": r.get("score", 0.0),
                "url": md.get("url", ""),
                "title": md.get("title", ""),
                "snippet": (txt[:200] + "...") if len(txt) > 200 else txt
            })
        return json.dumps({
            "query": query,
            "framework": framework,
            "results": formatted
        }, indent=2)

    except Exception as e:
        logger.error("Error in search_documentation: %s", e)
        return json.dumps({"error": "Error searching documentation: " + str(e)}, indent=2)


# ========== Root Agent ==========
root_agent = Agent(
    name="repository_parser_agent",
    model="gemini-2.0-flash",
    description=(
        "Parses code repositories and uses RAG to analyze impact of dependency updates. "
        "Identifies breaking changes, usage patterns, and generates recommendations."
    ),
    instruction=(
        "Use the tools to parse repositories and analyze the impact of updating dependencies. "
        "The agent uses vector search against documentation to identify potential breaking changes "
        "and provide recommendations for code updates. Focus on accuracy and actionable insights."
    ),
    tools=[parse_repository, search_documentation]
)


# ========== Optional quick test ==========
if __name__ == "__main__":
    def test_parser():
        sample_repo = {
            "name": "test-repo",
            "files": {
                "src/App.js": "import React, { useState } from \"react\"; export default function App() { return <div>Hello</div>; }",
                "src/utils/helpers.js": "export const sum = (a, b) => a + b;",
                "package.json": json.dumps({"dependencies": {"react": "17.0.0", "axios": "0.27.0"}})
            }
        }
        
        result = parse_repository(
            repo_path=json.dumps(sample_repo),
            dependency_name="react",
            current_version="17.0.0",
            target_version="18.2.0"
        )
        print(result)

        docs = search_documentation("react 18 breaking changes", "react")
        print(docs)

    test_parser()
