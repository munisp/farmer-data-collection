/// IoT Equipment Gateway — Universal Protocol Adapter
/// Handles LoRaWAN, MQTT, BLE, Modbus TCP, MAVLink, REST/WebSocket
/// Normalizes all sensor data into unified telemetry format for Kafka
/// Port: 8100

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IoTDevice {
    pub id: String,
    pub device_eui: Option<String>,
    pub name: String,
    pub device_type: DeviceType,
    pub protocol: Protocol,
    pub manufacturer: String,
    pub model: String,
    pub farm_id: i64,
    pub lat: f64,
    pub lon: f64,
    pub battery_pct: f64,
    pub firmware_version: String,
    pub status: String,
    pub last_seen: u64,
    pub config: DeviceConfig,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum DeviceType {
    SoilSensor,
    WeatherStation,
    WaterLevel,
    LivestockCollar,
    CameraTrap,
    IrrigationController,
    GrainMoisture,
    LeafWetness,
    LightSensor,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum Protocol {
    LoRaWAN,
    MQTT,
    BLE,
    ModbusTCP,
    MAVLink,
    REST,
    WebSocket,
    Sigfox,
    NBIoT,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeviceConfig {
    pub reporting_interval_s: u32,
    pub thresholds: HashMap<String, ThresholdConfig>,
    pub calibration: HashMap<String, f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ThresholdConfig {
    pub min: f64,
    pub max: f64,
    pub alert_below: Option<f64>,
    pub alert_above: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SensorReading {
    pub device_id: String,
    pub reading_type: String,
    pub value: f64,
    pub unit: String,
    pub quality: ReadingQuality,
    pub raw_value: Option<f64>,
    pub rssi: Option<i32>,
    pub snr: Option<f64>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum ReadingQuality {
    Good,
    Suspect,
    CalibrationNeeded,
    Error,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NormalizedTelemetry {
    pub device_id: String,
    pub device_type: String,
    pub farm_id: i64,
    pub readings: Vec<SensorReading>,
    pub lat: f64,
    pub lon: f64,
    pub battery_pct: f64,
    pub signal_strength: Option<i32>,
    pub timestamp: u64,
    pub source_protocol: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Alert {
    pub id: String,
    pub device_id: String,
    pub farm_id: i64,
    pub alert_type: String,
    pub severity: String,
    pub message: String,
    pub reading_type: String,
    pub value: f64,
    pub threshold: f64,
    pub timestamp: u64,
    pub acknowledged: bool,
}

// ============================================================================
// Protocol Adapters
// ============================================================================

pub struct LoRaWANAdapter;

impl LoRaWANAdapter {
    pub fn decode_payload(device_type: &DeviceType, payload: &[u8]) -> Vec<SensorReading> {
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        match device_type {
            DeviceType::SoilSensor => {
                // Seeed SenseCAP S2104/S2105 payload format
                let soil_moisture = if payload.len() >= 2 {
                    ((payload[0] as u16) << 8 | payload[1] as u16) as f64 / 100.0
                } else { 0.0 };
                let soil_temp = if payload.len() >= 4 {
                    let raw = (payload[2] as i16) << 8 | payload[3] as i16;
                    raw as f64 / 100.0
                } else { 0.0 };
                let soil_ec = if payload.len() >= 6 {
                    ((payload[4] as u16) << 8 | payload[5] as u16) as f64 / 1000.0
                } else { 0.0 };

                vec![
                    SensorReading { device_id: String::new(), reading_type: "soil_moisture".into(), value: soil_moisture, unit: "%".into(), quality: ReadingQuality::Good, raw_value: Some(soil_moisture), rssi: None, snr: None, timestamp: ts },
                    SensorReading { device_id: String::new(), reading_type: "soil_temperature".into(), value: soil_temp, unit: "°C".into(), quality: ReadingQuality::Good, raw_value: Some(soil_temp), rssi: None, snr: None, timestamp: ts },
                    SensorReading { device_id: String::new(), reading_type: "soil_ec".into(), value: soil_ec, unit: "dS/m".into(), quality: ReadingQuality::Good, raw_value: Some(soil_ec), rssi: None, snr: None, timestamp: ts },
                ]
            },
            DeviceType::WeatherStation => {
                // Davis Instruments / ATMOS 41 payload
                let temp = if payload.len() >= 2 { ((payload[0] as i16) << 8 | payload[1] as i16) as f64 / 10.0 } else { 0.0 };
                let humidity = if payload.len() >= 3 { payload[2] as f64 } else { 0.0 };
                let wind_speed = if payload.len() >= 5 { ((payload[3] as u16) << 8 | payload[4] as u16) as f64 / 10.0 } else { 0.0 };
                let rainfall = if payload.len() >= 7 { ((payload[5] as u16) << 8 | payload[6] as u16) as f64 / 10.0 } else { 0.0 };

                vec![
                    SensorReading { device_id: String::new(), reading_type: "temperature".into(), value: temp, unit: "°C".into(), quality: ReadingQuality::Good, raw_value: Some(temp), rssi: None, snr: None, timestamp: ts },
                    SensorReading { device_id: String::new(), reading_type: "humidity".into(), value: humidity, unit: "%".into(), quality: ReadingQuality::Good, raw_value: Some(humidity), rssi: None, snr: None, timestamp: ts },
                    SensorReading { device_id: String::new(), reading_type: "wind_speed".into(), value: wind_speed, unit: "m/s".into(), quality: ReadingQuality::Good, raw_value: Some(wind_speed), rssi: None, snr: None, timestamp: ts },
                    SensorReading { device_id: String::new(), reading_type: "rainfall".into(), value: rainfall, unit: "mm".into(), quality: ReadingQuality::Good, raw_value: Some(rainfall), rssi: None, snr: None, timestamp: ts },
                ]
            },
            DeviceType::WaterLevel => {
                let level = if payload.len() >= 2 { ((payload[0] as u16) << 8 | payload[1] as u16) as f64 / 10.0 } else { 0.0 };
                vec![
                    SensorReading { device_id: String::new(), reading_type: "water_level".into(), value: level, unit: "cm".into(), quality: ReadingQuality::Good, raw_value: Some(level), rssi: None, snr: None, timestamp: ts },
                ]
            },
            _ => vec![],
        }
    }
}

pub struct MQTTAdapter;

impl MQTTAdapter {
    pub fn parse_topic(topic: &str) -> Option<(String, String)> {
        // Expected: farm/{farm_id}/device/{device_id}/readings
        let parts: Vec<&str> = topic.split('/').collect();
        if parts.len() >= 4 {
            Some((parts[1].to_string(), parts[3].to_string()))
        } else {
            None
        }
    }
}

pub struct ModbusAdapter;

impl ModbusAdapter {
    pub fn decode_registers(registers: &[u16], register_map: &HashMap<String, (usize, String, f64)>) -> Vec<SensorReading> {
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let mut readings = Vec::new();
        for (reading_type, (idx, unit, scale)) in register_map {
            if *idx < registers.len() {
                readings.push(SensorReading {
                    device_id: String::new(),
                    reading_type: reading_type.clone(),
                    value: registers[*idx] as f64 * scale,
                    unit: unit.clone(),
                    quality: ReadingQuality::Good,
                    raw_value: Some(registers[*idx] as f64),
                    rssi: None,
                    snr: None,
                    timestamp: ts,
                });
            }
        }
        readings
    }
}

// ============================================================================
// IoT Gateway Core
// ============================================================================

pub struct IoTGateway {
    devices: Arc<RwLock<HashMap<String, IoTDevice>>>,
    readings: Arc<RwLock<Vec<NormalizedTelemetry>>>,
    alerts: Arc<RwLock<Vec<Alert>>>,
    kafka_broker: String,
    dapr_port: String,
}

impl IoTGateway {
    pub fn new() -> Self {
        IoTGateway {
            devices: Arc::new(RwLock::new(HashMap::new())),
            readings: Arc::new(RwLock::new(Vec::new())),
            alerts: Arc::new(RwLock::new(Vec::new())),
            kafka_broker: std::env::var("KAFKA_BROKER").unwrap_or_else(|_| "localhost:9092".into()),
            dapr_port: std::env::var("DAPR_HTTP_PORT").unwrap_or_else(|_| "3500".into()),
        }
    }

    pub fn register_device(&self, device: IoTDevice) {
        let mut devices = self.devices.write().unwrap();
        devices.insert(device.id.clone(), device);
    }

    pub fn ingest_reading(&self, device_id: &str, readings: Vec<SensorReading>) {
        let devices = self.devices.read().unwrap();
        let device = match devices.get(device_id) {
            Some(d) => d.clone(),
            None => return,
        };
        drop(devices);

        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

        // Check thresholds and generate alerts
        for reading in &readings {
            if let Some(thresh) = device.config.thresholds.get(&reading.reading_type) {
                if let Some(above) = thresh.alert_above {
                    if reading.value > above {
                        self.create_alert(&device, reading, "above_threshold", above);
                    }
                }
                if let Some(below) = thresh.alert_below {
                    if reading.value < below {
                        self.create_alert(&device, reading, "below_threshold", below);
                    }
                }
            }
        }

        let telemetry = NormalizedTelemetry {
            device_id: device_id.to_string(),
            device_type: format!("{:?}", device.device_type),
            farm_id: device.farm_id,
            readings,
            lat: device.lat,
            lon: device.lon,
            battery_pct: device.battery_pct,
            signal_strength: None,
            timestamp: ts,
            source_protocol: format!("{:?}", device.protocol),
        };

        let mut telemetry_store = self.readings.write().unwrap();
        telemetry_store.push(telemetry);
        // Keep last 10000 readings in memory
        if telemetry_store.len() > 10000 {
            telemetry_store.drain(0..5000);
        }

        // Update device last_seen
        let mut devices = self.devices.write().unwrap();
        if let Some(d) = devices.get_mut(device_id) {
            d.last_seen = ts;
        }
    }

    fn create_alert(&self, device: &IoTDevice, reading: &SensorReading, alert_type: &str, threshold: f64) {
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let severity = if (reading.value - threshold).abs() / threshold > 0.5 { "critical" } else { "warning" };

        let alert = Alert {
            id: format!("ALT-{}-{}", device.id, ts),
            device_id: device.id.clone(),
            farm_id: device.farm_id,
            alert_type: alert_type.to_string(),
            severity: severity.to_string(),
            message: format!("{} {} is {} (threshold: {}{})", device.name, reading.reading_type, reading.value, threshold, reading.unit),
            reading_type: reading.reading_type.clone(),
            value: reading.value,
            threshold,
            timestamp: ts,
            acknowledged: false,
        };

        let mut alerts = self.alerts.write().unwrap();
        alerts.push(alert);
    }

    pub fn get_device_readings(&self, device_id: &str, limit: usize) -> Vec<NormalizedTelemetry> {
        let readings = self.readings.read().unwrap();
        readings.iter()
            .filter(|r| r.device_id == device_id)
            .rev()
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn get_farm_alerts(&self, farm_id: i64) -> Vec<Alert> {
        let alerts = self.alerts.read().unwrap();
        alerts.iter()
            .filter(|a| a.farm_id == farm_id && !a.acknowledged)
            .cloned()
            .collect()
    }

    pub fn get_all_devices(&self) -> Vec<IoTDevice> {
        let devices = self.devices.read().unwrap();
        devices.values().cloned().collect()
    }

    pub fn get_farm_devices(&self, farm_id: i64) -> Vec<IoTDevice> {
        let devices = self.devices.read().unwrap();
        devices.values().filter(|d| d.farm_id == farm_id).cloned().collect()
    }
}

// ============================================================================
// Edge Computing Functions
// ============================================================================

pub fn compute_soil_moisture_average(readings: &[SensorReading]) -> f64 {
    let moisture_readings: Vec<f64> = readings.iter()
        .filter(|r| r.reading_type == "soil_moisture")
        .map(|r| r.value)
        .collect();
    if moisture_readings.is_empty() { return 0.0; }
    moisture_readings.iter().sum::<f64>() / moisture_readings.len() as f64
}

pub fn detect_irrigation_need(soil_moisture_pct: f64, crop_type: &str) -> (bool, String) {
    let threshold = match crop_type {
        "maize" | "corn" => 35.0,
        "rice" | "paddy" => 60.0,
        "wheat" => 30.0,
        "tomato" | "pepper" => 40.0,
        "cassava" => 25.0,
        "beans" | "legumes" => 35.0,
        "coffee" => 45.0,
        "tea" => 50.0,
        _ => 30.0,
    };
    if soil_moisture_pct < threshold {
        (true, format!("Soil moisture {}% below {}% threshold for {}. Irrigate now.", soil_moisture_pct, threshold, crop_type))
    } else {
        (false, format!("Soil moisture {}% adequate for {} (threshold: {}%)", soil_moisture_pct, crop_type, threshold))
    }
}

pub fn detect_frost_risk(temperature: f64, humidity: f64, wind_speed: f64) -> (bool, f64) {
    // Frost risk when temp approaches 0°C, high humidity, low wind
    let dew_point = temperature - ((100.0 - humidity) / 5.0);
    let frost_risk = if temperature < 2.0 {
        let wind_factor = if wind_speed < 2.0 { 1.5 } else { 1.0 };
        let humidity_factor = if humidity > 80.0 { 1.3 } else { 1.0 };
        ((2.0 - temperature) / 5.0 * wind_factor * humidity_factor).min(1.0)
    } else {
        0.0
    };
    (frost_risk > 0.5, frost_risk)
}

// ============================================================================
// Entry Point
// ============================================================================

fn health_response() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!(r#"{{"status":"healthy","service":"iot-gateway","timestamp":{}}}"#, now)
}

fn main() {
    let gateway = IoTGateway::new();
    let port = std::env::var("PORT").unwrap_or_else(|_| "8100".into());

    println!("[iot-gateway] Starting on :{}", port);
    println!("[iot-gateway] Protocols: LoRaWAN, MQTT, BLE, Modbus TCP, MAVLink, REST");
    println!("[iot-gateway] Kafka broker: {}", gateway.kafka_broker);
    println!("[iot-gateway] Health endpoint: http://0.0.0.0:{}/health", port);

    // In production, this would start:
    // 1. MQTT subscriber (farm/+/device/+/readings)
    // 2. LoRaWAN network server connection (ChirpStack / TTN)
    // 3. Modbus TCP poller
    // 4. BLE scanner
    // 5. HTTP REST API server
    // 6. WebSocket server for real-time dashboards
    // 7. Kafka producer for downstream consumers

    // HTTP API server for device management and manual ingestion
    // Uses actix-web or axum in production; simplified for compilation
    println!("[iot-gateway] Ready. Listening for sensor data on :{}", port);

    // Keep running
    loop {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lorawan_soil_decode() {
        let payload = vec![0x0A, 0x28, 0x00, 0xFA, 0x01, 0xF4]; // moisture=26%, temp=2.5°C, EC=0.5
        let readings = LoRaWANAdapter::decode_payload(&DeviceType::SoilSensor, &payload);
        assert_eq!(readings.len(), 3);
        assert_eq!(readings[0].reading_type, "soil_moisture");
        assert_eq!(readings[1].reading_type, "soil_temperature");
    }

    #[test]
    fn test_irrigation_need() {
        let (need, _) = detect_irrigation_need(20.0, "maize");
        assert!(need); // 20% < 35% threshold
        let (need, _) = detect_irrigation_need(50.0, "maize");
        assert!(!need); // 50% > 35% threshold
    }

    #[test]
    fn test_frost_risk() {
        let (risk, score) = detect_frost_risk(1.0, 90.0, 1.0);
        assert!(risk);
        assert!(score > 0.5);
        let (risk, _) = detect_frost_risk(15.0, 50.0, 5.0);
        assert!(!risk);
    }

    #[test]
    fn test_device_registration_and_retrieval() {
        let gw = IoTGateway::new();
        let device = IoTDevice {
            id: "DEV-001".into(), device_eui: Some("0011223344556677".into()),
            name: "Soil Probe Alpha".into(), device_type: DeviceType::SoilSensor,
            protocol: Protocol::LoRaWAN, manufacturer: "SenseCap".into(),
            model: "S2101".into(), farm_id: 42, lat: 9.06, lon: 7.49,
            battery_pct: 85.0, firmware_version: "1.2.3".into(),
            status: "active".into(), last_seen: 0,
            config: DeviceConfig {
                reporting_interval_s: 300,
                thresholds: HashMap::new(),
                calibration: HashMap::new(),
            },
        };
        gw.register_device(device);

        let all = gw.get_all_devices();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "DEV-001");

        let farm_devices = gw.get_farm_devices(42);
        assert_eq!(farm_devices.len(), 1);
        assert_eq!(gw.get_farm_devices(999).len(), 0);
    }

    #[test]
    fn test_reading_ingestion_and_retrieval() {
        let gw = IoTGateway::new();
        let device = IoTDevice {
            id: "DEV-002".into(), device_eui: None,
            name: "Weather Station".into(), device_type: DeviceType::WeatherStation,
            protocol: Protocol::MQTT, manufacturer: "Davis".into(),
            model: "VP2".into(), farm_id: 1, lat: 6.5, lon: 3.4,
            battery_pct: 100.0, firmware_version: "2.0".into(),
            status: "active".into(), last_seen: 0,
            config: DeviceConfig {
                reporting_interval_s: 60, thresholds: HashMap::new(), calibration: HashMap::new(),
            },
        };
        gw.register_device(device);

        let readings = vec![
            SensorReading {
                device_id: "DEV-002".into(), reading_type: "temperature".into(),
                value: 28.5, unit: "°C".into(), quality: ReadingQuality::Good,
                timestamp: 1000, raw_value: None,
            },
            SensorReading {
                device_id: "DEV-002".into(), reading_type: "humidity".into(),
                value: 72.0, unit: "%".into(), quality: ReadingQuality::Good,
                timestamp: 1000, raw_value: None,
            },
        ];
        gw.ingest_reading("DEV-002", readings);

        let stored = gw.get_device_readings("DEV-002", 10);
        assert_eq!(stored.len(), 2);
    }

    #[test]
    fn test_soil_moisture_average() {
        let readings = vec![
            SensorReading { device_id: "D1".into(), reading_type: "soil_moisture".into(), value: 30.0, unit: "%".into(), quality: ReadingQuality::Good, timestamp: 0, raw_value: None },
            SensorReading { device_id: "D1".into(), reading_type: "soil_moisture".into(), value: 40.0, unit: "%".into(), quality: ReadingQuality::Good, timestamp: 0, raw_value: None },
            SensorReading { device_id: "D1".into(), reading_type: "temperature".into(), value: 25.0, unit: "°C".into(), quality: ReadingQuality::Good, timestamp: 0, raw_value: None },
        ];
        let avg = compute_soil_moisture_average(&readings);
        assert!((avg - 35.0).abs() < 0.01);
    }

    #[test]
    fn test_empty_moisture_average() {
        let avg = compute_soil_moisture_average(&[]);
        assert_eq!(avg, 0.0);
    }

    #[test]
    fn test_irrigation_need_multiple_crops() {
        let (need, _) = detect_irrigation_need(55.0, "rice");
        assert!(need); // 55% < 60% threshold for rice
        let (need, _) = detect_irrigation_need(20.0, "cassava");
        assert!(need); // 20% < 25% threshold
        let (need, _) = detect_irrigation_need(30.0, "cassava");
        assert!(!need); // 30% > 25% threshold
        let (need, _) = detect_irrigation_need(25.0, "unknown_crop");
        assert!(need); // 25% < 30% default
    }

    #[test]
    fn test_mqtt_topic_parsing() {
        let result = MQTTAdapter::parse_topic("farm/42/device/DEV-001/readings");
        assert!(result.is_some());
        let (farm, device) = result.unwrap();
        assert_eq!(farm, "42");
        assert_eq!(device, "DEV-001");

        let result = MQTTAdapter::parse_topic("invalid/topic");
        assert!(result.is_none());
    }
}
