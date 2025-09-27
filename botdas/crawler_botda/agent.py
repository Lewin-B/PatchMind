import os
import json
import hashlib
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import time
import requests
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

# Agent framework
from google.adk.agents import Agent

from pinecone import Pinecone

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class CrawlerConfig:
    nextjs_base_url: str = "https://nextjs.org/docs"
    react_base_url: str = "https://react.dev/learn"
    language: str = "en"
    max_workers: int = 5
    timeout: int = 10
    max_retries: int = 3
    retry_delay: int = 1

# ===== Preprocessing Config =====
CHUNK_MAX_CHARS = 1200
CHUNK_OVERLAP_CHARS = 150
DISPLAY_MAX_RECORDS = 5
DISPLAY_TEXT_SNIPPET = 300

# ===== Pinecone Config =====
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX", "")
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1")
PINECONE_EMBED_MODEL = os.getenv("PINECONE_EMBED_MODEL", "llama-text-embed-v2")  # also supports multilingual-e5-large
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "docs")
PINECONE_INDEX_HOST = os.getenv("PINECONE_INDEX_HOST")

# Pinecone batch size limit for text upserts
PINECONE_MAX_BATCH_SIZE = 96  # Maximum batch size for Pinecone text upserts

# =============================== Existing Parser ===============================
class DocumentationParser:
    def __init__(self, config: CrawlerConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'NextJS-React-Documentation-Parser/1.2'})
    
    def generate_content_hash(self, content: str) -> str:
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    def check_robots_txt(self, base_url: str) -> bool:
        try:
            robots_url = urljoin(base_url, '/robots.txt')
            response = self.session.get(robots_url, timeout=self.config.timeout)
            if response.status_code == 200:
                robots_content = response.text.lower()
                if 'disallow: /' in robots_content and 'user-agent: *' in robots_content:
                    logger.warning("Robots.txt disallows crawling")
                    return False
            return True
        except Exception as e:
            logger.warning(f"Could not check robots.txt: {e}")
            return True
    
    def discover_urls_from_sitemap(self, base_url: str) -> List[str]:
        urls = []
        sitemap_urls = [urljoin(base_url, '/sitemap.xml'), urljoin(base_url, '/sitemap_index.xml')]
        for sitemap_url in sitemap_urls:
            try:
                r = self.session.get(sitemap_url, timeout=self.config.timeout)
                if r.status_code == 200:
                    urls.extend(self._parse_sitemap(r.text, base_url))
            except Exception as e:
                logger.debug(f"Could not fetch sitemap {sitemap_url}: {e}")
        return urls
    
    def _parse_sitemap(self, sitemap_content: str, base_url: str) -> List[str]:
        urls = []
        try:
            root = ET.fromstring(sitemap_content)
            for sm in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}sitemap'):
                loc = sm.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')
                if loc is not None:
                    try:
                        r = self.session.get(loc.text, timeout=self.config.timeout)
                        if r.status_code == 200:
                            urls.extend(self._parse_sitemap(r.text, base_url))
                    except Exception as e:
                        logger.debug(f"Could not fetch nested sitemap {loc.text}: {e}")
            for url_elem in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}url'):
                loc = url_elem.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')
                if loc is not None and self._is_documentation_url(loc.text, base_url):
                    urls.append(loc.text)
        except ET.ParseError as e:
            logger.error(f"Error parsing sitemap: {e}")
        return urls
    
    def _is_documentation_url(self, url: str, base_url: str) -> bool:
        pb = urlparse(base_url)
        pu = urlparse(url)
        if pu.netloc != pb.netloc:
            return False
        if not pu.path.startswith(pb.path):
            return False
        excluded_paths = ['/api/', '/blog/', '/showcase/', '/templates/', '/examples/']
        if any(ex in pu.path for ex in excluded_paths):
            return False
        return True
    
    def discover_navigation_links(self, base_url: str, max_depth: int = 2) -> List[str]:
        urls_to_visit = [base_url]
        visited, discovered = set(), set([base_url])
        for _ in range(max_depth):
            if not urls_to_visit:
                break
            level = urls_to_visit.copy(); urls_to_visit = []
            for url in level:
                if url in visited:
                    continue
                visited.add(url)
                links = self._extract_nav_links(url, base_url)
                for link in links:
                    if link not in discovered and self._is_documentation_url(link, base_url):
                        discovered.add(link)
                        if link not in visited:
                            urls_to_visit.append(link)
        return list(discovered)
    
    def _extract_nav_links(self, url: str, base_url: str) -> List[str]:
        try:
            r = self.session.get(url, timeout=self.config.timeout); r.raise_for_status()
            soup = BeautifulSoup(r.text, 'html.parser')
            links = []
            nav_selectors = ['nav a[href]', '.sidebar a[href]', '.toc a[href]', '.navigation a[href]',
                             '[role="navigation"] a[href]', '.docs-navigation a[href]', '.menu a[href]']
            for sel in nav_selectors:
                for a in soup.select(sel):
                    href = a.get('href')
                    if not href:
                        continue
                    if href.startswith('/'):
                        links.append(urljoin(url, href))
                    elif href.startswith('http') and urlparse(href).netloc == urlparse(base_url).netloc:
                        links.append(href)
            return list(set(links))
        except Exception as e:
            logger.error(f"Error extracting links from {url}: {e}")
            return []
    
    def parse_page(self, url: str, framework: str) -> Optional[Dict[str, Any]]:
        for attempt in range(self.config.max_retries):
            try:
                r = self.session.get(url, timeout=self.config.timeout); r.raise_for_status()
                soup = BeautifulSoup(r.text, 'html.parser')
                main = self._extract_main_content(soup)
                return {
                    'url': url,
                    'framework': framework,
                    'title': self._extract_title(soup),
                    'description': self._extract_description(soup),
                    'content': main,
                    'headings': self._extract_headings(soup),
                    'code_examples': self._extract_code_examples(soup),
                    'api_references': self._extract_api_references(soup),
                    'links': self._extract_internal_links(soup, url),
                    'metadata': self._extract_metadata(soup),
                    'content_hash': self.generate_content_hash(main),
                    'parsed_at': time.time()
                }
            except Exception as e:
                logger.error(f"Attempt {attempt+1} failed for {url}: {e}")
                if attempt < self.config.max_retries - 1:
                    time.sleep(self.config.retry_delay * (2 ** attempt))
                else:
                    logger.error(f"Failed to parse {url} after {self.config.max_retries} attempts")
                    return None
    
    def _extract_title(self, soup: BeautifulSoup) -> str:
        for sel in ['h1', '.page-title', '.doc-title', '.content h1', 'main h1', 'article h1']:
            el = soup.select_one(sel)
            if el:
                return el.get_text().strip()
        t = soup.find('title')
        return t.get_text().strip() if t else "Untitled"
    
    def _extract_description(self, soup: BeautifulSoup) -> str:
        m = soup.find('meta', attrs={'name': 'description'})
        if m and m.get('content'):
            return m['content'].strip()
        og = soup.find('meta', attrs={'property': 'og:description'})
        if og and og.get('content'):
            return og['content'].strip()
        p = soup.select_one('main p, .content p, article p')
        if p:
            txt = p.get_text().strip()
            return (txt[:200] + "...") if len(txt) > 200 else txt
        return ""
    
    def _extract_main_content(self, soup: BeautifulSoup) -> str:
        for el in soup.select('nav, footer, .sidebar, .toc, .breadcrumb, .header, .navbar'):
            el.decompose()
        for sel in ['main', '[role="main"]', '.docs-content', '.markdown-body', '.content', 'article', '.documentation', '.prose']:
            content = soup.select_one(sel)
            if content:
                return content.get_text(separator="\n").strip()
        b = soup.find('body')
        return b.get_text(separator="\n").strip() if b else soup.get_text(separator="\n").strip()
    
    def _extract_headings(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        out = []
        for h in soup.find_all(['h1','h2','h3','h4','h5','h6']):
            out.append({'level': int(h.name[1]), 'text': h.get_text().strip(), 'id': h.get('id','')})
        return out
    
    def _extract_code_examples(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        ex = []
        for pre in soup.find_all('pre'):
            code_elem = pre.find('code') or pre
            lang = 'text'
            for elem in [code_elem, pre]:
                if elem.get('class'):
                    for cls in elem['class']:
                        if cls.startswith('language-'):
                            lang = cls.replace('language-',''); break
                        if cls.startswith('lang-'):
                            lang = cls.replace('lang-',''); break
                    if lang != 'text': break
            code_text = code_elem.get_text().strip()
            if len(code_text) > 10:
                ex.append({'language': lang, 'code': code_text, 'lines': len(code_text.split('\n'))})
        return ex
    
    def _extract_api_references(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        refs = []
        for table in soup.find_all('table'):
            headers = [th.get_text().strip() for th in table.find_all('th')]
            if any(k in ' '.join(headers).lower() for k in ['prop','parameter','option','api','method']):
                rows = []
                for tr in table.find_all('tr')[1:]:
                    cells = [td.get_text().strip() for td in tr.find_all(['td','th'])]
                    if cells: rows.append(cells)
                refs.append({'type':'table','headers':headers,'rows':rows})
        for code in soup.find_all('code'):
            t = code.get_text().strip()
            if any(k in t for k in ['function ','const ','export ','interface ']) and len(t) < 200:
                refs.append({'type':'function','signature':t})
        return refs
    
    def _extract_internal_links(self, soup: BeautifulSoup, base_url: str) -> List[Dict[str, str]]:
        links = []; base_domain = urlparse(base_url).netloc
        for a in soup.find_all('a', href=True):
            href = a['href']
            full = urljoin(base_url, href) if href.startswith('/') else href
            if urlparse(full).netloc == base_domain:
                links.append({'url': full, 'text': a.get_text().strip(), 'title': a.get('title','')})
        return links
    
    def _extract_metadata(self, soup: BeautifulSoup) -> Dict[str, str]:
        m = {}
        for meta in soup.find_all('meta'):
            name = meta.get('name') or meta.get('property')
            content = meta.get('content')
            if name and content: m[name] = content
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                j = json.loads(script.string)
                if isinstance(j, dict):
                    m['structured_data'] = j; break
            except (json.JSONDecodeError, TypeError):
                continue
        return m
    
    def scan_framework_docs(self, framework: str, base_url: str) -> Dict[str, Any]:
        logger.info(f"Starting {framework} documentation scan: {base_url}")
        if not self.check_robots_txt(base_url):
            return {'error':'Crawling not allowed by robots.txt', 'framework':framework, 'base_url':base_url}
        logger.info(f"Discovering {framework} URLs...")
        sitemap_urls = self.discover_urls_from_sitemap(base_url)
        nav_urls = self.discover_navigation_links(base_url)
        all_urls = list(set(sitemap_urls + nav_urls + [base_url]))
        logger.info(f"Discovered {len(all_urls)} {framework} URLs")
        parsed, failed = [], []
        with ThreadPoolExecutor(max_workers=self.config.max_workers) as ex:
            fut = {ex.submit(self.parse_page, u, framework): u for u in all_urls}
            for f in as_completed(fut):
                u = fut[f]
                try:
                    res = f.result()
                    if res: parsed.append(res)
                    else: failed.append(u)
                except Exception as e:
                    failed.append(u); logger.error(f"Failed to parse {u}: {e}")
        return {
            'framework': framework,
            'base_url': base_url,
            'total_urls': len(all_urls),
            'successful_parses': len(parsed),
            'failed_parses': len(failed),
            'failed_urls': failed,
            'pages': parsed,
            'scan_completed_at': time.time()
        }

# ========================= Preprocess for Pinecone =========================
def _normalize_whitespace(text: str) -> str:
    return "\n".join(line.strip() for line in text.replace("\r", "").split("\n") if line.strip())

def _size_chunk(body: str, max_chars: int, overlap: int) -> List[str]:
    body = body.strip()
    if len(body) <= max_chars: return [body]
    chunks, start = [], 0
    while start < len(body):
        end = min(len(body), start + max_chars)
        chunks.append(body[start:end])
        if end == len(body): break
        start = max(0, end - overlap)
    return chunks

def preprocess_pages_for_vectors(pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    created_at = int(time.time())
    for page in pages:
        try:
            raw = page.get('content','') or ''
            text = _normalize_whitespace(raw)
            framework = page.get('framework','')
            url = page.get('url','')
            title = page.get('title','')
            content_hash = page.get('content_hash','')
            chunks = _size_chunk(text, CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS)
            for idx, chunk in enumerate(chunks):
                base = f"{url}|{content_hash}|{idx}"
                rec_id = hashlib.md5(base.encode()).hexdigest()
                rec = {
                    "_id": rec_id,
                    "text": chunk,        # ✅ changed from chunk_text to text
                    "framework": framework,
                    "url": url,
                    "title": title,
                    "content_hash": content_hash,
                    "chunk_index": idx,
                    "created_at": created_at
                }
                records.append(rec)
        except Exception as e:
            logger.error(f"Preprocess failed for page {page.get('url')}: {e}")
    return records

# ========================= Pinecone helpers (integrated) =========================
def pinecone_client() -> Pinecone:
    if not PINECONE_API_KEY:
        raise RuntimeError("PINECONE_API_KEY is not set")
    return Pinecone(api_key=PINECONE_API_KEY)

def ensure_integrated_index(pc: Pinecone,
                            index_name: str = PINECONE_INDEX_NAME,
                            cloud: str = PINECONE_CLOUD,
                            region: str = PINECONE_REGION,
                            model: str = PINECONE_EMBED_MODEL,
                            text_field: str = "chunk_text") -> str:
    """
    Create a DENSE index with integrated embedding if it doesn't exist.
    Returns the index host and prints guidance for production usage.
    """
    if not pc.has_index(index_name):
        logger.info(f"Creating Pinecone integrated index '{index_name}' with model '{model}' in {cloud}/{region}")
        pc.create_index_for_model(
            name=index_name,
            cloud=cloud,
            region=region,
            embed={
                "model": model,
                "field_map": {"text": text_field}
            }
        )
    # Get host once (cache it or set via env for prod)
    desc = pc.describe_index(index_name)
    host = desc["host"]
    return host

def upsert_records_integrated(pc: Pinecone,
                              host: str,
                              records: List[Dict[str, Any]],
                              namespace: str = PINECONE_NAMESPACE,
                              batch_size: int = PINECONE_MAX_BATCH_SIZE) -> Dict[str, Any]:
    """
    Upsert FLAT records into an index with integrated embedding.
    Each record MUST include:
      - _id (or id)
      - chunk_text (mapped as the embed text field)
      - other keys are stored as metadata
    
    Uses batch_size=96 to respect Pinecone's text upsert limit.
    """
    # Ensure batch_size doesn't exceed the limit
    batch_size = min(batch_size, PINECONE_MAX_BATCH_SIZE)
    
    index = pc.Index(host=host)
    total = 0
    failed_batches = 0
    
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(records) + batch_size - 1) // batch_size
        
        try:
            logger.info(f"Upserting batch {batch_num}/{total_batches} ({len(batch)} records)")
            # Upsert text+metadata; Pinecone embeds chunk_text automatically
            index.upsert_records(namespace, batch)
            total += len(batch)
            # Small delay to avoid rate limiting
            time.sleep(0.1)
        except Exception as e:
            logger.error(f"Failed to upsert batch {batch_num}: {e}")
            failed_batches += 1
            # Continue with next batch rather than failing completely
            continue
    
    # Optional: stats
    return {
        "namespace": namespace, 
        "upserted": total, 
        "total_records": len(records),
        "batch_size": batch_size,
        "failed_batches": failed_batches,
        "index_host": host
    }

def _preview_pinecone_batch(records: List[Dict[str, Any]]) -> str:
    preview = []
    for r in records[:DISPLAY_MAX_RECORDS]:
        preview.append({
            "_id": r["_id"],
            "title": r.get("title"),
            "framework": r.get("framework"),
            "url": r.get("url"),
            "chunk_index": r.get("chunk_index"),
            "chunk_text_preview": (
                r["text"][:DISPLAY_TEXT_SNIPPET] + ("..." if len(r["text"])>DISPLAY_TEXT_SNIPPET else "")
            ),
        })
    return json.dumps(preview, indent=2)

# ========================= Wire into your tools =========================
config = CrawlerConfig()
parser = DocumentationParser(config)

def _ingest_and_upsert(framework: str, base_url: str) -> str:
    """Scan -> preprocess -> upsert to Pinecone (integrated embedding) and display preview."""
    result = parser.scan_framework_docs(framework, base_url)
    if 'error' in result:
        return f"Error: {result['error']}"
    pages = result.get('pages', [])
    records = preprocess_pages_for_vectors(pages)
    # Pinecone
    pc = pinecone_client()
    host = PINECONE_INDEX_HOST or ensure_integrated_index(pc)
    up = upsert_records_integrated(pc, host, records)
    summary = {
        "framework": framework,
        "total_pages": result['successful_parses'],
        "failed_pages": result['failed_parses'],
        "records_prepared": len(records),
        "pinecone": up
    }
    display = (
        "=== Ingest & Upsert Summary ===\n" +
        json.dumps(summary, indent=2) +
        "\n\n=== Sample Records (pre-upsert view) ===\n" +
        _preview_pinecone_batch(records)
    )
    return display

# -------- Agent Tools --------
def ingest_all() -> str:
    """Ingest Next.js and React; preprocess; upsert to Pinecone integrated index; preview results."""
    try:
        nj = _ingest_and_upsert('nextjs', config.nextjs_base_url)
        rc = _ingest_and_upsert('react', config.react_base_url)
        return nj + "\n\n---\n\n" + rc
    except Exception as e:
        logger.error(f"Error in ingest_all: {e}")
        return f"Error ingest_all: {e}"

def ingest_nextjs() -> str:
    try:
        return _ingest_and_upsert('nextjs', config.nextjs_base_url)
    except Exception as e:
        logger.error(f"Error in ingest_nextjs: {e}")
        return f"Error scanning Next.js documentation: {e}"

def ingest_react() -> str:
    try:
        return _ingest_and_upsert('react', config.react_base_url)
    except Exception as e:
        logger.error(f"Error in ingest_react: {e}")
        return f"Error scanning React documentation: {e}"
    
# Query functions below still do live scans; for production you'd search Pinecone.
def query(query_text: str) -> str:
    return "Tip: With an integrated-embedding index, query Pinecone directly with text for semantic search."

def query_nextjs(query_text: str) -> str:
    return "Tip: Use Pinecone .query() with text to search your integrated index."

def query_react(query_text: str) -> str:
    return "Tip: Use Pinecone .query() with text to search your integrated index."

# -------- Root Agent --------
root_agent = Agent(
    name="framework_doc_agent",
    model="gemini-2.0-flash",
    description="Scans & parses Next.js/React docs, preprocesses, and upserts to Pinecone (integrated embedding).",
    instruction=(
        "Use the tools to scan/parse and upsert vector-ready records into Pinecone. "
        "Index uses integrated embeddings (Pinecone embeds the 'chunk_text' field). "
        f"Batch size is limited to {PINECONE_MAX_BATCH_SIZE} records per upsert to comply with Pinecone limits."
    ),
    tools=[ingest_all, ingest_nextjs, ingest_react, query, query_nextjs, query_react]
)

if __name__ == "__main__":
    def test_agent():
        print(ingest_nextjs())
    test_agent()