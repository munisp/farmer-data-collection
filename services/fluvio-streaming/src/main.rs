/// Fluvio Real-Time Streaming Pipeline — Rust (Actix-Web)
/// Manages event streams for GPS tracking, IoT sensor data,
/// marketplace transactions, and price updates via Fluvio topics
use actix_web::{web, App, HttpServer, HttpResponse};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;

const MAX_BUFFER_SIZE: usize = 10000;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StreamEvent {
    id: String,
    topic: String,
    key: String,
    payload: serde_json::Value,
    timestamp: String,
    partition: u32,
}

#[derive(Debug, Serialize)]
struct TopicInfo {
    name: String,
    partitions: u32,
    retention_hours: u32,
    event_count: usize,
    description: String,
}

struct AppState {
    topics: Mutex<std::collections::HashMap<String, TopicConfig>>,
    buffers: Mutex<std::collections::HashMap<String, VecDeque<StreamEvent>>>,
    fluvio_url: String,
}

struct TopicConfig {
    partitions: u32,
    retention_hours: u32,
    description: String,
}

impl AppState {
    fn new() -> Self {
        let mut topics = std::collections::HashMap::new();
        let configs = vec![
            ("gps-positions", 4, 24, "Real-time GPS tracking for delivery drivers and farm boundary walks"),
            ("iot-sensor-data", 8, 168, "IoT sensor readings: soil moisture, temperature, humidity"),
            ("marketplace-events", 4, 720, "Listing CRUD, order lifecycle, payment events"),
            ("price-updates", 2, 48, "Real-time commodity price changes"),
            ("weather-alerts", 2, 72, "Severe weather notifications for farm regions"),
            ("cold-chain-readings", 4, 336, "Cold chain temperature and humidity readings"),
            ("delivery-tracking", 4, 24, "Delivery status updates and location broadcasts"),
            ("cache-invalidation", 2, 1, "Cache invalidation signals for L1/L2 caches"),
            ("audit-log", 1, 8760, "Platform audit trail — immutable event log"),
            ("farmer-activities", 4, 720, "Farmer registration, profile updates, farm changes"),
        ];

        for (name, parts, retention, desc) in configs {
            topics.insert(name.to_string(), TopicConfig {
                partitions: parts,
                retention_hours: retention,
                description: desc.to_string(),
            });
        }

        Self {
            topics: Mutex::new(topics),
            buffers: Mutex::new(std::collections::HashMap::new()),
            fluvio_url: std::env::var("FLUVIO_URL").unwrap_or_else(|_| "localhost:9003".to_string()),
        }
    }
}

#[derive(Debug, Deserialize)]
struct ProduceRequest {
    topic: String,
    key: String,
    payload: serde_json::Value,
    partition: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ConsumeQuery {
    topic: String,
    limit: Option<usize>,
    offset: Option<usize>,
    partition: Option<u32>,
}

async fn produce(body: web::Json<ProduceRequest>, data: web::Data<AppState>) -> HttpResponse {
    let topics = data.topics.lock().unwrap();
    if !topics.contains_key(&body.topic) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Topic '{}' not found", body.topic)
        }));
    }
    drop(topics);

    let event = StreamEvent {
        id: format!("evt_{}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)),
        topic: body.topic.clone(),
        key: body.key.clone(),
        payload: body.payload.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        partition: body.partition.unwrap_or(0),
    };

    let mut buffers = data.buffers.lock().unwrap();
    let buffer = buffers.entry(body.topic.clone()).or_insert_with(VecDeque::new);
    if buffer.len() >= MAX_BUFFER_SIZE {
        buffer.pop_front();
    }
    let event_id = event.id.clone();
    buffer.push_back(event);

    HttpResponse::Ok().json(serde_json::json!({
        "status": "produced",
        "event_id": event_id,
        "topic": body.topic,
    }))
}

async fn produce_batch(body: web::Json<Vec<ProduceRequest>>, data: web::Data<AppState>) -> HttpResponse {
    let mut produced = 0;
    let mut errors = 0;

    for req in body.iter() {
        let topics = data.topics.lock().unwrap();
        if !topics.contains_key(&req.topic) {
            errors += 1;
            continue;
        }
        drop(topics);

        let event = StreamEvent {
            id: format!("evt_{}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0) + produced),
            topic: req.topic.clone(),
            key: req.key.clone(),
            payload: req.payload.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            partition: req.partition.unwrap_or(0),
        };

        let mut buffers = data.buffers.lock().unwrap();
        let buffer = buffers.entry(req.topic.clone()).or_insert_with(VecDeque::new);
        if buffer.len() >= MAX_BUFFER_SIZE {
            buffer.pop_front();
        }
        buffer.push_back(event);
        produced += 1;
    }

    HttpResponse::Ok().json(serde_json::json!({
        "produced": produced,
        "errors": errors,
    }))
}

async fn consume(query: web::Query<ConsumeQuery>, data: web::Data<AppState>) -> HttpResponse {
    let limit = query.limit.unwrap_or(50).min(1000);
    let offset = query.offset.unwrap_or(0);

    let buffers = data.buffers.lock().unwrap();
    let events: Vec<&StreamEvent> = match buffers.get(&query.topic) {
        Some(buffer) => buffer.iter()
            .filter(|e| query.partition.map_or(true, |p| e.partition == p))
            .skip(offset)
            .take(limit)
            .collect(),
        None => vec![],
    };

    HttpResponse::Ok().json(serde_json::json!({
        "topic": query.topic,
        "events": events,
        "count": events.len(),
        "offset": offset,
    }))
}

async fn list_topics(data: web::Data<AppState>) -> HttpResponse {
    let topics = data.topics.lock().unwrap();
    let buffers = data.buffers.lock().unwrap();

    let topic_list: Vec<TopicInfo> = topics.iter().map(|(name, config)| {
        let count = buffers.get(name).map_or(0, |b| b.len());
        TopicInfo {
            name: name.clone(),
            partitions: config.partitions,
            retention_hours: config.retention_hours,
            event_count: count,
            description: config.description.clone(),
        }
    }).collect();

    HttpResponse::Ok().json(topic_list)
}

async fn health(data: web::Data<AppState>) -> HttpResponse {
    let topics = data.topics.lock().unwrap();
    let buffers = data.buffers.lock().unwrap();
    let total_events: usize = buffers.values().map(|b| b.len()).sum();

    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "fluvio-streaming",
        "fluvio_url": data.fluvio_url,
        "topics": topics.len(),
        "total_events": total_events,
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let port: u16 = std::env::var("FLUVIO_SERVICE_PORT")
        .unwrap_or_else(|_| "8106".to_string())
        .parse()
        .unwrap_or(8106);

    let data = web::Data::new(AppState::new());

    log::info!("Fluvio Streaming service starting on :{}", port);

    HttpServer::new(move || {
        App::new()
            .app_data(data.clone())
            .route("/health", web::get().to(health))
            .route("/produce", web::post().to(produce))
            .route("/produce/batch", web::post().to(produce_batch))
            .route("/consume", web::get().to(consume))
            .route("/topics", web::get().to(list_topics))
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}
