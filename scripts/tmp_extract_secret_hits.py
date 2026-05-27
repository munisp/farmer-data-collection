import json
from pathlib import Path

report_path = Path('/home/ubuntu/work_audit/farmer-data-collection/reports/production-readiness/production-readiness-report.json')
report = json.loads(report_path.read_text())

for entry in report.get('file_analysis', []):
    if entry.get('secret_hits', 0) <= 0:
        continue
    if entry.get('test_like'):
        continue
    if entry.get('category') in {'documentation', 'test'}:
        continue
    path = entry.get('path', '')
    if path.endswith(('package-lock.json', 'pnpm-lock.yaml')):
        continue
    if '/dev-dist/' in path or path.startswith('reports/'):
        continue
    print(f"{path}\tsecret_hits={entry['secret_hits']}\tcategory={entry.get('category')}")
