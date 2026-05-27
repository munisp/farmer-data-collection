package activities
import ("context"; "encoding/json"; "fmt"; "orchestrator/middleware"; "time")
type MarketplaceActivities struct { mm *middleware.Manager }
func NewMarketplaceActivities(mm *middleware.Manager) *MarketplaceActivities { return &MarketplaceActivities{mm: mm} }
type CreateListingInput struct { UserID int; FarmID int; CropID int; Title string; Description string; Quantity float64; Unit string; PricePerUnit int; Category string }
type CreateListingOutput struct { ListingID int }
func (m *MarketplaceActivities) CreateListing(ctx context.Context, input CreateListingInput) (*CreateListingOutput, error) {
query := "INSERT INTO produce_listings (user_id, farm_id, crop_id, title, description, quantity, unit, price_per_unit, category, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',NOW(),NOW()) RETURNING id"
var listingID int
err := m.mm.PostgresDB.QueryRowContext(ctx, query, input.UserID, input.FarmID, input.CropID, input.Title, input.Description, input.Quantity, input.Unit, input.PricePerUnit, input.Category).Scan(&listingID)
if err != nil { return nil, err }
event := map[string]interface{}{"event_type":"LISTING_CREATED","listing_id":listingID,"title":input.Title,"price":input.PricePerUnit}
eventJSON, _ := json.Marshal(event)
m.mm.PublishEvent(ctx, fmt.Sprintf("listing:%d",listingID), eventJSON)
cacheKey := fmt.Sprintf("listing:%d", listingID)
cacheData, _ := json.Marshal(input)
m.mm.CacheSet(ctx, cacheKey, string(cacheData))
return &CreateListingOutput{ListingID: listingID}, nil
}
type CreateOrderInput struct { BuyerID int; ListingID int; Quantity float64; TotalAmount int }
type CreateOrderOutput struct { OrderID int; PaymentRequired bool }
func (m *MarketplaceActivities) CreateOrder(ctx context.Context, input CreateOrderInput) (*CreateOrderOutput, error) {
query := "INSERT INTO marketplace_orders (buyer_id, listing_id, quantity, total_amount, status, created_at, updated_at) VALUES ($1,$2,$3,$4,'pending',NOW(),NOW()) RETURNING id"
var orderID int
err := m.mm.PostgresDB.QueryRowContext(ctx, query, input.BuyerID, input.ListingID, input.Quantity, input.TotalAmount).Scan(&orderID)
if err != nil { return nil, err }
event := map[string]interface{}{"event_type":"ORDER_CREATED","order_id":orderID,"buyer_id":input.BuyerID,"amount":input.TotalAmount}
eventJSON, _ := json.Marshal(event)
m.mm.PublishEvent(ctx, fmt.Sprintf("order:%d",orderID), eventJSON)
return &CreateOrderOutput{OrderID: orderID, PaymentRequired: true}, nil
}
