package activities
import ("context"; "encoding/json"; "fmt"; "orchestrator/middleware")
type FinancialActivities struct { mm *middleware.Manager }
func NewFinancialActivities(mm *middleware.Manager) *FinancialActivities { return &FinancialActivities{mm: mm} }
type ProcessPaymentInput struct { OrderID int; Amount int; PayerID int; PayeeID int; PaymentMethod string }
type ProcessPaymentOutput struct { TransactionID string; Status string }
func (f *FinancialActivities) ProcessPayment(ctx context.Context, input ProcessPaymentInput) (*ProcessPaymentOutput, error) {
txID := fmt.Sprintf("tx_%d_%d", input.OrderID, input.Amount)
event := map[string]interface{}{"event_type":"PAYMENT_PROCESSED","transaction_id":txID,"order_id":input.OrderID,"amount":input.Amount,"payer_id":input.PayerID,"payee_id":input.PayeeID,"method":input.PaymentMethod}
eventJSON, _ := json.Marshal(event)
f.mm.PublishEvent(ctx, txID, eventJSON)
query := "UPDATE marketplace_orders SET status='paid', payment_method=$1, updated_at=NOW() WHERE id=$2"
_, err := f.mm.ExecDB(ctx, query, input.PaymentMethod, input.OrderID)
if err != nil { return nil, err }
return &ProcessPaymentOutput{TransactionID: txID, Status: "completed"}, nil
}
type RecordExpenseInput struct { UserID int; FarmID int; CropID int; Category string; Description string; Amount int; PaymentMethod string }
type RecordExpenseOutput struct { ExpenseID int }
func (f *FinancialActivities) RecordExpense(ctx context.Context, input RecordExpenseInput) (*RecordExpenseOutput, error) {
query := "INSERT INTO expenses (user_id, farm_id, crop_id, category, description, amount, expense_date, payment_method, created_at, updated_at, version) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,NOW(),NOW(),1) RETURNING id"
var expenseID int
err := f.mm.PostgresDB.QueryRowContext(ctx, query, input.UserID, input.FarmID, input.CropID, input.Category, input.Description, input.Amount, input.PaymentMethod).Scan(&expenseID)
if err != nil { return nil, err }
event := map[string]interface{}{"event_type":"EXPENSE_RECORDED","expense_id":expenseID,"amount":input.Amount,"category":input.Category}
eventJSON, _ := json.Marshal(event)
f.mm.PublishEvent(ctx, fmt.Sprintf("expense:%d",expenseID), eventJSON)
return &RecordExpenseOutput{ExpenseID: expenseID}, nil
}
