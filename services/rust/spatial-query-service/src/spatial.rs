//! PostGIS spatial query handlers
//!
//! Each handler executes a PostGIS query against the farm_boundaries table
//! using geography type for true ellipsoidal (WGS84) calculations.

use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use tokio_postgres::NoTls;

use crate::AppState;

// ─── Request / Response types ───

#[derive(Deserialize)]
pub struct RadiusQuery {
    pub latitude: f64,
    pub longitude: f64,
    pub radius_m: f64,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct NearestQuery {
    pub latitude: f64,
    pub longitude: f64,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct PointQuery {
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Deserialize)]
pub struct DistanceQuery {
    pub lat1: f64,
    pub lng1: f64,
    pub lat2: f64,
    pub lng2: f64,
}

#[derive(Deserialize)]
pub struct PolygonAreaQuery {
    pub coordinates: Vec<Vec<f64>>, // [[lng, lat], ...]
}

#[derive(Deserialize)]
pub struct BufferQuery {
    pub farm_id: i32,
    pub buffer_m: f64,
}

#[derive(Deserialize)]
pub struct IntersectionQuery {
    pub polygon_a: Vec<Vec<f64>>,
    pub polygon_b: Vec<Vec<f64>>,
}

#[derive(Deserialize)]
pub struct HeatmapQuery {
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lng: f64,
    pub max_lng: f64,
    pub grid_size: Option<i32>,
}

#[derive(Serialize)]
struct FarmResult {
    id: i32,
    farm_id: i32,
    farm_name: Option<String>,
    area_hectares: Option<f64>,
    perimeter_m: Option<f64>,
    distance_m: Option<f64>,
    centroid_lat: Option<f64>,
    centroid_lng: Option<f64>,
}

#[derive(Serialize)]
struct DistanceResult {
    distance_m: f64,
    distance_km: f64,
}

#[derive(Serialize)]
struct AreaResult {
    area_sqm: f64,
    area_hectares: f64,
    area_acres: f64,
    perimeter_m: f64,
    num_points: usize,
}

#[derive(Serialize)]
struct HeatmapCell {
    lat: f64,
    lng: f64,
    count: i64,
    total_area_ha: f64,
}

// ─── Helpers ───

async fn get_client(state: &AppState) -> Result<tokio_postgres::Client, HttpResponse> {
    let (client, connection) = tokio_postgres::connect(&state.db_url, NoTls)
        .await
        .map_err(|e| {
            log::error!("DB connection error: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Database connection failed: {}", e)
            }))
        })?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            log::error!("DB connection task error: {}", e);
        }
    });

    Ok(client)
}

fn coords_to_wkt_polygon(coords: &[Vec<f64>]) -> String {
    let points: Vec<String> = coords.iter()
        .map(|c| format!("{} {}", c[0], c[1]))
        .collect();
    let mut ring = points.clone();
    if ring.first() != ring.last() {
        ring.push(ring[0].clone());
    }
    format!("POLYGON(({}))", ring.join(", "))
}

// ─── Handlers ───

