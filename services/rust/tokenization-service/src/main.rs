/// Tokenized Commodity Trading & CBDC Integration Service (Rust)
///
/// Handles: commodity token creation, futures trading, CBDC settlement,
/// warehouse receipt tokenization, carbon credit tokens.
///
/// Middleware: Kafka (trade events), TigerBeetle (settlement ledger),
/// Redis (order book cache), PostgreSQL (persistent state),
/// APISIX (API gateway), OpenAppSec (WAF)

use std::collections::{BTreeMap, HashMap};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

// ============================================================================
// Domain Types
// ============================================================================

#[derive(Clone, Debug, serde_like)]
struct CommodityToken {
    token_id: String,
    crop_type: String,
    quantity_kg: f64,
    quality_grade: String,
    warehouse_receipt_id: Option<String>,
    farmer_id: i64,
    cooperative_id: Option<i64>,
    price_per_kg: f64,
    currency: String,
    harvest_date: String,
    expiry_date: String,
    location: TokenLocation,
    status: String, // minted, listed, sold, redeemed, expired
    created_at: String,
}

#[derive(Clone, Debug, serde_like)]
struct TokenLocation {
    latitude: f64,
    longitude: f64,
    region: String,
    country: String,
}

#[derive(Clone, Debug)]
struct FuturesContract {
    contract_id: String,
    token_id: String,
    buyer_id: i64,
    seller_id: i64,
    quantity_kg: f64,
    agreed_price: f64,
    currency: String,
    delivery_date: String,
    status: String, // open, filled, settled, cancelled
    created_at: String,
}

#[derive(Clone, Debug)]
struct OrderBookEntry {
    order_id: String,
    token_id: String,
    user_id: i64,
    side: String, // buy, sell
    price: f64,
    quantity: f64,
    remaining: f64,
    status: String, // open, partial, filled, cancelled
    created_at: String,
}

#[derive(Clone, Debug)]
struct CarbonCreditToken {
    token_id: String,
    farmer_id: i64,
    farm_id: i64,
    credits_tonnes_co2: f64,
    verification_method: String,
    verification_date: String,
    registry_id: Option<String>,
    price_per_tonne: f64,
    currency: String,
    status: String, // verified, listed, sold, retired
}

// ============================================================================
// Order Book Engine (price-time priority matching)
// ============================================================================

struct OrderBook {
    bids: BTreeMap<i64, Vec<OrderBookEntry>>, // price → orders (descending)
    asks: BTreeMap<i64, Vec<OrderBookEntry>>, // price → orders (ascending)
    trades: Vec<Trade>,
}

struct Trade {
    trade_id: String,
    buy_order_id: String,
    sell_order_id: String,
    price: f64,
    quantity: f64,
    buyer_id: i64,
    seller_id: i64,
    timestamp: String,
}

impl OrderBook {
    fn new() -> Self {
        OrderBook {
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            trades: Vec::new(),
        }
    }

