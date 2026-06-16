/// WAF Security & Input Sanitization Service — Rust (Actix-Web)
/// Integrates with OpenAppSec for request inspection and provides
/// DOMPurify-equivalent server-side HTML sanitization
use actix_web::{web, App, HttpServer, HttpResponse};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

struct AppState {
    openappsec_url: String,
    client: reqwest::Client,
    requests_total: AtomicU64,
    blocked_total: AtomicU64,
    sanitized_total: AtomicU64,
}

#[derive(Debug, Deserialize)]
struct SanitizeRequest {
    fields: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize)]
struct SanitizeResponse {
    fields: std::collections::HashMap<String, String>,
    sanitized_count: usize,
    threats_found: Vec<ThreatInfo>,
}

#[derive(Debug, Serialize, Clone)]
struct ThreatInfo {
    field: String,
    threat_type: String,
    original: String,
    sanitized: String,
}

#[derive(Debug, Deserialize)]
struct InspectRequest {
    method: String,
    path: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
    source_ip: Option<String>,
}

#[derive(Debug, Serialize)]
struct InspectResponse {
    allowed: bool,
    risk_score: f64,
    threats: Vec<String>,
    action: String, // "allow", "block", "challenge"
}

fn detect_sql_injection(input: &str) -> bool {
    let patterns = [
        "' or ", "' and ", "1=1", "union select", "drop table",
        "insert into", "delete from", "update set", "--", "/*",
        "char(", "concat(", "group_concat", "load_file", "into outfile",
        "information_schema", "0x", "benchmark(", "sleep(",
    ];
    let lower = input.to_lowercase();
    patterns.iter().any(|p| lower.contains(p))
}

fn detect_xss(input: &str) -> bool {
    let patterns = [
        "<script", "javascript:", "onerror=", "onload=", "onclick=",
        "onfocus=", "onmouseover=", "<iframe", "<object", "<embed",
        "<svg/onload", "alert(", "eval(", "document.cookie",
        "window.location", "<img src=x",
    ];
    let lower = input.to_lowercase();
    patterns.iter().any(|p| lower.contains(p))
}

fn detect_path_traversal(input: &str) -> bool {
    input.contains("../") || input.contains("..\\") || input.contains("/etc/") || input.contains("C:\\")
}

fn detect_command_injection(input: &str) -> bool {
    let patterns = [
        "; ls", "| cat", "&& rm", "$(", "`", "; wget", "; curl",
        "| nc", "; bash", "| sh", "; python", "; perl",
    ];
    patterns.iter().any(|p| input.contains(p))
}

fn sanitize_html(input: &str) -> String {
    ammonia::clean(input)
}

async fn sanitize(body: web::Json<SanitizeRequest>, data: web::Data<AppState>) -> HttpResponse {
    data.requests_total.fetch_add(1, Ordering::Relaxed);

    let mut sanitized_fields = std::collections::HashMap::new();
    let mut threats = Vec::new();
    let mut count = 0;

    for (key, value) in &body.fields {
        let clean = sanitize_html(value);
        let is_dirty = clean != *value;

        if detect_sql_injection(value) {
            threats.push(ThreatInfo {
                field: key.clone(),
                threat_type: "sql_injection".to_string(),
                original: value.chars().take(100).collect(),
                sanitized: clean.clone(),
            });
        }
        if detect_xss(value) {
            threats.push(ThreatInfo {
                field: key.clone(),
                threat_type: "xss".to_string(),
                original: value.chars().take(100).collect(),
                sanitized: clean.clone(),
            });
        }
        if detect_command_injection(value) {
            threats.push(ThreatInfo {
                field: key.clone(),
                threat_type: "command_injection".to_string(),
                original: value.chars().take(100).collect(),
                sanitized: clean.clone(),
            });
        }

        if is_dirty || !threats.is_empty() {
            count += 1;
        }
        sanitized_fields.insert(key.clone(), clean);
    }

    if count > 0 {
        data.sanitized_total.fetch_add(count as u64, Ordering::Relaxed);
    }
    if !threats.is_empty() {
        data.blocked_total.fetch_add(threats.len() as u64, Ordering::Relaxed);
    }

    HttpResponse::Ok().json(SanitizeResponse {
        fields: sanitized_fields,
        sanitized_count: count,
        threats_found: threats,
    })
}

