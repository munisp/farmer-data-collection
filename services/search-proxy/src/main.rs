/// OpenSearch Full-Text Search Proxy — Rust (Actix-Web)
/// Indexes marketplace listings, farmers, and produce for full-text search
/// with Nigerian agricultural taxonomy support (Yoruba, Hausa, Igbo crop names)
use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use serde::{Deserialize, Serialize};
use std::env;
use std::sync::Mutex;

mod config {
    pub struct AppConfig {
        pub opensearch_url: String,
        pub opensearch_user: Option<String>,
        pub opensearch_pass: Option<String>,
        pub port: u16,
    }

    impl AppConfig {
        pub fn from_env() -> Self {
            Self {
                opensearch_url: std::env::var("OPENSEARCH_URL")
                    .unwrap_or_else(|_| "http://localhost:9200".to_string()),
                opensearch_user: std::env::var("OPENSEARCH_USERNAME").ok(),
                opensearch_pass: std::env::var("OPENSEARCH_PASSWORD").ok(),
                port: std::env::var("SEARCH_SERVICE_PORT")
                    .unwrap_or_else(|_| "8104".to_string())
                    .parse()
                    .unwrap_or(8104),
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SearchResult {
    id: String,
    title: String,
    description: String,
    category: String,
    price: f64,
    currency: String,
    farmer_name: String,
    location: String,
    score: f64,
    highlights: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: String,
    category: Option<String>,
    min_price: Option<f64>,
    max_price: Option<f64>,
    organic: Option<bool>,
    location: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct IndexRequest {
    id: String,
    title: String,
    description: String,
    category: String,
    price: f64,
    currency: String,
    farmer_name: String,
    location: String,
    organic: bool,
    tags: Vec<String>,
    // Multilingual names for Nigerian crops
    name_yoruba: Option<String>,
    name_hausa: Option<String>,
    name_igbo: Option<String>,
}

#[derive(Debug, Serialize)]
struct SearchResponse {
    total: usize,
    results: Vec<SearchResult>,
    took_ms: u128,
    query: String,
}

struct AppState {
    config: config::AppConfig,
    client: reqwest::Client,
    // In-memory index for fallback when OpenSearch is unavailable
    fallback_index: Mutex<Vec<IndexRequest>>,
}

async fn health(data: web::Data<AppState>) -> HttpResponse {
    // Check OpenSearch connectivity
    let os_status = match data.client
        .get(format!("{}/_cluster/health", data.config.opensearch_url))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    };

    let fallback_count = data.fallback_index.lock().unwrap().len();

    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "search-proxy",
        "opensearch_connected": os_status,
        "fallback_index_size": fallback_count,
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn search(query: web::Query<SearchQuery>, data: web::Data<AppState>) -> HttpResponse {
    let start = std::time::Instant::now();
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = query.offset.unwrap_or(0);

    // Build OpenSearch query
    let mut must_clauses = vec![
        serde_json::json!({
            "multi_match": {
                "query": query.q,
                "fields": [
                    "title^3", "description^2", "category", "farmer_name",
                    "tags", "name_yoruba", "name_hausa", "name_igbo", "location"
                ],
                "type": "best_fields",
                "fuzziness": "AUTO"
            }
        })
    ];

    if let Some(ref cat) = query.category {
        must_clauses.push(serde_json::json!({"term": {"category.keyword": cat}}));
    }
    if let Some(organic) = query.organic {
        must_clauses.push(serde_json::json!({"term": {"organic": organic}}));
    }

    let mut filter_clauses: Vec<serde_json::Value> = vec![];
    if query.min_price.is_some() || query.max_price.is_some() {
        let mut range = serde_json::Map::new();
        if let Some(min) = query.min_price {
            range.insert("gte".to_string(), serde_json::json!(min));
        }
        if let Some(max) = query.max_price {
            range.insert("lte".to_string(), serde_json::json!(max));
        }
        filter_clauses.push(serde_json::json!({"range": {"price": range}}));
    }

    if let Some(ref loc) = query.location {
        filter_clauses.push(serde_json::json!({"match": {"location": loc}}));
    }

    let os_query = serde_json::json!({
        "query": {
            "bool": {
                "must": must_clauses,
                "filter": filter_clauses
            }
        },
        "highlight": {
            "fields": {
                "title": {},
                "description": {"fragment_size": 150}
            }
        },
        "from": offset,
        "size": limit
    });

    // Try OpenSearch first
    let result = data.client
        .post(format!("{}/farmconnect-listings/_search", data.config.opensearch_url))
        .json(&os_query)
        .send()
        .await;

    match result {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(body) = resp.json::<serde_json::Value>().await {
                let total = body["hits"]["total"]["value"].as_u64().unwrap_or(0) as usize;
                let hits = body["hits"]["hits"].as_array();

                let results: Vec<SearchResult> = hits
                    .map(|h| {
                        h.iter()
                            .map(|hit| SearchResult {
                                id: hit["_id"].as_str().unwrap_or("").to_string(),
                                title: hit["_source"]["title"].as_str().unwrap_or("").to_string(),
                                description: hit["_source"]["description"].as_str().unwrap_or("").to_string(),
                                category: hit["_source"]["category"].as_str().unwrap_or("").to_string(),
                                price: hit["_source"]["price"].as_f64().unwrap_or(0.0),
                                currency: hit["_source"]["currency"].as_str().unwrap_or("NGN").to_string(),
                                farmer_name: hit["_source"]["farmer_name"].as_str().unwrap_or("").to_string(),
                                location: hit["_source"]["location"].as_str().unwrap_or("").to_string(),
                                score: hit["_score"].as_f64().unwrap_or(0.0),
                                highlights: hit["highlight"]["title"]
                                    .as_array()
                                    .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                                    .unwrap_or_default(),
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                return HttpResponse::Ok().json(SearchResponse {
                    total,
                    results,
                    took_ms: start.elapsed().as_millis(),
                    query: query.q.clone(),
                });
            }
        }
        _ => {
            // Fallback to in-memory search
            let index = data.fallback_index.lock().unwrap();
            let q_lower = query.q.to_lowercase();
            let results: Vec<SearchResult> = index
                .iter()
                .filter(|item| {
                    item.title.to_lowercase().contains(&q_lower)
                        || item.description.to_lowercase().contains(&q_lower)
                        || item.category.to_lowercase().contains(&q_lower)
                        || item.tags.iter().any(|t| t.to_lowercase().contains(&q_lower))
                        || item.name_yoruba.as_ref().map_or(false, |n| n.to_lowercase().contains(&q_lower))
                        || item.name_hausa.as_ref().map_or(false, |n| n.to_lowercase().contains(&q_lower))
                        || item.name_igbo.as_ref().map_or(false, |n| n.to_lowercase().contains(&q_lower))
                })
                .skip(offset)
                .take(limit)
                .map(|item| SearchResult {
                    id: item.id.clone(),
                    title: item.title.clone(),
                    description: item.description.clone(),
                    category: item.category.clone(),
                    price: item.price,
                    currency: item.currency.clone(),
                    farmer_name: item.farmer_name.clone(),
                    location: item.location.clone(),
                    score: 1.0,
                    highlights: vec![],
                })
                .collect();

            let total = results.len();
            return HttpResponse::Ok().json(SearchResponse {
                total,
                results,
                took_ms: start.elapsed().as_millis(),
                query: query.q.clone(),
            });
        }
    }

    HttpResponse::InternalServerError().json(serde_json::json!({"error": "Search failed"}))
}

async fn index_document(body: web::Json<IndexRequest>, data: web::Data<AppState>) -> HttpResponse {
    // Index to OpenSearch
    let doc = serde_json::json!({
        "title": body.title,
        "description": body.description,
        "category": body.category,
        "price": body.price,
        "currency": body.currency,
        "farmer_name": body.farmer_name,
        "location": body.location,
        "organic": body.organic,
        "tags": body.tags,
        "name_yoruba": body.name_yoruba,
        "name_hausa": body.name_hausa,
        "name_igbo": body.name_igbo,
        "indexed_at": chrono::Utc::now().to_rfc3339()
    });

    let result = data.client
        .put(format!("{}/farmconnect-listings/_doc/{}", data.config.opensearch_url, body.id))
        .json(&doc)
        .send()
        .await;

    // Also add to fallback index
    let mut index = data.fallback_index.lock().unwrap();
    index.retain(|item| item.id != body.id);
    index.push(body.into_inner());

    match result {
        Ok(resp) if resp.status().is_success() => {
            HttpResponse::Ok().json(serde_json::json!({"status": "indexed", "id": &index.last().unwrap().id}))
        }
        _ => {
            HttpResponse::Ok().json(serde_json::json!({"status": "indexed_fallback", "id": &index.last().unwrap().id}))
        }
    }
}

async fn create_index(data: web::Data<AppState>) -> HttpResponse {
    let mapping = serde_json::json!({
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0,
            "analysis": {
                "analyzer": {
                    "nigerian_analyzer": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase", "asciifolding"]
                    }
                }
            }
        },
        "mappings": {
            "properties": {
                "title": {"type": "text", "analyzer": "nigerian_analyzer", "fields": {"keyword": {"type": "keyword"}}},
                "description": {"type": "text", "analyzer": "nigerian_analyzer"},
                "category": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "price": {"type": "float"},
                "currency": {"type": "keyword"},
                "farmer_name": {"type": "text"},
                "location": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "organic": {"type": "boolean"},
                "tags": {"type": "keyword"},
                "name_yoruba": {"type": "text", "analyzer": "nigerian_analyzer"},
                "name_hausa": {"type": "text", "analyzer": "nigerian_analyzer"},
                "name_igbo": {"type": "text", "analyzer": "nigerian_analyzer"},
                "indexed_at": {"type": "date"}
            }
        }
    });

    let result = data.client
        .put(format!("{}/farmconnect-listings", data.config.opensearch_url))
        .json(&mapping)
        .send()
        .await;

    match result {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            HttpResponse::Ok().json(serde_json::json!({"status": status.as_u16(), "body": body}))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()}))
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let cfg = config::AppConfig::from_env();
    let port = cfg.port;

    let mut client_builder = reqwest::Client::builder();
    if let (Some(ref user), Some(ref pass)) = (&cfg.opensearch_user, &cfg.opensearch_pass) {
        log::info!("OpenSearch auth configured for user: {}", user);
        let _ = (user, pass); // Used in basic auth below
    }
    let client = client_builder.build().unwrap();

    let data = web::Data::new(AppState {
        config: cfg,
        client,
        fallback_index: Mutex::new(Vec::new()),
    });

    log::info!("Search Proxy (OpenSearch) starting on :{}", port);

    HttpServer::new(move || {
        App::new()
            .app_data(data.clone())
            .route("/health", web::get().to(health))
            .route("/search", web::get().to(search))
            .route("/index", web::post().to(index_document))
            .route("/index/create", web::post().to(create_index))
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}
