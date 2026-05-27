from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('/home/ubuntu/work_audit/farmer-data-collection')
CLIENT = ROOT / 'client' / 'src'
MOBILE = ROOT / 'mobile' / 'src'

client_pages = sorted([p for p in CLIENT.rglob('*') if p.is_file() and 'pages' in p.parts and p.suffix in {'.ts', '.tsx'}])
mobile_screens = sorted([p for p in MOBILE.rglob('*') if p.is_file() and ('screens' in p.parts or 'features' in p.parts) and p.suffix in {'.ts', '.tsx'}])

api_pattern = re.compile(r'trpc\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)|fetch\(|axios\.')
crud_tokens = {
    'create': re.compile(r'create|add|new', re.I),
    'read': re.compile(r'get|list|fetch|query|overview|dashboard|details|view', re.I),
    'update': re.compile(r'update|edit|save|approve|assign|schedule', re.I),
    'delete': re.compile(r'delete|remove|archive|cancel', re.I),
    'search': re.compile(r'search|filter|lookup|find', re.I),
}


def analyze(paths: list[Path], base: Path) -> list[dict]:
    items = []
    for path in paths:
        text = path.read_text(errors='ignore')
        api_refs = []
        for match in api_pattern.finditer(text):
            if match.group(1) and match.group(2):
                api_refs.append(f"{match.group(1)}.{match.group(2)}")
            else:
                api_refs.append(match.group(0))
        crud = {k: bool(v.search(text)) for k, v in crud_tokens.items()}
        items.append({
            'path': str(path.relative_to(base)),
            'api_ref_count': len(api_refs),
            'api_refs': sorted(set(api_refs))[:30],
            'crud_signals': crud,
        })
    return items

report = {
    'client_pages': analyze(client_pages, CLIENT),
    'mobile_screens': analyze(mobile_screens, MOBILE),
}

out = ROOT / 'reports' / 'production-readiness' / 'ui-parity-inventory.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print(out)