async fn inspect(body: web::Json<InspectRequest>, data: web::Data<AppState>) -> HttpResponse {
    data.requests_total.fetch_add(1, Ordering::Relaxed);

    let mut threats = Vec::new();
    let mut risk_score: f64 = 0.0;

    // Check path
    if detect_path_traversal(&body.path) {
        threats.push("path_traversal".to_string());
        risk_score += 0.9;
    }

    // Check body
    if let Some(ref b) = body.body {
        if detect_sql_injection(b) {
            threats.push("sql_injection".to_string());
            risk_score += 0.95;
        }
        if detect_xss(b) {
            threats.push("xss".to_string());
            risk_score += 0.8;
        }
        if detect_command_injection(b) {
            threats.push("command_injection".to_string());
            risk_score += 0.95;
        }
    }

    // Check headers for suspicious patterns
    for (key, value) in &body.headers {
        if key.to_lowercase() == "user-agent" && value.len() > 500 {
            threats.push("suspicious_user_agent".to_string());
            risk_score += 0.3;
        }
    }

    // Forward to OpenAppSec if configured
    if !data.openappsec_url.is_empty() {
        if let Ok(resp) = data.client
            .post(format!("{}/api/v1/inspect", data.openappsec_url))
            .json(&body.into_inner())
            .send()
            .await
        {
            if let Ok(oas_result) = resp.json::<serde_json::Value>().await {
                if let Some(score) = oas_result["risk_score"].as_f64() {
                    risk_score = risk_score.max(score);
                }
            }
        }
    }

    let action = if risk_score >= 0.9 {
        data.blocked_total.fetch_add(1, Ordering::Relaxed);
        "block"
    } else if risk_score >= 0.5 {
        "challenge"
    } else {
        "allow"
    };

    HttpResponse::Ok().json(InspectResponse {
        allowed: action == "allow",
        risk_score,
        threats,
        action: action.to_string(),
    })
}

async fn health(data: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "waf-security",
        "openappsec_configured": !data.openappsec_url.is_empty(),
        "requests_total": data.requests_total.load(Ordering::Relaxed),
        "blocked_total": data.blocked_total.load(Ordering::Relaxed),
        "sanitized_total": data.sanitized_total.load(Ordering::Relaxed),
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn metrics(data: web::Data<AppState>) -> HttpResponse {
    let content = format!(
        "# HELP waf_requests_total Total WAF requests\n\
         # TYPE waf_requests_total counter\n\
         waf_requests_total {}\n\
         # HELP waf_blocked_total Total blocked requests\n\
         # TYPE waf_blocked_total counter\n\
         waf_blocked_total {}\n\
         # HELP waf_sanitized_total Total sanitized fields\n\
         # TYPE waf_sanitized_total counter\n\
         waf_sanitized_total {}\n",
        data.requests_total.load(Ordering::Relaxed),
        data.blocked_total.load(Ordering::Relaxed),
        data.sanitized_total.load(Ordering::Relaxed),
    );
    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .body(content)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let port: u16 = std::env::var("WAF_SERVICE_PORT")
        .unwrap_or_else(|_| "8105".to_string())
        .parse()
        .unwrap_or(8105);

    let openappsec_url = std::env::var("OPENAPPSEC_URL").unwrap_or_default();

    let data = web::Data::new(AppState {
        openappsec_url,
        client: reqwest::Client::new(),
        requests_total: AtomicU64::new(0),
        blocked_total: AtomicU64::new(0),
        sanitized_total: AtomicU64::new(0),
    });

    log::info!("WAF Security service starting on :{}", port);

    HttpServer::new(move || {
        App::new()
            .app_data(data.clone())
            .route("/health", web::get().to(health))
            .route("/sanitize", web::post().to(sanitize))
            .route("/inspect", web::post().to(inspect))
            .route("/metrics", web::get().to(metrics))
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}
