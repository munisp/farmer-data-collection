package middleware

import (
	"context"
	"fmt"
	"log"
	"time"
)

// WorkflowStatus represents the status of a workflow
type WorkflowStatus string

const (
	WorkflowStatusPending   WorkflowStatus = "pending"
	WorkflowStatusRunning   WorkflowStatus = "running"
	WorkflowStatusCompleted WorkflowStatus = "completed"
	WorkflowStatusFailed    WorkflowStatus = "failed"
	WorkflowStatusCancelled WorkflowStatus = "cancelled"
)

// WorkflowExecution represents a workflow execution
type WorkflowExecution struct {
	WorkflowID string                 `json:"workflow_id"`
	RunID      string                 `json:"run_id"`
	Status     WorkflowStatus         `json:"status"`
	Input      interface{}            `json:"input"`
	Output     interface{}            `json:"output,omitempty"`
	Error      string                 `json:"error,omitempty"`
	StartedAt  time.Time              `json:"started_at"`
	EndedAt    *time.Time             `json:"ended_at,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// TaskQueues defines the available task queues
var TaskQueues = struct {
	LoanProcessing    string
	PaymentCollection string
	DataSync          string
	Notifications     string
	Analytics         string
	OrderProcessing   string
	DataExport        string
	ReportGeneration  string
}{
	LoanProcessing:    "loan-processing-queue",
	PaymentCollection: "payment-collection-queue",
	DataSync:          "data-sync-queue",
	Notifications:     "notifications-queue",
	Analytics:         "analytics-queue",
	OrderProcessing:   "order-processing-queue",
	DataExport:        "data-export-queue",
	ReportGeneration:  "report-generation-queue",
}

// TemporalClient provides idempotent Temporal workflow operations
// This is a stub implementation - replace with actual Temporal client in production
type TemporalClient struct {
	address     string
	namespace   string
	executions  map[string]*WorkflowExecution
	idempotency *IdempotencyService
}

// TemporalConfig holds Temporal configuration
type TemporalConfig struct {
	Address     string
	Namespace   string
	Idempotency *IdempotencyService
}

// NewTemporalClient creates a new idempotent Temporal client
func NewTemporalClient(config TemporalConfig) *TemporalClient {
	if config.Address == "" {
		config.Address = "localhost:7233"
	}
	if config.Namespace == "" {
		config.Namespace = "default"
	}

	return &TemporalClient{
		address:     config.Address,
		namespace:   config.Namespace,
		executions:  make(map[string]*WorkflowExecution),
		idempotency: config.Idempotency,
	}
}

// GenerateWorkflowID generates a deterministic workflow ID for idempotency
func GenerateWorkflowID(workflowType string, identifiers ...interface{}) string {
	return GenerateKey(workflowType, identifiers...)
}

// StartWorkflow starts a workflow with idempotency (returns existing if already running)
func (c *TemporalClient) StartWorkflow(ctx context.Context, workflowID, taskQueue string, input interface{}) (*WorkflowExecution, error) {
	// Check if workflow already exists (idempotent)
	if existing, ok := c.executions[workflowID]; ok {
		log.Printf("[Temporal] Workflow %s already exists with status %s", workflowID, existing.Status)
		return existing, nil
	}

	// Create new workflow execution
	execution := &WorkflowExecution{
		WorkflowID: workflowID,
		RunID:      GenerateKey("run", workflowID, time.Now().UnixNano()),
		Status:     WorkflowStatusRunning,
		Input:      input,
		StartedAt:  time.Now(),
		Metadata: map[string]interface{}{
			"taskQueue": taskQueue,
		},
	}

	c.executions[workflowID] = execution
	log.Printf("[Temporal] Started workflow: %s (queue: %s)", workflowID, taskQueue)

	return execution, nil
}

// GetWorkflowStatus gets the status of a workflow
func (c *TemporalClient) GetWorkflowStatus(ctx context.Context, workflowID string) (*WorkflowExecution, error) {
	execution, ok := c.executions[workflowID]
	if !ok {
		return nil, fmt.Errorf("workflow not found: %s", workflowID)
	}
	return execution, nil
}

// CompleteWorkflow marks a workflow as completed
func (c *TemporalClient) CompleteWorkflow(ctx context.Context, workflowID string, output interface{}) error {
	execution, ok := c.executions[workflowID]
	if !ok {
		return fmt.Errorf("workflow not found: %s", workflowID)
	}

	now := time.Now()
	execution.Status = WorkflowStatusCompleted
	execution.Output = output
	execution.EndedAt = &now

	log.Printf("[Temporal] Completed workflow: %s", workflowID)
	return nil
}

// FailWorkflow marks a workflow as failed
func (c *TemporalClient) FailWorkflow(ctx context.Context, workflowID string, errMsg string) error {
	execution, ok := c.executions[workflowID]
	if !ok {
		return fmt.Errorf("workflow not found: %s", workflowID)
	}

	now := time.Now()
	execution.Status = WorkflowStatusFailed
	execution.Error = errMsg
	execution.EndedAt = &now

	log.Printf("[Temporal] Failed workflow: %s - %s", workflowID, errMsg)
	return nil
}

// CancelWorkflow cancels a running workflow
func (c *TemporalClient) CancelWorkflow(ctx context.Context, workflowID string) error {
	execution, ok := c.executions[workflowID]
	if !ok {
		return fmt.Errorf("workflow not found: %s", workflowID)
	}

	if execution.Status != WorkflowStatusRunning {
		return fmt.Errorf("workflow %s is not running (status: %s)", workflowID, execution.Status)
	}

	now := time.Now()
	execution.Status = WorkflowStatusCancelled
	execution.EndedAt = &now

	log.Printf("[Temporal] Cancelled workflow: %s", workflowID)
	return nil
}

// Loan Processing Workflows

// LoanApplicationInput represents input for loan application workflow
type LoanApplicationInput struct {
	ApplicationID int     `json:"application_id"`
	FarmerID      int     `json:"farmer_id"`
	Amount        float64 `json:"amount"`
	Purpose       string  `json:"purpose"`
	Term          int     `json:"term_months"`
}

// StartLoanApplicationWorkflow starts a loan application workflow with idempotency
func (c *TemporalClient) StartLoanApplicationWorkflow(ctx context.Context, input LoanApplicationInput) (*WorkflowExecution, error) {
	// Generate deterministic workflow ID
	workflowID := GenerateWorkflowID("loan-application", input.ApplicationID)
	return c.StartWorkflow(ctx, workflowID, TaskQueues.LoanProcessing, input)
}

// DisbursementInput represents input for disbursement workflow
type DisbursementInput struct {
	ApplicationID int     `json:"application_id"`
	FarmerID      int     `json:"farmer_id"`
	Amount        float64 `json:"amount"`
	AccountNumber string  `json:"account_number"`
}

// StartDisbursementWorkflow starts a disbursement workflow with idempotency
func (c *TemporalClient) StartDisbursementWorkflow(ctx context.Context, input DisbursementInput) (*WorkflowExecution, error) {
	// Generate deterministic workflow ID
	workflowID := GenerateWorkflowID("disbursement", input.ApplicationID)
	return c.StartWorkflow(ctx, workflowID, TaskQueues.LoanProcessing, input)
}

// PaymentCollectionInput represents input for payment collection workflow
type PaymentCollectionInput struct {
	LoanID            int       `json:"loan_id"`
	FarmerID          int       `json:"farmer_id"`
	InstallmentNumber int       `json:"installment_number"`
	Amount            float64   `json:"amount"`
	DueDate           time.Time `json:"due_date"`
}

// StartPaymentCollectionWorkflow starts a payment collection workflow with idempotency
func (c *TemporalClient) StartPaymentCollectionWorkflow(ctx context.Context, input PaymentCollectionInput) (*WorkflowExecution, error) {
	// Generate deterministic workflow ID (includes installment number for uniqueness)
	workflowID := GenerateWorkflowID("payment-collection", input.LoanID, input.InstallmentNumber)
	return c.StartWorkflow(ctx, workflowID, TaskQueues.PaymentCollection, input)
}

// Data Sync Workflows

// DataSyncInput represents input for data sync workflow
type DataSyncInput struct {
	FarmerID   int       `json:"farmer_id"`
	SyncType   string    `json:"sync_type"` // "full" or "incremental"
	LastSyncAt time.Time `json:"last_sync_at"`
}

// StartDataSyncWorkflow starts a data sync workflow with idempotency
func (c *TemporalClient) StartDataSyncWorkflow(ctx context.Context, input DataSyncInput) (*WorkflowExecution, error) {
	// Generate deterministic workflow ID
	workflowID := GenerateWorkflowID("data-sync", input.FarmerID, input.SyncType)
	return c.StartWorkflow(ctx, workflowID, TaskQueues.DataSync, input)
}

// Notification Workflows

// NotificationInput represents input for notification workflow
type NotificationInput struct {
	RecipientID   int                    `json:"recipient_id"`
	Type          string                 `json:"type"` // "sms", "email", "push"
	Template      string                 `json:"template"`
	Variables     map[string]interface{} `json:"variables"`
	IdempotencyID string                 `json:"idempotency_id"`
}

// StartNotificationWorkflow starts a notification workflow with idempotency
func (c *TemporalClient) StartNotificationWorkflow(ctx context.Context, input NotificationInput) (*WorkflowExecution, error) {
	// Generate deterministic workflow ID using the idempotency ID
	workflowID := GenerateWorkflowID("notification", input.IdempotencyID)
	return c.StartWorkflow(ctx, workflowID, TaskQueues.Notifications, input)
}

// Order Processing Workflows

// OrderProcessingInput represents input for order processing workflow
type OrderProcessingInput struct {
	OrderID  int     `json:"order_id"`
	BuyerID  int     `json:"buyer_id"`
	SellerID int     `json:"seller_id"`
	Amount   float64 `json:"amount"`
}

// StartOrderProcessingWorkflow starts an order processing workflow with idempotency
func (c *TemporalClient) StartOrderProcessingWorkflow(ctx context.Context, input OrderProcessingInput) (*WorkflowExecution, error) {
	// Generate deterministic workflow ID
	workflowID := GenerateWorkflowID("order-processing", input.OrderID)
	return c.StartWorkflow(ctx, workflowID, TaskQueues.OrderProcessing, input)
}

// Report Generation Workflows

// ReportGenerationInput represents input for report generation workflow
type ReportGenerationInput struct {
	ReportType string                 `json:"report_type"`
	FarmerID   int                    `json:"farmer_id,omitempty"`
	StartDate  time.Time              `json:"start_date"`
	EndDate    time.Time              `json:"end_date"`
	Parameters map[string]interface{} `json:"parameters,omitempty"`
}

// StartReportGenerationWorkflow starts a report generation workflow with idempotency
func (c *TemporalClient) StartReportGenerationWorkflow(ctx context.Context, input ReportGenerationInput) (*WorkflowExecution, error) {
	// Generate deterministic workflow ID
	workflowID := GenerateWorkflowID("report", input.ReportType, input.FarmerID, input.StartDate.Unix(), input.EndDate.Unix())
	return c.StartWorkflow(ctx, workflowID, TaskQueues.ReportGeneration, input)
}

// ListWorkflows lists all workflow executions
func (c *TemporalClient) ListWorkflows(ctx context.Context, status *WorkflowStatus) ([]*WorkflowExecution, error) {
	var results []*WorkflowExecution
	for _, exec := range c.executions {
		if status == nil || exec.Status == *status {
			results = append(results, exec)
		}
	}
	return results, nil
}

// Close closes the Temporal client
func (c *TemporalClient) Close() error {
	log.Printf("[Temporal] Client closed")
	return nil
}
