"""
TigerBeetle Client for Ag-Fintech Platform
Provides idempotent double-entry bookkeeping operations
"""

import logging
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from .idempotency import IdempotencyService, generate_transfer_id

logger = logging.getLogger(__name__)


@dataclass
class AccountTypes:
    """TigerBeetle account types (matches TypeScript ACCOUNT_TYPES)"""
    CASH: int = 1001
    ACCOUNTS_RECEIVABLE: int = 1002
    INVENTORY: int = 1003
    EQUIPMENT: int = 1004
    ACCOUNTS_PAYABLE: int = 2001
    LOANS_PAYABLE: int = 2002
    OWNER_EQUITY: int = 3001
    RETAINED_EARNINGS: int = 3002
    HARVEST_REVENUE: int = 4001
    LIVESTOCK_REVENUE: int = 4002
    OTHER_REVENUE: int = 4003
    SEED_EXPENSE: int = 5001
    FERTILIZER_EXPENSE: int = 5002
    PESTICIDE_EXPENSE: int = 5003
    LABOR_EXPENSE: int = 5004
    EQUIPMENT_EXPENSE: int = 5005
    UTILITIES_EXPENSE: int = 5006
    OTHER_EXPENSE: int = 5007


@dataclass
class TigerBeetleAccount:
    """Represents a ledger account"""
    id: int
    farmer_id: int
    account_type: int
    ledger: int
    debits_posted: int = 0
    credits_posted: int = 0
    debits_pending: int = 0
    credits_pending: int = 0


@dataclass
class TigerBeetleTransfer:
    """Represents a ledger transfer"""
    id: int
    debit_account_id: int
    credit_account_id: int
    amount: int
    ledger: int
    code: int
    timestamp: int = 0


def get_farmer_ledger(farmer_id: int) -> int:
    """Returns the ledger ID for a farmer"""
    return 1000 + farmer_id


def get_account_id(farmer_id: int, account_type: int) -> int:
    """Generates a deterministic account ID"""
    return farmer_id * 10000 + account_type


def get_transfer_id(farmer_id: int, entity_type: str, entity_id: int, sequence: int) -> int:
    """Generates a deterministic transfer ID for idempotency"""
    return generate_transfer_id(farmer_id, entity_type, entity_id, sequence)


