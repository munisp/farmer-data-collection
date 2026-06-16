"""
Credit Scoring Model for Farmer Microfinance

Architecture: Deep neural network for binary classification (will repay / default).
Designed for farmers with thin or no traditional credit files.

Uses platform-specific signals: marketplace activity, cooperative membership,
mobile money usage, farm size, crop diversity, loan history.

Output: probability of repayment (0-1) and risk category.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict


class CreditScorer(nn.Module):
    """
    Deep tabular classifier for farmer credit risk.
    
    Architecture:
        FC(15→128) → BN → LeakyReLU → Dropout →
        FC(128→64) → BN → LeakyReLU → Dropout →
        FC(64→32) → BN → LeakyReLU →
        FC(32→1) → Sigmoid
    
    Input features (15):
        age, years_farming, farm_size_ha, num_crops, has_irrigation,
        cooperative_member, has_insurance, mobile_money_active,
        annual_revenue, savings_balance, previous_loans,
        loans_repaid_on_time, outstanding_debt,
        marketplace_transactions, avg_transaction_value
    """

    INPUT_DIM = 15

    def __init__(self, dropout: float = 0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(self.INPUT_DIM, 128),
            nn.BatchNorm1d(128),
            nn.LeakyReLU(0.1),
            nn.Dropout(dropout),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.LeakyReLU(0.1),
            nn.Dropout(dropout),
            nn.Linear(64, 32),
            nn.BatchNorm1d(32),
            nn.LeakyReLU(0.1),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.net(x))

    def predict(self, x: torch.Tensor) -> Dict:
        self.eval()
        with torch.no_grad():
            prob = self.forward(x).squeeze()
        score = prob.item()
        if score >= 0.8:
            category = "excellent"
        elif score >= 0.6:
            category = "good"
        elif score >= 0.4:
            category = "fair"
        elif score >= 0.2:
            category = "poor"
        else:
            category = "very_poor"

        return {
            "repayment_probability": round(score, 4),
            "risk_category": category,
            "recommended_max_loan_factor": round(min(score * 2, 1.5), 2),
        }

    def get_num_params(self) -> int:
        return sum(p.numel() for p in self.parameters())
