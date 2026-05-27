from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('/home/ubuntu/work_audit/farmer-data-collection')
SERVICE_ROOTS = sorted([p for p in (ROOT / 'services').iterdir() if p.is_dir()], key=lambda p: p.name.lower())
for extra in ['ml-service', 'cache-service', 'event-consumer']:
    p = ROOT / extra
    if p.exists() and p.is_dir():
        SERVICE_ROOTS.append(p)

SEARCH_DIRS = [
    ROOT / 'server',
    ROOT / 'client',
    ROOT / 'mobile',
    ROOT / 'deployment',
    ROOT / 'k8s',
    ROOT / 'config',
]
COMPOSE_FILES = sorted(ROOT.glob('docker-compose*.yml')) + sorted(ROOT.glob('docker-compose*.yaml'))

results = []
for svc in SERVICE_ROOTS:
    name = svc.name
    pattern = re.compile(re.escape(name))
    compose_refs = []
    for compose in COMPOSE_FILES:
        text = compose.read_text(errors='ignore')
        if pattern.search(text):
            compose_refs.append(str(compose.relative_to(ROOT)))

    code_refs = []
    for base in SEARCH_DIRS:
        if not base.exists():
            continue
        for f in base.rglob('*'):
            if not f.is_file():
                continue
            if f.suffix.lower() not in {'.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.yml', '.yaml', '.json', '.md'}:
                continue
            try:
                text = f.read_text(errors='ignore')
            except Exception:
                continue
            if pattern.search(text):
                code_refs.append(str(f.relative_to(ROOT)))

    results.append({
        'service': name,
        'path': str(svc.relative_to(ROOT)),
        'compose_ref_count': len(compose_refs),
        'compose_refs': compose_refs[:20],
        'cross_repo_ref_count': len(code_refs),
        'cross_repo_refs': code_refs[:30],
        'weakly_connected': len(compose_refs) == 0 or len(code_refs) < 5,
    })

out = ROOT / 'reports' / 'production-readiness' / 'service-wiring-inventory.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(results, indent=2))
print(out)
