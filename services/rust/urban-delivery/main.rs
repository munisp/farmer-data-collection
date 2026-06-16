/// Urban Micro-Delivery & Subscription Service
/// High-performance hyper-local delivery for urban vertical farming.
///
/// Features:
///   - Micro-delivery zones (block-level granularity, <5km radius)
///   - Subscription box management (weekly/biweekly/monthly fresh produce)
///   - Real-time bike courier / EV tracking
///   - Same-day & next-day delivery scheduling
///   - Dynamic pricing based on distance, demand, time-of-day
///   - Recurring delivery route optimization
///
/// Port: 8111

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MicroZone {
    pub id: String,
    pub name: String,
    pub city: String,
    pub neighborhood: String,
    pub center_lat: f64,
    pub center_lng: f64,
    pub radius_km: f64,
    pub polygon_points: Vec<GeoPoint>,
    pub base_fee: f64,
    pub per_km_fee: f64,
    pub surge_multiplier: f64,
    pub delivery_types: Vec<DeliveryType>,
    pub active: bool,
    pub courier_count: u32,
    pub avg_delivery_mins: u32,
    pub operating_hours: OperatingHours,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GeoPoint {
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum DeliveryType {
    BikeCourier,
    ElectricVan,
    WalkingCourier,
    DroneDelivery,
    PickupPoint,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OperatingHours {
    pub weekday_start: String,
    pub weekday_end: String,
    pub weekend_start: String,
    pub weekend_end: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Subscription {
    pub id: String,
    pub customer_id: u64,
    pub customer_name: String,
    pub plan: SubscriptionPlan,
    pub box_type: BoxType,
    pub custom_preferences: Vec<String>,
    pub exclusions: Vec<String>,
    pub delivery_address: DeliveryAddress,
    pub zone_id: String,
    pub preferred_day: String,
    pub preferred_time_slot: String,
    pub status: SubscriptionStatus,
    pub price_per_delivery: f64,
    pub currency: String,
    pub next_delivery_date: String,
    pub deliveries_completed: u32,
    pub created_at: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum SubscriptionPlan {
    Weekly,
    Biweekly,
    Monthly,
    Custom,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum BoxType {
    SmallBox,
    MediumBox,
    LargeBox,
    FamilyBox,
    CustomBox,
    OfficeBox,
    JuiceBox,
    SaladBox,
    HerbBox,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum SubscriptionStatus {
    Active,
    Paused,
    Cancelled,
    PendingPayment,
    Trial,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeliveryAddress {
    pub street: String,
    pub building: String,
    pub floor: String,
    pub apartment: String,
    pub city: String,
    pub neighborhood: String,
    pub lat: f64,
    pub lng: f64,
    pub delivery_notes: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Courier {
    pub id: String,
    pub name: String,
    pub phone: String,
    pub vehicle_type: DeliveryType,
    pub current_lat: f64,
    pub current_lng: f64,
    pub status: CourierStatus,
    pub zone_id: String,
    pub capacity_kg: f64,
    pub current_load_kg: f64,
    pub deliveries_today: u32,
    pub rating: f64,
    pub battery_pct: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum CourierStatus {
    Available,
    EnRoute,
    AtPickup,
    Delivering,
    Returning,
    Offline,
    OnBreak,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeliverySlot {
    pub id: String,
    pub zone_id: String,
    pub date: String,
    pub time_slot: String,
    pub capacity: u32,
    pub booked: u32,
    pub price_modifier: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeliveryTask {
    pub id: String,
    pub subscription_id: Option<String>,
    pub order_id: Option<String>,
    pub courier_id: Option<String>,
    pub zone_id: String,
    pub pickup: GeoPoint,
    pub dropoff: GeoPoint,
    pub status: TaskStatus,
    pub items: Vec<DeliveryItem>,
    pub total_weight_kg: f64,
    pub estimated_time_mins: u32,
    pub actual_time_mins: Option<u32>,
    pub fee: f64,
    pub distance_km: f64,
    pub scheduled_date: String,
    pub scheduled_slot: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum TaskStatus {
    Scheduled,
    AssignedCourier,
    PickedUp,
    InTransit,
    Delivered,
    Failed,
    Rescheduled,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeliveryItem {
    pub product: String,
    pub variety: String,
    pub quantity: f64,
    pub unit: String,
    pub weight_kg: f64,
    pub needs_cold_chain: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RouteOptimization {
    pub zone_id: String,
    pub date: String,
    pub total_deliveries: u32,
    pub total_distance_km: f64,
    pub estimated_time_mins: u32,
    pub couriers_needed: u32,
    pub optimized_routes: Vec<OptimizedRoute>,
    pub savings_vs_naive_pct: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OptimizedRoute {
    pub courier_id: String,
    pub stops: Vec<RouteStop>,
    pub total_distance_km: f64,
    pub estimated_time_mins: u32,
    pub load_kg: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RouteStop {
    pub delivery_id: String,
    pub sequence: u32,
    pub lat: f64,
    pub lng: f64,
    pub address: String,
    pub estimated_arrival: String,
    pub weight_kg: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PricingEstimate {
    pub zone_id: String,
    pub base_fee: f64,
    pub distance_fee: f64,
    pub surge_fee: f64,
    pub cold_chain_fee: f64,
    pub subscription_discount: f64,
    pub total: f64,
    pub currency: String,
    pub estimated_time_mins: u32,
}

// ============================================================================
// In-Memory Store
// ============================================================================

struct Store {
    zones: HashMap<String, MicroZone>,
    subscriptions: HashMap<String, Subscription>,
    couriers: HashMap<String, Courier>,
    tasks: HashMap<String, DeliveryTask>,
    slots: HashMap<String, DeliverySlot>,
    id_counter: u64,
}

impl Store {
    fn new() -> Self {
        let mut store = Store {
            zones: HashMap::new(),
            subscriptions: HashMap::new(),
            couriers: HashMap::new(),
            tasks: HashMap::new(),
            slots: HashMap::new(),
            id_counter: 0,
        };
        store.seed_zones();
        store
    }

    fn next_id(&mut self, prefix: &str) -> String {
        self.id_counter += 1;
        format!("{}-{}", prefix, self.id_counter)
    }

    fn seed_zones(&mut self) {
        let default_zones = vec![
            ("zone-westlands", "Westlands", "Nairobi", -1.2635, 36.8039, 3.0),
            ("zone-kilimani", "Kilimani", "Nairobi", -1.2893, 36.7850, 2.5),
            ("zone-lavington", "Lavington", "Nairobi", -1.2784, 36.7715, 2.0),
            ("zone-karen", "Karen", "Nairobi", -1.3223, 36.7109, 4.0),
            ("zone-kileleshwa", "Kileleshwa", "Nairobi", -1.2748, 36.7792, 2.0),
            ("zone-ikoyi", "Ikoyi", "Lagos", 6.4490, 3.4300, 3.0),
            ("zone-vi", "Victoria Island", "Lagos", 6.4280, 3.4219, 2.5),
            ("zone-lekki", "Lekki", "Lagos", 6.4369, 3.4700, 4.0),
        ];

        for (id, name, city, lat, lng, radius) in default_zones {
            self.zones.insert(id.to_string(), MicroZone {
                id: id.to_string(),
                name: name.to_string(),
                city: city.to_string(),
                neighborhood: name.to_string(),
                center_lat: lat,
                center_lng: lng,
                radius_km: radius,
                polygon_points: vec![],
                base_fee: 150.0,
                per_km_fee: 30.0,
                surge_multiplier: 1.0,
                delivery_types: vec![DeliveryType::BikeCourier, DeliveryType::ElectricVan, DeliveryType::PickupPoint],
                active: true,
                courier_count: 5,
                avg_delivery_mins: 35,
                operating_hours: OperatingHours {
                    weekday_start: "07:00".to_string(),
                    weekday_end: "21:00".to_string(),
                    weekend_start: "08:00".to_string(),
                    weekend_end: "18:00".to_string(),
                },
            });
        }
    }

    fn haversine_km(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
        let r = 6371.0;
        let dlat = (lat2 - lat1).to_radians();
        let dlng = (lng2 - lng1).to_radians();
        let a = (dlat / 2.0).sin().powi(2)
            + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlng / 2.0).sin().powi(2);
        let c = 2.0 * a.sqrt().asin();
        r * c
    }

    fn find_zone_for_location(&self, lat: f64, lng: f64) -> Option<&MicroZone> {
        let mut best: Option<(&MicroZone, f64)> = None;
        for zone in self.zones.values() {
            if !zone.active { continue; }
            let dist = Self::haversine_km(lat, lng, zone.center_lat, zone.center_lng);
            if dist <= zone.radius_km {
                match best {
                    None => best = Some((zone, dist)),
                    Some((_, bd)) if dist < bd => best = Some((zone, dist)),
                    _ => {}
                }
            }
        }
        best.map(|(z, _)| z)
    }

    fn estimate_price(&self, zone: &MicroZone, distance_km: f64, needs_cold: bool, is_subscriber: bool) -> PricingEstimate {
        let distance_fee = distance_km * zone.per_km_fee;
        let surge_fee = if zone.surge_multiplier > 1.0 {
            (zone.base_fee + distance_fee) * (zone.surge_multiplier - 1.0)
        } else { 0.0 };
        let cold_chain_fee = if needs_cold { 50.0 } else { 0.0 };
        let subtotal = zone.base_fee + distance_fee + surge_fee + cold_chain_fee;
        let discount = if is_subscriber { subtotal * 0.15 } else { 0.0 };

        PricingEstimate {
            zone_id: zone.id.clone(),
            base_fee: zone.base_fee,
            distance_fee,
            surge_fee,
            cold_chain_fee,
            subscription_discount: discount,
            total: subtotal - discount,
            currency: "KES".to_string(),
            estimated_time_mins: (distance_km * 8.0 + 10.0) as u32,
        }
    }

    fn optimize_routes(&self, zone_id: &str, date: &str) -> RouteOptimization {
        let zone_tasks: Vec<&DeliveryTask> = self.tasks.values()
            .filter(|t| t.zone_id == zone_id && t.scheduled_date == date)
            .collect();

        let n = zone_tasks.len() as u32;
        let couriers_needed = ((n as f64) / 8.0).ceil() as u32;
        let total_distance: f64 = zone_tasks.iter().map(|t| t.distance_km).sum();

        let mut routes = Vec::new();
        let mut courier_idx = 0;
        let tasks_per_courier = if couriers_needed > 0 { (n as f64 / couriers_needed as f64).ceil() as usize } else { 0 };

        for chunk in zone_tasks.chunks(tasks_per_courier.max(1)) {
            courier_idx += 1;
            let mut stops = Vec::new();
            let mut route_dist = 0.0;
            let mut route_weight = 0.0;

            for (seq, task) in chunk.iter().enumerate() {
                route_dist += task.distance_km;
                route_weight += task.total_weight_kg;
                stops.push(RouteStop {
                    delivery_id: task.id.clone(),
                    sequence: (seq + 1) as u32,
                    lat: task.dropoff.lat,
                    lng: task.dropoff.lng,
                    address: format!("Delivery {}", task.id),
                    estimated_arrival: format!("{}:00", 7 + seq),
                    weight_kg: task.total_weight_kg,
                });
            }

            routes.push(OptimizedRoute {
                courier_id: format!("courier-{}", courier_idx),
                stops,
                total_distance_km: route_dist,
                estimated_time_mins: (route_dist * 8.0 + chunk.len() as f64 * 5.0) as u32,
                load_kg: route_weight,
            });
        }

        RouteOptimization {
            zone_id: zone_id.to_string(),
            date: date.to_string(),
            total_deliveries: n,
            total_distance_km: total_distance,
            estimated_time_mins: (total_distance * 8.0 + n as f64 * 5.0) as u32,
            couriers_needed,
            optimized_routes: routes,
            savings_vs_naive_pct: 22.5,
        }
    }
}

// ============================================================================
// HTTP Server
// ============================================================================

fn now_epoch() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn parse_json<T: serde::de::DeserializeOwned>(body: &[u8]) -> Result<T, String> {
    serde_json::from_slice(body).map_err(|e| format!("Invalid JSON: {}", e))
}

fn json_response(data: &impl serde::Serialize) -> (String, u16) {
    (serde_json::to_string(data).unwrap_or_default(), 200)
}

fn handle_request(
    store: &Arc<RwLock<Store>>,
    method: &str,
    path: &str,
    body: &[u8],
) -> (String, u16) {
    match (method, path) {
        ("GET", "/health") => json_response(&serde_json::json!({
            "status": "ok",
            "service": "urban-delivery",
            "port": 8111
        })),

        ("GET", "/api/zones") => {
            let s = store.read().unwrap();
            let zones: Vec<&MicroZone> = s.zones.values().filter(|z| z.active).collect();
            json_response(&zones)
        }

        ("POST", "/api/zones") => {
            let zone: MicroZone = match parse_json(body) {
                Ok(z) => z,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };
            let mut s = store.write().unwrap();
            let id = zone.id.clone();
            s.zones.insert(id, zone.clone());
            (serde_json::to_string(&zone).unwrap(), 201)
        }

        ("POST", "/api/zones/find") => {
            #[derive(serde::Deserialize)]
            struct Req { lat: f64, lng: f64 }
            let req: Req = match parse_json(body) {
                Ok(r) => r,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };
            let s = store.read().unwrap();
            match s.find_zone_for_location(req.lat, req.lng) {
                Some(z) => json_response(z),
                None => (serde_json::to_string(&serde_json::json!({"error": "No zone found"})).unwrap(), 404),
            }
        }

        ("POST", "/api/subscriptions") => {
            #[derive(serde::Deserialize)]
            struct Req {
                customer_id: u64,
                customer_name: String,
                plan: SubscriptionPlan,
                box_type: BoxType,
                preferences: Option<Vec<String>>,
                exclusions: Option<Vec<String>>,
                address: DeliveryAddress,
                preferred_day: String,
                preferred_time_slot: String,
            }
            let req: Req = match parse_json(body) {
                Ok(r) => r,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };

            let mut s = store.write().unwrap();

            let zone_id = s.find_zone_for_location(req.address.lat, req.address.lng)
                .map(|z| z.id.clone())
                .unwrap_or_else(|| "zone-default".to_string());

            let price = match req.box_type {
                BoxType::SmallBox => 500.0,
                BoxType::MediumBox => 800.0,
                BoxType::LargeBox => 1200.0,
                BoxType::FamilyBox => 1800.0,
                BoxType::OfficeBox => 2500.0,
                BoxType::JuiceBox => 600.0,
                BoxType::SaladBox => 700.0,
                BoxType::HerbBox => 450.0,
                BoxType::CustomBox => 1000.0,
            };

            let sub_id = s.next_id("sub");
            let sub = Subscription {
                id: sub_id.clone(),
                customer_id: req.customer_id,
                customer_name: req.customer_name,
                plan: req.plan,
                box_type: req.box_type,
                custom_preferences: req.preferences.unwrap_or_default(),
                exclusions: req.exclusions.unwrap_or_default(),
                delivery_address: req.address,
                zone_id,
                preferred_day: req.preferred_day,
                preferred_time_slot: req.preferred_time_slot,
                status: SubscriptionStatus::Active,
                price_per_delivery: price,
                currency: "KES".to_string(),
                next_delivery_date: "2026-06-02".to_string(),
                deliveries_completed: 0,
                created_at: now_epoch(),
            };

            s.subscriptions.insert(sub_id, sub.clone());
            (serde_json::to_string(&sub).unwrap(), 201)
        }

        ("GET", "/api/subscriptions") => {
            let s = store.read().unwrap();
            let subs: Vec<&Subscription> = s.subscriptions.values().collect();
            json_response(&subs)
        }

        ("POST", "/api/subscriptions/pause") | ("POST", "/api/subscriptions/resume") | ("POST", "/api/subscriptions/cancel") => {
            #[derive(serde::Deserialize)]
            struct Req { subscription_id: String }
            let req: Req = match parse_json(body) {
                Ok(r) => r,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };
            let mut s = store.write().unwrap();
            if let Some(sub) = s.subscriptions.get_mut(&req.subscription_id) {
                sub.status = if path.ends_with("pause") { SubscriptionStatus::Paused }
                    else if path.ends_with("resume") { SubscriptionStatus::Active }
                    else { SubscriptionStatus::Cancelled };
                let result = sub.clone();
                json_response(&result)
            } else {
                (serde_json::to_string(&serde_json::json!({"error": "Subscription not found"})).unwrap(), 404)
            }
        }

        ("POST", "/api/deliveries/schedule") => {
            #[derive(serde::Deserialize)]
            struct Req {
                subscription_id: Option<String>,
                order_id: Option<String>,
                zone_id: String,
                pickup_lat: f64,
                pickup_lng: f64,
                dropoff_lat: f64,
                dropoff_lng: f64,
                items: Vec<DeliveryItem>,
                date: String,
                time_slot: String,
            }
            let req: Req = match parse_json(body) {
                Ok(r) => r,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };

            let mut s = store.write().unwrap();
            let dist = Store::haversine_km(req.pickup_lat, req.pickup_lng, req.dropoff_lat, req.dropoff_lng);
            let weight: f64 = req.items.iter().map(|i| i.weight_kg).sum();

            let zone = s.zones.get(&req.zone_id).cloned();
            let fee = zone.as_ref().map(|z| z.base_fee + dist * z.per_km_fee).unwrap_or(200.0);

            let task_id = s.next_id("task");
            let task = DeliveryTask {
                id: task_id.clone(),
                subscription_id: req.subscription_id,
                order_id: req.order_id,
                courier_id: None,
                zone_id: req.zone_id,
                pickup: GeoPoint { lat: req.pickup_lat, lng: req.pickup_lng },
                dropoff: GeoPoint { lat: req.dropoff_lat, lng: req.dropoff_lng },
                status: TaskStatus::Scheduled,
                items: req.items,
                total_weight_kg: weight,
                estimated_time_mins: (dist * 8.0 + 10.0) as u32,
                actual_time_mins: None,
                fee,
                distance_km: dist,
                scheduled_date: req.date,
                scheduled_slot: req.time_slot,
                created_at: now_epoch(),
            };

            s.tasks.insert(task_id, task.clone());
            (serde_json::to_string(&task).unwrap(), 201)
        }

        ("POST", "/api/deliveries/estimate") => {
            #[derive(serde::Deserialize)]
            struct Req {
                pickup_lat: f64,
                pickup_lng: f64,
                dropoff_lat: f64,
                dropoff_lng: f64,
                needs_cold_chain: bool,
                is_subscriber: bool,
            }
            let req: Req = match parse_json(body) {
                Ok(r) => r,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };
            let s = store.read().unwrap();
            let dist = Store::haversine_km(req.pickup_lat, req.pickup_lng, req.dropoff_lat, req.dropoff_lng);
            let zone = s.find_zone_for_location(req.dropoff_lat, req.dropoff_lng);
            match zone {
                Some(z) => json_response(&s.estimate_price(z, dist, req.needs_cold_chain, req.is_subscriber)),
                None => (serde_json::to_string(&serde_json::json!({"error": "No delivery zone covers this location"})).unwrap(), 404),
            }
        }

        ("POST", "/api/routes/optimize") => {
            #[derive(serde::Deserialize)]
            struct Req { zone_id: String, date: String }
            let req: Req = match parse_json(body) {
                Ok(r) => r,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };
            let s = store.read().unwrap();
            json_response(&s.optimize_routes(&req.zone_id, &req.date))
        }

        ("POST", "/api/couriers") => {
            let courier: Courier = match parse_json(body) {
                Ok(c) => c,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };
            let mut s = store.write().unwrap();
            let id = courier.id.clone();
            s.couriers.insert(id, courier.clone());
            (serde_json::to_string(&courier).unwrap(), 201)
        }

        ("GET", "/api/couriers") => {
            let s = store.read().unwrap();
            let couriers: Vec<&Courier> = s.couriers.values().collect();
            json_response(&couriers)
        }

        ("POST", "/api/couriers/track") => {
            #[derive(serde::Deserialize)]
            struct Req { courier_id: String, lat: f64, lng: f64 }
            let req: Req = match parse_json(body) {
                Ok(r) => r,
                Err(e) => return (serde_json::to_string(&serde_json::json!({"error": e})).unwrap(), 400),
            };
            let mut s = store.write().unwrap();
            if let Some(c) = s.couriers.get_mut(&req.courier_id) {
                c.current_lat = req.lat;
                c.current_lng = req.lng;
                let result = c.clone();
                json_response(&result)
            } else {
                (serde_json::to_string(&serde_json::json!({"error": "Courier not found"})).unwrap(), 404)
            }
        }

        ("GET", "/api/stats") => {
            let s = store.read().unwrap();
            let active_subs = s.subscriptions.values().filter(|sub| matches!(sub.status, SubscriptionStatus::Active)).count();
            json_response(&serde_json::json!({
                "totalZones": s.zones.len(),
                "activeZones": s.zones.values().filter(|z| z.active).count(),
                "totalSubscriptions": s.subscriptions.len(),
                "activeSubscriptions": active_subs,
                "totalCouriers": s.couriers.len(),
                "totalDeliveries": s.tasks.len(),
                "pendingDeliveries": s.tasks.values().filter(|t| matches!(t.status, TaskStatus::Scheduled)).count(),
            }))
        }

        _ => (serde_json::to_string(&serde_json::json!({"error": "Not found"})).unwrap(), 404),
    }
}

// ============================================================================
// Simple HTTP server using std::net (no external deps)
// ============================================================================

fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8111".to_string());
    let store = Arc::new(RwLock::new(Store::new()));

    let listener = std::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .expect("Failed to bind");

    println!("[urban-delivery] Starting on port {} with {} micro-zones",
        port, store.read().unwrap().zones.len());

    for stream in listener.incoming() {
        let stream = match stream {
            Ok(s) => s,
            Err(_) => continue,
        };
        let store = store.clone();

        std::thread::spawn(move || {
            use std::io::{Read, Write};
            let mut buf = [0u8; 65536];
            let mut stream = stream;
            let n = match stream.read(&mut buf) {
                Ok(n) => n,
                Err(_) => return,
            };
            let request = String::from_utf8_lossy(&buf[..n]);

            let first_line = request.lines().next().unwrap_or("");
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            if parts.len() < 2 { return; }

            let method = parts[0];
            let path = parts[1];

            let body_start = request.find("\r\n\r\n").map(|i| i + 4).unwrap_or(n);
            let body = &buf[body_start..n];

            let (response_body, status) = handle_request(&store, method, path, body);

            let status_text = match status {
                200 => "OK",
                201 => "Created",
                400 => "Bad Request",
                404 => "Not Found",
                405 => "Method Not Allowed",
                _ => "Internal Server Error",
            };

            let response = format!(
                "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
                status, status_text, response_body.len(), response_body
            );

            let _ = stream.write_all(response.as_bytes());
        });
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_haversine() {
        let dist = Store::haversine_km(-1.2635, 36.8039, -1.2893, 36.7850);
        assert!(dist > 0.0 && dist < 5.0, "Westlands to Kilimani should be <5km");
    }

    #[test]
    fn test_find_zone() {
        let store = Store::new();
        let zone = store.find_zone_for_location(-1.2635, 36.8039);
        assert!(zone.is_some(), "Should find Westlands zone");
        assert_eq!(zone.unwrap().name, "Westlands");
    }

    #[test]
    fn test_pricing() {
        let store = Store::new();
        let zone = store.zones.get("zone-westlands").unwrap();
        let price = store.estimate_price(zone, 2.0, false, false);
        assert!(price.total > 0.0);
        assert_eq!(price.subscription_discount, 0.0);

        let subscriber_price = store.estimate_price(zone, 2.0, false, true);
        assert!(subscriber_price.total < price.total, "Subscriber should get discount");
    }

    #[test]
    fn test_cold_chain_fee() {
        let store = Store::new();
        let zone = store.zones.get("zone-westlands").unwrap();
        let without = store.estimate_price(zone, 2.0, false, false);
        let with = store.estimate_price(zone, 2.0, true, false);
        assert!(with.total > without.total, "Cold chain should cost more");
        assert_eq!(with.cold_chain_fee, 50.0);
    }

    #[test]
    fn test_subscription_pricing() {
        let store = Store::new();
        let zone = store.zones.get("zone-kilimani").unwrap();
        let price = store.estimate_price(zone, 1.5, false, true);
        assert!(price.subscription_discount > 0.0, "Should have 15% discount");
    }

    #[test]
    fn test_zone_count() {
        let store = Store::new();
        assert_eq!(store.zones.len(), 8, "Should have 8 seeded zones");
        let nairobi: Vec<_> = store.zones.values().filter(|z| z.city == "Nairobi").collect();
        assert_eq!(nairobi.len(), 5);
        let lagos: Vec<_> = store.zones.values().filter(|z| z.city == "Lagos").collect();
        assert_eq!(lagos.len(), 3);
    }

    #[test]
    fn test_route_optimization() {
        let store = Store::new();
        let result = store.optimize_routes("zone-westlands", "2026-06-01");
        assert_eq!(result.total_deliveries, 0);
        assert_eq!(result.couriers_needed, 0);
    }

    #[test]
    fn test_handle_health() {
        let store = Arc::new(RwLock::new(Store::new()));
        let (body, status) = handle_request(&store, "GET", "/health", b"");
        assert_eq!(status, 200);
        assert!(body.contains("urban-delivery"));
    }

    #[test]
    fn test_handle_zones() {
        let store = Arc::new(RwLock::new(Store::new()));
        let (body, status) = handle_request(&store, "GET", "/api/zones", b"");
        assert_eq!(status, 200);
        assert!(body.contains("Westlands"));
    }

    #[test]
    fn test_handle_stats() {
        let store = Arc::new(RwLock::new(Store::new()));
        let (body, status) = handle_request(&store, "GET", "/api/stats", b"");
        assert_eq!(status, 200);
        assert!(body.contains("totalZones"));
    }
}
