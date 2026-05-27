package middleware

import (
	"context"
	"fmt"
	"log"
	"sync"
)

// TigerBeetle account types (matches TypeScript ACCOUNT_TYPES)
var AccountTypes = struct {
	Cash               uint64
	AccountsReceivable uint64
	Inventory          uint64
	Equipment          uint64
	AccountsPayable    uint64
	LoansPayable       uint64
	OwnerEquity        uint64
	RetainedEarnings   uint64
	HarvestRevenue     uint64
	LivestockRevenue   uint64
	OtherRevenue       uint64
	SeedExpense        uint64
	FertilizerExpense  uint64
	PesticideExpense   uint64
	LaborExpense       uint64
	EquipmentExpense   uint64
	UtilitiesExpense   uint64
	OtherExpense       uint64
}{
	Cash:               1001,
	AccountsReceivable: 1002,
	Inventory:          1003,
	Equipment:          1004,
	AccountsPayable:    2001,
	LoansPayable:       2002,
	OwnerEquity:        3001,
	RetainedEarnings:   3002,
	HarvestRevenue:     4001,
	LivestockRevenue:   4002,
	OtherRevenue:       4003,
	SeedExpense:        5001,
	FertilizerExpense:  5002,
	PesticideExpense:   5003,
	LaborExpense:       5004,
	EquipmentExpense:   5005,
	UtilitiesExpense:   5006,
	OtherExpense:       5007,
}

// TigerBeetleAccount represents a ledger account
type TigerBeetleAccount struct {
	ID             uint64 `json:"id"`
	FarmerID       int    `json:"farmer_id"`
	AccountType    uint64 `json:"account_type"`
	Ledger         int    `json:"ledger"`
	DebitsPosted   uint64 `json:"debits_posted"`
	CreditsPosted  uint64 `json:"credits_posted"`
	DebitsPending  uint64 `json:"debits_pending"`
	CreditsPending uint64 `json:"credits_pending"`
}

// TigerBeetleTransfer represents a ledger transfer
type TigerBeetleTransfer struct {
	ID              uint64 `json:"id"`
	DebitAccountID  uint64 `json:"debit_account_id"`
	CreditAccountID uint64 `json:"credit_account_id"`
	Amount          uint64 `json:"amount"`
	Ledger          int    `json:"ledger"`
	Code            uint64 `json:"code"`
	Timestamp       int64  `json:"timestamp"`
}

// TigerBeetleClient provides idempotent TigerBeetle operations
// This is a mock implementation - replace with actual TigerBeetle client in production
type TigerBeetleClient struct {
	clusterID        string
	replicaAddresses []string
	accounts         map[uint64]*TigerBeetleAccount
	transfers        map[uint64]*TigerBeetleTransfer
	mu               sync.RWMutex
	idempotency      *IdempotencyService
}

// TigerBeetleConfig holds TigerBeetle configuration
type TigerBeetleConfig struct {
	ClusterID        string
	ReplicaAddresses []string
	Idempotency      *IdempotencyService
}

// NewTigerBeetleClient creates a new idempotent TigerBeetle client
func NewTigerBeetleClient(config TigerBeetleConfig) *TigerBeetleClient {
	return &TigerBeetleClient{
		clusterID:        config.ClusterID,
		replicaAddresses: config.ReplicaAddresses,
		accounts:         make(map[uint64]*TigerBeetleAccount),
		transfers:        make(map[uint64]*TigerBeetleTransfer),
		idempotency:      config.Idempotency,
	}
}

// GetFarmerLedger returns the ledger ID for a farmer
func GetFarmerLedger(farmerID int) int {
	return 1000 + farmerID
}

// GetAccountID generates a deterministic account ID
func GetAccountID(farmerID int, accountType uint64) uint64 {
	return uint64(farmerID)*10000 + accountType
}

// GetTransferID generates a deterministic transfer ID for idempotency
func GetTransferID(farmerID int, entityType string, entityID int, sequence int) uint64 {
	return GenerateTransferID(farmerID, entityType, entityID, sequence)
}

// CreateAccount creates a new account (idempotent - returns existing if already exists)
func (c *TigerBeetleClient) CreateAccount(ctx context.Context, farmerID int, accountType uint64) (*TigerBeetleAccount, error) {
	accountID := GetAccountID(farmerID, accountType)
	ledger := GetFarmerLedger(farmerID)

	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if account already exists (idempotent)
	if existing, ok := c.accounts[accountID]; ok {
		log.Printf("[TigerBeetle] Account %d already exists for farmer %d", accountID, farmerID)
		return existing, nil
	}

	// Create new account
	account := &TigerBeetleAccount{
		ID:             accountID,
		FarmerID:       farmerID,
		AccountType:    accountType,
		Ledger:         ledger,
		DebitsPosted:   0,
		CreditsPosted:  0,
		DebitsPending:  0,
		CreditsPending: 0,
	}

	c.accounts[accountID] = account
	log.Printf("[TigerBeetle] Created account %d for farmer %d (type: %d)", accountID, farmerID, accountType)
	return account, nil
}

