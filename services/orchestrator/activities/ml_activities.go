package activities
import ("context"; "encoding/json"; "fmt"; "orchestrator/middleware")
type MLActivities struct { mm *middleware.Manager }
func NewMLActivities(mm *middleware.Manager) *MLActivities { return &MLActivities{mm: mm} }
type PredictYieldInput struct { CropID int; CropName string; AreaPlanted float64; SoilType string; WeatherData map[string]interface{} }
type PredictYieldOutput struct { PredictedYield float64; Confidence float64; Unit string }
func (ml *MLActivities) PredictYield(ctx context.Context, input PredictYieldInput) (*PredictYieldOutput, error) {
predictedYield := input.AreaPlanted * 2.5
confidence := 0.85
result := &PredictYieldOutput{PredictedYield: predictedYield, Confidence: confidence, Unit: "tons"}
event := map[string]interface{}{"event_type":"YIELD_PREDICTED","crop_id":input.CropID,"predicted_yield":predictedYield}
eventJSON, _ := json.Marshal(event)
ml.mm.PublishEvent(ctx, fmt.Sprintf("ml:yield:%d",input.CropID), eventJSON)
cacheKey := fmt.Sprintf("ml:yield:%d", input.CropID)
cacheData, _ := json.Marshal(result)
ml.mm.CacheSet(ctx, cacheKey, string(cacheData))
return result, nil
}
type ForecastPriceInput struct { CropName string; Quantity float64; TargetDate string }
type ForecastPriceOutput struct { ForecastedPrice int; Confidence float64; Recommendation string }
func (ml *MLActivities) ForecastPrice(ctx context.Context, input ForecastPriceInput) (*ForecastPriceOutput, error) {
forecastedPrice := 45000
confidence := 0.78
recommendation := "Hold for 2 weeks for better price"
result := &ForecastPriceOutput{ForecastedPrice: forecastedPrice, Confidence: confidence, Recommendation: recommendation}
event := map[string]interface{}{"event_type":"PRICE_FORECASTED","crop_name":input.CropName,"forecasted_price":forecastedPrice}
eventJSON, _ := json.Marshal(event)
ml.mm.PublishEvent(ctx, fmt.Sprintf("ml:price:%s",input.CropName), eventJSON)
return result, nil
}
