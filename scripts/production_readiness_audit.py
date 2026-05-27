#!/usr/bin/env python3
"""Repository-wide production readiness and feature completeness audit.

This script performs a static repository assessment and produces:
1. JSON output for CI/CD consumption
2. Markdown output for human review

The audit is intentionally evidence-based. It scans the repository, classifies
files, extracts lightweight code structure signals, evaluates readiness checks,
and calculates weighted domain scores.
"""

from __future__ import annotations

import argparse
import ast
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


DEFAULT_CONFIG: Dict[str, Any] = {
    "ignore_dirs": [
        ".git",
        "node_modules",
        "dist",
        "coverage",
        ".next",
        ".turbo",
        ".venv",
        "venv",
        "__pycache__",
        ".idea",
        ".vscode",
        "build",
        "target",
        ".expo",
        "reports",
    ],
    "text_extensions": [
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
        ".py", ".go", ".rs", ".java", ".kt", ".sh",
        ".json", ".yml", ".yaml", ".toml", ".ini", ".env",
        ".md", ".txt", ".sql", ".graphql", ".proto", ".html",
        ".css", ".scss", ".dockerfile",
    ],
    "code_extensions": [
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
        ".py", ".go", ".rs", ".java", ".kt", ".sh",
    ],
    "documentation_files": [
        "README.md",
        "docs",
        "archive/docs",
        ".env.example",
        ".env.production.example",
    ],
    "service_keywords": {
        "database": ["postgres", "mysql", "drizzle", "typeorm", "sequelize", "mongodb", "sqlite"],
        "cache": ["redis", "cache"],
        "messaging": ["kafka", "rabbitmq", "sqs", "pubsub", "nats", "bullmq"],
        "storage": ["s3", "bucket", "minio", "blob"],
        "auth": ["auth", "jwt", "keycloak", "oauth", "passport", "session"],
        "payments": ["stripe", "paystack", "flutterwave", "mojaloop"],
        "communications": ["sms", "email", "twilio", "africastalking", "notification"],
        "observability": ["prometheus", "grafana", "otel", "opentelemetry", "logstash", "metrics"],
        "orchestration": ["kubernetes", "docker", "compose", "helm", "apisix", "dapr"],
        "realtime": ["websocket", "socket.io", "eventsource", "sse"],
        "ml_ai": ["ml", "model", "inference", "predict", "tensorflow", "pytorch", "ollama"],
        "weather_gis": ["weather", "satellite", "gps", "map", "geotag", "spatial"],
    },
    "domain_weights": {
        "feature_completeness": 0.24,
        "code_quality": 0.16,
        "service_integration": 0.14,
        "security": 0.16,
        "infrastructure": 0.12,
        "delivery_pipeline": 0.10,
        "documentation_maintainability": 0.08,
    },
    "thresholds": {
        "frontend_pages_min": 10,
        "frontend_components_min": 20,
        "backend_modules_min": 20,
        "service_dirs_min": 5,
        "test_ratio_min": 0.12,
        "typed_ratio_min": 0.55,
        "env_vars_min": 12,
        "docs_count_min": 5,
        "ops_scripts_min": 5,
        "integration_tags_min": 5,
    },
    "hardcoded_secret_allowlist": [
        "example",
        "placeholder",
        "changeme",
        "your-secret",
        "your_secret",
        "dummy",
        "sample",
        "test",
        "postgres:postgres",
    ],
    "risk_file_limit": 40,
}

TEXT_FILENAMES = {"Dockerfile", "Makefile", ".env", ".gitignore", ".dockerignore"}
TEST_MARKERS = ("__tests__", ".test.", ".spec.", "tests/")


@dataclass
class FileAnalysis:
    path: str
    category: str
    extension: str
    size_bytes: int
    lines: int
    code_like: bool
    test_like: bool
    functions: int = 0
    methods: int = 0
    classes: int = 0
    interfaces: int = 0
    exports: int = 0
    imports: int = 0
    routes: int = 0
    env_vars: int = 0
    todos: int = 0
    fixmes: int = 0
    mocks: int = 0
    auth_hits: int = 0
    security_hits: int = 0
    health_hits: int = 0
    secret_hits: int = 0
    integration_tags: List[str] = None
    risk_score: float = 0.0

    def __post_init__(self) -> None:
        if self.integration_tags is None:
            self.integration_tags = []


class AuditError(RuntimeError):
    pass


