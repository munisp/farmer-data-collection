#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path

AUDIT_PATH = Path('/tmp/fdc_audit_prod.json')

if not AUDIT_PATH.exists() or AUDIT_PATH.stat().st_size == 0:
    print('NO_AUDIT_JSON')
    raise SystemExit(0)

data = json.loads(AUDIT_PATH.read_text())
metadata = data.get('metadata', {})
advisories = data.get('advisories', {})

severity_counter = Counter()
items = []

for advisory_id, advisory in advisories.items():
    severity = advisory.get('severity', 'unknown')
    module_name = advisory.get('module_name', 'unknown')
    title = advisory.get('title', '')
    vulnerable_versions = advisory.get('vulnerable_versions', '')
    recommendation = advisory.get('recommendation', '')
    findings = advisory.get('findings', [])
    paths = []
    for finding in findings:
        for path in finding.get('paths', []):
            paths.append(path)
    severity_counter[severity] += 1
    items.append({
        'id': advisory_id,
        'module_name': module_name,
        'severity': severity,
        'title': title,
        'vulnerable_versions': vulnerable_versions,
        'recommendation': recommendation,
        'paths': sorted(set(paths)),
    })

print('AUDIT_METADATA')
for key in sorted(metadata.keys()):
    print(f'{key}: {metadata[key]}')

print('\nSEVERITY_COUNTS')
for severity, count in sorted(severity_counter.items()):
    print(f'{severity}: {count}')

print('\nTOP_ADVISORIES')
severity_order = {'critical': 0, 'high': 1, 'moderate': 2, 'low': 3, 'info': 4, 'unknown': 5}
for item in sorted(items, key=lambda x: (severity_order.get(x['severity'], 9), x['module_name']))[:20]:
    print(f"[{item['severity']}] {item['module_name']} :: {item['title']}")
    if item['vulnerable_versions']:
        print(f"  vulnerable_versions: {item['vulnerable_versions']}")
    if item['recommendation']:
        print(f"  recommendation: {item['recommendation']}")
    if item['paths']:
        for path in item['paths'][:5]:
            print(f"  path: {path}")
