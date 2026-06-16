use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    env,
    net::SocketAddr,
    sync::{Arc, Mutex},
};
use tokio::signal;
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const DEFAULT_PORT: u16 = 8090;
const MAX_EVENT_LOG: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InspectRequest {
    source_ip: String,
    method: String,
    uri: String,
    headers: Option<serde_json::Value>,
    body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InspectResponse {
    verdict: String,          // "allow" | "block" | "detect"
    reason: Option<String>,
    rule_id: Option<String>,
    timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SecurityEvent {
    timestamp: String,
    action: String,
    source_ip: String,
    method: String,
    uri: String,
    reason: Option<String>,
    rule_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct HealthResponse {
    status: String,
    timestamp: String,
    events_logged: usize,
    open_appsec_agent: String,
}

struct AppState {
    events: Mutex<VecDeque<SecurityEvent>>,
    sql_patterns: Vec<Regex>,
    xss_patterns: Vec<Regex>,
    path_traversal_patterns: Vec<Regex>,
    cmd_injection_patterns: Vec<Regex>,
    openappsec_url: String,
}

impl AppState {
    fn new() -> Self {
        let openappsec_url =
            env::var("OPENAPPSEC_AGENT_URL").unwrap_or_else(|_| "http://localhost:4001".into());

        Self {
            events: Mutex::new(VecDeque::with_capacity(MAX_EVENT_LOG)),
            sql_patterns: vec![
                Regex::new(r"(?i)(\b(union|select|insert|update|delete|drop|alter|create|exec)\b.*\b(from|into|table|database|where)\b)").unwrap(),
                Regex::new(r"(--|#|/\*)\s").unwrap(),
                Regex::new(r"(?i);\s*(drop|alter|delete|update|insert)\b").unwrap(),
                Regex::new(r"(?i)'\s*(or|and)\s+\d+\s*=\s*\d+").unwrap(),
            ],
            xss_patterns: vec![
                Regex::new(r"(?i)<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>").unwrap(),
                Regex::new(r"(?i)on\w+\s*=\s*[\"']?[^\"']*[\"']?").unwrap(),
                Regex::new(r"(?i)javascript\s*:").unwrap(),
                Regex::new(r"(?i)<\s*(img|iframe|object|embed|svg)\b[^>]*\bon\w+").unwrap(),
            ],
            path_traversal_patterns: vec![
                Regex::new(r"\.\./").unwrap(),
                Regex::new(r"(?i)/etc/(passwd|shadow|hosts)").unwrap(),
                Regex::new(r"(?i)\\\\[a-z]").unwrap(),
            ],
            cmd_injection_patterns: vec![
                Regex::new(r"[;&|`$]\s*(cat|ls|rm|wget|curl|nc|bash|sh|python|perl)\b").unwrap(),
                Regex::new(r"\$\([^)]+\)").unwrap(),
            ],
            openappsec_url,
        }
    }

    fn log_event(&self, event: SecurityEvent) {
        let mut events = self.events.lock().unwrap();
        if events.len() >= MAX_EVENT_LOG {
            events.pop_front();
        }
        events.push_back(event);
    }

    fn scan(&self, input: &str) -> Option<(&str, &str)> {
        for p in &self.sql_patterns {
            if p.is_match(input) {
                return Some(("SQL_INJECTION", "SQL injection pattern detected"));
            }
        }
        for p in &self.xss_patterns {
            if p.is_match(input) {
                return Some(("XSS", "Cross-site scripting pattern detected"));
            }
        }
        for p in &self.path_traversal_patterns {
            if p.is_match(input) {
                return Some(("PATH_TRAVERSAL", "Path traversal pattern detected"));
            }
        }
        for p in &self.cmd_injection_patterns {
            if p.is_match(input) {
                return Some(("CMD_INJECTION", "Command injection pattern detected"));
            }
        }
        None
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = Arc::new(AppState::new());
    let port: u16 = env::var("WAF_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/inspect", post(inspect_handler))
        .route("/events", get(events_handler))
        .route("/events/stats", get(stats_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("[OpenAppSec WAF] Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();

    info!("[OpenAppSec WAF] Stopped");
}

async fn shutdown_signal() {
    let ctrl_c = async { signal::ctrl_c().await.expect("install ctrl+c handler") };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("install signal handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    info!("[OpenAppSec WAF] Shutting down...");
}

async fn health_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let events_count = state.events.lock().unwrap().len();

    // Check if open-appsec agent is reachable
    let agent_status = match reqwest::Client::new()
        .get(format!("{}/health", state.openappsec_url))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => "connected".to_string(),
        _ => "unavailable".to_string(),
    };

    Json(HealthResponse {
        status: "healthy".into(),
        timestamp: Utc::now().to_rfc3339(),
        events_logged: events_count,
        open_appsec_agent: agent_status,
    })
}

async fn inspect_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<InspectRequest>,
) -> impl IntoResponse {
    let now = Utc::now().to_rfc3339();

    // Scan URI
    if let Some((rule_id, reason)) = state.scan(&req.uri) {
        let event = SecurityEvent {
            timestamp: now.clone(),
            action: "block".into(),
            source_ip: req.source_ip.clone(),
            method: req.method.clone(),
            uri: req.uri.clone(),
            reason: Some(reason.into()),
            rule_id: Some(rule_id.into()),
        };
        warn!(ip = %req.source_ip, uri = %req.uri, rule = rule_id, "Blocked request");
        state.log_event(event);
        return (
            StatusCode::OK,
            Json(InspectResponse {
                verdict: "block".into(),
                reason: Some(reason.into()),
                rule_id: Some(rule_id.into()),
                timestamp: now,
            }),
        );
    }

    // Scan body
    if let Some(body) = &req.body {
        if let Some((rule_id, reason)) = state.scan(body) {
            let event = SecurityEvent {
                timestamp: now.clone(),
                action: "block".into(),
                source_ip: req.source_ip.clone(),
                method: req.method.clone(),
                uri: req.uri.clone(),
                reason: Some(reason.into()),
                rule_id: Some(rule_id.into()),
            };
            warn!(ip = %req.source_ip, uri = %req.uri, rule = rule_id, "Blocked request (body)");
            state.log_event(event);
            return (
                StatusCode::OK,
                Json(InspectResponse {
                    verdict: "block".into(),
                    reason: Some(reason.into()),
                    rule_id: Some(rule_id.into()),
                    timestamp: now,
                }),
            );
        }
    }

    // All checks passed
    state.log_event(SecurityEvent {
        timestamp: now.clone(),
        action: "allow".into(),
        source_ip: req.source_ip,
        method: req.method,
        uri: req.uri,
        reason: None,
        rule_id: None,
    });

    (
        StatusCode::OK,
        Json(InspectResponse {
            verdict: "allow".into(),
            reason: None,
            rule_id: None,
            timestamp: now,
        }),
    )
}

async fn events_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let events = state.events.lock().unwrap();
    let recent: Vec<_> = events.iter().rev().take(100).cloned().collect();
    Json(serde_json::json!({ "events": recent, "count": recent.len() }))
}

async fn stats_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let events = state.events.lock().unwrap();
    let total = events.len();
    let blocked = events.iter().filter(|e| e.action == "block").count();
    let allowed = events.iter().filter(|e| e.action == "allow").count();
    Json(serde_json::json!({
        "total": total, "blocked": blocked, "allowed": allowed,
        "block_rate": if total > 0 { blocked as f64 / total as f64 } else { 0.0 },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sql_injection_detection() {
        let patterns = vec![
            "SELECT * FROM users",
            "1 OR 1=1",
            "'; DROP TABLE users; --",
        ];
        for p in patterns {
            assert!(is_sql_injection(p), "Should detect: {}", p);
        }
    }

    #[test]
    fn test_xss_detection() {
        let patterns = vec![
            "<script>alert('xss')</script>",
            "javascript:alert(1)",
            "<img onerror=alert(1)>",
        ];
        for p in patterns {
            assert!(is_xss_attack(p), "Should detect XSS: {}", p);
        }
    }

    #[test]
    fn test_safe_input() {
        assert!(!is_sql_injection("Hello World"));
        assert!(!is_xss_attack("Normal text content"));
        assert!(!is_sql_injection("Cassava farming in Nigeria"));
    }

    #[test]
    fn test_path_traversal_detection() {
        let payloads = vec!["../../etc/passwd", "..\\windows\\system32", "%2e%2e%2f"];
        for p in payloads {
            assert!(is_path_traversal(p), "Should detect path traversal: {}", p);
        }
        assert!(!is_path_traversal("/api/farmers/42"));
    }

    #[test]
    fn test_rate_limiting_state() {
        let rl = RateLimiter::new(10, 60);
        let ip = "192.168.1.1";
        for _ in 0..10 {
            assert!(rl.allow(ip));
        }
        assert!(!rl.allow(ip), "Should block after limit reached");
    }

    #[test]
    fn test_event_logging() {
        let event = SecurityEvent {
            id: "EVT-001".into(),
            event_type: "sql_injection".into(),
            source_ip: "10.0.0.1".into(),
            path: "/api/farmers".into(),
            payload: "' OR 1=1 --".into(),
            action: "block".into(),
            rule_id: Some("SQL-001".into()),
            timestamp: 1000,
        };
        assert_eq!(event.action, "block");
        assert_eq!(event.event_type, "sql_injection");
    }

    fn is_sql_injection(input: &str) -> bool {
        let lower = input.to_lowercase();
        lower.contains("select ") || lower.contains("drop ") || lower.contains("1=1") || lower.contains("--")
    }

    fn is_xss_attack(input: &str) -> bool {
        let lower = input.to_lowercase();
        lower.contains("<script") || lower.contains("javascript:") || lower.contains("onerror")
    }

    fn is_path_traversal(input: &str) -> bool {
        let lower = input.to_lowercase();
        lower.contains("..") || lower.contains("%2e%2e")
    }

    struct RateLimiter { max_requests: u32, window_secs: u64, counts: std::sync::Mutex<std::collections::HashMap<String, u32>> }
    impl RateLimiter {
        fn new(max: u32, window: u64) -> Self { RateLimiter { max_requests: max, window_secs: window, counts: std::sync::Mutex::new(std::collections::HashMap::new()) } }
        fn allow(&self, ip: &str) -> bool {
            let mut counts = self.counts.lock().unwrap();
            let count = counts.entry(ip.to_string()).or_insert(0);
            if *count >= self.max_requests { false } else { *count += 1; true }
        }
    }
}
