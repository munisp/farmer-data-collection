//! PostGIS Spatial Query Microservice
//!
//! Replaces JavaScript Haversine calculations with native PostGIS queries
//! for accurate geodesic spatial operations. All computations happen in
//! PostgreSQL using the geography type for true ellipsoidal math.
//!
//! Endpoints:
//!   POST /spatial/farms-within-radius     — find farms within radius of a point
//!   POST /spatial/nearest-farms           — find N nearest farms to a point
//!   POST /spatial/point-in-farm           — check if a point falls within any farm boundary
//!   POST /spatial/overlapping-boundaries  — detect overlapping farm boundaries
//!   POST /spatial/distance                — geodesic distance between two points
//!   POST /spatial/area                    — compute area of a GeoJSON polygon
//!   POST /spatial/buffer                  — compute buffer zone around a farm
//!   POST /spatial/intersection            — compute intersection of two polygons
//!   POST /spatial/density-heatmap         — farm density grid for a bounding box
//!   GET  /health                          — health check

use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, middleware::Logger};
use serde::{Deserialize, Serialize};
use std::env;

mod spatial;

#[derive(Clone)]
pub struct AppState {
    pub db_url: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
    database: String,
    features: Vec<String>,
}

async fn health(data: web::Data<AppState>) -> HttpResponse {
    let db_status = match tokio_postgres::connect(&data.db_url, tokio_postgres::NoTls).await {
        Ok(_) => "connected".to_string(),
        Err(e) => format!("error: {}", e),
    };

    HttpResponse::Ok().json(HealthResponse {
        status: "healthy".to_string(),
        service: "spatial-query-service".to_string(),
        database: db_status,
        features: vec![
            "postgis-farms-within-radius".into(),
            "postgis-nearest-farms".into(),
            "postgis-point-in-farm".into(),
            "postgis-overlapping-boundaries".into(),
            "postgis-geodesic-distance".into(),
            "postgis-polygon-area".into(),
            "postgis-buffer-zone".into(),
            "postgis-intersection".into(),
            "postgis-density-heatmap".into(),
        ],
    })
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let port: u16 = env::var("SPATIAL_SERVICE_PORT")
        .unwrap_or_else(|_| "8099".to_string())
        .parse()
        .unwrap_or(8099);

    let db_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/farmer_data".to_string());

    let state = AppState {
        db_url: db_url.clone(),
    };

    log::info!("Starting spatial-query-service on port {}", port);
    log::info!("Database: {}", db_url.split('@').last().unwrap_or("unknown"));

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(Logger::default())
            .wrap(cors)
            .app_data(web::Data::new(state.clone()))
            .route("/health", web::get().to(health))
            .service(
                web::scope("/spatial")
                    .route("/farms-within-radius", web::post().to(spatial::farms_within_radius))
                    .route("/nearest-farms", web::post().to(spatial::nearest_farms))
                    .route("/point-in-farm", web::post().to(spatial::point_in_farm))
                    .route("/overlapping-boundaries", web::post().to(spatial::overlapping_boundaries))
                    .route("/distance", web::post().to(spatial::geodesic_distance))
                    .route("/area", web::post().to(spatial::polygon_area))
                    .route("/buffer", web::post().to(spatial::buffer_zone))
                    .route("/intersection", web::post().to(spatial::polygon_intersection))
                    .route("/density-heatmap", web::post().to(spatial::density_heatmap))
            )
    })
    .bind(("0.0.0.0", port))?
    .workers(4)
    .run()
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_haversine_distance() {
        let lagos = (6.5244, 3.3792);
        let ibadan = (7.3775, 3.9470);
        let dist = haversine(lagos.0, lagos.1, ibadan.0, ibadan.1);
        assert!(dist > 100.0 && dist < 130.0, "Lagos-Ibadan ~119km, got {}", dist);
    }

    #[test]
    fn test_point_in_polygon() {
        let polygon = vec![
            (6.0, 3.0),
            (7.0, 3.0),
            (7.0, 4.0),
            (6.0, 4.0),
        ];
        assert!(point_in_polygon(6.5, 3.5, &polygon));
        assert!(!point_in_polygon(8.0, 5.0, &polygon));
    }

    fn haversine(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
        let r = 6371.0;
        let dlat = (lat2 - lat1).to_radians();
        let dlon = (lon2 - lon1).to_radians();
        let a = (dlat / 2.0).sin().powi(2)
            + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
        r * 2.0 * a.sqrt().asin()
    }

    fn point_in_polygon(lat: f64, lon: f64, polygon: &[(f64, f64)]) -> bool {
        let mut inside = false;
        let n = polygon.len();
        let mut j = n - 1;
        for i in 0..n {
            if ((polygon[i].1 > lon) != (polygon[j].1 > lon))
                && (lat < (polygon[j].0 - polygon[i].0) * (lon - polygon[i].1)
                    / (polygon[j].1 - polygon[i].1) + polygon[i].0)
            {
                inside = !inside;
            }
            j = i;
        }
        inside
    }
}