class TigerBeetleClient:
    """
    Provides idempotent TigerBeetle operations.
    This is a mock implementation - replace with actual TigerBeetle client in production.
    """

    def __init__(
        self,
        cluster_id: str = "0",
        replica_addresses: Optional[list] = None,
        idempotency: Optional[IdempotencyService] = None,
    ):
        self.cluster_id = cluster_id
        self.replica_addresses = replica_addresses or ["127.0.0.1:3000"]
        self.idempotency = idempotency
        self.accounts: Dict[int, TigerBeetleAccount] = {}
        self.transfers: Dict[int, TigerBeetleTransfer] = {}

    def create_account(
        self, farmer_id: int, account_type: int
    ) -> TigerBeetleAccount:
        """Create a new account (idempotent - returns existing if already exists)"""
        account_id = get_account_id(farmer_id, account_type)
        ledger = get_farmer_ledger(farmer_id)

        # Check if account already exists (idempotent)
        if account_id in self.accounts:
            logger.info(f"[TigerBeetle] Account {account_id} already exists for farmer {farmer_id}")
            return self.accounts[account_id]

        # Create new account
        account = TigerBeetleAccount(
            id=account_id,
            farmer_id=farmer_id,
            account_type=account_type,
            ledger=ledger,
        )

        self.accounts[account_id] = account
        logger.info(f"[TigerBeetle] Created account {account_id} for farmer {farmer_id} (type: {account_type})")
        return account

    def create_transfer(
        self,
        transfer_id: int,
        debit_account_id: int,
        credit_account_id: int,
        amount: int,
        ledger: int,
        code: int,
    ) -> TigerBeetleTransfer:
        """Create a transfer with idempotency"""
        # Check if transfer already exists (idempotent)
        if transfer_id in self.transfers:
            logger.info(f"[TigerBeetle] Transfer {transfer_id} already exists")
            return self.transfers[transfer_id]

        # Verify accounts exist
        if debit_account_id not in self.accounts:
            raise ValueError(f"Debit account {debit_account_id} not found")
        if credit_account_id not in self.accounts:
            raise ValueError(f"Credit account {credit_account_id} not found")

        # Create transfer
        transfer = TigerBeetleTransfer(
            id=transfer_id,
            debit_account_id=debit_account_id,
            credit_account_id=credit_account_id,
            amount=amount,
            ledger=ledger,
            code=code,
        )

        # Update account balances
        self.accounts[debit_account_id].debits_posted += amount
        self.accounts[credit_account_id].credits_posted += amount

        self.transfers[transfer_id] = transfer
        logger.info(
            f"[TigerBeetle] Created transfer {transfer_id}: "
            f"{debit_account_id} -> {credit_account_id}, amount: {amount}"
        )
        return transfer

    def record_expense(
        self,
        expense_id: int,
        farmer_id: int,
        expense_type: int,
        amount_cents: int,
        is_paid: bool,
    ) -> None:
        """Record an expense with idempotency"""
        ledger = get_farmer_ledger(farmer_id)

        # Ensure accounts exist
        expense_account_id = get_account_id(farmer_id, expense_type)
        cash_account_id = get_account_id(farmer_id, AccountTypes.CASH)
        payable_account_id = get_account_id(farmer_id, AccountTypes.ACCOUNTS_PAYABLE)

        self.create_account(farmer_id, expense_type)
        self.create_account(farmer_id, AccountTypes.CASH)
        self.create_account(farmer_id, AccountTypes.ACCOUNTS_PAYABLE)

        # Generate deterministic transfer ID for idempotency
        transfer_id = get_transfer_id(farmer_id, "expense", expense_id, 0)

        # Determine credit account based on payment status
        credit_account_id = cash_account_id if is_paid else payable_account_id

        self.create_transfer(
            transfer_id, expense_account_id, credit_account_id, amount_cents, ledger, expense_type
        )

    def record_revenue(
        self,
        harvest_id: int,
        farmer_id: int,
        revenue_type: int,
        amount_cents: int,
        is_received: bool,
    ) -> None:
        """Record revenue with idempotency"""
        ledger = get_farmer_ledger(farmer_id)

        # Ensure accounts exist
        revenue_account_id = get_account_id(farmer_id, revenue_type)
        cash_account_id = get_account_id(farmer_id, AccountTypes.CASH)
        receivable_account_id = get_account_id(farmer_id, AccountTypes.ACCOUNTS_RECEIVABLE)

        self.create_account(farmer_id, revenue_type)
        self.create_account(farmer_id, AccountTypes.CASH)
        self.create_account(farmer_id, AccountTypes.ACCOUNTS_RECEIVABLE)

        # Generate deterministic transfer ID for idempotency
        transfer_id = get_transfer_id(farmer_id, "revenue", harvest_id, 0)

        # Determine debit account based on receipt status
        debit_account_id = cash_account_id if is_received else receivable_account_id

        self.create_transfer(
            transfer_id, debit_account_id, revenue_account_id, amount_cents, ledger, revenue_type
        )

    def record_loan_disbursement(
        self, loan_id: int, farmer_id: int, amount_cents: int
    ) -> None:
        """Record a loan disbursement with idempotency"""
        ledger = get_farmer_ledger(farmer_id)

        # Ensure accounts exist
        cash_account_id = get_account_id(farmer_id, AccountTypes.CASH)
        loans_payable_id = get_account_id(farmer_id, AccountTypes.LOANS_PAYABLE)

        self.create_account(farmer_id, AccountTypes.CASH)
        self.create_account(farmer_id, AccountTypes.LOANS_PAYABLE)

        # Generate deterministic transfer ID for idempotency
        transfer_id = get_transfer_id(farmer_id, "loan_disbursement", loan_id, 0)

        # Debit cash (increase), credit loans payable (increase liability)
        self.create_transfer(
            transfer_id, cash_account_id, loans_payable_id, amount_cents, ledger, AccountTypes.LOANS_PAYABLE
        )

    def record_loan_repayment(
        self, loan_id: int, farmer_id: int, installment_number: int, amount_cents: int
    ) -> None:
        """Record a loan repayment with idempotency"""
        ledger = get_farmer_ledger(farmer_id)

        # Ensure accounts exist
        cash_account_id = get_account_id(farmer_id, AccountTypes.CASH)
        loans_payable_id = get_account_id(farmer_id, AccountTypes.LOANS_PAYABLE)

        self.create_account(farmer_id, AccountTypes.CASH)
        self.create_account(farmer_id, AccountTypes.LOANS_PAYABLE)

        # Generate deterministic transfer ID for idempotency (includes installment number)
        transfer_id = get_transfer_id(farmer_id, "loan_repayment", loan_id, installment_number)

        # Debit loans payable (decrease liability), credit cash (decrease)
        self.create_transfer(
            transfer_id, loans_payable_id, cash_account_id, amount_cents, ledger, AccountTypes.LOANS_PAYABLE
        )

    def get_account_balance(
        self, farmer_id: int, account_type: int
    ) -> Tuple[int, int, int]:
        """Returns (debits, credits, balance) for an account"""
        account_id = get_account_id(farmer_id, account_type)

        if account_id not in self.accounts:
            return 0, 0, 0

        account = self.accounts[account_id]
        debits = account.debits_posted
        credits = account.credits_posted
        balance = debits - credits

        return debits, credits, balance

    def calculate_profit_loss(
        self, farmer_id: int
    ) -> Tuple[int, int, int]:
        """Calculate profit/loss for a farmer. Returns (total_revenue, total_expenses, profit_loss)"""
        # Get all revenue accounts
        _, harvest_credits, _ = self.get_account_balance(farmer_id, AccountTypes.HARVEST_REVENUE)
        _, livestock_credits, _ = self.get_account_balance(farmer_id, AccountTypes.LIVESTOCK_REVENUE)
        _, other_credits, _ = self.get_account_balance(farmer_id, AccountTypes.OTHER_REVENUE)

        total_revenue = harvest_credits + livestock_credits + other_credits

        # Get all expense accounts
        seed_debits, _, _ = self.get_account_balance(farmer_id, AccountTypes.SEED_EXPENSE)
        fertilizer_debits, _, _ = self.get_account_balance(farmer_id, AccountTypes.FERTILIZER_EXPENSE)
        pesticide_debits, _, _ = self.get_account_balance(farmer_id, AccountTypes.PESTICIDE_EXPENSE)
        labor_debits, _, _ = self.get_account_balance(farmer_id, AccountTypes.LABOR_EXPENSE)
        equipment_debits, _, _ = self.get_account_balance(farmer_id, AccountTypes.EQUIPMENT_EXPENSE)
        utilities_debits, _, _ = self.get_account_balance(farmer_id, AccountTypes.UTILITIES_EXPENSE)
        other_debits, _, _ = self.get_account_balance(farmer_id, AccountTypes.OTHER_EXPENSE)

        total_expenses = (
            seed_debits + fertilizer_debits + pesticide_debits +
            labor_debits + equipment_debits + utilities_debits + other_debits
        )
        profit_loss = total_revenue - total_expenses

        return total_revenue, total_expenses, profit_loss

    def initialize_farmer_accounts(self, farmer_id: int) -> None:
        """Create all standard accounts for a farmer"""
        account_types = [
            AccountTypes.CASH,
            AccountTypes.ACCOUNTS_RECEIVABLE,
            AccountTypes.INVENTORY,
            AccountTypes.EQUIPMENT,
            AccountTypes.ACCOUNTS_PAYABLE,
            AccountTypes.LOANS_PAYABLE,
            AccountTypes.OWNER_EQUITY,
            AccountTypes.RETAINED_EARNINGS,
            AccountTypes.HARVEST_REVENUE,
            AccountTypes.LIVESTOCK_REVENUE,
            AccountTypes.OTHER_REVENUE,
            AccountTypes.SEED_EXPENSE,
            AccountTypes.FERTILIZER_EXPENSE,
            AccountTypes.PESTICIDE_EXPENSE,
            AccountTypes.LABOR_EXPENSE,
            AccountTypes.EQUIPMENT_EXPENSE,
            AccountTypes.UTILITIES_EXPENSE,
            AccountTypes.OTHER_EXPENSE,
        ]

        for account_type in account_types:
            self.create_account(farmer_id, account_type)

        logger.info(f"[TigerBeetle] Initialized all accounts for farmer {farmer_id}")