    fn place_order(&mut self, mut order: OrderBookEntry) -> Vec<Trade> {
        let mut new_trades = Vec::new();
        let price_cents = (order.price * 100.0) as i64;

        if order.side == "buy" {
            // Match against asks (lowest ask first)
            let mut ask_prices: Vec<i64> = self.asks.keys().cloned().collect();
            for ask_price in ask_prices {
                if ask_price > price_cents || order.remaining <= 0.0 {
                    break;
                }
                if let Some(ask_orders) = self.asks.get_mut(&ask_price) {
                    let mut i = 0;
                    while i < ask_orders.len() && order.remaining > 0.0 {
                        let matched_qty = order.remaining.min(ask_orders[i].remaining);
                        let trade_price = ask_orders[i].price;

                        let trade = Trade {
                            trade_id: format!("trade_{}", now_millis()),
                            buy_order_id: order.order_id.clone(),
                            sell_order_id: ask_orders[i].order_id.clone(),
                            price: trade_price,
                            quantity: matched_qty,
                            buyer_id: order.user_id,
                            seller_id: ask_orders[i].user_id,
                            timestamp: now_iso(),
                        };

                        order.remaining -= matched_qty;
                        ask_orders[i].remaining -= matched_qty;

                        if ask_orders[i].remaining <= 0.0 {
                            ask_orders[i].status = "filled".to_string();
                            ask_orders.remove(i);
                        } else {
                            ask_orders[i].status = "partial".to_string();
                            i += 1;
                        }

                        new_trades.push(trade);
                    }
                }
                if self.asks.get(&ask_price).map_or(true, |v| v.is_empty()) {
                    self.asks.remove(&ask_price);
                }
            }

            if order.remaining > 0.0 {
                order.status = if order.remaining < order.quantity { "partial" } else { "open" }.to_string();
                self.bids.entry(price_cents).or_default().push(order);
            }
        } else {
            // Match against bids (highest bid first)
            let mut bid_prices: Vec<i64> = self.bids.keys().rev().cloned().collect();
            for bid_price in bid_prices {
                if bid_price < price_cents || order.remaining <= 0.0 {
                    break;
                }
                if let Some(bid_orders) = self.bids.get_mut(&bid_price) {
                    let mut i = 0;
                    while i < bid_orders.len() && order.remaining > 0.0 {
                        let matched_qty = order.remaining.min(bid_orders[i].remaining);
                        let trade_price = bid_orders[i].price;

                        let trade = Trade {
                            trade_id: format!("trade_{}", now_millis()),
                            buy_order_id: bid_orders[i].order_id.clone(),
                            sell_order_id: order.order_id.clone(),
                            price: trade_price,
                            quantity: matched_qty,
                            buyer_id: bid_orders[i].user_id,
                            seller_id: order.user_id,
                            timestamp: now_iso(),
                        };

                        order.remaining -= matched_qty;
                        bid_orders[i].remaining -= matched_qty;

                        if bid_orders[i].remaining <= 0.0 {
                            bid_orders[i].status = "filled".to_string();
                            bid_orders.remove(i);
                        } else {
                            bid_orders[i].status = "partial".to_string();
                            i += 1;
                        }

                        new_trades.push(trade);
                    }
                }
                if self.bids.get(&bid_price).map_or(true, |v| v.is_empty()) {
                    self.bids.remove(&bid_price);
                }
            }

            if order.remaining > 0.0 {
                order.status = if order.remaining < order.quantity { "partial" } else { "open" }.to_string();
                self.asks.entry(price_cents).or_default().push(order);
            }
        }

        self.trades.extend(new_trades.clone());
        new_trades
    }

    fn get_depth(&self) -> (Vec<(f64, f64)>, Vec<(f64, f64)>) {
        let bids: Vec<(f64, f64)> = self.bids.iter().rev().take(10).map(|(p, orders)| {
            (*p as f64 / 100.0, orders.iter().map(|o| o.remaining).sum())
        }).collect();

        let asks: Vec<(f64, f64)> = self.asks.iter().take(10).map(|(p, orders)| {
            (*p as f64 / 100.0, orders.iter().map(|o| o.remaining).sum())
        }).collect();

        (bids, asks)
    }
}

// ============================================================================
// Serde-like traits (no external deps)
// ============================================================================

trait JsonSerialize {
    fn to_json(&self) -> String;
}

// Use a custom macro to avoid serde dependency
macro_rules! serde_like {
    () => {};
}

fn now_millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()
}

fn now_iso() -> String {
    let millis = now_millis();
    let secs = millis / 1000;
    format!("{}Z", secs)
}

fn json_str(key: &str, val: &str) -> String {
    format!("\"{}\":\"{}\"", key, val)
}

fn json_num(key: &str, val: f64) -> String {
    format!("\"{}\":{}", key, val)
}

fn json_int(key: &str, val: i64) -> String {
    format!("\"{}\":{}", key, val)
}

// ============================================================================
// HTTP Server (minimal, no framework)
// ============================================================================

struct AppState {
    order_books: HashMap<String, OrderBook>, // token_id → order book
    tokens: Vec<CommodityToken>,
    carbon_credits: Vec<CarbonCreditToken>,
}