def deep_merge(base: Dict[str, Any], extra: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in extra.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_config(path: Optional[Path]) -> Dict[str, Any]:
    config = dict(DEFAULT_CONFIG)
    if path and path.exists():
        user_config = json.loads(path.read_text(encoding="utf-8"))
        config = deep_merge(config, user_config)
    return config


def normalize_path(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def should_ignore(path: Path, root: Path, config: Dict[str, Any]) -> bool:
    rel_parts = path.relative_to(root).parts
    ignore_dirs = set(config.get("ignore_dirs", []))
    return any(part in ignore_dirs for part in rel_parts)


def classify_file(rel_path: str) -> str:
    lower = rel_path.lower()
    if any(marker in lower for marker in ["docs/", "readme", ".md"]):
        return "documentation"
    if any(marker in lower for marker in [".github/", "scripts/", "makefile", "jenkinsfile", "gitlab-ci"]):
        return "automation"
    if any(marker in lower for marker in ["docker", "k8s/", "kubernetes/", "deployment/", "monitoring/", "config/", "chaos/"]):
        return "infrastructure"
    if any(marker in lower for marker in ["tests/", "__tests__", ".test.", ".spec."]):
        return "test"
    if lower.startswith("client/") or "/client/" in lower:
        return "frontend"
    if lower.startswith("mobile/") or "/mobile/" in lower:
        return "mobile"
    if lower.startswith("server/") or "/server/" in lower:
        return "backend"
    if lower.startswith("services/") or "/services/" in lower:
        return "service"
    if lower.startswith("ml-service/") or "/ml-service/" in lower:
        return "ml"
    if lower.startswith("shared/") or "/shared/" in lower:
        return "shared"
    return "repository"


def is_test_file(rel_path: str) -> bool:
    lower = rel_path.lower()
    return any(marker in lower for marker in TEST_MARKERS)


def is_text_file(path: Path, config: Dict[str, Any]) -> bool:
    if path.name in TEXT_FILENAMES:
        return True
    if path.suffix.lower() in set(config.get("text_extensions", [])):
        return True
    if path.name.startswith(".env"):
        return True
    return False


def read_text_safely(path: Path) -> Optional[str]:
    try:
        data = path.read_bytes()
    except Exception:
        return None
    if b"\x00" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return data.decode("latin-1")
        except Exception:
            return None


def count_regex(pattern: str, text: str, flags: int = re.MULTILINE) -> int:
    return len(re.findall(pattern, text, flags))


def find_secret_hits(text: str, allowlist: Sequence[str]) -> int:
    hits = 0
    patterns = [
        r"(?im)\b(?:api[_-]?key|secret|token|password|passwd|client_secret)\b\s*[:=]\s*['\"][^\n'\"]{8,}['\"]",
        r"(?im)\bauthorization\b\s*[:=]\s*['\"]bearer\s+[A-Za-z0-9._\-]{12,}['\"]",
        r"AKIA[0-9A-Z]{16}",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.MULTILINE):
            snippet = match.group(0)
            lowered_snippet = snippet.lower()
            if any(allowed in lowered_snippet for allowed in allowlist):
                continue
            if "process.env" in lowered_snippet or "import.meta.env" in lowered_snippet:
                continue
            if re.search(r"\$\{[A-Z0-9_]+\}", snippet):
                continue
            hits += 1
    return hits


def analyze_python_structure(text: str) -> Tuple[int, int, int]:
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return 0, 0, 0
    functions = methods = classes = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if isinstance(getattr(node, "parent", None), ast.ClassDef):
                methods += 1
            else:
                functions += 1
        elif isinstance(node, ast.ClassDef):
            classes += 1
    return functions, methods, classes


def attach_parents(tree: ast.AST) -> None:
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            setattr(child, "parent", parent)


def analyze_text_file(path: Path, rel_path: str, text: str, config: Dict[str, Any]) -> FileAnalysis:
    extension = path.suffix.lower() or (".env" if path.name.startswith(".env") else path.name)
    category = classify_file(rel_path)
    analysis = FileAnalysis(
        path=rel_path,
        category=category,
        extension=extension,
        size_bytes=path.stat().st_size,
        lines=text.count("\n") + (0 if not text else 1),
        code_like=extension in set(config.get("code_extensions", [])) or path.name in {"Dockerfile", "Makefile"},
        test_like=is_test_file(rel_path),
    )

    lowered = text.lower()
    analysis.todos = count_regex(r"\bTODO\b", text, flags=re.IGNORECASE)
    analysis.fixmes = count_regex(r"\bFIXME\b|\bXXX\b|\bHACK\b", text, flags=re.IGNORECASE)
    analysis.mocks = count_regex(r"\bmock\b|\bstub\b|\bfake\b|\bdummy\b", text, flags=re.IGNORECASE)
    analysis.imports = count_regex(r"\bimport\b|\brequire\s*\(", text)
    analysis.exports = count_regex(r"\bexport\b|module\.exports", text)
    analysis.routes = count_regex(r"\b(Route\s+path=|router\.(get|post|put|delete|patch)|app\.(get|post|put|delete|patch)|createTRPCRouter|publicProcedure|protectedProcedure)\b", text)
    analysis.env_vars = count_regex(r"(process\.env\.[A-Z0-9_]+|import\.meta\.env\.[A-Z0-9_]+|\b[A-Z][A-Z0-9_]{2,}\b(?=\s*[:=]))", text)
    analysis.auth_hits = count_regex(r"\b(auth|jwt|oauth|session|keycloak|passport|rbac|role)\b", text, flags=re.IGNORECASE)
    analysis.security_hits = count_regex(r"\b(csrf|helmet|cors|bcrypt|argon|rate.?limit|xss|sanitize|secret|encrypt|decrypt)\b", text, flags=re.IGNORECASE)
    analysis.health_hits = count_regex(r"\bhealth(check)?\b|\breadiness\b|\bliveness\b", text, flags=re.IGNORECASE)
    analysis.secret_hits = find_secret_hits(text, config.get("hardcoded_secret_allowlist", []))

    if extension == ".py":
        try:
            tree = ast.parse(text)
            attach_parents(tree)
            analysis.functions, analysis.methods, analysis.classes = analyze_python_structure(text)
        except SyntaxError:
            pass
    else:
        analysis.classes = count_regex(r"\bclass\s+[A-Za-z_][A-Za-z0-9_]*", text)
        analysis.interfaces = count_regex(r"\binterface\s+[A-Za-z_][A-Za-z0-9_]*", text)
        analysis.functions = count_regex(
            r"\bfunction\s+[A-Za-z_][A-Za-z0-9_]*\s*\(|\b(?:const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|\b(?:async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{",
            text,
        )
        analysis.methods = count_regex(r"\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{", text)

    integration_tags: List[str] = []
    for tag, keywords in config.get("service_keywords", {}).items():
        if any(keyword.lower() in lowered for keyword in keywords):
            integration_tags.append(tag)
    analysis.integration_tags = sorted(set(integration_tags))

    analysis.risk_score = (
        analysis.todos * 0.6
        + analysis.fixmes * 1.0
        + analysis.mocks * (0.8 if not analysis.test_like else 0.15)
        + analysis.secret_hits * 5.0
        + max(0, analysis.lines - 800) / 400.0
    )
    return analysis


def scan_repository(root: Path, config: Dict[str, Any]) -> Dict[str, Any]:
    files: List[FileAnalysis] = []
    category_counts: Counter[str] = Counter()
    extension_counts: Counter[str] = Counter()
    integration_counter: Counter[str] = Counter()
    env_var_files = 0
    dirs_seen: set[str] = set()

    for path in root.rglob("*"):
        if should_ignore(path, root, config):
            continue
        if path.is_dir():
            dirs_seen.add(normalize_path(path, root))
            continue
        rel_path = normalize_path(path, root)
        category_counts[classify_file(rel_path)] += 1
        extension_counts[path.suffix.lower() or path.name] += 1

        if not is_text_file(path, config):
            analysis = FileAnalysis(
                path=rel_path,
                category=classify_file(rel_path),
                extension=path.suffix.lower(),
                size_bytes=path.stat().st_size,
                lines=0,
                code_like=False,
                test_like=is_test_file(rel_path),
            )
            files.append(analysis)
            continue

        text = read_text_safely(path)
        if text is None:
            continue
        analysis = analyze_text_file(path, rel_path, text, config)
        if analysis.env_vars > 0:
            env_var_files += 1
        for tag in analysis.integration_tags:
            integration_counter[tag] += 1
        files.append(analysis)

    return {
        "files": files,
        "category_counts": dict(category_counts),
        "extension_counts": dict(extension_counts),
        "integration_counts": dict(integration_counter),
        "env_var_files": env_var_files,
        "directories_scanned": len(dirs_seen),
    }


def safe_div(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def capped_ratio(actual: float, target: float) -> float:
    if target <= 0:
        return 1.0
    return max(0.0, min(actual / target, 1.0))


def inverse_ratio(actual: float, ceiling: float) -> float:
    if ceiling <= 0:
        return 1.0 if actual == 0 else 0.0
    return max(0.0, min(1.0 - (actual / ceiling), 1.0))


def add_check(checks: List[Dict[str, Any]], check_id: str, name: str, weight: float, score: float, evidence: Dict[str, Any], recommendation: str) -> None:
    checks.append({
        "id": check_id,
        "name": name,
        "weight": weight,
        "score": round(max(0.0, min(score, 1.0)), 4),
        "evidence": evidence,
        "recommendation": recommendation,
    })


def summarize(repo: Dict[str, Any], root: Path, config: Dict[str, Any]) -> Dict[str, Any]:
    files: List[FileAnalysis] = repo["files"]
    thresholds = config["thresholds"]
    code_files = [f for f in files if f.code_like and not f.test_like]
    test_files = [f for f in files if f.test_like or f.category == "test"]
    frontend_files = [f for f in files if f.category == "frontend"]
    backend_files = [f for f in files if f.category == "backend"]
    service_files = [f for f in files if f.category == "service"]
    infra_files = [f for f in files if f.category == "infrastructure"]
    docs_files = [f for f in files if f.category == "documentation"]
    automation_files = [f for f in files if f.category == "automation"]

    path_lookup = {f.path: f for f in files}
    path_set = set(path_lookup)

    frontend_pages = sum(1 for f in files if f.path.startswith("client/src/pages/") and f.extension in {".ts", ".tsx", ".js", ".jsx"})
    frontend_components = sum(1 for f in files if "/components/" in f.path and f.extension in {".ts", ".tsx", ".js", ".jsx"})
    backend_modules = sum(1 for f in files if (f.path.startswith("server/") or f.path.startswith("services/")) and f.extension in {".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"})
    service_dirs = len({p.split("/")[1] for p in path_set if p.startswith("services/") and "/" in p})
    dockerfiles = sum(1 for f in files if "dockerfile" in f.path.lower() or f.path.startswith("docker-compose"))
    compose_files = sum(1 for f in files if "docker-compose" in f.path.lower())
    k8s_files = sum(1 for f in files if f.path.startswith("k8s/") or "/kubernetes/" in f.path or f.path.startswith("deployment/"))
    monitoring_files = sum(1 for f in files if f.path.startswith("monitoring/") or "/prometheus/" in f.path or "/grafana/" in f.path or "logstash" in f.path.lower())
    env_example_files = sum(1 for f in files if f.path.startswith(".env") or "/.env" in f.path)
    typed_code_files = sum(1 for f in code_files if f.extension in {".ts", ".tsx"})
    total_functions = sum(f.functions for f in files)
    total_methods = sum(f.methods for f in files)
    total_classes = sum(f.classes for f in files)
    total_interfaces = sum(f.interfaces for f in files)
    total_routes = sum(f.routes for f in files)
    total_env_vars = sum(f.env_vars for f in files)
    total_todos = sum(f.todos for f in files)
    total_fixmes = sum(f.fixmes for f in files)
    total_mocks = sum(f.mocks for f in files if not f.test_like)
    total_secret_hits = sum(f.secret_hits for f in files)
    production_secret_hits = sum(
        f.secret_hits
        for f in files
        if not f.test_like
        and f.category not in {"documentation", "test"}
        and not f.path.endswith(("package-lock.json", "pnpm-lock.yaml"))
        and "/dev-dist/" not in f.path
        and not f.path.startswith("reports/")
        and not re.match(r"^(test-|setup-|verify-|smoke-).+\.m?js$", Path(f.path).name)
    )
    total_auth_hits = sum(f.auth_hits for f in files)
    total_security_hits = sum(f.security_hits for f in files)
    total_health_hits = sum(f.health_hits for f in files)
    integration_tag_count = len(repo["integration_counts"])

    workflow_path = root / ".github/workflows/ci-cd.yml"
    workflow_text = workflow_path.read_text(encoding="utf-8") if workflow_path.exists() else ""

    domain_checks: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    add_check(
        domain_checks["feature_completeness"],
        "FC-001",
        "Frontend implementation surface",
        0.28,
        0.5 * capped_ratio(frontend_pages, thresholds["frontend_pages_min"]) + 0.5 * capped_ratio(frontend_components, thresholds["frontend_components_min"]),
        {"frontend_pages": frontend_pages, "frontend_components": frontend_components},
        "Increase implemented pages and shared components coverage for user-facing flows that are still thin or undocumented.",
    )
    add_check(
        domain_checks["feature_completeness"],
        "FC-002",
        "Backend implementation surface",
        0.30,
        0.65 * capped_ratio(backend_modules, thresholds["backend_modules_min"]) + 0.35 * capped_ratio(total_routes, 15),
        {"backend_modules": backend_modules, "route_signals": total_routes},
        "Ensure backend modules, routes, and service handlers cover all expected feature areas with traceable API surfaces.",
    )
    add_check(
        domain_checks["feature_completeness"],
        "FC-003",
        "Cross-platform and shared-contract coverage",
        0.22,
        min(1.0, (1.0 if any(p.startswith("mobile/") for p in path_set) else 0.0) * 0.4 + (1.0 if any(p.startswith("shared/") for p in path_set) else 0.0) * 0.3 + (1.0 if any(p.startswith("drizzle/") for p in path_set) else 0.0) * 0.3),
        {
            "has_mobile": any(p.startswith("mobile/") for p in path_set),
            "has_shared": any(p.startswith("shared/") for p in path_set),
            "has_db_schema": any(p.startswith("drizzle/") for p in path_set),
        },
        "Keep shared contracts, schema definitions, and cross-platform feature surfaces synchronized across client, server, and mobile targets.",
    )
    add_check(
        domain_checks["feature_completeness"],
        "FC-004",
        "Implementation detail density",
        0.20,
        min(1.0, 0.4 * capped_ratio(total_functions, 200) + 0.3 * capped_ratio(total_classes, 30) + 0.3 * capped_ratio(total_interfaces, 20)),
        {"functions": total_functions, "classes": total_classes, "interfaces": total_interfaces},
        "Thin modules should be reviewed to confirm they contain complete implementation logic rather than placeholders or wiring-only code.",
    )

    test_ratio = safe_div(len(test_files), max(len(code_files), 1))
    add_check(
        domain_checks["code_quality"],
        "CQ-001",
        "Typed code ratio",
        0.22,
        capped_ratio(safe_div(typed_code_files, max(len(code_files), 1)), thresholds["typed_ratio_min"]),
        {"typed_code_files": typed_code_files, "code_files": len(code_files)},
        "Increase strongly typed implementation coverage where JavaScript or shell-heavy modules dominate critical logic.",
    )
    add_check(
        domain_checks["code_quality"],
        "CQ-002",
        "Test density",
        0.28,
        capped_ratio(test_ratio, thresholds["test_ratio_min"]),
        {"test_files": len(test_files), "code_files": len(code_files), "test_ratio": round(test_ratio, 4)},
        "Add automated test coverage around critical routes, services, integrations, and production-risk workflows.",
    )
    add_check(
        domain_checks["code_quality"],
        "CQ-003",
        "Unresolved placeholder hygiene",
        0.28,
        0.5 * inverse_ratio(total_todos, 40) + 0.5 * inverse_ratio(total_fixmes, 20),
        {"todo_markers": total_todos, "fixme_markers": total_fixmes},
        "Resolve TODO, FIXME, XXX, and HACK markers in production paths or explicitly track them outside runtime code.",
    )
    add_check(
        domain_checks["code_quality"],
        "CQ-004",
        "Production mock smell",
        0.22,
        inverse_ratio(total_mocks, 25),
        {"mock_like_markers_in_non_test_files": total_mocks},
        "Remove or isolate mock, fake, and stub logic from production paths unless clearly feature-flagged or documented as test support.",
    )

    add_check(
        domain_checks["service_integration"],
        "SI-001",
        "Service directory breadth",
        0.24,
        capped_ratio(service_dirs, thresholds["service_dirs_min"]),
        {"service_directories": service_dirs},
        "Confirm each bounded service area has operational documentation, ownership, and integration validation.",
    )
    add_check(
        domain_checks["service_integration"],
        "SI-002",
        "Integration diversity",
        0.30,
        capped_ratio(integration_tag_count, thresholds["integration_tags_min"]),
        {"integration_tags": repo["integration_counts"]},
        "Document, test, and validate each detected external integration domain with ownership, retry policy, and failure handling.",
    )
    add_check(
        domain_checks["service_integration"],
        "SI-003",
        "Environment-driven integrations",
        0.22,
        capped_ratio(total_env_vars, thresholds["env_vars_min"]),
        {"env_var_references": total_env_vars, "files_with_env_usage": repo["env_var_files"]},
        "Move integration configuration fully into environment or secret-management flows and avoid implicit local defaults for production-critical services.",
    )
    async_signals = sum(1 for p in path_set if any(token in p for token in ["cron/", "jobs/", "consumers/", "notifications/", "events/"]))
    add_check(
        domain_checks["service_integration"],
        "SI-004",
        "Asynchronous and event-driven architecture signals",
        0.24,
        capped_ratio(async_signals, 5),
        {"async_signal_directories": async_signals},
        "Validate retries, DLQs, idempotency, and alerting for asynchronous jobs, consumers, and event-driven services.",
    )

    add_check(
        domain_checks["security"],
        "SE-001",
        "Authentication and authorization foundations",
        0.22,
        min(1.0, 0.5 * capped_ratio(total_auth_hits, 20) + 0.5 * (1.0 if any("auth" in p.lower() for p in path_set) else 0.0)),
        {"auth_keyword_hits": total_auth_hits, "auth_related_paths": sum(1 for p in path_set if "auth" in p.lower())},
        "Review authentication, authorization, and identity boundaries to ensure each detected auth-related surface is covered by policy and tests.",
    )
    add_check(
        domain_checks["security"],
        "SE-002",
        "Security middleware and control signals",
        0.24,
        capped_ratio(total_security_hits, 20),
        {"security_keyword_hits": total_security_hits},
        "Ensure CSRF, CORS, rate limiting, secure headers, secret handling, and password protections are consistently enforced across services.",
    )
    add_check(
        domain_checks["security"],
        "SE-003",
        "Hardcoded secret hygiene",
        0.30,
        inverse_ratio(total_secret_hits, 3),
        {"hardcoded_secret_hits": total_secret_hits, "production_scope_secret_hits": production_secret_hits},
        "Remove hardcoded credentials or tokens and replace them with environment-backed or secret-managed configuration.",
    )
    security_pipeline_signals = sum(1 for token in ["trivy", "npm audit", "security"] if token in workflow_text.lower())
    add_check(
        domain_checks["security"],
        "SE-004",
        "Security scanning in delivery pipeline",
        0.24,
        capped_ratio(security_pipeline_signals, 3),
        {"security_pipeline_signals": security_pipeline_signals},
        "Keep dependency, filesystem, and container scanning wired into the CI gate rather than relying on ad hoc manual checks.",
    )

    add_check(
        domain_checks["infrastructure"],
        "IN-001",
        "Containerization assets",
        0.24,
        min(1.0, 0.5 * capped_ratio(dockerfiles, 4) + 0.5 * capped_ratio(compose_files, 3)),
        {"docker_related_files": dockerfiles, "compose_files": compose_files},
        "Standardize and validate container build definitions, runtime configuration, and local environment parity.",
    )
    add_check(
        domain_checks["infrastructure"],
        "IN-002",
        "Orchestration and deployment manifests",
        0.28,
        capped_ratio(k8s_files, 6),
        {"k8s_and_deployment_files": k8s_files},
        "Ensure each deployment manifest is environment-aware, validated, and mapped to a tested release process.",
    )
    add_check(
        domain_checks["infrastructure"],
        "IN-003",
        "Observability and monitoring assets",
        0.24,
        capped_ratio(monitoring_files, 4),
        {"monitoring_files": monitoring_files},
        "Expand metrics, alert rules, dashboards, and log routing to cover all mission-critical services and integrations.",
    )
    resilience_signals = 0
    for token in ["blue-green", "rollback", "chaos", "health", "prometheus", "grafana"]:
        if any(token in p.lower() for p in path_set):
            resilience_signals += 1
    add_check(
        domain_checks["infrastructure"],
        "IN-004",
        "Resilience and operational health signals",
        0.24,
        min(1.0, 0.5 * capped_ratio(total_health_hits, 10) + 0.5 * capped_ratio(resilience_signals, 5)),
        {"health_hits": total_health_hits, "resilience_signals": resilience_signals},
        "Link health endpoints, rollback paths, chaos assets, and monitoring to a documented production recovery posture.",
    )

    pipeline_signals = {
        "lint": "lint:" in workflow_text,
        "test": "test:" in workflow_text,
        "build": "build:" in workflow_text,
        "security": "security:" in workflow_text,
        "deploy_staging": "deploy-staging:" in workflow_text,
        "deploy_production": "deploy-production:" in workflow_text,
        "artifacts": "upload-artifact" in workflow_text,
        "load_test": "load-test:" in workflow_text,
    }
    add_check(
        domain_checks["delivery_pipeline"],
        "DP-001",
        "Core CI stages",
        0.30,
        safe_div(sum(1 for key in ["lint", "test", "build", "security"] if pipeline_signals[key]), 4),
        pipeline_signals,
        "Keep lint, test, build, and security stages mandatory for pull requests and release branches.",
    )
    add_check(
        domain_checks["delivery_pipeline"],
        "DP-002",
        "Deployment gating stages",
        0.28,
        safe_div(sum(1 for key in ["deploy_staging", "deploy_production"] if pipeline_signals[key]), 2),
        pipeline_signals,
        "Require promotion through explicit staging and production gates with smoke tests and rollback handling.",
    )
    add_check(
        domain_checks["delivery_pipeline"],
        "DP-003",
        "Artifact and performance controls",
        0.22,
        safe_div(sum(1 for key in ["artifacts", "load_test"] if pipeline_signals[key]), 2),
        pipeline_signals,
        "Retain build artifacts and performance budgets as first-class deployment gates rather than optional post-merge checks.",
    )
    add_check(
        domain_checks["delivery_pipeline"],
        "DP-004",
        "Local pipeline parity",
        0.20,
        1.0 if (root / "Makefile").exists() and any(p.startswith("scripts/prb/") for p in path_set) else 0.5 if (root / "Makefile").exists() else 0.0,
        {"has_makefile": (root / "Makefile").exists(), "has_prb_scripts": any(p.startswith("scripts/prb/") for p in path_set)},
        "Preserve local verification entry points so developers can reproduce CI failures before opening deployment-bound changes.",
    )

    docs_count = len(docs_files)
    ops_scripts = sum(1 for p in path_set if p.startswith("scripts/") or p.startswith("deployment/") or p.startswith("monitoring/"))
    add_check(
        domain_checks["documentation_maintainability"],
        "DM-001",
        "Documentation presence",
        0.30,
        capped_ratio(docs_count, thresholds["docs_count_min"]),
        {"documentation_files": docs_count},
        "Add or update architecture, onboarding, operations, and feature documents so implementation depth is matched by maintainable guidance.",
    )
    add_check(
        domain_checks["documentation_maintainability"],
        "DM-002",
        "Environment and configuration examples",
        0.24,
        capped_ratio(env_example_files, 3),
        {"env_example_files": env_example_files},
        "Keep sanitized environment examples current for every deployable service and integration domain.",
    )
    add_check(
        domain_checks["documentation_maintainability"],
        "DM-003",
        "Operational script coverage",
        0.24,
        capped_ratio(ops_scripts, thresholds["ops_scripts_min"]),
        {"operational_script_and_deployment_assets": ops_scripts},
        "Consolidate production runbooks with the scripts actually used for setup, migration, remediation, and deployment.",
    )
    inventory_coverage = 1.0 if len(files) > 0 else 0.0
    add_check(
        domain_checks["documentation_maintainability"],
        "DM-004",
        "Repository inventory coverage",
        0.22,
        inventory_coverage,
        {"files_scanned": len(files), "directories_scanned": repo["directories_scanned"]},
        "Preserve full-repository scanning so feature-completeness and readiness scoring stay evidence-based as the codebase evolves.",
    )

    domain_scores: Dict[str, Dict[str, Any]] = {}
    overall_score = 0.0
    domain_weights = config["domain_weights"]
    for domain, checks in domain_checks.items():
        total_weight = sum(check["weight"] for check in checks) or 1.0
        weighted_score = sum(check["score"] * check["weight"] for check in checks) / total_weight
        domain_scores[domain] = {
            "score": round(weighted_score * 100, 2),
            "weight": domain_weights.get(domain, 0.0),
            "checks": checks,
        }
        overall_score += weighted_score * domain_weights.get(domain, 0.0)

    risk_hotspots = sorted(
        [asdict(f) for f in files if f.risk_score > 0],
        key=lambda item: (-item["risk_score"], -item["secret_hits"], -item["fixmes"], -item["todos"], -item["lines"]),
    )[: config.get("risk_file_limit", 40)]

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "repository_root": str(root),
        "overall_score": round(overall_score * 100, 2),
        "inventory": {
            "files_scanned": len(files),
            "directories_scanned": repo["directories_scanned"],
            "category_counts": repo["category_counts"],
            "extension_counts": repo["extension_counts"],
            "frontend_pages": frontend_pages,
            "frontend_components": frontend_components,
            "backend_modules": backend_modules,
            "service_directories": service_dirs,
            "docker_related_files": dockerfiles,
            "compose_files": compose_files,
            "k8s_and_deployment_files": k8s_files,
            "monitoring_files": monitoring_files,
            "documentation_files": docs_count,
            "test_files": len(test_files),
            "code_files": len(code_files),
        },
        "implementation_metrics": {
            "functions": total_functions,
            "methods": total_methods,
            "classes": total_classes,
            "interfaces": total_interfaces,
            "route_signals": total_routes,
            "env_var_references": total_env_vars,
            "todo_markers": total_todos,
            "fixme_markers": total_fixmes,
            "mock_markers_non_test": total_mocks,
            "hardcoded_secret_hits": total_secret_hits,
            "production_scope_secret_hits": production_secret_hits,
            "auth_hits": total_auth_hits,
            "security_hits": total_security_hits,
            "health_hits": total_health_hits,
            "integration_counts": repo["integration_counts"],
        },
        "domain_scores": domain_scores,
        "risk_hotspots": risk_hotspots,
        "file_analysis": [asdict(f) for f in files],
    }
    return summary


def markdown_table(headers: Sequence[str], rows: Sequence[Sequence[Any]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(item) for item in row) + " |")
    return "\n".join(lines)


def grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def build_markdown_report(summary: Dict[str, Any], min_score: Optional[float]) -> str:
    overall = summary["overall_score"]
    inventory = summary["inventory"]
    metrics = summary["implementation_metrics"]

    domain_rows = []
    for domain, payload in summary["domain_scores"].items():
        domain_rows.append([
            domain.replace("_", " ").title(),
            payload["score"],
            round(payload["weight"] * 100, 1),
            grade(payload["score"]),
        ])

    hotspot_rows = []
    for item in summary["risk_hotspots"][:15]:
        hotspot_rows.append([
            item["path"],
            round(item["risk_score"], 2),
            item["todos"],
            item["fixmes"],
            item["mocks"],
            item["secret_hits"],
            item["lines"],
        ])

    failed_checks: List[Tuple[str, str, float, str]] = []
    for domain, payload in summary["domain_scores"].items():
        for check in payload["checks"]:
            if check["score"] < 0.6:
                failed_checks.append((domain, check["id"], round(check["score"] * 100, 1), check["name"]))
    failed_checks.sort(key=lambda row: row[2])

    status_line = "Pass"
    if min_score is not None and overall < min_score:
        status_line = f"Fail (below threshold {min_score})"

    sections = [
        "# Production Readiness Audit Report",
        "",
        f"This report summarizes a full repository scan completed at **{summary['generated_at']}**.",
        "",
        markdown_table(
            ["Metric", "Value"],
            [
                ["Overall readiness score", f"{overall:.2f}"],
                ["Readiness grade", grade(overall)],
                ["Threshold status", status_line],
                ["Files scanned", inventory["files_scanned"]],
                ["Directories scanned", inventory["directories_scanned"]],
            ],
        ),
        "",
        "## Domain Scores",
        "",
        markdown_table(["Domain", "Score", "Weight %", "Grade"], domain_rows),
        "",
        "## Repository Inventory",
        "",
        markdown_table(
            ["Metric", "Value"],
            [
                ["Frontend pages", inventory["frontend_pages"]],
                ["Frontend components", inventory["frontend_components"]],
                ["Backend modules", inventory["backend_modules"]],
                ["Service directories", inventory["service_directories"]],
                ["Test files", inventory["test_files"]],
                ["Code files", inventory["code_files"]],
                ["Docker-related files", inventory["docker_related_files"]],
                ["Deployment manifests", inventory["k8s_and_deployment_files"]],
                ["Monitoring files", inventory["monitoring_files"]],
                ["Documentation files", inventory["documentation_files"]],
            ],
        ),
        "",
        "## Implementation Metrics",
        "",
        markdown_table(
            ["Metric", "Value"],
            [
                ["Functions", metrics["functions"]],
                ["Methods", metrics["methods"]],
                ["Classes", metrics["classes"]],
                ["Interfaces", metrics["interfaces"]],
                ["Route signals", metrics["route_signals"]],
                ["Environment variable references", metrics["env_var_references"]],
                ["TODO markers", metrics["todo_markers"]],
                ["FIXME markers", metrics["fixme_markers"]],
                ["Mock markers in non-test files", metrics["mock_markers_non_test"]],
                ["Hardcoded secret hits", metrics["hardcoded_secret_hits"]],
                ["Auth-related hits", metrics["auth_hits"]],
                ["Security-related hits", metrics["security_hits"]],
                ["Health-related hits", metrics["health_hits"]],
            ],
        ),
        "",
        "## Integration Signals",
        "",
        markdown_table(
            ["Integration Domain", "Detected Files"],
            sorted([[key, value] for key, value in metrics["integration_counts"].items()], key=lambda row: (-row[1], row[0])) or [["none", 0]],
        ),
        "",
        "## Lowest-Scoring Checks",
        "",
        markdown_table(
            ["Domain", "Check ID", "Score", "Check"],
            failed_checks[:20] or [["none", "none", "100.0", "No checks scored below 60%"]],
        ),
        "",
        "## Highest-Risk File Hotspots",
        "",
        markdown_table(
            ["Path", "Risk", "TODO", "FIXME", "Mocks", "Secret Hits", "Lines"],
            hotspot_rows or [["none", 0, 0, 0, 0, 0, 0]],
        ),
        "",
        "## Domain Check Details",
        "",
    ]

    for domain, payload in summary["domain_scores"].items():
        sections.append(f"### {domain.replace('_', ' ').title()}")
        sections.append("")
        rows = []
        for check in payload["checks"]:
            rows.append([
                check["id"],
                check["name"],
                round(check["score"] * 100, 1),
                check["recommendation"],
            ])
        sections.append(markdown_table(["Check ID", "Check", "Score", "Recommendation"], rows))
        sections.append("")

    return "\n".join(sections).strip() + "\n"


def write_outputs(summary: Dict[str, Any], output_dir: Path, min_score: Optional[float]) -> Tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "production-readiness-report.json"
    md_path = output_dir / "production-readiness-report.md"
    json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    md_path.write_text(build_markdown_report(summary, min_score), encoding="utf-8")
    return json_path, md_path


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Static production-readiness audit")
    parser.add_argument("--root", default=".", help="Repository root to scan")
    parser.add_argument("--config", default="scripts/production_readiness_config.json", help="Optional JSON config path")
    parser.add_argument("--output-dir", default="reports/production-readiness", help="Directory for report artifacts")
    parser.add_argument("--min-score", type=float, default=None, help="Fail when overall score is below this threshold")
    parser.add_argument("--strict", action="store_true", help="Fail when any hardcoded secret hit is detected")
    parser.add_argument("--print-summary", action="store_true", help="Print a one-line summary to stdout")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    root = Path(args.root).resolve()
    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = (root / config_path).resolve()
    config = load_config(config_path if config_path.exists() else None)

    repo = scan_repository(root, config)
    summary = summarize(repo, root, config)
    json_path, md_path = write_outputs(summary, Path(args.output_dir), args.min_score)

    overall_score = summary["overall_score"]
    hardcoded_secret_hits = summary["implementation_metrics"]["production_scope_secret_hits"]

    if args.print_summary:
        print(f"production_readiness_score={overall_score:.2f} json={json_path} markdown={md_path}")
    else:
        print(json.dumps({
            "overall_score": overall_score,
            "grade": grade(overall_score),
            "json_report": str(json_path),
            "markdown_report": str(md_path),
            "hardcoded_secret_hits": hardcoded_secret_hits,
        }, indent=2))

    if args.strict and hardcoded_secret_hits > 0:
        print("Audit failed: hardcoded secret hits detected in strict mode", file=sys.stderr)
        return 2
    if args.min_score is not None and overall_score < args.min_score:
        print(f"Audit failed: overall score {overall_score:.2f} is below threshold {args.min_score}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
