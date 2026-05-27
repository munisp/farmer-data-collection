from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('/home/ubuntu/work_audit/farmer-data-collection')
report = json.loads((ROOT / 'reports' / 'production-readiness' / 'ui-parity-inventory.json').read_text())


def summarize(items: list[dict], label: str) -> list[str]:
    lines = [f'## {label}']
    total = len(items)
    zero_api = [i for i in items if i['api_ref_count'] == 0]
    weak_crud = [
        i for i in items
        if sum(1 for v in i['crud_signals'].values() if v) <= 2
    ]
    no_search = [i for i in items if not i['crud_signals'].get('search')]
    lines.append(f'total={total}')
    lines.append(f'zero_api={len(zero_api)}')
    lines.append(f'weak_crud={len(weak_crud)}')
    lines.append(f'no_search_signal={len(no_search)}')
    lines.append('top_zero_api:')
    for item in zero_api[:30]:
        lines.append(f"- {item['path']}")
    lines.append('top_weak_crud:')
    for item in weak_crud[:30]:
        lines.append(f"- {item['path']} :: {item['crud_signals']}")
    return lines

text = []
text.extend(summarize(report['client_pages'], 'Client Pages'))
text.append('')
text.extend(summarize(report['mobile_screens'], 'Mobile Screens'))

out = ROOT / 'reports' / 'production-readiness' / 'ui-parity-summary.txt'
out.write_text('\n'.join(text) + '\n')
print(out)
