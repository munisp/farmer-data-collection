package activities

import (
auth_activities.go "context"
auth_activities.go "encoding/json"
auth_activities.go "fmt"
auth_activities.go "orchestrator/middleware"
auth_activities.go "time"
)

type FarmActivities struct {
auth_activities.go mm *middleware.Manager
}

func NewFarmActivities(mm *middleware.Manager) *FarmActivities {
auth_activities.go return &FarmActivities{mm: mm}
}

type CreateFarmInput struct {
auth_activities.go UserID          int
auth_activities.go FarmerID        int
auth_activities.go FarmName        string
auth_activities.go FarmSize        float64
auth_activities.go FarmSizeUnit    string
auth_activities.go Location        string
auth_activities.go Latitude        float64
auth_activities.go Longitude       float64
auth_activities.go SoilType        string
auth_activities.go IrrigationType  string
}

type CreateFarmOutput struct {
auth_activities.go FarmID int
}

func (f *FarmActivities) CreateFarm(ctx context.Context, input CreateFarmInput) (*CreateFarmOutput, error) {
auth_activities.go query := `INSERT INTO farms (user_id, farmer_id, farm_name, farm_size, farm_size_unit, location, latitude, longitude, soil_type, irrigation_type, created_at, updated_at, version)
auth_activities.go           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1) RETURNING id`
auth_activities.go 
auth_activities.go now := time.Now()
auth_activities.go var farmID int
auth_activities.go err := f.mm.PostgresDB.QueryRowContext(ctx, query,
auth_activities.go auth_activities.go input.UserID, input.FarmerID, input.FarmName, input.FarmSize, input.FarmSizeUnit,
auth_activities.go auth_activities.go input.Location, input.Latitude, input.Longitude, input.SoilType, input.IrrigationType,
auth_activities.go auth_activities.go now, now).Scan(&farmID)
auth_activities.go 
auth_activities.go if err != nil {
auth_activities.go auth_activities.go return nil, fmt.Errorf("failed to create farm: %w", err)
auth_activities.go }

auth_activities.go // Publish event to Kafka
auth_activities.go event := map[string]interface{}{
auth_activities.go auth_activities.go "event_type": "FARM_CREATED",
auth_activities.go auth_activities.go "farm_id":    farmID,
auth_activities.go auth_activities.go "user_id":    input.UserID,
auth_activities.go auth_activities.go "farm_name":  input.FarmName,
auth_activities.go auth_activities.go "location":   input.Location,
auth_activities.go }
auth_activities.go eventJSON, _ := json.Marshal(event)
auth_activities.go f.mm.PublishEvent(ctx, fmt.Sprintf("farm:%d", farmID), eventJSON)

auth_activities.go // Save to Dapr state
auth_activities.go stateData, _ := json.Marshal(input)
auth_activities.go f.mm.SaveState(ctx, "farm-state", fmt.Sprintf("farm:%d", farmID), stateData)

auth_activities.go return &CreateFarmOutput{FarmID: farmID}, nil
}

type GetFarmInput struct {
auth_activities.go FarmID int
}

type GetFarmOutput struct {
auth_activities.go FarmID         int
auth_activities.go FarmName       string
auth_activities.go FarmSize       float64
auth_activities.go Location       string
auth_activities.go Latitude       float64
auth_activities.go Longitude      float64
}

func (f *FarmActivities) GetFarm(ctx context.Context, input GetFarmInput) (*GetFarmOutput, error) {
auth_activities.go // Try cache first
auth_activities.go cacheKey := fmt.Sprintf("farm:%d", input.FarmID)
auth_activities.go cached, err := f.mm.CacheGet(ctx, cacheKey)
auth_activities.go if err == nil && cached != "" {
auth_activities.go auth_activities.go var output GetFarmOutput
auth_activities.go auth_activities.go json.Unmarshal([]byte(cached), &output)
auth_activities.go auth_activities.go return &output, nil
auth_activities.go }

auth_activities.go // Query database
auth_activities.go query := "SELECT id, farm_name, farm_size, location, latitude, longitude FROM farms WHERE id = $1"
auth_activities.go row := f.mm.PostgresDB.QueryRowContext(ctx, query, input.FarmID)
auth_activities.go 
auth_activities.go var output GetFarmOutput
auth_activities.go err = row.Scan(&output.FarmID, &output.FarmName, &output.FarmSize, &output.Location, &output.Latitude, &output.Longitude)
auth_activities.go if err != nil {
auth_activities.go auth_activities.go return nil, fmt.Errorf("farm not found: %w", err)
auth_activities.go }

auth_activities.go // Cache result
auth_activities.go cacheData, _ := json.Marshal(output)
auth_activities.go f.mm.CacheSet(ctx, cacheKey, string(cacheData))

auth_activities.go return &output, nil
}
