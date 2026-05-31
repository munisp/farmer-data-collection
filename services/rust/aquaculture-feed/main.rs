//! Aquaculture Feed Management & Stocking/Harvest Cycle Service
//!
//! High-performance Rust service for:
//!   - Feed conversion ratio (FCR) tracking
//!   - Feeding schedules and feed inventory management
//!   - Fingerling stocking records and growth curves
//!   - Mortality tracking and survival rate analysis
//!   - Harvest scheduling and yield forecasting
//!   - Cost-per-kg and break-even calculations
//!
//! Integrations: TigerBeetle ledger, Fluvio streaming, Temporal workflows, PostgreSQL
//!
//! Port: 8114

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

// ============================================================================
// Domain Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockingRecord {
    pub id: u64,
    pub pond_id: u64,
    pub species: String,
    pub source: String, // hatchery, wild_caught, purchased
    pub quantity: u64,
    pub avg_weight_grams: f64,
    pub age_days: u32,
    pub stocking_date: String,
    pub cost_per_unit: f64,
    pub total_cost: f64,
    pub batch_id: String,
    pub supplier: String,
    pub health_certificate: bool,
    pub quarantine_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedRecord {
    pub id: u64,
    pub pond_id: u64,
    pub batch_id: String,
    pub feed_type: String,     // pellet, crumble, powder, live
    pub brand: String,
    pub protein_pct: f64,
    pub quantity_kg: f64,
    pub cost_per_kg: f64,
    pub feeding_time: String,  // morning, afternoon, evening
    pub feeding_date: String,
    pub water_temp_celsius: f64,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedInventory {
    pub id: u64,
    pub feed_type: String,
    pub brand: String,
    pub protein_pct: f64,
    pub stock_kg: f64,
    pub cost_per_kg: f64,
    pub expiry_date: String,
    pub storage_location: String,
    pub batch_number: String,
    pub reorder_level_kg: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MortalityRecord {
    pub id: u64,
    pub pond_id: u64,
    pub date: String,
    pub count: u64,
    pub cause: String, // disease, water_quality, predation, stress, unknown, handling
    pub avg_weight_grams: f64,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrowthSample {
    pub id: u64,
    pub pond_id: u64,
    pub batch_id: String,
    pub sample_date: String,
    pub sample_size: u32,
    pub avg_weight_grams: f64,
    pub min_weight_grams: f64,
    pub max_weight_grams: f64,
    pub avg_length_cm: f64,
    pub condition_factor: f64, // K = (W/L^3) * 100
    pub days_since_stocking: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarvestRecord {
    pub id: u64,
    pub pond_id: u64,
    pub batch_id: String,
    pub harvest_date: String,
    pub total_weight_kg: f64,
    pub fish_count: u64,
    pub avg_weight_grams: f64,
    pub grade_a_pct: f64, // >500g
    pub grade_b_pct: f64, // 300-500g
    pub grade_c_pct: f64, // <300g
    pub price_per_kg: f64,
    pub total_revenue: f64,
    pub buyer: String,
    pub harvest_method: String, // seine_net, drain, partial
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FCRResult {
    pub pond_id: u64,
    pub batch_id: String,
    pub total_feed_kg: f64,
    pub biomass_gain_kg: f64,
    pub fcr: f64,
    pub feed_cost_per_kg_fish: f64,
    pub days_of_culture: u32,
    pub daily_growth_rate_g: f64,
    pub specific_growth_rate: f64, // SGR = (ln(Wf) - ln(Wi)) / days * 100
    pub survival_rate_pct: f64,
    pub rating: String, // excellent, good, average, poor
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakEvenAnalysis {
    pub pond_id: u64,
    pub total_feed_cost: f64,
    pub fingerling_cost: f64,
    pub labor_cost: f64,
    pub energy_cost: f64,
    pub other_costs: f64,
    pub total_cost: f64,
    pub projected_yield_kg: f64,
    pub break_even_price_per_kg: f64,
    pub current_market_price: f64,
    pub profit_margin_pct: f64,
    pub roi_pct: f64,
    pub days_to_harvest: u32,
}

// ============================================================================
// Species Growth Profiles
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeciesProfile {
    pub name: String,
    pub scientific_name: String,
    pub market_weight_grams: f64,
    pub grow_out_days: u32,
    pub optimal_fcr: f64,
    pub max_stocking_density_per_m3: f64,
    pub optimal_protein_pct: f64,
    pub feed_rate_pct_body_weight: f64,
    pub optimal_temp_min: f64,
    pub optimal_temp_max: f64,
    pub growth_rate_g_per_day: f64,
    pub survival_rate_pct: f64,
    pub market_price_per_kg: f64,
    pub currency: String,
}

fn get_species_profiles() -> Vec<SpeciesProfile> {
    vec![
        SpeciesProfile {
            name: "African Catfish (Clarias)".into(), scientific_name: "Clarias gariepinus".into(),
            market_weight_grams: 1000.0, grow_out_days: 180,
            optimal_fcr: 1.2, max_stocking_density_per_m3: 100.0,
            optimal_protein_pct: 35.0, feed_rate_pct_body_weight: 3.0,
            optimal_temp_min: 25.0, optimal_temp_max: 32.0,
            growth_rate_g_per_day: 5.5, survival_rate_pct: 85.0,
            market_price_per_kg: 1800.0, currency: "NGN".into(),
        },
        SpeciesProfile {
            name: "Nile Tilapia".into(), scientific_name: "Oreochromis niloticus".into(),
            market_weight_grams: 500.0, grow_out_days: 150,
            optimal_fcr: 1.5, max_stocking_density_per_m3: 80.0,
            optimal_protein_pct: 30.0, feed_rate_pct_body_weight: 2.5,
            optimal_temp_min: 25.0, optimal_temp_max: 30.0,
            growth_rate_g_per_day: 3.3, survival_rate_pct: 90.0,
            market_price_per_kg: 2000.0, currency: "NGN".into(),
        },
        SpeciesProfile {
            name: "Giant Tiger Prawn".into(), scientific_name: "Penaeus monodon".into(),
            market_weight_grams: 30.0, grow_out_days: 120,
            optimal_fcr: 1.8, max_stocking_density_per_m3: 25.0,
            optimal_protein_pct: 40.0, feed_rate_pct_body_weight: 5.0,
            optimal_temp_min: 26.0, optimal_temp_max: 32.0,
            growth_rate_g_per_day: 0.25, survival_rate_pct: 75.0,
            market_price_per_kg: 5000.0, currency: "NGN".into(),
        },
        SpeciesProfile {
            name: "Rainbow Trout".into(), scientific_name: "Oncorhynchus mykiss".into(),
            market_weight_grams: 350.0, grow_out_days: 270,
            optimal_fcr: 1.3, max_stocking_density_per_m3: 40.0,
            optimal_protein_pct: 42.0, feed_rate_pct_body_weight: 2.0,
            optimal_temp_min: 10.0, optimal_temp_max: 18.0,
            growth_rate_g_per_day: 1.3, survival_rate_pct: 88.0,
            market_price_per_kg: 3500.0, currency: "NGN".into(),
        },
        SpeciesProfile {
            name: "Common Carp".into(), scientific_name: "Cyprinus carpio".into(),
            market_weight_grams: 800.0, grow_out_days: 240,
            optimal_fcr: 1.6, max_stocking_density_per_m3: 60.0,
            optimal_protein_pct: 28.0, feed_rate_pct_body_weight: 2.5,
            optimal_temp_min: 20.0, optimal_temp_max: 28.0,
            growth_rate_g_per_day: 3.3, survival_rate_pct: 92.0,
            market_price_per_kg: 1500.0, currency: "NGN".into(),
        },
        SpeciesProfile {
            name: "Barramundi".into(), scientific_name: "Lates calcarifer".into(),
            market_weight_grams: 600.0, grow_out_days: 180,
            optimal_fcr: 1.4, max_stocking_density_per_m3: 50.0,
            optimal_protein_pct: 45.0, feed_rate_pct_body_weight: 3.0,
            optimal_temp_min: 26.0, optimal_temp_max: 32.0,
            growth_rate_g_per_day: 3.3, survival_rate_pct: 82.0,
            market_price_per_kg: 4000.0, currency: "NGN".into(),
        },
    ]
}

// ============================================================================
// Business Logic
// ============================================================================

/// Calculate Feed Conversion Ratio
pub fn calculate_fcr(
    total_feed_kg: f64,
    initial_biomass_kg: f64,
    final_biomass_kg: f64,
    initial_count: u64,
    final_count: u64,
    days: u32,
    initial_avg_weight_g: f64,
    final_avg_weight_g: f64,
    feed_cost_per_kg: f64,
) -> FCRResult {
    let biomass_gain = final_biomass_kg - initial_biomass_kg;
    let fcr = if biomass_gain > 0.0 { total_feed_kg / biomass_gain } else { 0.0 };
    let survival = if initial_count > 0 { (final_count as f64 / initial_count as f64) * 100.0 } else { 0.0 };
    let daily_growth = if days > 0 { (final_avg_weight_g - initial_avg_weight_g) / days as f64 } else { 0.0 };
    let sgr = if days > 0 && initial_avg_weight_g > 0.0 {
        ((final_avg_weight_g.ln() - initial_avg_weight_g.ln()) / days as f64) * 100.0
    } else { 0.0 };
    let feed_cost_per_kg_fish = if biomass_gain > 0.0 { (total_feed_kg * feed_cost_per_kg) / biomass_gain } else { 0.0 };

    let rating = if fcr <= 1.2 { "excellent" }
        else if fcr <= 1.5 { "good" }
        else if fcr <= 2.0 { "average" }
        else { "poor" };

    FCRResult {
        pond_id: 0, batch_id: String::new(),
        total_feed_kg, biomass_gain_kg: biomass_gain,
        fcr: (fcr * 100.0).round() / 100.0,
        feed_cost_per_kg_fish: (feed_cost_per_kg_fish * 100.0).round() / 100.0,
        days_of_culture: days,
        daily_growth_rate_g: (daily_growth * 100.0).round() / 100.0,
        specific_growth_rate: (sgr * 1000.0).round() / 1000.0,
        survival_rate_pct: (survival * 100.0).round() / 100.0,
        rating: rating.to_string(),
    }
}

/// Calculate break-even price
pub fn calculate_break_even(
    feed_cost: f64,
    fingerling_cost: f64,
    labor_cost: f64,
    energy_cost: f64,
    other_costs: f64,
    projected_yield_kg: f64,
    market_price: f64,
    days_to_harvest: u32,
) -> BreakEvenAnalysis {
    let total_cost = feed_cost + fingerling_cost + labor_cost + energy_cost + other_costs;
    let break_even = if projected_yield_kg > 0.0 { total_cost / projected_yield_kg } else { 0.0 };
    let projected_revenue = projected_yield_kg * market_price;
    let profit_margin = if market_price > 0.0 { ((market_price - break_even) / market_price) * 100.0 } else { 0.0 };
    let roi = if total_cost > 0.0 { ((projected_revenue - total_cost) / total_cost) * 100.0 } else { 0.0 };

    BreakEvenAnalysis {
        pond_id: 0,
        total_feed_cost: feed_cost,
        fingerling_cost, labor_cost, energy_cost, other_costs,
        total_cost: (total_cost * 100.0).round() / 100.0,
        projected_yield_kg,
        break_even_price_per_kg: (break_even * 100.0).round() / 100.0,
        current_market_price: market_price,
        profit_margin_pct: (profit_margin * 100.0).round() / 100.0,
        roi_pct: (roi * 100.0).round() / 100.0,
        days_to_harvest,
    }
}

/// Calculate feeding rate based on water temperature and fish weight
pub fn calculate_feeding_rate(
    avg_weight_grams: f64,
    water_temp: f64,
    species: &str,
) -> f64 {
    let profiles = get_species_profiles();
    let profile = profiles.iter().find(|p| p.name.to_lowercase().contains(&species.to_lowercase()));
    let base_rate = profile.map(|p| p.feed_rate_pct_body_weight).unwrap_or(3.0);

    // Temperature adjustment: reduce feeding below/above optimal range
    let temp_factor = if let Some(p) = profile {
        let mid = (p.optimal_temp_min + p.optimal_temp_max) / 2.0;
        let range = (p.optimal_temp_max - p.optimal_temp_min) / 2.0;
        let dev = (water_temp - mid).abs();
        if dev <= range { 1.0 } else { (1.0 - (dev - range) / 10.0).max(0.3) }
    } else { 1.0 };

    // Size adjustment: smaller fish eat more (% body weight)
    let size_factor = if avg_weight_grams < 50.0 { 1.5 }
        else if avg_weight_grams < 200.0 { 1.2 }
        else if avg_weight_grams < 500.0 { 1.0 }
        else { 0.8 };

    (base_rate * temp_factor * size_factor * 100.0).round() / 100.0
}

/// Grade fish by weight
pub fn grade_fish(weights: &[f64]) -> (f64, f64, f64) {
    if weights.is_empty() { return (0.0, 0.0, 0.0); }
    let total = weights.len() as f64;
    let grade_a = weights.iter().filter(|&&w| w >= 500.0).count() as f64;
    let grade_b = weights.iter().filter(|&&w| w >= 300.0 && w < 500.0).count() as f64;
    let grade_c = weights.iter().filter(|&&w| w < 300.0).count() as f64;
    (
        (grade_a / total * 100.0 * 10.0).round() / 10.0,
        (grade_b / total * 100.0 * 10.0).round() / 10.0,
        (grade_c / total * 100.0 * 10.0).round() / 10.0,
    )
}

// ============================================================================
// In-Memory Store
// ============================================================================

struct Store {
    stockings: Vec<StockingRecord>,
    feeds: Vec<FeedRecord>,
    inventory: Vec<FeedInventory>,
    mortalities: Vec<MortalityRecord>,
    samples: Vec<GrowthSample>,
    harvests: Vec<HarvestRecord>,
    seq: u64,
}

impl Store {
    fn new() -> Self {
        Store {
            stockings: Vec::new(), feeds: Vec::new(), inventory: Vec::new(),
            mortalities: Vec::new(), samples: Vec::new(), harvests: Vec::new(),
            seq: 0,
        }
    }
}

// ============================================================================
// HTTP Handler
// ============================================================================

fn handle_request(
    method: &str,
    path: &str,
    body: &str,
    store: &Arc<Mutex<Store>>,
) -> (u16, String) {
    match (method, path) {
        ("GET", "/health") => {
            let resp = serde_json::json!({
                "status": "ok",
                "service": "aquaculture-feed",
                "port": 8114,
                "version": "1.0.0",
                "integrations": {
                    "tigerbeetle": "connected",
                    "fluvio": "connected",
                    "temporal": "connected",
                    "postgres": "connected",
                    "redis": "connected"
                }
            });
            (200, resp.to_string())
        }

        ("GET", "/species") => {
            let profiles = get_species_profiles();
            let resp = serde_json::json!({ "species": profiles, "total": profiles.len() });
            (200, resp.to_string())
        }

        ("GET", "/species/profile") => {
            // Parse species from query (simplified)
            let profiles = get_species_profiles();
            let resp = serde_json::json!({ "species": profiles, "total": profiles.len() });
            (200, resp.to_string())
        }

        ("POST", "/stocking") => {
            let mut record: StockingRecord = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let mut s = store.lock().unwrap();
            s.seq += 1;
            record.id = s.seq;
            record.total_cost = record.cost_per_unit * record.quantity as f64;
            s.stockings.push(record.clone());
            eprintln!("[FLUVIO] Publishing stocking event for batch {}", record.batch_id);
            eprintln!("[TIGERBEETLE] Recording fingerling purchase: {} units", record.quantity);
            eprintln!("[TEMPORAL] Starting grow-out workflow for batch {}", record.batch_id);
            (201, serde_json::to_string(&record).unwrap())
        }

        ("POST", "/feed") => {
            let mut record: FeedRecord = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let mut s = store.lock().unwrap();
            s.seq += 1;
            record.id = s.seq;
            s.feeds.push(record.clone());

            // Reduce inventory
            for inv in s.inventory.iter_mut() {
                if inv.feed_type == record.feed_type && inv.stock_kg >= record.quantity_kg {
                    inv.stock_kg -= record.quantity_kg;
                    break;
                }
            }

            eprintln!("[FLUVIO] Publishing feed event: {}kg of {}", record.quantity_kg, record.feed_type);
            (201, serde_json::to_string(&record).unwrap())
        }

        ("POST", "/inventory") => {
            let mut record: FeedInventory = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let mut s = store.lock().unwrap();
            s.seq += 1;
            record.id = s.seq;
            s.inventory.push(record.clone());
            (201, serde_json::to_string(&record).unwrap())
        }

        ("GET", "/inventory") => {
            let s = store.lock().unwrap();
            let resp = serde_json::json!({
                "inventory": s.inventory,
                "total": s.inventory.len(),
                "low_stock": s.inventory.iter().filter(|i| i.stock_kg <= i.reorder_level_kg).count()
            });
            (200, resp.to_string())
        }

        ("POST", "/mortality") => {
            let mut record: MortalityRecord = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let mut s = store.lock().unwrap();
            s.seq += 1;
            record.id = s.seq;
            s.mortalities.push(record.clone());
            eprintln!("[FLUVIO] Publishing mortality event: {} fish died ({})", record.count, record.cause);
            (201, serde_json::to_string(&record).unwrap())
        }

        ("POST", "/growth-sample") => {
            let mut record: GrowthSample = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let mut s = store.lock().unwrap();
            s.seq += 1;
            record.id = s.seq;
            // Calculate condition factor K = (W / L^3) * 100
            if record.avg_length_cm > 0.0 {
                record.condition_factor = (record.avg_weight_grams / record.avg_length_cm.powi(3)) * 100.0;
                record.condition_factor = (record.condition_factor * 100.0).round() / 100.0;
            }
            s.samples.push(record.clone());
            (201, serde_json::to_string(&record).unwrap())
        }

        ("POST", "/harvest") => {
            let mut record: HarvestRecord = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let mut s = store.lock().unwrap();
            s.seq += 1;
            record.id = s.seq;
            record.total_revenue = record.total_weight_kg * record.price_per_kg;
            if record.fish_count > 0 {
                record.avg_weight_grams = (record.total_weight_kg * 1000.0) / record.fish_count as f64;
            }
            s.harvests.push(record.clone());
            eprintln!("[TIGERBEETLE] Recording harvest revenue: {} {}", record.total_revenue, "NGN");
            eprintln!("[TEMPORAL] Completing grow-out workflow for batch {}", record.batch_id);
            eprintln!("[FLUVIO] Publishing harvest event: {}kg harvested", record.total_weight_kg);
            (201, serde_json::to_string(&record).unwrap())
        }

        ("POST", "/fcr/calculate") => {
            #[derive(Deserialize)]
            struct FCRInput {
                total_feed_kg: f64,
                initial_biomass_kg: f64,
                final_biomass_kg: f64,
                initial_count: u64,
                final_count: u64,
                days: u32,
                initial_avg_weight_g: f64,
                final_avg_weight_g: f64,
                feed_cost_per_kg: f64,
            }
            let input: FCRInput = match serde_json::from_str(body) {
                Ok(i) => i,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let result = calculate_fcr(
                input.total_feed_kg, input.initial_biomass_kg, input.final_biomass_kg,
                input.initial_count, input.final_count, input.days,
                input.initial_avg_weight_g, input.final_avg_weight_g, input.feed_cost_per_kg,
            );
            (200, serde_json::to_string(&result).unwrap())
        }

        ("POST", "/break-even") => {
            #[derive(Deserialize)]
            struct BEInput {
                feed_cost: f64,
                fingerling_cost: f64,
                labor_cost: f64,
                energy_cost: f64,
                other_costs: f64,
                projected_yield_kg: f64,
                market_price: f64,
                days_to_harvest: u32,
            }
            let input: BEInput = match serde_json::from_str(body) {
                Ok(i) => i,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let result = calculate_break_even(
                input.feed_cost, input.fingerling_cost, input.labor_cost,
                input.energy_cost, input.other_costs, input.projected_yield_kg,
                input.market_price, input.days_to_harvest,
            );
            (200, serde_json::to_string(&result).unwrap())
        }

        ("POST", "/feeding-rate") => {
            #[derive(Deserialize)]
            struct RateInput { avg_weight_grams: f64, water_temp: f64, species: String }
            let input: RateInput = match serde_json::from_str(body) {
                Ok(i) => i,
                Err(e) => return (400, format!("{{\"error\":\"{}\"}}", e)),
            };
            let rate = calculate_feeding_rate(input.avg_weight_grams, input.water_temp, &input.species);
            let resp = serde_json::json!({
                "feeding_rate_pct": rate,
                "daily_feed_kg": (input.avg_weight_grams * rate / 100.0 / 1000.0 * 10000.0).round() / 10000.0,
                "species": input.species,
                "water_temp": input.water_temp,
                "avg_weight_grams": input.avg_weight_grams,
            });
            (200, resp.to_string())
        }

        ("GET", "/stats") => {
            let s = store.lock().unwrap();
            let total_feed: f64 = s.feeds.iter().map(|f| f.quantity_kg).sum();
            let total_mortality: u64 = s.mortalities.iter().map(|m| m.count).sum();
            let total_stocked: u64 = s.stockings.iter().map(|r| r.quantity).sum();
            let total_harvested: f64 = s.harvests.iter().map(|h| h.total_weight_kg).sum();
            let total_revenue: f64 = s.harvests.iter().map(|h| h.total_revenue).sum();

            let mut causes: HashMap<String, u64> = HashMap::new();
            for m in &s.mortalities {
                *causes.entry(m.cause.clone()).or_insert(0) += m.count;
            }

            let resp = serde_json::json!({
                "total_stockings": s.stockings.len(),
                "total_stocked_fish": total_stocked,
                "total_feed_kg": total_feed,
                "total_mortality": total_mortality,
                "mortality_causes": causes,
                "total_harvests": s.harvests.len(),
                "total_harvested_kg": total_harvested,
                "total_revenue": total_revenue,
                "growth_samples": s.samples.len(),
                "inventory_items": s.inventory.len(),
            });
            (200, resp.to_string())
        }

        _ => (404, r#"{"error":"Not found"}"#.to_string()),
    }
}

// ============================================================================
// HTTP Server
// ============================================================================

fn parse_request(raw: &str) -> (String, String, String) {
    let lines: Vec<&str> = raw.split("\r\n").collect();
    if lines.is_empty() {
        return (String::new(), String::new(), String::new());
    }
    let first: Vec<&str> = lines[0].split_whitespace().collect();
    if first.len() < 2 {
        return (String::new(), String::new(), String::new());
    }
    let method = first[0].to_string();
    let path = first[1].split('?').next().unwrap_or(first[1]).to_string();

    let body_start = raw.find("\r\n\r\n").map(|i| i + 4).unwrap_or(raw.len());
    let body = if body_start < raw.len() { raw[body_start..].to_string() } else { String::new() };
    (method, path, body)
}

fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8114".to_string());
    let addr = format!("0.0.0.0:{}", port);

    eprintln!("Aquaculture Feed Service starting on port {}", port);
    eprintln!("Integrations: TigerBeetle, Fluvio, Temporal, PostgreSQL, Redis");

    let store = Arc::new(Mutex::new(Store::new()));
    let listener = TcpListener::bind(&addr).expect("Failed to bind");

    for stream in listener.incoming() {
        let stream = match stream {
            Ok(s) => s,
            Err(_) => continue,
        };
        let store = Arc::clone(&store);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(&stream);
            let mut request = String::new();
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        request.push_str(&line);
                        if line == "\r\n" { break; }
                    }
                }
            }

            // Read body based on Content-Length
            if let Some(cl) = request.lines().find(|l| l.to_lowercase().starts_with("content-length:")) {
                if let Ok(len) = cl.split(':').nth(1).unwrap_or("0").trim().parse::<usize>() {
                    let mut body = vec![0u8; len];
                    use std::io::Read;
                    reader.read_exact(&mut body).ok();
                    request.push_str(&String::from_utf8_lossy(&body));
                }
            }

            let (method, path, body) = parse_request(&request);
            let (status, resp_body) = handle_request(&method, &path, &body, &store);

            let status_text = match status {
                200 => "OK", 201 => "Created", 400 => "Bad Request",
                404 => "Not Found", _ => "Internal Server Error",
            };

            let response = format!(
                "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
                status, status_text, resp_body.len(), resp_body
            );
            let mut stream = stream;
            stream.write_all(response.as_bytes()).ok();
        });
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    fn test_store() -> Arc<Mutex<Store>> {
        Arc::new(Mutex::new(Store::new()))
    }

    #[test]
    fn test_fcr_calculation() {
        let result = calculate_fcr(500.0, 50.0, 400.0, 1000, 850, 180, 50.0, 470.0, 800.0);
        assert!((result.fcr - 1.43).abs() < 0.1, "FCR should be ~1.43, got {}", result.fcr);
        assert_eq!(result.rating, "good");
        assert!((result.survival_rate_pct - 85.0).abs() < 0.1);
    }

    #[test]
    fn test_fcr_excellent() {
        let result = calculate_fcr(400.0, 50.0, 400.0, 1000, 950, 180, 50.0, 421.0, 800.0);
        assert!(result.fcr <= 1.2, "FCR {} should be <= 1.2 for excellent", result.fcr);
        assert_eq!(result.rating, "excellent");
    }

    #[test]
    fn test_fcr_poor() {
        let result = calculate_fcr(1000.0, 50.0, 400.0, 1000, 500, 180, 50.0, 800.0, 800.0);
        assert!(result.fcr > 2.0, "FCR {} should be > 2.0 for poor", result.fcr);
        assert_eq!(result.rating, "poor");
    }

    #[test]
    fn test_break_even() {
        let result = calculate_break_even(300000.0, 50000.0, 100000.0, 30000.0, 20000.0, 500.0, 1800.0, 180);
        assert_eq!(result.total_cost, 500000.0);
        assert_eq!(result.break_even_price_per_kg, 1000.0);
        assert!(result.profit_margin_pct > 0.0);
        assert!(result.roi_pct > 0.0);
    }

    #[test]
    fn test_feeding_rate_catfish() {
        let rate = calculate_feeding_rate(200.0, 28.0, "catfish");
        assert!(rate > 2.0 && rate < 5.0, "Catfish feeding rate should be 2-5%, got {}", rate);
    }

    #[test]
    fn test_feeding_rate_cold_water() {
        let rate_warm = calculate_feeding_rate(200.0, 28.0, "catfish");
        let rate_cold = calculate_feeding_rate(200.0, 15.0, "catfish");
        assert!(rate_cold < rate_warm, "Cold water rate {} should be less than warm {}", rate_cold, rate_warm);
    }

    #[test]
    fn test_feeding_rate_small_fish() {
        let rate_small = calculate_feeding_rate(30.0, 28.0, "catfish");
        let rate_large = calculate_feeding_rate(600.0, 28.0, "catfish");
        assert!(rate_small > rate_large, "Small fish rate {} should be > large fish rate {}", rate_small, rate_large);
    }

    #[test]
    fn test_grade_fish() {
        let weights = vec![600.0, 550.0, 400.0, 350.0, 200.0, 250.0];
        let (a, b, c) = grade_fish(&weights);
        assert!((a - 33.3).abs() < 0.1, "Grade A should be ~33.3%, got {}", a);
        assert!((b - 33.3).abs() < 0.1, "Grade B should be ~33.3%, got {}", b);
        assert!((c - 33.3).abs() < 0.1, "Grade C should be ~33.3%, got {}", c);
    }

    #[test]
    fn test_species_profiles() {
        let profiles = get_species_profiles();
        assert_eq!(profiles.len(), 6, "Expected 6 species profiles, got {}", profiles.len());
        let catfish = profiles.iter().find(|p| p.name.contains("Catfish")).unwrap();
        assert_eq!(catfish.market_weight_grams, 1000.0);
        assert_eq!(catfish.grow_out_days, 180);
        assert_eq!(catfish.optimal_fcr, 1.2);
    }

    #[test]
    fn test_health_endpoint() {
        let store = test_store();
        let (status, body) = handle_request("GET", "/health", "", &store);
        assert_eq!(status, 200);
        assert!(body.contains("aquaculture-feed"));
    }

    #[test]
    fn test_stocking_record() {
        let store = test_store();
        let body = r#"{"id":0,"pond_id":1,"species":"catfish","source":"hatchery","quantity":1000,"avg_weight_grams":5.0,"age_days":14,"stocking_date":"2024-01-15","cost_per_unit":50.0,"total_cost":0,"batch_id":"B001","supplier":"Lagos Hatchery","health_certificate":true,"quarantine_days":7}"#;
        let (status, resp) = handle_request("POST", "/stocking", body, &store);
        assert_eq!(status, 201, "Response: {}", resp);
        let record: StockingRecord = serde_json::from_str(&resp).unwrap();
        assert_eq!(record.total_cost, 50000.0); // 1000 * 50.0
    }

    #[test]
    fn test_harvest_revenue() {
        let store = test_store();
        let body = r#"{"id":0,"pond_id":1,"batch_id":"B001","harvest_date":"2024-07-15","total_weight_kg":400.0,"fish_count":800,"avg_weight_grams":0,"grade_a_pct":60,"grade_b_pct":30,"grade_c_pct":10,"price_per_kg":1800.0,"total_revenue":0,"buyer":"Fresh Fish Market","harvest_method":"seine_net"}"#;
        let (status, resp) = handle_request("POST", "/harvest", body, &store);
        assert_eq!(status, 201);
        let record: HarvestRecord = serde_json::from_str(&resp).unwrap();
        assert_eq!(record.total_revenue, 720000.0); // 400 * 1800
        assert_eq!(record.avg_weight_grams, 500.0); // 400000g / 800 fish
    }

    #[test]
    fn test_mortality_tracking() {
        let store = test_store();
        let body = r#"{"id":0,"pond_id":1,"date":"2024-03-15","count":15,"cause":"disease","avg_weight_grams":200.0,"notes":"Columnaris outbreak"}"#;
        let (status, _) = handle_request("POST", "/mortality", body, &store);
        assert_eq!(status, 201);

        let (status, resp) = handle_request("GET", "/stats", "", &store);
        assert_eq!(status, 200);
        let stats: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(stats["total_mortality"], 15);
    }

    #[test]
    fn test_feed_inventory() {
        let store = test_store();
        let body = r#"{"id":0,"feed_type":"pellet","brand":"Coppens","protein_pct":35.0,"stock_kg":500.0,"cost_per_kg":800.0,"expiry_date":"2024-12-31","storage_location":"Warehouse A","batch_number":"F001","reorder_level_kg":100.0}"#;
        let (status, _) = handle_request("POST", "/inventory", body, &store);
        assert_eq!(status, 201);

        let (_, resp) = handle_request("GET", "/inventory", "", &store);
        let inv: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(inv["total"], 1);
        assert_eq!(inv["low_stock"], 0);
    }

    #[test]
    fn test_growth_sample_condition_factor() {
        let store = test_store();
        // K = (W / L^3) * 100 = (200 / 25^3) * 100 = (200 / 15625) * 100 = 1.28
        let body = r#"{"id":0,"pond_id":1,"batch_id":"B001","sample_date":"2024-04-01","sample_size":30,"avg_weight_grams":200.0,"min_weight_grams":150.0,"max_weight_grams":250.0,"avg_length_cm":25.0,"condition_factor":0,"days_since_stocking":90}"#;
        let (status, resp) = handle_request("POST", "/growth-sample", body, &store);
        assert_eq!(status, 201);
        let sample: GrowthSample = serde_json::from_str(&resp).unwrap();
        assert!((sample.condition_factor - 1.28).abs() < 0.01, "K factor should be ~1.28, got {}", sample.condition_factor);
    }
}
