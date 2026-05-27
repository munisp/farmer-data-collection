package activities
import ("context"; "encoding/json"; "fmt"; "orchestrator/middleware")
type NotificationActivities struct { mm *middleware.Manager }
func NewNotificationActivities(mm *middleware.Manager) *NotificationActivities { return &NotificationActivities{mm: mm} }
type SendNotificationInput struct { UserID int; Title string; Message string; Type string; Priority string }
type SendNotificationOutput struct { NotificationID string; Sent bool }
func (n *NotificationActivities) SendNotification(ctx context.Context, input SendNotificationInput) (*SendNotificationOutput, error) {
notifID := fmt.Sprintf("notif_%d_%d", input.UserID, time.Now().Unix())
event := map[string]interface{}{"event_type":"NOTIFICATION_SENT","notification_id":notifID,"user_id":input.UserID,"title":input.Title,"type":input.Type}
eventJSON, _ := json.Marshal(event)
n.mm.PublishEvent(ctx, notifID, eventJSON)
return &SendNotificationOutput{NotificationID: notifID, Sent: true}, nil
}
