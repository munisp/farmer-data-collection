package activities
import ("context"; "encoding/json"; "fmt"; "orchestrator/middleware"; "time")
type CropActivities struct { mm *middleware.Manager }
func NewCropActivities(mm *middleware.Manager) *CropActivities { return &CropActivities{mm: mm} }
type CreateCropInput struct { UserID int; FarmID int; CropName string; CropVariety string; PlantingDate time.Time; AreaPlanted float64; Season string; PricePerUnit int }
type CreateCropOutput struct { CropID int }
func (c *CropActivities) CreateCrop(ctx context.Context, input CreateCropInput) (*CreateCropOutput, error) {
query := "INSERT INTO crops (user_id, farm_id, crop_name, crop_variety, planting_date, area_planted, season, price_per_unit, status, created_at, updated_at, version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'planted',NOW(),NOW(),1) RETURNING id"
var cropID int
err := c.mm.PostgresDB.QueryRowContext(ctx, query, input.UserID, input.FarmID, input.CropName, input.CropVariety, input.PlantingDate, input.AreaPlanted, input.Season, input.PricePerUnit).Scan(&cropID)
if err != nil { return nil, err }
event := map[string]interface{}{"event_type":"CROP_PLANTED","crop_id":cropID,"crop_name":input.CropName,"farm_id":input.FarmID}
eventJSON, _ := json.Marshal(event)
c.mm.PublishEvent(ctx, fmt.Sprintf("crop:%d",cropID), eventJSON)
return &CreateCropOutput{CropID: cropID}, nil
}
type RecordHarvestInput struct { CropID int; HarvestDate time.Time; Quantity float64; Unit string; Quality string; MarketPrice int }
type RecordHarvestOutput struct { HarvestID int }
func (c *CropActivities) RecordHarvest(ctx context.Context, input RecordHarvestInput) (*RecordHarvestOutput, error) {
query := "INSERT INTO harvests (user_id, crop_id, harvest_date, quantity, unit, quality, market_price, created_at, updated_at, version) SELECT user_id, $1, $2, $3, $4, $5, $6, NOW(), NOW(), 1 FROM crops WHERE id=$1 RETURNING id"
var harvestID int
err := c.mm.PostgresDB.QueryRowContext(ctx, query, input.CropID, input.HarvestDate, input.Quantity, input.Unit, input.Quality, input.MarketPrice).Scan(&harvestID)
if err != nil { return nil, err }
event := map[string]interface{}{"event_type":"HARVEST_RECORDED","harvest_id":harvestID,"crop_id":input.CropID,"quantity":input.Quantity}
eventJSON, _ := json.Marshal(event)
c.mm.PublishEvent(ctx, fmt.Sprintf("harvest:%d",harvestID), eventJSON)
return &RecordHarvestOutput{HarvestID: harvestID}, nil
}
