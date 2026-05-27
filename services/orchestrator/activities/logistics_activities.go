package activities
import ("context"; "encoding/json"; "fmt"; "orchestrator/middleware")
type LogisticsActivities struct { mm *middleware.Manager }
func NewLogisticsActivities(mm *middleware.Manager) *LogisticsActivities { return &LogisticsActivities{mm: mm} }
type ScheduleDeliveryInput struct { OrderID int; PickupLocation string; DeliveryLocation string; ScheduledDate string }
type ScheduleDeliveryOutput struct { DeliveryID string; EstimatedArrival string }
func (l *LogisticsActivities) ScheduleDelivery(ctx context.Context, input ScheduleDeliveryInput) (*ScheduleDeliveryOutput, error) {
deliveryID := fmt.Sprintf("delivery_%d", input.OrderID)
event := map[string]interface{}{"event_type":"DELIVERY_SCHEDULED","delivery_id":deliveryID,"order_id":input.OrderID}
eventJSON, _ := json.Marshal(event)
l.mm.PublishEvent(ctx, deliveryID, eventJSON)
return &ScheduleDeliveryOutput{DeliveryID: deliveryID, EstimatedArrival: "2 days"}, nil
}
