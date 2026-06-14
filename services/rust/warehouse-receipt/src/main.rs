// Warehouse Receipt Service — Rust microservice for managing digital warehouse receipts,
// collateralized lending, and commodity storage tracking.
// Port: 8117 | Middleware: TigerBeetle, Fluvio, Temporal, PostgreSQL

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

// ─── Domain Models ──────────────────────────────────────────────────

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct WarehouseReceipt {
    id: String,
    farmer_id: String,
    warehouse_id: String,
    commodity: String,
    quantity_kg: f64,
    quality_grade: String,
    moisture_percent: f64,
    storage_date: String,
    expiry_date: String,
    status: String, // active, redeemed, expired, pledged
    current_value: f64,
    currency: String,
    is_tradeable: bool,
    pledge_status: Option<PledgeInfo>,
    created_at: u64,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct PledgeInfo {
    lender_id: String,
    loan_amount: f64,
    interest_rate: f64,
    pledge_date: String,
    maturity_date: String,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct Warehouse {
    id: String,
    name: String,
    location: String,
    capacity_mt: f64,
    current_stock_mt: f64,
    utilization_percent: f64,
    certified: bool,
    manager: String,
    commodities_accepted: Vec<String>,
    storage_rate_per_kg_per_day: f64,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct CommodityPrice {
    commodity: String,
    price_per_kg: f64,
    currency: String,
    market: String,
    date: String,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct TradeOffer {
    id: String,
    receipt_id: String,
    seller_id: String,
    buyer_id: Option<String>,
    ask_price_per_kg: f64,
    status: String, // open, accepted, cancelled
    created_at: u64,
}

struct AppState {
    receipts: HashMap<String, WarehouseReceipt>,
    warehouses: HashMap<String, Warehouse>,
    prices: Vec<CommodityPrice>,
    trades: HashMap<String, TradeOffer>,
    start_time: u64,
}

impl AppState {
    fn new() -> Self {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let mut state = AppState {
            receipts: HashMap::new(),
            warehouses: HashMap::new(),
            prices: Vec::new(),
            trades: HashMap::new(),
            start_time: now,
        };
        state.seed();
        state
    }

    fn seed(&mut self) {
        // Warehouses
        self.warehouses.insert("WH-001".into(), Warehouse {
            id: "WH-001".into(), name: "Nairobi Central Warehouse".into(),
            location: "Nairobi, Kenya".into(), capacity_mt: 5000.0, current_stock_mt: 3200.0,
            utilization_percent: 64.0, certified: true, manager: "John Kamau".into(),
            commodities_accepted: vec!["maize".into(), "wheat".into(), "rice".into(), "beans".into()],
            storage_rate_per_kg_per_day: 0.02,
        });
        self.warehouses.insert("WH-002".into(), Warehouse {
            id: "WH-002".into(), name: "Lagos Commodity Hub".into(),
            location: "Lagos, Nigeria".into(), capacity_mt: 8000.0, current_stock_mt: 5600.0,
            utilization_percent: 70.0, certified: true, manager: "Adewale Okonkwo".into(),
            commodities_accepted: vec!["cocoa".into(), "cashew".into(), "sesame".into(), "soybean".into()],
            storage_rate_per_kg_per_day: 0.03,
        });
        self.warehouses.insert("WH-003".into(), Warehouse {
            id: "WH-003".into(), name: "Kampala Grain Store".into(),
            location: "Kampala, Uganda".into(), capacity_mt: 3000.0, current_stock_mt: 1800.0,
            utilization_percent: 60.0, certified: true, manager: "Moses Okello".into(),
            commodities_accepted: vec!["coffee".into(), "maize".into(), "sorghum".into(), "millet".into()],
            storage_rate_per_kg_per_day: 0.015,
        });

        // Commodity prices
        self.prices = vec![
            CommodityPrice { commodity: "maize".into(), price_per_kg: 45.0, currency: "KES".into(), market: "NAIROBI".into(), date: "2025-01-15".into() },
            CommodityPrice { commodity: "wheat".into(), price_per_kg: 55.0, currency: "KES".into(), market: "NAIROBI".into(), date: "2025-01-15".into() },
            CommodityPrice { commodity: "cocoa".into(), price_per_kg: 2500.0, currency: "NGN".into(), market: "LAGOS".into(), date: "2025-01-15".into() },
            CommodityPrice { commodity: "coffee".into(), price_per_kg: 350.0, currency: "KES".into(), market: "NAIROBI".into(), date: "2025-01-15".into() },
            CommodityPrice { commodity: "rice".into(), price_per_kg: 120.0, currency: "KES".into(), market: "NAIROBI".into(), date: "2025-01-15".into() },
            CommodityPrice { commodity: "cashew".into(), price_per_kg: 1800.0, currency: "NGN".into(), market: "LAGOS".into(), date: "2025-01-15".into() },
        ];

        // Warehouse receipts
        self.receipts.insert("WR-001".into(), WarehouseReceipt {
            id: "WR-001".into(), farmer_id: "F-101".into(), warehouse_id: "WH-001".into(),
            commodity: "maize".into(), quantity_kg: 5000.0, quality_grade: "Grade1".into(),
            moisture_percent: 12.5, storage_date: "2025-01-01".into(), expiry_date: "2025-07-01".into(),
            status: "active".into(), current_value: 225000.0, currency: "KES".into(),
            is_tradeable: true, pledge_status: None, created_at: self.start_time,
        });
        self.receipts.insert("WR-002".into(), WarehouseReceipt {
            id: "WR-002".into(), farmer_id: "F-102".into(), warehouse_id: "WH-002".into(),
            commodity: "cocoa".into(), quantity_kg: 2000.0, quality_grade: "Grade1".into(),
            moisture_percent: 7.5, storage_date: "2025-01-05".into(), expiry_date: "2025-12-31".into(),
            status: "pledged".into(), current_value: 5000000.0, currency: "NGN".into(),
            is_tradeable: false,
            pledge_status: Some(PledgeInfo {
                lender_id: "MFI-001".into(), loan_amount: 3000000.0, interest_rate: 12.0,
                pledge_date: "2025-01-10".into(), maturity_date: "2025-06-10".into(),
            }),
            created_at: self.start_time,
        });
        self.receipts.insert("WR-003".into(), WarehouseReceipt {
            id: "WR-003".into(), farmer_id: "F-103".into(), warehouse_id: "WH-003".into(),
            commodity: "coffee".into(), quantity_kg: 1000.0, quality_grade: "AA".into(),
            moisture_percent: 11.0, storage_date: "2025-01-08".into(), expiry_date: "2025-08-08".into(),
            status: "active".into(), current_value: 350000.0, currency: "KES".into(),
            is_tradeable: true, pledge_status: None, created_at: self.start_time,
        });

        // Trade offers
        self.trades.insert("TR-001".into(), TradeOffer {
            id: "TR-001".into(), receipt_id: "WR-003".into(), seller_id: "F-103".into(),
            buyer_id: None, ask_price_per_kg: 370.0, status: "open".into(), created_at: self.start_time,
        });
    }
}

type SharedState = Arc<RwLock<AppState>>;

// ─── HTTP Response Helpers ──────────────────────────────────────────

fn json_response(status: u16, body: &impl serde::Serialize) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let json = serde_json::to_vec(body).unwrap_or_default();
    tiny_http::Response::from_data(json)
        .with_status_code(status)
        .with_header(tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap())
}

fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8117".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let state: SharedState = Arc::new(RwLock::new(AppState::new()));

    println!("Warehouse Receipt service starting on {}", addr);
    let server = Arc::new(match tiny_http::Server::http(&addr) {
        Ok(s) => s,
        Err(e) => { eprintln!("Failed to start server: {}", e); return; }
    });

    // Graceful shutdown on SIGTERM/SIGINT
    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();
    let server_clone = server.clone();
    std::thread::spawn(move || {
        unsafe {
            libc::signal(libc::SIGTERM, signal_handler as libc::sighandler_t);
            libc::signal(libc::SIGINT, signal_handler as libc::sighandler_t);
        }
        while !SHUTDOWN.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        running_clone.store(false, Ordering::Relaxed);
        server_clone.unblock();
        eprintln!("[WarehouseReceipt] Shutdown signal received");
    });

    for request in server.incoming_requests() {
        if !running.load(Ordering::Relaxed) {
            break;
        }
        let path = request.url().split('?').next().unwrap_or("/").to_string();
        let method = request.method().as_str().to_uppercase();

        match (method.as_str(), path.as_str()) {
            ("GET", "/health") => {
                let s = state.read().unwrap();
                let _ = request.respond(json_response(200, &serde_json::json!({
                    "status": "healthy", "service": "warehouse-receipt", "version": "1.0.0",
                    "receipts": s.receipts.len(), "warehouses": s.warehouses.len(),
                })));
            }
            ("GET", "/api/receipts") => {
                let s = state.read().unwrap();
                let receipts: Vec<_> = s.receipts.values().cloned().collect();
                let _ = request.respond(json_response(200, &serde_json::json!({
                    "receipts": receipts, "total": receipts.len()
                })));
            }
            ("GET", "/api/warehouses") => {
                let s = state.read().unwrap();
                let warehouses: Vec<_> = s.warehouses.values().cloned().collect();
                let _ = request.respond(json_response(200, &serde_json::json!({
                    "warehouses": warehouses, "total": warehouses.len()
                })));
            }
            ("GET", "/api/prices") => {
                let s = state.read().unwrap();
                let _ = request.respond(json_response(200, &serde_json::json!({
                    "prices": s.prices, "total": s.prices.len()
                })));
            }
            ("GET", "/api/trades") => {
                let s = state.read().unwrap();
                let trades: Vec<_> = s.trades.values().cloned().collect();
                let _ = request.respond(json_response(200, &serde_json::json!({
                    "trades": trades, "total": trades.len()
                })));
            }
            ("GET", "/api/stats") => {
                let s = state.read().unwrap();
                let total_value: f64 = s.receipts.values().map(|r| r.current_value).sum();
                let total_quantity: f64 = s.receipts.values().map(|r| r.quantity_kg).sum();
                let active = s.receipts.values().filter(|r| r.status == "active").count();
                let pledged = s.receipts.values().filter(|r| r.status == "pledged").count();
                let _ = request.respond(json_response(200, &serde_json::json!({
                    "totalReceipts": s.receipts.len(),
                    "activeReceipts": active,
                    "pledgedReceipts": pledged,
                    "totalWarehouses": s.warehouses.len(),
                    "totalValueFormatted": format!("{:.0}", total_value),
                    "totalQuantityKg": total_quantity,
                    "commodityPrices": s.prices.len(),
                    "openTrades": s.trades.values().filter(|t| t.status == "open").count(),
                })));
            }
            _ => {
                let _ = request.respond(json_response(404, &serde_json::json!({"error": "not found"})));
            }
        }
    }
    eprintln!("[WarehouseReceipt] Server stopped gracefully");
}

static SHUTDOWN: AtomicBool = AtomicBool::new(false);

extern "C" fn signal_handler(_: libc::c_int) {
    SHUTDOWN.store(true, Ordering::Relaxed);
}