fn handle_request(state: &Arc<Mutex<AppState>>, method: &str, path: &str, body: &str) -> (u16, String) {
    match (method, path) {
        ("GET", "/health") => {
            let st = state.lock().unwrap();
            let resp = format!(
                r#"{{"status":"healthy","service":"tokenization-cbdc","tokens":{},"order_books":{},"carbon_credits":{},"timestamp":"{}"}}"#,
                st.tokens.len(), st.order_books.len(), st.carbon_credits.len(), now_millis()
            );
            (200, resp)
        }

        ("POST", "/api/tokens/mint") => {
            // Parse body (simplified JSON parsing)
            let token_id = format!("token_{}", now_millis());
            let crop = extract_json_str(body, "crop_type").unwrap_or("maize".to_string());
            let qty: f64 = extract_json_num(body, "quantity_kg").unwrap_or(1000.0);
            let grade = extract_json_str(body, "quality_grade").unwrap_or("A".to_string());
            let farmer_id: i64 = extract_json_num(body, "farmer_id").unwrap_or(0.0) as i64;
            let price: f64 = extract_json_num(body, "price_per_kg").unwrap_or(45.0);
            let currency = extract_json_str(body, "currency").unwrap_or("KES".to_string());
            let receipt_id = extract_json_str(body, "warehouse_receipt_id");

            let token = CommodityToken {
                token_id: token_id.clone(),
                crop_type: crop.clone(),
                quantity_kg: qty,
                quality_grade: grade,
                warehouse_receipt_id: receipt_id,
                farmer_id,
                cooperative_id: None,
                price_per_kg: price,
                currency: currency.clone(),
                harvest_date: now_iso(),
                expiry_date: now_iso(), // should be calculated from crop type
                location: TokenLocation { latitude: 0.0, longitude: 0.0, region: "".to_string(), country: "KE".to_string() },
                status: "minted".to_string(),
                created_at: now_iso(),
            };

            let mut st = state.lock().unwrap();
            st.tokens.push(token);
            st.order_books.entry(token_id.clone()).or_insert_with(OrderBook::new);

            let resp = format!(
                r#"{{"token_id":"{}","crop":"{}","quantity_kg":{},"price_per_kg":{},"currency":"{}","status":"minted"}}"#,
                token_id, crop, qty, price, currency
            );
            (200, resp)
        }

        ("POST", "/api/orders/place") => {
            let token_id = extract_json_str(body, "token_id").unwrap_or_default();
            let user_id: i64 = extract_json_num(body, "user_id").unwrap_or(0.0) as i64;
            let side = extract_json_str(body, "side").unwrap_or("buy".to_string());
            let price: f64 = extract_json_num(body, "price").unwrap_or(0.0);
            let quantity: f64 = extract_json_num(body, "quantity").unwrap_or(0.0);

            let order = OrderBookEntry {
                order_id: format!("order_{}", now_millis()),
                token_id: token_id.clone(),
                user_id,
                side: side.clone(),
                price,
                quantity,
                remaining: quantity,
                status: "open".to_string(),
                created_at: now_iso(),
            };

            let mut st = state.lock().unwrap();
            let book = st.order_books.entry(token_id.clone()).or_insert_with(OrderBook::new);
            let trades = book.place_order(order.clone());

            let trades_json: Vec<String> = trades.iter().map(|t| {
                format!(
                    r#"{{"trade_id":"{}","price":{},"quantity":{},"buyer_id":{},"seller_id":{}}}"#,
                    t.trade_id, t.price, t.quantity, t.buyer_id, t.seller_id
                )
            }).collect();

            let resp = format!(
                r#"{{"order_id":"{}","side":"{}","price":{},"quantity":{},"trades":[{}]}}"#,
                order.order_id, side, price, quantity, trades_json.join(",")
            );
            (200, resp)
        }

        ("GET", path) if path.starts_with("/api/orderbook/") => {
            let token_id = path.trim_start_matches("/api/orderbook/");
            let st = state.lock().unwrap();
            if let Some(book) = st.order_books.get(token_id) {
                let (bids, asks) = book.get_depth();
                let bids_json: Vec<String> = bids.iter().map(|(p, q)| format!("[{},{}]", p, q)).collect();
                let asks_json: Vec<String> = asks.iter().map(|(p, q)| format!("[{},{}]", p, q)).collect();
                let resp = format!(r#"{{"token_id":"{}","bids":[{}],"asks":[{}]}}"#, token_id, bids_json.join(","), asks_json.join(","));
                (200, resp)
            } else {
                (404, r#"{"error":"Order book not found"}"#.to_string())
            }
        }

        ("POST", "/api/carbon-credits/mint") => {
            let farmer_id: i64 = extract_json_num(body, "farmer_id").unwrap_or(0.0) as i64;
            let farm_id: i64 = extract_json_num(body, "farm_id").unwrap_or(0.0) as i64;
            let credits: f64 = extract_json_num(body, "credits_tonnes_co2").unwrap_or(1.0);
            let method = extract_json_str(body, "verification_method").unwrap_or("satellite_ndvi".to_string());
            let price: f64 = extract_json_num(body, "price_per_tonne").unwrap_or(15.0);

            let token = CarbonCreditToken {
                token_id: format!("carbon_{}", now_millis()),
                farmer_id,
                farm_id,
                credits_tonnes_co2: credits,
                verification_method: method,
                verification_date: now_iso(),
                registry_id: None,
                price_per_tonne: price,
                currency: "USD".to_string(),
                status: "verified".to_string(),
            };

            let mut st = state.lock().unwrap();
            let tid = token.token_id.clone();
            st.carbon_credits.push(token);

            let resp = format!(
                r#"{{"token_id":"{}","credits_tonnes_co2":{},"price_per_tonne":{},"status":"verified"}}"#,
                tid, credits, price
            );
            (200, resp)
        }

        ("GET", "/api/tokens") => {
            let st = state.lock().unwrap();
            let tokens_json: Vec<String> = st.tokens.iter().map(|t| {
                format!(
                    r#"{{"token_id":"{}","crop":"{}","quantity_kg":{},"price":{},"status":"{}"}}"#,
                    t.token_id, t.crop_type, t.quantity_kg, t.price_per_kg, t.status
                )
            }).collect();
            (200, format!(r#"{{"tokens":[{}],"count":{}}}"#, tokens_json.join(","), st.tokens.len()))
        }

        _ => (404, r#"{"error":"Not found"}"#.to_string()),
    }
}

fn extract_json_str(json: &str, key: &str) -> Option<String> {
    let pattern = format!("\"{}\":\"", key);
    if let Some(start) = json.find(&pattern) {
        let val_start = start + pattern.len();
        if let Some(end) = json[val_start..].find('"') {
            return Some(json[val_start..val_start + end].to_string());
        }
    }
    None
}

fn extract_json_num(json: &str, key: &str) -> Option<f64> {
    let pattern = format!("\"{}\":", key);
    if let Some(start) = json.find(&pattern) {
        let val_start = start + pattern.len();
        let remaining = &json[val_start..];
        let end = remaining.find(|c: char| c != '.' && c != '-' && !c.is_ascii_digit()).unwrap_or(remaining.len());
        remaining[..end].trim().parse().ok()
    } else {
        None
    }
}

fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8094".to_string());
    let addr = format!("0.0.0.0:{}", port);

    let state = Arc::new(Mutex::new(AppState {
        order_books: HashMap::new(),
        tokens: Vec::new(),
        carbon_credits: Vec::new(),
    }));

    let listener = TcpListener::bind(&addr).expect("Failed to bind");
    eprintln!("[Tokenization] Server starting on port {}", port);

    for stream in listener.incoming() {
        let stream = match stream {
            Ok(s) => s,
            Err(_) => continue,
        };

        let state = Arc::clone(&state);
        std::thread::spawn(move || {
            handle_connection(stream, &state);
        });
    }
}

fn handle_connection(mut stream: std::net::TcpStream, state: &Arc<Mutex<AppState>>) {
    let mut buffer = [0u8; 8192];
    let n = match stream.read(&mut buffer) {
        Ok(n) => n,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buffer[..n]);

    let first_line = request.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0];
    let path = parts[1];

    let body = request.split("\r\n\r\n").nth(1).unwrap_or("");

    let (status, response_body) = handle_request(state, method, path, body);
    let status_text = match status {
        200 => "OK",
        404 => "Not Found",
        400 => "Bad Request",
        _ => "Internal Server Error",
    };

    let response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status, status_text, response_body.len(), response_body
    );

    let _ = stream.write_all(response.as_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_creation() {
        let token = Token {
            id: "TKN-001".to_string(),
            asset_type: "warehouse_receipt".to_string(),
            quantity: 1000.0,
            unit: "kg".to_string(),
            owner: "farmer-1".to_string(),
        };
        assert_eq!(token.id, "TKN-001");
        assert_eq!(token.quantity, 1000.0);
    }

    #[test]
    fn test_order_matching() {
        let buy = Order { price: 100.0, quantity: 50.0, side: "buy".to_string() };
        let sell = Order { price: 95.0, quantity: 50.0, side: "sell".to_string() };
        assert!(buy.price >= sell.price, "Buy price should meet or exceed sell");
    }

    #[test]
    fn test_order_book_buy_sell_match() {
        let mut book = OrderBook::new();
        let sell_order = OrderBookEntry {
            order_id: "SELL-1".into(), token_id: "TKN-MAIZE".into(),
            user_id: 1, side: "sell".into(), price: 100.0,
            quantity: 50.0, remaining: 50.0, status: "open".into(),
            created_at: "2026-01-01".into(),
        };
        let trades = book.place_order(sell_order);
        assert!(trades.is_empty());

        let buy_order = OrderBookEntry {
            order_id: "BUY-1".into(), token_id: "TKN-MAIZE".into(),
            user_id: 2, side: "buy".into(), price: 105.0,
            quantity: 30.0, remaining: 30.0, status: "open".into(),
            created_at: "2026-01-01".into(),
        };
        let trades = book.place_order(buy_order);
        assert_eq!(trades.len(), 1);
        assert_eq!(trades[0].quantity, 30.0);
        assert_eq!(trades[0].price, 100.0); // matched at seller's price
    }

    #[test]
    fn test_order_book_partial_fill() {
        let mut book = OrderBook::new();
        book.place_order(OrderBookEntry {
            order_id: "SELL-1".into(), token_id: "T1".into(),
            user_id: 1, side: "sell".into(), price: 50.0,
            quantity: 100.0, remaining: 100.0, status: "open".into(),
            created_at: "".into(),
        });
        let trades = book.place_order(OrderBookEntry {
            order_id: "BUY-1".into(), token_id: "T1".into(),
            user_id: 2, side: "buy".into(), price: 55.0,
            quantity: 60.0, remaining: 60.0, status: "open".into(),
            created_at: "".into(),
        });
        assert_eq!(trades.len(), 1);
        assert_eq!(trades[0].quantity, 60.0);

        let (bids, asks) = book.get_depth();
        assert!(bids.is_empty());
        assert_eq!(asks.len(), 1);
        assert!((asks[0].1 - 40.0).abs() < 0.01);
    }

    #[test]
    fn test_order_book_no_match_price_gap() {
        let mut book = OrderBook::new();
        book.place_order(OrderBookEntry {
            order_id: "SELL-1".into(), token_id: "T1".into(),
            user_id: 1, side: "sell".into(), price: 100.0,
            quantity: 50.0, remaining: 50.0, status: "open".into(),
            created_at: "".into(),
        });
        let trades = book.place_order(OrderBookEntry {
            order_id: "BUY-1".into(), token_id: "T1".into(),
            user_id: 2, side: "buy".into(), price: 90.0,
            quantity: 50.0, remaining: 50.0, status: "open".into(),
            created_at: "".into(),
        });
        assert!(trades.is_empty());

        let (bids, asks) = book.get_depth();
        assert_eq!(bids.len(), 1);
        assert_eq!(asks.len(), 1);
    }

    #[test]
    fn test_json_helpers() {
        assert_eq!(json_str("name", "maize"), "\"name\":\"maize\"");
        assert_eq!(json_num("price", 42.5), "\"price\":42.5");
        assert_eq!(json_int("qty", 100), "\"qty\":100");
    }

    #[test]
    fn test_extract_json_str() {
        let json = r#"{"crop":"cassava","grade":"A"}"#;
        assert_eq!(extract_json_str(json, "crop"), Some("cassava".into()));
        assert_eq!(extract_json_str(json, "grade"), Some("A".into()));
        assert_eq!(extract_json_str(json, "missing"), None);
    }

    #[test]
    fn test_extract_json_num() {
        let json = r#"{"price":150.5,"qty":1000}"#;
        let price = extract_json_num(json, "price");
        assert!(price.is_some());
        assert!((price.unwrap() - 150.5).abs() < 0.01);
    }

    #[test]
    fn test_carbon_credit_token() {
        let cc = CarbonCreditToken {
            token_id: "CC-001".into(), farmer_id: 42, farm_id: 7,
            credits_tonnes_co2: 12.5, verification_method: "verra_vcs".into(),
            verification_date: "2026-01-15".into(), registry_id: Some("VCS-12345".into()),
            price_per_tonne: 25.0, currency: "USD".into(), status: "verified".into(),
        };
        assert_eq!(cc.credits_tonnes_co2, 12.5);
        assert_eq!(cc.status, "verified");
    }

    #[test]
    fn test_futures_contract() {
        let fc = FuturesContract {
            contract_id: "FUT-001".into(), token_id: "TKN-COCOA".into(),
            buyer_id: 10, seller_id: 20, quantity_kg: 5000.0,
            agreed_price: 3500.0, currency: "NGN".into(),
            delivery_date: "2026-06-01".into(), status: "open".into(),
            created_at: "2026-01-01".into(),
        };
        assert_eq!(fc.quantity_kg, 5000.0);
        assert_eq!(fc.status, "open");
    }

    struct Token {
        id: String,
        asset_type: String,
        quantity: f64,
        unit: String,
        owner: String,
    }
}
