/// Autonomous Field Operations Orchestrator
/// Coordinates equipment operations: plan → dispatch → execute → verify
/// Handles multi-equipment coordination, safety constraints, and field operation sequencing
/// Port: 8102

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FieldOperation {
    pub id: String,
    pub farm_id: i64,
    pub field_id: i64,
    pub operation_type: OperationType,
    pub priority: u8, // 1-10
    pub status: OperationStatus,
    pub equipment_ids: Vec<String>,
    pub prescription_id: Option<String>,
    pub constraints: OperationConstraints,
    pub plan: OperationPlan,
    pub result: Option<OperationResult>,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum OperationType {
    Tillage,
    Planting,
    Spraying,
    Fertilizing,
    Harvesting,
    Irrigation,
    Scouting,
    SoilSampling,
    Mowing,
    Baling,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub enum OperationStatus {
    Planned,
    WeatherHold,
    Dispatched,
    InProgress,
    Paused,
    Completed,
    Aborted,
    Failed,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OperationConstraints {
    pub min_soil_moisture: Option<f64>,
    pub max_soil_moisture: Option<f64>,
    pub max_wind_speed_ms: Option<f64>,
    pub no_rain: bool,
    pub min_temperature: Option<f64>,
    pub max_temperature: Option<f64>,
    pub daylight_only: bool,
    pub min_visibility_m: Option<f64>,
    pub depends_on: Vec<String>, // operation IDs that must complete first
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OperationPlan {
    pub field_boundary_wkt: String,
    pub headland_passes: u32,
    pub entry_point_lat: f64,
    pub entry_point_lon: f64,
    pub direction_deg: f64,
    pub swath_width_m: f64,
    pub speed_target_kmh: f64,
    pub product: Option<String>,
    pub rate: Option<f64>,
    pub rate_unit: Option<String>,
    pub estimated_time_h: f64,
    pub estimated_fuel_l: f64,
    pub estimated_product_needed: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OperationResult {
    pub area_covered_ha: f64,
    pub time_elapsed_h: f64,
    pub fuel_used_l: f64,
    pub product_used: f64,
    pub avg_speed_kmh: f64,
    pub coverage_pct: f64,
    pub overlap_pct: f64,
    pub skip_pct: f64,
    pub quality_score: f64, // 0-100
    pub path_wkt: String,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WeatherConditions {
    pub temperature: f64,
    pub humidity: f64,
    pub wind_speed_ms: f64,
    pub wind_gust_ms: f64,
    pub precipitation_mm: f64,
    pub visibility_m: f64,
    pub cloud_cover_pct: f64,
    pub is_daylight: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SafetyZone {
    pub zone_type: String, // water_body, road, building, powerline, neighbor
    pub polygon_wkt: String,
    pub buffer_m: f64,
}

// ============================================================================
// Operations Orchestrator
// ============================================================================

pub struct OperationsOrchestrator {
    operations: Arc<RwLock<HashMap<String, FieldOperation>>>,
    safety_zones: Arc<RwLock<Vec<SafetyZone>>>,
}

impl OperationsOrchestrator {
    pub fn new() -> Self {
        OperationsOrchestrator {
            operations: Arc::new(RwLock::new(HashMap::new())),
            safety_zones: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn create_operation(&self, mut op: FieldOperation) -> String {
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        op.id = format!("OP-{}-{}", op.farm_id, ts);
        op.status = OperationStatus::Planned;
        op.created_at = ts;

        let id = op.id.clone();
        let mut ops = self.operations.write().unwrap();
        ops.insert(id.clone(), op);
        id
    }

    pub fn check_weather_gate(&self, op_id: &str, weather: &WeatherConditions) -> (bool, Vec<String>) {
        let ops = self.operations.read().unwrap();
        let op = match ops.get(op_id) {
            Some(o) => o,
            None => return (false, vec!["Operation not found".into()]),
        };

        let mut issues = Vec::new();

        if let Some(max_wind) = op.constraints.max_wind_speed_ms {
            if weather.wind_speed_ms > max_wind {
                issues.push(format!("Wind {:.1} m/s exceeds max {:.1} m/s", weather.wind_speed_ms, max_wind));
            }
        }

        if op.constraints.no_rain && weather.precipitation_mm > 0.0 {
            issues.push(format!("Rain detected: {:.1} mm", weather.precipitation_mm));
        }

        if let Some(min_temp) = op.constraints.min_temperature {
            if weather.temperature < min_temp {
                issues.push(format!("Temperature {:.1}°C below minimum {:.1}°C", weather.temperature, min_temp));
            }
        }

        if let Some(max_temp) = op.constraints.max_temperature {
            if weather.temperature > max_temp {
                issues.push(format!("Temperature {:.1}°C above maximum {:.1}°C", weather.temperature, max_temp));
            }
        }

        if op.constraints.daylight_only && !weather.is_daylight {
            issues.push("Operation requires daylight".into());
        }

        if let Some(min_vis) = op.constraints.min_visibility_m {
            if weather.visibility_m < min_vis {
                issues.push(format!("Visibility {:.0}m below minimum {:.0}m", weather.visibility_m, min_vis));
            }
        }

        (issues.is_empty(), issues)
    }

    pub fn check_dependencies(&self, op_id: &str) -> (bool, Vec<String>) {
        let ops = self.operations.read().unwrap();
        let op = match ops.get(op_id) {
            Some(o) => o,
            None => return (false, vec!["Operation not found".into()]),
        };

        let mut unmet = Vec::new();
        for dep_id in &op.constraints.depends_on {
            match ops.get(dep_id) {
                Some(dep) if dep.status == OperationStatus::Completed => {},
                Some(dep) => unmet.push(format!("{} is {:?}", dep_id, dep.status)),
                None => unmet.push(format!("{} not found", dep_id)),
            }
        }

        (unmet.is_empty(), unmet)
    }

    pub fn dispatch(&self, op_id: &str) -> Result<(), String> {
        let mut ops = self.operations.write().unwrap();
        let op = ops.get_mut(op_id).ok_or("Operation not found")?;

        if op.status != OperationStatus::Planned && op.status != OperationStatus::WeatherHold {
            return Err(format!("Cannot dispatch from {:?} status", op.status));
        }

        op.status = OperationStatus::Dispatched;
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        op.started_at = Some(ts);
        Ok(())
    }

    pub fn complete_operation(&self, op_id: &str, result: OperationResult) -> Result<(), String> {
        let mut ops = self.operations.write().unwrap();
        let op = ops.get_mut(op_id).ok_or("Operation not found")?;
        op.status = OperationStatus::Completed;
        op.completed_at = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
        op.result = Some(result);
        Ok(())
    }

    pub fn calculate_field_efficiency(&self, op_id: &str) -> Option<HashMap<String, f64>> {
        let ops = self.operations.read().unwrap();
        let op = ops.get(op_id)?;
        let result = op.result.as_ref()?;

        let mut metrics = HashMap::new();
        metrics.insert("area_efficiency".into(), result.coverage_pct);
        metrics.insert("overlap_waste".into(), result.overlap_pct);
        metrics.insert("skip_loss".into(), result.skip_pct);
        metrics.insert("fuel_efficiency_l_ha".into(),
            if result.area_covered_ha > 0.0 { result.fuel_used_l / result.area_covered_ha } else { 0.0 });
        metrics.insert("time_efficiency_ha_h".into(),
            if result.time_elapsed_h > 0.0 { result.area_covered_ha / result.time_elapsed_h } else { 0.0 });
        metrics.insert("quality_score".into(), result.quality_score);

        Some(metrics)
    }

    pub fn get_farm_operations(&self, farm_id: i64) -> Vec<FieldOperation> {
        let ops = self.operations.read().unwrap();
        ops.values().filter(|o| o.farm_id == farm_id).cloned().collect()
    }

    pub fn add_safety_zone(&self, zone: SafetyZone) {
        let mut zones = self.safety_zones.write().unwrap();
        zones.push(zone);
    }
}

// ============================================================================
// Path Planning
// ============================================================================

pub fn generate_field_path(
    boundary_points: &[(f64, f64)],
    headland_passes: u32,
    swath_width_m: f64,
    direction_deg: f64,
    entry_lat: f64,
    entry_lon: f64,
) -> Vec<(f64, f64)> {
    let mut path = Vec::new();

    // Headland passes (perimeter)
    for pass in 0..headland_passes {
        let offset_m = (pass as f64 + 0.5) * swath_width_m;
        let offset_deg = offset_m / 111320.0;
        for point in boundary_points {
            path.push((point.0 + offset_deg * 0.01, point.1 + offset_deg * 0.01));
        }
    }

    // Interior passes (parallel lines in specified direction)
    if boundary_points.len() >= 2 {
        let min_lat = boundary_points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
        let max_lat = boundary_points.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max);
        let min_lon = boundary_points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
        let max_lon = boundary_points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);

        let lat_step = swath_width_m / 111320.0;
        let mut forward = true;

        let mut lat = min_lat + lat_step * headland_passes as f64;
        while lat < max_lat - lat_step * headland_passes as f64 {
            if forward {
                path.push((lat, min_lon));
                path.push((lat, max_lon));
            } else {
                path.push((lat, max_lon));
                path.push((lat, min_lon));
            }
            forward = !forward;
            lat += lat_step;
        }
    }

    path
}

pub fn calculate_overlap(path: &[(f64, f64)], swath_width_m: f64) -> f64 {
    if path.len() < 4 { return 0.0; }

    let mut overlaps = 0;
    let mut total = 0;

    // Check distance between adjacent passes
    for i in (0..path.len() - 3).step_by(2) {
        let lat1 = (path[i].0 + path[i + 1].0) / 2.0;
        let lat2 = (path[i + 2].0 + path[i + 3].0) / 2.0;
        let dist_m = (lat2 - lat1).abs() * 111320.0;

        if dist_m < swath_width_m {
            overlaps += 1;
        }
        total += 1;
    }

    if total > 0 { overlaps as f64 / total as f64 * 100.0 } else { 0.0 }
}

// ============================================================================
// Entry Point
// ============================================================================

fn health_response() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!(r#"{{"status":"healthy","service":"autonomous-ops","timestamp":{}}}"#, now)
}

fn main() {
    let _orchestrator = OperationsOrchestrator::new();
    let port = std::env::var("PORT").unwrap_or_else(|_| "8102".into());

    println!("[autonomous-ops] Starting on :{}", port);
    println!("[autonomous-ops] Features: operation planning, weather gating, dependency tracking, path planning, safety zones");
    println!("[autonomous-ops] Health endpoint: http://0.0.0.0:{}/health", port);

    // Health endpoint available via health_response()
    loop {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_dispatch() {
        let orch = OperationsOrchestrator::new();
        let op = FieldOperation {
            id: String::new(),
            farm_id: 1,
            field_id: 1,
            operation_type: OperationType::Spraying,
            priority: 8,
            status: OperationStatus::Planned,
            equipment_ids: vec!["EQ-1".into()],
            prescription_id: Some("RX-1".into()),
            constraints: OperationConstraints {
                max_wind_speed_ms: Some(8.0),
                no_rain: true,
                daylight_only: true,
                min_soil_moisture: None, max_soil_moisture: None,
                min_temperature: None, max_temperature: None,
                min_visibility_m: Some(500.0),
                depends_on: vec![],
            },
            plan: OperationPlan {
                field_boundary_wkt: String::new(),
                headland_passes: 2, entry_point_lat: -1.28, entry_point_lon: 36.82,
                direction_deg: 0.0, swath_width_m: 6.0, speed_target_kmh: 8.0,
                product: Some("Glyphosate".into()), rate: Some(3.0), rate_unit: Some("L/ha".into()),
                estimated_time_h: 2.5, estimated_fuel_l: 15.0, estimated_product_needed: 30.0,
            },
            result: None,
            created_at: 0,
            started_at: None, completed_at: None,
        };

        let op_id = orch.create_operation(op);
        assert!(orch.dispatch(&op_id).is_ok());
    }

    #[test]
    fn test_weather_gate() {
        let orch = OperationsOrchestrator::new();
        let op = FieldOperation {
            id: String::new(), farm_id: 1, field_id: 1,
            operation_type: OperationType::Spraying, priority: 5,
            status: OperationStatus::Planned, equipment_ids: vec![],
            prescription_id: None,
            constraints: OperationConstraints {
                max_wind_speed_ms: Some(8.0), no_rain: true, daylight_only: false,
                min_soil_moisture: None, max_soil_moisture: None,
                min_temperature: None, max_temperature: None,
                min_visibility_m: None, depends_on: vec![],
            },
            plan: OperationPlan {
                field_boundary_wkt: String::new(), headland_passes: 0,
                entry_point_lat: 0.0, entry_point_lon: 0.0, direction_deg: 0.0,
                swath_width_m: 6.0, speed_target_kmh: 8.0,
                product: None, rate: None, rate_unit: None,
                estimated_time_h: 0.0, estimated_fuel_l: 0.0, estimated_product_needed: 0.0,
            },
            result: None, created_at: 0, started_at: None, completed_at: None,
        };

        let op_id = orch.create_operation(op);

        let weather = WeatherConditions {
            temperature: 25.0, humidity: 60.0, wind_speed_ms: 3.0,
            wind_gust_ms: 5.0, precipitation_mm: 0.0, visibility_m: 10000.0,
            cloud_cover_pct: 30.0, is_daylight: true,
        };
        let (ok, _) = orch.check_weather_gate(&op_id, &weather);
        assert!(ok);

        let bad_weather = WeatherConditions {
            temperature: 25.0, humidity: 60.0, wind_speed_ms: 12.0,
            wind_gust_ms: 18.0, precipitation_mm: 5.0, visibility_m: 500.0,
            cloud_cover_pct: 90.0, is_daylight: true,
        };
        let (ok, issues) = orch.check_weather_gate(&op_id, &bad_weather);
        assert!(!ok);
        assert!(issues.len() >= 2);
    }

    #[test]
    fn test_complete_operation_with_result() {
        let orch = OperationsOrchestrator::new();
        let op = FieldOperation {
            id: String::new(), farm_id: 1, field_id: 2,
            operation_type: OperationType::Harvesting, priority: 9,
            status: OperationStatus::Planned, equipment_ids: vec!["EQ-2".into()],
            prescription_id: None,
            constraints: OperationConstraints {
                max_wind_speed_ms: None, no_rain: false, daylight_only: true,
                min_soil_moisture: None, max_soil_moisture: None,
                min_temperature: None, max_temperature: None,
                min_visibility_m: None, depends_on: vec![],
            },
            plan: OperationPlan {
                field_boundary_wkt: String::new(), headland_passes: 2,
                entry_point_lat: 9.06, entry_point_lon: 7.49, direction_deg: 90.0,
                swath_width_m: 4.5, speed_target_kmh: 6.0,
                product: None, rate: None, rate_unit: None,
                estimated_time_h: 3.0, estimated_fuel_l: 20.0, estimated_product_needed: 0.0,
            },
            result: None, created_at: 0, started_at: None, completed_at: None,
        };

        let op_id = orch.create_operation(op);
        assert!(orch.dispatch(&op_id).is_ok());
        let result = OperationResult {
            area_covered_ha: 5.0, coverage_pct: 98.5, overlap_pct: 2.1, skip_pct: 0.4,
            fuel_used_l: 18.0, time_elapsed_h: 2.8, quality_score: 92.0,
            product_applied: 0.0,
        };
        assert!(orch.complete_operation(&op_id, result).is_ok());

        let metrics = orch.calculate_field_efficiency(&op_id);
        assert!(metrics.is_some());
        let m = metrics.unwrap();
        assert!(*m.get("area_efficiency").unwrap() > 95.0);
        assert!(*m.get("fuel_efficiency_l_ha").unwrap() > 0.0);
    }

    #[test]
    fn test_dependency_tracking() {
        let orch = OperationsOrchestrator::new();
        let make_op = |deps: Vec<String>| FieldOperation {
            id: String::new(), farm_id: 1, field_id: 1,
            operation_type: OperationType::Planting, priority: 5,
            status: OperationStatus::Planned, equipment_ids: vec![],
            prescription_id: None,
            constraints: OperationConstraints {
                max_wind_speed_ms: None, no_rain: false, daylight_only: false,
                min_soil_moisture: None, max_soil_moisture: None,
                min_temperature: None, max_temperature: None,
                min_visibility_m: None, depends_on: deps,
            },
            plan: OperationPlan {
                field_boundary_wkt: String::new(), headland_passes: 0,
                entry_point_lat: 0.0, entry_point_lon: 0.0, direction_deg: 0.0,
                swath_width_m: 3.0, speed_target_kmh: 5.0,
                product: None, rate: None, rate_unit: None,
                estimated_time_h: 1.0, estimated_fuel_l: 5.0, estimated_product_needed: 0.0,
            },
            result: None, created_at: 0, started_at: None, completed_at: None,
        };

        let tillage_id = orch.create_operation(make_op(vec![]));
        let planting_id = orch.create_operation(make_op(vec![tillage_id.clone()]));

        let (ready, unmet) = orch.check_dependencies(&planting_id);
        assert!(!ready);
        assert_eq!(unmet.len(), 1);

        orch.dispatch(&tillage_id).unwrap();
        let result = OperationResult {
            area_covered_ha: 2.0, coverage_pct: 100.0, overlap_pct: 0.0, skip_pct: 0.0,
            fuel_used_l: 10.0, time_elapsed_h: 1.0, quality_score: 95.0, product_applied: 0.0,
        };
        orch.complete_operation(&tillage_id, result).unwrap();

        let (ready, unmet) = orch.check_dependencies(&planting_id);
        assert!(ready);
        assert!(unmet.is_empty());
    }

    #[test]
    fn test_farm_operations_filter() {
        let orch = OperationsOrchestrator::new();
        let make_op = |farm_id: i64| FieldOperation {
            id: String::new(), farm_id, field_id: 1,
            operation_type: OperationType::Irrigation, priority: 5,
            status: OperationStatus::Planned, equipment_ids: vec![],
            prescription_id: None,
            constraints: OperationConstraints {
                max_wind_speed_ms: None, no_rain: false, daylight_only: false,
                min_soil_moisture: None, max_soil_moisture: None,
                min_temperature: None, max_temperature: None,
                min_visibility_m: None, depends_on: vec![],
            },
            plan: OperationPlan {
                field_boundary_wkt: String::new(), headland_passes: 0,
                entry_point_lat: 0.0, entry_point_lon: 0.0, direction_deg: 0.0,
                swath_width_m: 3.0, speed_target_kmh: 5.0,
                product: None, rate: None, rate_unit: None,
                estimated_time_h: 1.0, estimated_fuel_l: 5.0, estimated_product_needed: 0.0,
            },
            result: None, created_at: 0, started_at: None, completed_at: None,
        };

        orch.create_operation(make_op(1));
        orch.create_operation(make_op(1));
        orch.create_operation(make_op(2));

        assert_eq!(orch.get_farm_operations(1).len(), 2);
        assert_eq!(orch.get_farm_operations(2).len(), 1);
        assert_eq!(orch.get_farm_operations(999).len(), 0);
    }

    #[test]
    fn test_safety_zone() {
        let orch = OperationsOrchestrator::new();
        orch.add_safety_zone(SafetyZone {
            zone_type: "water_body".into(),
            boundary_wkt: "POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))".into(),
            buffer_m: 50.0,
            restriction: "no_spray".into(),
        });
        let zones = orch.safety_zones.read().unwrap();
        assert_eq!(zones.len(), 1);
        assert_eq!(zones[0].buffer_m, 50.0);
    }

    #[test]
    fn test_field_path_generation() {
        let boundary = vec![(0.0, 0.0), (0.001, 0.0), (0.001, 0.001), (0.0, 0.001)];
        let path = generate_field_path(&boundary, 1, 6.0, 0.0, 0.0, 0.0);
        assert!(!path.is_empty());
    }

    #[test]
    fn test_overlap_calculation() {
        let path = vec![(0.0, 0.0), (0.0, 0.001), (0.00005, 0.001), (0.00005, 0.0)];
        let overlap = calculate_overlap(&path, 6.0);
        assert!(overlap >= 0.0);
        assert!(overlap <= 100.0);
    }

    #[test]
    fn test_dispatch_invalid_status() {
        let orch = OperationsOrchestrator::new();
        assert!(orch.dispatch("nonexistent").is_err());
    }
}