// CreateTransfer creates a transfer with idempotency
func (c *TigerBeetleClient) CreateTransfer(ctx context.Context, transferID uint64, debitAccountID, creditAccountID, amount uint64, ledger int, code uint64) (*TigerBeetleTransfer, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if transfer already exists (idempotent)
	if existing, ok := c.transfers[transferID]; ok {
		log.Printf("[TigerBeetle] Transfer %d already exists", transferID)
		return existing, nil
	}

	// Verify accounts exist
	debitAccount, ok := c.accounts[debitAccountID]
	if !ok {
		return nil, fmt.Errorf("debit account %d not found", debitAccountID)
	}
	creditAccount, ok := c.accounts[creditAccountID]
	if !ok {
		return nil, fmt.Errorf("credit account %d not found", creditAccountID)
	}

	// Create transfer
	transfer := &TigerBeetleTransfer{
		ID:              transferID,
		DebitAccountID:  debitAccountID,
		CreditAccountID: creditAccountID,
		Amount:          amount,
		Ledger:          ledger,
		Code:            code,
	}

	// Update account balances
	debitAccount.DebitsPosted += amount
	creditAccount.CreditsPosted += amount

	c.transfers[transferID] = transfer
	log.Printf("[TigerBeetle] Created transfer %d: %d -> %d, amount: %d", transferID, debitAccountID, creditAccountID, amount)
	return transfer, nil
}

// RecordExpense records an expense with idempotency
func (c *TigerBeetleClient) RecordExpense(ctx context.Context, expenseID int, farmerID int, expenseType uint64, amountCents uint64, isPaid bool) error {
	ledger := GetFarmerLedger(farmerID)

	// Ensure accounts exist
	expenseAccountID := GetAccountID(farmerID, expenseType)
	cashAccountID := GetAccountID(farmerID, AccountTypes.Cash)
	payableAccountID := GetAccountID(farmerID, AccountTypes.AccountsPayable)

	if _, err := c.CreateAccount(ctx, farmerID, expenseType); err != nil {
		return err
	}
	if _, err := c.CreateAccount(ctx, farmerID, AccountTypes.Cash); err != nil {
		return err
	}
	if _, err := c.CreateAccount(ctx, farmerID, AccountTypes.AccountsPayable); err != nil {
		return err
	}

	// Generate deterministic transfer ID for idempotency
	transferID := GetTransferID(farmerID, "expense", expenseID, 0)

	// Determine credit account based on payment status
	var creditAccountID uint64
	if isPaid {
		creditAccountID = cashAccountID
	} else {
		creditAccountID = payableAccountID
	}

	_, err := c.CreateTransfer(ctx, transferID, expenseAccountID, creditAccountID, amountCents, ledger, expenseType)
	return err
}

// RecordRevenue records revenue with idempotency
func (c *TigerBeetleClient) RecordRevenue(ctx context.Context, harvestID int, farmerID int, revenueType uint64, amountCents uint64, isReceived bool) error {
	ledger := GetFarmerLedger(farmerID)

	// Ensure accounts exist
	revenueAccountID := GetAccountID(farmerID, revenueType)
	cashAccountID := GetAccountID(farmerID, AccountTypes.Cash)
	receivableAccountID := GetAccountID(farmerID, AccountTypes.AccountsReceivable)

	if _, err := c.CreateAccount(ctx, farmerID, revenueType); err != nil {
		return err
	}
	if _, err := c.CreateAccount(ctx, farmerID, AccountTypes.Cash); err != nil {
		return err
	}
	if _, err := c.CreateAccount(ctx, farmerID, AccountTypes.AccountsReceivable); err != nil {
		return err
	}

	// Generate deterministic transfer ID for idempotency
	transferID := GetTransferID(farmerID, "revenue", harvestID, 0)

	// Determine debit account based on receipt status
	var debitAccountID uint64
	if isReceived {
		debitAccountID = cashAccountID
	} else {
		debitAccountID = receivableAccountID
	}

	_, err := c.CreateTransfer(ctx, transferID, debitAccountID, revenueAccountID, amountCents, ledger, revenueType)
	return err
}

