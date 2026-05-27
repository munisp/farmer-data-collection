-- Migration: Add Marketplace Schema for Selling Produce
-- Date: 2024-11-25
-- Description: Enables farmers to list and sell their produce, buyers to purchase

-- ============================================================================
-- 1. Produce Listings Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS produce_listings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  crop_id INTEGER REFERENCES crops(id) ON DELETE SET NULL,
  
  -- Product Information
  title VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL, -- vegetables, fruits, grains, dairy, meat, eggs, honey
  
  -- Quantity and Pricing
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  unit VARCHAR(20) NOT NULL, -- kg, lbs, units, dozens, liters
  price_per_unit INTEGER NOT NULL CHECK (price_per_unit > 0), -- in cents
  total_price INTEGER NOT NULL CHECK (total_price > 0), -- in cents
  
  -- Certifications
  organic BOOLEAN DEFAULT FALSE,
  certification VARCHAR(100), -- organic, fair_trade, non_gmo, etc.
  
  -- Availability
  available_from DATE,
  available_until DATE,
  
  -- Delivery Options
  delivery_options JSONB DEFAULT '{"pickup": true, "delivery": false, "shipping": false}'::jsonb,
  
  -- Location
  location JSONB, -- {lat, lng, address, city, state, zip}
  
  -- Media
  photos JSONB DEFAULT '[]'::jsonb, -- array of photo URLs
  
  -- Status and Metrics
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'sold_out', 'expired', 'deleted')),
  views INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for produce_listings
CREATE INDEX IF NOT EXISTS idx_produce_listings_user_id ON produce_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_produce_listings_farm_id ON produce_listings(farm_id);
CREATE INDEX IF NOT EXISTS idx_produce_listings_crop_id ON produce_listings(crop_id);
CREATE INDEX IF NOT EXISTS idx_produce_listings_category ON produce_listings(category);
CREATE INDEX IF NOT EXISTS idx_produce_listings_status ON produce_listings(status);
CREATE INDEX IF NOT EXISTS idx_produce_listings_created_at ON produce_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_produce_listings_organic ON produce_listings(organic);

-- ============================================================================
-- 2. Marketplace Orders Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id SERIAL PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Order Information
  order_number VARCHAR(50) UNIQUE NOT NULL,
  total_amount INTEGER NOT NULL CHECK (total_amount > 0), -- in cents
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  
  -- Payment
  payment_method VARCHAR(50), -- card, cash, bank_transfer
  payment_intent_id VARCHAR(100), -- Stripe payment intent ID
  
  -- Delivery
  delivery_method VARCHAR(50), -- pickup, delivery, shipping
  delivery_address JSONB,
  delivery_date DATE,
  delivery_notes TEXT,
  
  -- Communication
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  confirmed_at TIMESTAMP,
  delivered_at TIMESTAMP
);

-- Indexes for marketplace_orders
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer_id ON marketplace_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_seller_id ON marketplace_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status ON marketplace_orders(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_payment_status ON marketplace_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_created_at ON marketplace_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_order_number ON marketplace_orders(order_number);

-- ============================================================================
-- 3. Order Items Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES produce_listings(id) ON DELETE RESTRICT,
  
  -- Snapshot at time of order (prices may change)
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_per_unit INTEGER NOT NULL CHECK (price_per_unit > 0), -- in cents
  total_price INTEGER NOT NULL CHECK (total_price > 0), -- in cents
  
  -- Product snapshot
  product_title VARCHAR(200) NOT NULL,
  product_unit VARCHAR(20) NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_listing_id ON order_items(listing_id);

-- ============================================================================
-- 4. Buyer Profiles Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS buyer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Business Information
  business_name VARCHAR(200),
  business_type VARCHAR(50), -- restaurant, retailer, individual, wholesaler
  phone VARCHAR(20),
  
  -- Delivery Addresses (array of address objects)
  delivery_addresses JSONB DEFAULT '[]'::jsonb,
  default_delivery_address_index INTEGER DEFAULT 0,
  
  -- Preferences
  preferences JSONB DEFAULT '{}'::jsonb, -- {organic_only, delivery_only, max_distance, etc}
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for buyer_profiles
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_user_id ON buyer_profiles(user_id);

-- ============================================================================
-- 5. Marketplace Reviews Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Review Content
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  
  -- Review Type
  review_type VARCHAR(20) CHECK (review_type IN ('seller', 'buyer', 'product')),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for marketplace_reviews
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_order_id ON marketplace_reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_reviewer_id ON marketplace_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_reviewee_id ON marketplace_reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_rating ON marketplace_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_created_at ON marketplace_reviews(created_at DESC);

-- Unique constraint: one review per order per reviewer
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_reviews_unique ON marketplace_reviews(order_id, reviewer_id);

-- ============================================================================
-- 6. Shopping Cart Table (for temporary cart storage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS shopping_cart_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES produce_listings(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for shopping_cart_items
CREATE INDEX IF NOT EXISTS idx_shopping_cart_items_user_id ON shopping_cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_cart_items_listing_id ON shopping_cart_items(listing_id);

-- Unique constraint: one cart item per user per listing
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_cart_items_unique ON shopping_cart_items(user_id, listing_id);

-- ============================================================================
-- 7. Marketplace Messages Table (buyer-seller communication)
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES produce_listings(id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES marketplace_orders(id) ON DELETE SET NULL,
  
  -- Message Content
  subject VARCHAR(200),
  message TEXT NOT NULL,
  
  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for marketplace_messages
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_sender_id ON marketplace_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_recipient_id ON marketplace_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_listing_id ON marketplace_messages(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_order_id ON marketplace_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_read ON marketplace_messages(read);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_created_at ON marketplace_messages(created_at DESC);

-- ============================================================================
-- Migration complete
-- ============================================================================