/// Find all farms within a radius of a point (PostGIS ST_DWithin on geography)
pub async fn farms_within_radius(
    state: web::Data<AppState>,
    body: web::Json<RadiusQuery>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let limit = body.limit.unwrap_or(50);
    let rows = client.query(
        "SELECT fb.id, fb.farm_id, f.farm_name,
                fb.area_hectares, fb.perimeter_m,
                ST_Distance(fb.boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_m,
                ST_Y(ST_Centroid(fb.boundary)) as centroid_lat,
                ST_X(ST_Centroid(fb.boundary)) as centroid_lng
         FROM farm_boundaries fb
         JOIN farms f ON f.id = fb.farm_id
         WHERE ST_DWithin(
             fb.boundary::geography,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             $3
         )
         ORDER BY distance_m ASC
         LIMIT $4",
        &[&body.longitude, &body.latitude, &body.radius_m, &limit],
    ).await;

    match rows {
        Ok(rows) => {
            let farms: Vec<FarmResult> = rows.iter().map(|r| FarmResult {
                id: r.get(0),
                farm_id: r.get(1),
                farm_name: r.get(2),
                area_hectares: r.get(3),
                perimeter_m: r.get(4),
                distance_m: r.get(5),
                centroid_lat: r.get(6),
                centroid_lng: r.get(7),
            }).collect();
            HttpResponse::Ok().json(serde_json::json!({
                "farms": farms,
                "count": farms.len(),
                "query": { "lat": body.latitude, "lng": body.longitude, "radius_m": body.radius_m }
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}

/// Find N nearest farms to a point (PostGIS KNN with <-> operator)
pub async fn nearest_farms(
    state: web::Data<AppState>,
    body: web::Json<NearestQuery>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let limit = body.limit.unwrap_or(10);
    let rows = client.query(
        "SELECT fb.id, fb.farm_id, f.farm_name,
                fb.area_hectares, fb.perimeter_m,
                ST_Distance(fb.boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_m,
                ST_Y(ST_Centroid(fb.boundary)) as centroid_lat,
                ST_X(ST_Centroid(fb.boundary)) as centroid_lng
         FROM farm_boundaries fb
         JOIN farms f ON f.id = fb.farm_id
         ORDER BY fb.boundary <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
         LIMIT $3",
        &[&body.longitude, &body.latitude, &limit],
    ).await;

    match rows {
        Ok(rows) => {
            let farms: Vec<FarmResult> = rows.iter().map(|r| FarmResult {
                id: r.get(0),
                farm_id: r.get(1),
                farm_name: r.get(2),
                area_hectares: r.get(3),
                perimeter_m: r.get(4),
                distance_m: r.get(5),
                centroid_lat: r.get(6),
                centroid_lng: r.get(7),
            }).collect();
            HttpResponse::Ok().json(serde_json::json!({
                "farms": farms,
                "count": farms.len()
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}

/// Check if a GPS point falls within any farm boundary (PostGIS ST_Contains)
pub async fn point_in_farm(
    state: web::Data<AppState>,
    body: web::Json<PointQuery>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let rows = client.query(
        "SELECT fb.id, fb.farm_id, f.farm_name, fb.area_hectares
         FROM farm_boundaries fb
         JOIN farms f ON f.id = fb.farm_id
         WHERE ST_Contains(fb.boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))",
        &[&body.longitude, &body.latitude],
    ).await;

    match rows {
        Ok(rows) => {
            let farms: Vec<serde_json::Value> = rows.iter().map(|r| {
                serde_json::json!({
                    "id": r.get::<_, i32>(0),
                    "farm_id": r.get::<_, i32>(1),
                    "farm_name": r.get::<_, Option<String>>(2),
                    "area_hectares": r.get::<_, Option<f64>>(3),
                })
            }).collect();
            HttpResponse::Ok().json(serde_json::json!({
                "point": { "lat": body.latitude, "lng": body.longitude },
                "inside_farms": farms,
                "is_inside": !farms.is_empty()
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}

/// Detect overlapping farm boundaries (PostGIS ST_Overlaps)
pub async fn overlapping_boundaries(
    state: web::Data<AppState>,
    _body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let rows = client.query(
        "SELECT a.id as id_a, a.farm_id as farm_a, b.id as id_b, b.farm_id as farm_b,
                ST_Area(ST_Intersection(a.boundary, b.boundary)::geography) / 10000.0 as overlap_hectares,
                ST_AsGeoJSON(ST_Intersection(a.boundary, b.boundary)) as overlap_geojson
         FROM farm_boundaries a
         JOIN farm_boundaries b ON a.id < b.id
         WHERE ST_Overlaps(a.boundary, b.boundary)
            OR ST_Contains(a.boundary, b.boundary)
            OR ST_Contains(b.boundary, a.boundary)
         ORDER BY overlap_hectares DESC",
        &[],
    ).await;

    match rows {
        Ok(rows) => {
            let overlaps: Vec<serde_json::Value> = rows.iter().map(|r| {
                serde_json::json!({
                    "boundary_a": r.get::<_, i32>(0),
                    "farm_a": r.get::<_, i32>(1),
                    "boundary_b": r.get::<_, i32>(2),
                    "farm_b": r.get::<_, i32>(3),
                    "overlap_hectares": r.get::<_, Option<f64>>(4),
                    "overlap_geojson": r.get::<_, Option<String>>(5),
                })
            }).collect();
            HttpResponse::Ok().json(serde_json::json!({
                "overlaps": overlaps,
                "count": overlaps.len()
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}

/// Geodesic distance between two points (PostGIS ST_Distance on geography)
pub async fn geodesic_distance(
    state: web::Data<AppState>,
    body: web::Json<DistanceQuery>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let row = client.query_one(
        "SELECT ST_Distance(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
         ) as distance_m",
        &[&body.lng1, &body.lat1, &body.lng2, &body.lat2],
    ).await;

    match row {
        Ok(row) => {
            let distance_m: f64 = row.get(0);
            HttpResponse::Ok().json(DistanceResult {
                distance_m,
                distance_km: distance_m / 1000.0,
            })
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}

/// Compute area/perimeter of a GeoJSON polygon (PostGIS ST_Area/ST_Perimeter on geography)
pub async fn polygon_area(
    state: web::Data<AppState>,
    body: web::Json<PolygonAreaQuery>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let wkt = coords_to_wkt_polygon(&body.coordinates);

    let row = client.query_one(
        "SELECT 
            ST_Area(ST_GeomFromText($1, 4326)::geography) as area_sqm,
            ST_Perimeter(ST_GeomFromText($1, 4326)::geography) as perimeter_m",
        &[&wkt],
    ).await;

    match row {
        Ok(row) => {
            let area_sqm: f64 = row.get(0);
            let perimeter_m: f64 = row.get(1);
            HttpResponse::Ok().json(AreaResult {
                area_sqm,
                area_hectares: area_sqm / 10000.0,
                area_acres: area_sqm / 4046.86,
                perimeter_m,
                num_points: body.coordinates.len(),
            })
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}

/// Compute a buffer zone around a farm boundary (PostGIS ST_Buffer on geography)
pub async fn buffer_zone(
    state: web::Data<AppState>,
    body: web::Json<BufferQuery>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let row = client.query_one(
        "SELECT ST_AsGeoJSON(ST_Buffer(fb.boundary::geography, $2)::geometry) as buffer_geojson,
                ST_Area(ST_Buffer(fb.boundary::geography, $2)) / 10000.0 as buffer_area_ha,
                fb.area_hectares as original_area_ha
         FROM farm_boundaries fb
         WHERE fb.farm_id = $1
         LIMIT 1",
        &[&body.farm_id, &body.buffer_m],
    ).await;

    match row {
        Ok(row) => {
            HttpResponse::Ok().json(serde_json::json!({
                "farm_id": body.farm_id,
                "buffer_m": body.buffer_m,
                "buffer_geojson": row.get::<_, Option<String>>(0),
                "buffer_area_ha": row.get::<_, Option<f64>>(1),
                "original_area_ha": row.get::<_, Option<f64>>(2),
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}

/// Compute intersection of two polygons (PostGIS ST_Intersection)
pub async fn polygon_intersection(
    state: web::Data<AppState>,
    body: web::Json<IntersectionQuery>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let wkt_a = coords_to_wkt_polygon(&body.polygon_a);
    let wkt_b = coords_to_wkt_polygon(&body.polygon_b);

    let row = client.query_one(
        "SELECT 
            ST_AsGeoJSON(ST_Intersection(
                ST_GeomFromText($1, 4326),
                ST_GeomFromText($2, 4326)
            )) as intersection_geojson,
            ST_Area(ST_Intersection(
                ST_GeomFromText($1, 4326)::geography,
                ST_GeomFromText($2, 4326)::geography
            )) / 10000.0 as intersection_ha,
            ST_Intersects(
                ST_GeomFromText($1, 4326),
                ST_GeomFromText($2, 4326)
            ) as does_intersect",
        &[&wkt_a, &wkt_b],
    ).await;

    match row {
        Ok(row) => {
            HttpResponse::Ok().json(serde_json::json!({
                "does_intersect": row.get::<_, bool>(2),
                "intersection_geojson": row.get::<_, Option<String>>(0),
                "intersection_hectares": row.get::<_, Option<f64>>(1),
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}

/// Generate farm density heatmap grid (PostGIS spatial binning)
pub async fn density_heatmap(
    state: web::Data<AppState>,
    body: web::Json<HeatmapQuery>,
) -> HttpResponse {
    let client = match get_client(&state).await {
        Ok(c) => c,
        Err(e) => return e,
    };

    let grid_size = body.grid_size.unwrap_or(20);
    let lat_step = (body.max_lat - body.min_lat) / grid_size as f64;
    let lng_step = (body.max_lng - body.min_lng) / grid_size as f64;

    let rows = client.query(
        "WITH grid AS (
            SELECT 
                generate_series AS row_idx,
                generate_series AS col_idx,
                $1::float8 + (generate_series * $5::float8) as cell_lat,
                $3::float8 + (generate_series * $6::float8) as cell_lng
            FROM generate_series(0, $7::int - 1)
         )
         SELECT 
            ST_Y(ST_Centroid(fb.boundary)) as lat,
            ST_X(ST_Centroid(fb.boundary)) as lng,
            COUNT(*) as farm_count,
            COALESCE(SUM(fb.area_hectares), 0) as total_area
         FROM farm_boundaries fb
         WHERE ST_Within(
             ST_Centroid(fb.boundary),
             ST_MakeEnvelope($3, $1, $4, $2, 4326)
         )
         GROUP BY 
            FLOOR((ST_Y(ST_Centroid(fb.boundary)) - $1) / $5),
            FLOOR((ST_X(ST_Centroid(fb.boundary)) - $3) / $6),
            ST_Y(ST_Centroid(fb.boundary)),
            ST_X(ST_Centroid(fb.boundary))
         ORDER BY farm_count DESC",
        &[
            &body.min_lat, &body.max_lat,
            &body.min_lng, &body.max_lng,
            &lat_step, &lng_step,
            &(grid_size as i64),
        ],
    ).await;

    match rows {
        Ok(rows) => {
            let cells: Vec<HeatmapCell> = rows.iter().map(|r| HeatmapCell {
                lat: r.get(0),
                lng: r.get(1),
                count: r.get(2),
                total_area_ha: r.get(3),
            }).collect();
            HttpResponse::Ok().json(serde_json::json!({
                "cells": cells,
                "count": cells.len(),
                "bounds": {
                    "min_lat": body.min_lat,
                    "max_lat": body.max_lat,
                    "min_lng": body.min_lng,
                    "max_lng": body.max_lng,
                },
                "grid_size": grid_size,
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Query failed: {}", e)
        })),
    }
}