// RecordLoanDisbursement records a loan disbursement with idempotency
func (c *TigerBeetleClient) RecordLoanDisbursement(ctx context.Context, loanID int, farmerID int, amountCents uint64) error {
	ledger := GetFarmerLedger(farmerID)

	// Ensure accounts exist
	cashAccountID := GetAccountID(farmerID, AccountTypes.Cash)
	loansPayableID := GetAccountID(farmerID, AccountTypes.LoansPayable)

	if _, err := c.CreateAccount(ctx, farmerID, AccountTypes.Cash); err != nil {
		return err
	}
	if _, err := c.CreateAccount(ctx, farmerID, AccountTypes.LoansPayable); err != nil {
		return err
	}

	// Generate deterministic transfer ID for idempotency
	transferID := GetTransferID(farmerID, "loan_disbursement", loanID, 0)

	// Debit cash (increase), credit loans payable (increase liability)
	_, err := c.CreateTransfer(ctx, transferID, cashAccountID, loansPayableID, amountCents, ledger, AccountTypes.LoansPayable)
	return err
}

// RecordLoanRepayment records a loan repayment with idempotency
func (c *TigerBeetleClient) RecordLoanRepayment(ctx context.Context, loanID int, farmerID int, installmentNumber int, amountCents uint64) error {
	ledger := GetFarmerLedger(farmerID)

	// Ensure accounts exist
	cashAccountID := GetAccountID(farmerID, AccountTypes.Cash)
	loansPayableID := GetAccountID(farmerID, AccountTypes.LoansPayable)

	if _, err := c.CreateAccount(ctx, farmerID, AccountTypes.Cash); err != nil {
		return err
	}
	if _, err := c.CreateAccount(ctx, farmerID, AccountTypes.LoansPayable); err != nil {
		return err
	}

	// Generate deterministic transfer ID for idempotency (includes installment number)
	transferID := GetTransferID(farmerID, "loan_repayment", loanID, installmentNumber)

	// Debit loans payable (decrease liability), credit cash (decrease)
	_, err := c.CreateTransfer(ctx, transferID, loansPayableID, cashAccountID, amountCents, ledger, AccountTypes.LoansPayable)
	return err
}

// GetAccountBalance returns the balance for an account
func (c *TigerBeetleClient) GetAccountBalance(ctx context.Context, farmerID int, accountType uint64) (debits, credits, balance int64, err error) {
	accountID := GetAccountID(farmerID, accountType)

	c.mu.RLock()
	defer c.mu.RUnlock()

	account, ok := c.accounts[accountID]
	if !ok {
		return 0, 0, 0, nil // Account doesn't exist yet
	}

	debits = int64(account.DebitsPosted)
	credits = int64(account.CreditsPosted)
	balance = debits - credits

	return debits, credits, balance, nil
}

// CalculateProfitLoss calculates profit/loss for a farmer
func (c *TigerBeetleClient) CalculateProfitLoss(ctx context.Context, farmerID int) (totalRevenue, totalExpenses, profitLoss int64, err error) {
	// Get all revenue accounts
	_, harvestCredits, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.HarvestRevenue)
	_, livestockCredits, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.LivestockRevenue)
	_, otherCredits, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.OtherRevenue)

	totalRevenue = harvestCredits + livestockCredits + otherCredits

	// Get all expense accounts
	seedDebits, _, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.SeedExpense)
	fertilizerDebits, _, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.FertilizerExpense)
	pesticideDebits, _, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.PesticideExpense)
	laborDebits, _, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.LaborExpense)
	equipmentDebits, _, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.EquipmentExpense)
	utilitiesDebits, _, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.UtilitiesExpense)
	otherDebits, _, _, _ := c.GetAccountBalance(ctx, farmerID, AccountTypes.OtherExpense)

	totalExpenses = seedDebits + fertilizerDebits + pesticideDebits + laborDebits + equipmentDebits + utilitiesDebits + otherDebits
	profitLoss = totalRevenue - totalExpenses

	return totalRevenue, totalExpenses, profitLoss, nil
}

// InitializeFarmerAccounts creates all standard accounts for a farmer
func (c *TigerBeetleClient) InitializeFarmerAccounts(ctx context.Context, farmerID int) error {
	accountTypes := []uint64{
		AccountTypes.Cash,
		AccountTypes.AccountsReceivable,
		AccountTypes.Inventory,
		AccountTypes.Equipment,
		AccountTypes.AccountsPayable,
		AccountTypes.LoansPayable,
		AccountTypes.OwnerEquity,
		AccountTypes.RetainedEarnings,
		AccountTypes.HarvestRevenue,
		AccountTypes.LivestockRevenue,
		AccountTypes.OtherRevenue,
		AccountTypes.SeedExpense,
		AccountTypes.FertilizerExpense,
		AccountTypes.PesticideExpense,
		AccountTypes.LaborExpense,
		AccountTypes.EquipmentExpense,
		AccountTypes.UtilitiesExpense,
		AccountTypes.OtherExpense,
	}

	for _, accountType := range accountTypes {
		if _, err := c.CreateAccount(ctx, farmerID, accountType); err != nil {
			return fmt.Errorf("failed to create account type %d: %w", accountType, err)
		}
	}

	log.Printf("[TigerBeetle] Initialized all accounts for farmer %d", farmerID)
	return nil
}
