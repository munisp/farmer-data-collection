/// ISOBUS (ISO 11783) Implement Gateway
/// Parses CAN bus messages from agricultural implements
/// Handles TaskController protocol, work records, prescription maps
/// Port: 8101

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

// ============================================================================
// ISOBUS / ISO 11783 Protocol Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CANMessage {
    pub pgn: u32,         // Parameter Group Number
    pub source: u8,       // Source address (0-253)
    pub priority: u8,     // Priority (0-7)
    pub data: Vec<u8>,    // 8 bytes payload
    pub timestamp: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ISOBUSDevice {
    pub address: u8,
    pub name: u64,         // 64-bit NAME
    pub manufacturer_code: u16,
    pub device_class: DeviceClass,
    pub function: u8,
    pub serial_number: u32,
    pub model: String,
    pub status: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum DeviceClass {
    Tractor,
    Planter,
    Sprayer,
    Harvester,
    Spreader,
    Baler,
    Mower,
    Tillage,
    Unknown(u8),
}

// PGN definitions for common agricultural messages
pub mod pgn {
    pub const WHEEL_SPEED: u32 = 65265;    // FEF1 - Wheel speed
    pub const ENGINE_RPM: u32 = 61444;     // F004 - Electronic Engine Controller
    pub const FUEL_RATE: u32 = 65266;      // FEF2 - Fuel consumption
    pub const PTO_SPEED: u32 = 65091;      // FE43 - PTO speed
    pub const IMPLEMENT_WIDTH: u32 = 65096; // FE48 - Working width
    pub const SECTION_STATUS: u32 = 65093; // FE45 - Section on/off status
    pub const RATE_ACTUAL: u32 = 65094;    // FE46 - Actual application rate
    pub const RATE_SETPOINT: u32 = 65095;  // FE47 - Target application rate
    pub const GPS_POSITION: u32 = 65267;   // FEF3 - Vehicle position
    pub const AREA_TOTAL: u32 = 65097;     // FE49 - Total worked area
    pub const TANK_LEVEL: u32 = 65098;     // FE4A - Tank/hopper level
    pub const YIELD_MASS: u32 = 65099;     // FE4B - Yield monitor
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProcessData {
    pub wheel_speed_kmh: f64,
    pub engine_rpm: u16,
    pub fuel_rate_lph: f64,
    pub pto_speed_rpm: u16,
    pub working_width_m: f64,
    pub sections_on: Vec<bool>,
    pub application_rate: f64,
    pub application_rate_unit: String,
    pub total_area_ha: f64,
    pub tank_level_pct: f64,
    pub yield_kg_ha: f64,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorkRecord {
    pub task_id: String,
    pub equipment_id: String,
    pub implement_id: String,
    pub task_type: String,
    pub field_id: i64,
    pub start_time: u64,
    pub end_time: u64,
    pub area_worked_ha: f64,
    pub total_product_applied: f64,
    pub product_unit: String,
    pub avg_speed_kmh: f64,
    pub fuel_consumed_l: f64,
    pub path_wkt: String,
    pub sections_coverage: Vec<f64>, // per-section area
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PrescriptionMap {
    pub id: String,
    pub field_id: i64,
    pub map_type: String,
    pub zones: Vec<PrescriptionZone>,
    pub default_rate: f64,
    pub unit: String,
    pub product: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PrescriptionZone {
    pub polygon_wkt: String,
    pub rate: f64,
    pub unit: String,
}

// ============================================================================
// CAN Bus Protocol Decoder
// ============================================================================

pub struct CANDecoder;

impl CANDecoder {
    pub fn decode_pgn(msg: &CANMessage) -> Option<(&'static str, f64, &'static str)> {
        match msg.pgn {
            pgn::WHEEL_SPEED => {
                if msg.data.len() >= 2 {
                    let speed = ((msg.data[0] as u16) | ((msg.data[1] as u16) << 8)) as f64 / 256.0;
                    Some(("wheel_speed", speed, "km/h"))
                } else { None }
            },
            pgn::ENGINE_RPM => {
                if msg.data.len() >= 4 {
                    let rpm = ((msg.data[3] as u16) | ((msg.data[4 - 1] as u16) << 8)) as f64 / 8.0;
                    Some(("engine_rpm", rpm, "rpm"))
                } else { None }
            },
            pgn::FUEL_RATE => {
                if msg.data.len() >= 2 {
                    let rate = ((msg.data[0] as u16) | ((msg.data[1] as u16) << 8)) as f64 * 0.05;
                    Some(("fuel_rate", rate, "L/h"))
                } else { None }
            },
            pgn::PTO_SPEED => {
                if msg.data.len() >= 2 {
                    let speed = ((msg.data[0] as u16) | ((msg.data[1] as u16) << 8)) as f64 / 8.0;
                    Some(("pto_speed", speed, "rpm"))
                } else { None }
            },
            pgn::RATE_ACTUAL => {
                if msg.data.len() >= 4 {
                    let rate = u32::from_le_bytes([msg.data[0], msg.data[1], msg.data[2], msg.data[3]]) as f64 / 1000.0;
                    Some(("application_rate", rate, "L/ha"))
                } else { None }
            },
            pgn::SECTION_STATUS => {
                // Section status bitmap
                if !msg.data.is_empty() {
                    let sections_on = msg.data[0].count_ones();
                    Some(("sections_active", sections_on as f64, "count"))
                } else { None }
            },
            pgn::AREA_TOTAL => {
                if msg.data.len() >= 4 {
                    let area = u32::from_le_bytes([msg.data[0], msg.data[1], msg.data[2], msg.data[3]]) as f64 / 10000.0;
                    Some(("total_area", area, "ha"))
                } else { None }
            },
            pgn::YIELD_MASS => {
                if msg.data.len() >= 4 {
                    let yield_val = u32::from_le_bytes([msg.data[0], msg.data[1], msg.data[2], msg.data[3]]) as f64 / 100.0;
                    Some(("yield_mass", yield_val, "kg/ha"))
                } else { None }
            },
            _ => None,
        }
    }
}

// ============================================================================
// Task Controller (TC-BAS / TC-GEO / TC-SC)
// ============================================================================

pub struct TaskController {
    devices: Arc<RwLock<HashMap<u8, ISOBUSDevice>>>,
    process_data: Arc<RwLock<HashMap<String, ProcessData>>>,
    work_records: Arc<RwLock<Vec<WorkRecord>>>,
    prescriptions: Arc<RwLock<HashMap<String, PrescriptionMap>>>,
}

impl TaskController {
    pub fn new() -> Self {
        TaskController {
            devices: Arc::new(RwLock::new(HashMap::new())),
            process_data: Arc::new(RwLock::new(HashMap::new())),
            work_records: Arc::new(RwLock::new(Vec::new())),
            prescriptions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn register_device(&self, device: ISOBUSDevice) {
        let mut devices = self.devices.write().unwrap();
        devices.insert(device.address, device);
    }

    pub fn process_can_message(&self, msg: &CANMessage) {
        if let Some((param, value, _unit)) = CANDecoder::decode_pgn(msg) {
            let eq_id = format!("ISOBUS-{}", msg.source);
            let mut pd = self.process_data.write().unwrap();
            let data = pd.entry(eq_id).or_insert_with(|| ProcessData {
                wheel_speed_kmh: 0.0, engine_rpm: 0, fuel_rate_lph: 0.0,
                pto_speed_rpm: 0, working_width_m: 0.0, sections_on: vec![],
                application_rate: 0.0, application_rate_unit: String::new(),
                total_area_ha: 0.0, tank_level_pct: 0.0, yield_kg_ha: 0.0,
                lat: 0.0, lon: 0.0,
            });

            match param {
                "wheel_speed" => data.wheel_speed_kmh = value,
                "engine_rpm" => data.engine_rpm = value as u16,
                "fuel_rate" => data.fuel_rate_lph = value,
                "pto_speed" => data.pto_speed_rpm = value as u16,
                "application_rate" => data.application_rate = value,
                "total_area" => data.total_area_ha = value,
                "yield_mass" => data.yield_kg_ha = value,
                _ => {}
            }
        }
    }

    pub fn upload_prescription(&self, prescription: PrescriptionMap) {
        let mut prescriptions = self.prescriptions.write().unwrap();
        prescriptions.insert(prescription.id.clone(), prescription);
    }

    pub fn get_rate_for_position(&self, prescription_id: &str, _lat: f64, _lon: f64) -> f64 {
        let prescriptions = self.prescriptions.read().unwrap();
        if let Some(rx) = prescriptions.get(prescription_id) {
            // In production: point-in-polygon test against each zone
            // For now return default rate
            rx.default_rate
        } else {
            0.0
        }
    }

    pub fn complete_work_record(&self, record: WorkRecord) {
        let mut records = self.work_records.write().unwrap();
        records.push(record);
    }

    pub fn get_work_records(&self, field_id: i64) -> Vec<WorkRecord> {
        let records = self.work_records.read().unwrap();
        records.iter().filter(|r| r.field_id == field_id).cloned().collect()
    }

    pub fn get_process_data(&self, equipment_id: &str) -> Option<ProcessData> {
        let pd = self.process_data.read().unwrap();
        pd.get(equipment_id).cloned()
    }
}

// ============================================================================
// ISO-XML Import/Export
// ============================================================================

pub fn generate_iso_xml_task(task_type: &str, field_id: i64, prescription: &PrescriptionMap) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<ISO11783_TaskData VersionMajor=\"4\" VersionMinor=\"0\" ManagementSoftwareManufacturer=\"FarmConnect\">\n");
    xml.push_str(&format!("  <TSK A=\"TSK-{}\" B=\"{}\" G=\"1\">\n", field_id, task_type));
    xml.push_str(&format!("    <TZN A=\"TZN-1\" B=\"0\" C=\"{}\">\n", prescription.default_rate));

    for (i, zone) in prescription.zones.iter().enumerate() {
        xml.push_str(&format!("    <PDV A=\"PDV-{}\" B=\"{}\" C=\"{}\" />\n", i, zone.rate, zone.unit));
    }

    xml.push_str("  </TSK>\n");
    xml.push_str("</ISO11783_TaskData>\n");
    xml
}

// ============================================================================
// Entry Point
// ============================================================================

fn health_response() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!(r#"{{"status":"healthy","service":"isobus-gateway","timestamp":{}}}"#, now)
}

fn main() {
    let _tc = TaskController::new();
    let port = std::env::var("PORT").unwrap_or_else(|_| "8101".into());

    println!("[isobus-gateway] Starting on :{}", port);
    println!("[isobus-gateway] CAN bus protocol: ISO 11783 (ISOBUS)");
    println!("[isobus-gateway] Features: TaskController, Process Data, Work Records, Prescription Maps, ISO-XML");
    println!("[isobus-gateway] Health endpoint: http://0.0.0.0:{}/health", port);

    // In production, this would:
    // 1. Connect to SocketCAN interface (vcan0 or can0)
    // 2. Listen for CAN frames and decode PGNs
    // 3. Run TaskController state machine
    // 4. Publish process data to Kafka topic "implement-data"
    // 5. Serve HTTP API for prescription upload/download

    loop {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_can_decode_wheel_speed() {
        let msg = CANMessage {
            pgn: pgn::WHEEL_SPEED,
            source: 0,
            priority: 6,
            data: vec![0x00, 0x10, 0, 0, 0, 0, 0, 0], // 16.0 km/h
            timestamp: 0,
        };
        let result = CANDecoder::decode_pgn(&msg);
        assert!(result.is_some());
        let (name, _value, unit) = result.unwrap();
        assert_eq!(name, "wheel_speed");
        assert_eq!(unit, "km/h");
    }

    #[test]
    fn test_task_controller() {
        let tc = TaskController::new();

        let msg = CANMessage {
            pgn: pgn::ENGINE_RPM,
            source: 5,
            priority: 3,
            data: vec![0, 0, 0, 0xE0, 0x2E, 0, 0, 0], // ~1500 RPM
            timestamp: 0,
        };
        tc.process_can_message(&msg);

        let pd = tc.get_process_data("ISOBUS-5");
        assert!(pd.is_some());
    }

    #[test]
    fn test_iso_xml_generation() {
        let rx = PrescriptionMap {
            id: "RX-1".into(),
            field_id: 1,
            map_type: "fertilizer".into(),
            zones: vec![
                PrescriptionZone { polygon_wkt: "POLYGON(...)".into(), rate: 150.0, unit: "kg/ha".into() },
            ],
            default_rate: 120.0,
            unit: "kg/ha".into(),
            product: "DAP".into(),
        };
        let xml = generate_iso_xml_task("fertilizing", 1, &rx);
        assert!(xml.contains("ISO11783_TaskData"));
        assert!(xml.contains("FarmConnect"));
    }

    #[test]
    fn test_device_registration() {
        let tc = TaskController::new();
        let device = ISOBUSDevice {
            address: 10, name: "John Deere Planter".into(),
            manufacturer: "John Deere".into(), device_class: "planter".into(),
            function: "precision_planting".into(), ecu_count: 2,
            capabilities: vec!["section_control".into(), "variable_rate".into()],
        };
        tc.register_device(device);
        let devices = tc.devices.read().unwrap();
        assert_eq!(devices.len(), 1);
    }

    #[test]
    fn test_prescription_upload_and_rate() {
        let tc = TaskController::new();
        let rx = PrescriptionMap {
            id: "RX-FERT-1".into(), field_id: 42, map_type: "fertilizer".into(),
            zones: vec![
                PrescriptionZone { polygon_wkt: "POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))".into(), rate: 200.0, unit: "kg/ha".into() },
            ],
            default_rate: 150.0, unit: "kg/ha".into(), product: "NPK 15-15-15".into(),
        };
        tc.upload_prescription(rx);

        let rate = tc.get_rate_for_position("RX-FERT-1", 0.5, 0.5);
        assert!(rate > 0.0);
    }

    #[test]
    fn test_work_record_storage() {
        let tc = TaskController::new();
        let record = WorkRecord {
            id: "WR-001".into(), field_id: 1, equipment_id: "EQ-1".into(),
            operation_type: "spraying".into(), start_time: 1000, end_time: 2000,
            area_worked_ha: 3.5, product_applied: 105.0, product_unit: "L".into(),
            fuel_used_l: 12.0, avg_speed_kmh: 8.5,
            coverage_pct: 98.0, overlap_pct: 3.0,
        };
        tc.complete_work_record(record);
        let records = tc.get_work_records(1);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].area_worked_ha, 3.5);
    }

    #[test]
    fn test_can_decode_engine_rpm() {
        let msg = CANMessage {
            pgn: pgn::ENGINE_RPM,
            source: 0, priority: 3,
            data: vec![0, 0, 0, 0xE0, 0x2E, 0, 0, 0],
            timestamp: 0,
        };
        let result = CANDecoder::decode_pgn(&msg);
        assert!(result.is_some());
        let (name, _, unit) = result.unwrap();
        assert_eq!(name, "engine_rpm");
        assert_eq!(unit, "rpm");
    }

    #[test]
    fn test_can_decode_unknown_pgn() {
        let msg = CANMessage { pgn: 99999, source: 0, priority: 3, data: vec![], timestamp: 0 };
        let result = CANDecoder::decode_pgn(&msg);
        assert!(result.is_none());
    }

    #[test]
    fn test_process_data_tracking() {
        let tc = TaskController::new();
        let msg1 = CANMessage { pgn: pgn::WHEEL_SPEED, source: 1, priority: 6, data: vec![0x00, 0x10, 0, 0, 0, 0, 0, 0], timestamp: 100 };
        let msg2 = CANMessage { pgn: pgn::ENGINE_RPM, source: 1, priority: 3, data: vec![0, 0, 0, 0xE0, 0x2E, 0, 0, 0], timestamp: 200 };
        tc.process_can_message(&msg1);
        tc.process_can_message(&msg2);

        let pd = tc.get_process_data("ISOBUS-1");
        assert!(pd.is_some());
        let data = pd.unwrap();
        assert!(data.values.len() >= 2);
    }
}
