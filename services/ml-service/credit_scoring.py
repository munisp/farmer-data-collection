"""
Credit Scoring ML Service

Machine Learning models for:
- Credit score prediction
- Default risk assessment
- Fraud detection
- Loan amount recommendation

Uses scikit-learn, XGBoost, and TensorFlow
"""

import os
import json
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

# ML Libraries
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import joblib

# Database
import psycopg2
from psycopg2.extras import RealDictCursor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection
def get_db_connection():
    """Get PostgreSQL database connection"""
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', '5432'),
        database=os.getenv('DB_NAME', 'farmer_data'),
        user=os.getenv('DB_USER', 'postgres'),
        password=os.getenv('DB_PASSWORD', 'postgres')
    )

class CreditScoringModel:
    """Credit Scoring ML Model"""
    
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = [
            'repayment_history_score',
            'farm_productivity_score',
            'income_stability_score',
            'debt_to_income_ratio',
            'business_age_months',
            'total_loans',
            'active_loans',
            'total_harvests',
            'avg_harvest_revenue',
            'total_expenses_12m',
            'expense_variance',
        ]
        
    def extract_features(self, user_id: int) -> Optional[Dict]:
        """Extract features for a user from database"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get user info
            cursor.execute("""
                SELECT created_at FROM users WHERE id = %s
            """, (user_id,))
            user = cursor.fetchone()
            
            if not user:
                return None
            
            # Calculate business age
            business_age_months = (datetime.now() - user['created_at']).days / 30.0
            
            # Get loan history
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_loans,
                    COUNT(CASE WHEN status IN ('active', 'approved') THEN 1 END) as active_loans,
                    COUNT(CASE WHEN status = 'paid_off' THEN 1 END) as paid_loans,
                    COUNT(CASE WHEN status = 'defaulted' THEN 1 END) as defaulted_loans
                FROM loans 
                WHERE user_id = %s
            """, (user_id,))
            loan_stats = cursor.fetchone()
            
            # Calculate repayment history score
            repayment_history_score = 50.0  # Default
            if loan_stats['total_loans'] > 0:
                repayment_history_score = (
                    (loan_stats['paid_loans'] / loan_stats['total_loans']) * 100
                ) if loan_stats['total_loans'] > 0 else 50.0
            
            # Get harvest data
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_harvests,
                    AVG(revenue) as avg_revenue,
                    STDDEV(revenue) as revenue_stddev
                FROM harvests 
                WHERE user_id = %s 
                AND harvest_date >= NOW() - INTERVAL '12 months'
            """, (user_id,))
            harvest_stats = cursor.fetchone()
            
            total_harvests = harvest_stats['total_harvests'] or 0
            avg_harvest_revenue = float(harvest_stats['avg_revenue'] or 0)
            revenue_stddev = float(harvest_stats['revenue_stddev'] or 0)
            
            # Farm productivity score
            farm_productivity_score = min(100, (avg_harvest_revenue / 100000) * 100)
            
            # Get expense data
            cursor.execute("""
                SELECT 
                    SUM(amount) as total_expenses,
                    STDDEV(amount) as expense_stddev,
                    AVG(amount) as avg_expense
                FROM expenses 
                WHERE user_id = %s 
                AND expense_date >= NOW() - INTERVAL '12 months'
            """, (user_id,))
            expense_stats = cursor.fetchone()
            
            total_expenses_12m = float(expense_stats['total_expenses'] or 0)
            avg_expense = float(expense_stats['avg_expense'] or 1)
            expense_stddev = float(expense_stats['expense_stddev'] or 0)
            
            # Income stability score (lower variance = higher stability)
            expense_variance = (expense_stddev / avg_expense) if avg_expense > 0 else 1.0
            income_stability_score = max(0, min(100, (1 - expense_variance) * 100))
            
            # Debt-to-income ratio
            cursor.execute("""
                SELECT COALESCE(SUM(outstanding_balance), 0) as total_debt
                FROM loans 
                WHERE user_id = %s 
                AND status IN ('active', 'approved')
            """, (user_id,))
            debt_result = cursor.fetchone()
            total_debt = float(debt_result['total_debt'] or 0)
            
            monthly_income = avg_harvest_revenue / 12 if avg_harvest_revenue > 0 else 1
            debt_to_income_ratio = (total_debt / (monthly_income * 12)) if monthly_income > 0 else 0
            
            cursor.close()
            conn.close()
            
            features = {
                'repayment_history_score': repayment_history_score,
                'farm_productivity_score': farm_productivity_score,
                'income_stability_score': income_stability_score,
                'debt_to_income_ratio': debt_to_income_ratio,
                'business_age_months': business_age_months,
                'total_loans': float(loan_stats['total_loans']),
                'active_loans': float(loan_stats['active_loans']),
                'total_harvests': float(total_harvests),
                'avg_harvest_revenue': avg_harvest_revenue,
                'total_expenses_12m': total_expenses_12m,
                'expense_variance': expense_variance,
            }
            
            logger.info(f"Extracted features for user {user_id}")
            return features
            
        except Exception as e:
            logger.error(f"Error extracting features: {e}")
            return None
    
    def predict_credit_score(self, user_id: int) -> Dict:
        """Predict credit score for a user"""
        features = self.extract_features(user_id)
        
        if not features:
            return {
                'score': 500,
                'risk_category': 'medium',
                'confidence': 0.5,
                'factors': features or {},
            }
        
        # Weighted scoring model (if no trained model available)
        if self.model is None:
            score = (
                features['repayment_history_score'] * 0.35 +
                features['farm_productivity_score'] * 0.25 +
                features['income_stability_score'] * 0.20 +
                (100 - min(100, features['debt_to_income_ratio'] * 100)) * 0.15 +
                min(100, (features['business_age_months'] / 24) * 100) * 0.05
            ) * 8.5  # Scale to 300-850 range
            
            score = max(300, min(850, score))
            confidence = 0.75
        else:
            # Use trained ML model
            feature_vector = [features[name] for name in self.feature_names]
            feature_vector_scaled = self.scaler.transform([feature_vector])
            score = self.model.predict(feature_vector_scaled)[0]
            confidence = 0.85
        
        # Determine risk category
        if score >= 700:
            risk_category = 'low'
        elif score >= 600:
            risk_category = 'medium'
        else:
            risk_category = 'high'
        
        return {
            'score': int(score),
            'risk_category': risk_category,
            'confidence': confidence,
            'factors': features,
        }
    
    def train_model(self, training_data: pd.DataFrame):
        """Train the credit scoring model"""
        logger.info("Training credit scoring model...")
        
        X = training_data[self.feature_names]
        y = training_data['credit_score']
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Train Gradient Boosting model
        self.model = GradientBoostingRegressor(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=5,
            random_state=42
        )
        self.model.fit(X_train_scaled, y_train)
        
        # Evaluate
        train_score = self.model.score(X_train_scaled, y_train)
        test_score = self.model.score(X_test_scaled, y_test)
        
        logger.info(f"Model trained. Train R²: {train_score:.4f}, Test R²: {test_score:.4f}")
        
        # Save model
        joblib.dump(self.model, 'credit_scoring_model.pkl')
        joblib.dump(self.scaler, 'credit_scoring_scaler.pkl')
        
        return {
            'train_score': train_score,
            'test_score': test_score,
        }
    
    def load_model(self):
        """Load trained model from disk"""
        try:
            self.model = joblib.load('credit_scoring_model.pkl')
            self.scaler = joblib.load('credit_scoring_scaler.pkl')
            logger.info("Loaded trained credit scoring model")
        except FileNotFoundError:
            logger.warning("No trained model found, using rule-based scoring")

class FraudDetectionModel:
    """Fraud Detection ML Model"""
    
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = [
            'transaction_amount',
            'hour_of_day',
            'day_of_week',
            'is_weekend',
            'time_since_last_transaction_hours',
            'amount_deviation_from_avg',
            'transaction_count_24h',
            'transaction_count_7d',
            'avg_transaction_amount_30d',
            'account_age_days',
        ]
    
    def extract_transaction_features(self, transaction_data: Dict) -> Dict:
        """Extract features from a transaction"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            user_id = transaction_data['user_id']
            amount = transaction_data['amount']
            timestamp = datetime.now()
            
            # Time features
            hour_of_day = timestamp.hour
            day_of_week = timestamp.weekday()
            is_weekend = 1 if day_of_week >= 5 else 0
            
            # Get user account age
            cursor.execute("""
                SELECT created_at FROM users WHERE id = %s
            """, (user_id,))
            user = cursor.fetchone()
            account_age_days = (timestamp - user['created_at']).days if user else 0
            
            # Get recent transaction history
            cursor.execute("""
                SELECT 
                    transaction_date,
                    amount
                FROM bank_transactions 
                WHERE user_id = %s 
                AND transaction_date >= NOW() - INTERVAL '30 days'
                ORDER BY transaction_date DESC
            """, (user_id,))
            recent_transactions = cursor.fetchall()
            
            # Calculate features
            if recent_transactions:
                last_transaction_time = recent_transactions[0]['transaction_date']
                time_since_last_transaction_hours = (timestamp - last_transaction_time).total_seconds() / 3600
                
                amounts = [float(t['amount']) for t in recent_transactions]
                avg_amount_30d = np.mean(amounts)
                amount_deviation_from_avg = abs(amount - avg_amount_30d) / avg_amount_30d if avg_amount_30d > 0 else 0
                
                # Count transactions in different time windows
                transaction_count_24h = sum(
                    1 for t in recent_transactions 
                    if (timestamp - t['transaction_date']).total_seconds() < 86400
                )
                transaction_count_7d = sum(
                    1 for t in recent_transactions 
                    if (timestamp - t['transaction_date']).days < 7
                )
            else:
                time_since_last_transaction_hours = 0
                amount_deviation_from_avg = 0
                transaction_count_24h = 0
                transaction_count_7d = 0
                avg_amount_30d = 0
            
            cursor.close()
            conn.close()
            
            features = {
                'transaction_amount': float(amount),
                'hour_of_day': float(hour_of_day),
                'day_of_week': float(day_of_week),
                'is_weekend': float(is_weekend),
                'time_since_last_transaction_hours': time_since_last_transaction_hours,
                'amount_deviation_from_avg': amount_deviation_from_avg,
                'transaction_count_24h': float(transaction_count_24h),
                'transaction_count_7d': float(transaction_count_7d),
                'avg_transaction_amount_30d': avg_amount_30d,
                'account_age_days': float(account_age_days),
            }
            
            return features
            
        except Exception as e:
            logger.error(f"Error extracting transaction features: {e}")
            return {}
    
    def detect_fraud(self, transaction_data: Dict) -> Dict:
        """Detect if a transaction is fraudulent"""
        features = self.extract_transaction_features(transaction_data)
        
        if not features:
            return {
                'is_fraud': False,
                'fraud_probability': 0.0,
                'risk_level': 'unknown',
                'reason': 'Unable to extract features',
            }
        
        # Rule-based detection (if no trained model)
        if self.model is None:
            # Simple rules
            fraud_score = 0
            reasons = []
            
            # Large transaction
            if features['transaction_amount'] > 1000000:  # > ₦10,000
                fraud_score += 30
                reasons.append('Large transaction amount')
            
            # Unusual time
            if features['hour_of_day'] < 6 or features['hour_of_day'] > 22:
                fraud_score += 20
                reasons.append('Unusual transaction time')
            
            # High frequency
            if features['transaction_count_24h'] > 10:
                fraud_score += 25
                reasons.append('High transaction frequency')
            
            # Large deviation from average
            if features['amount_deviation_from_avg'] > 5:
                fraud_score += 25
                reasons.append('Amount significantly different from usual')
            
            fraud_probability = min(1.0, fraud_score / 100)
            is_fraud = fraud_probability > 0.7
            
            if fraud_probability > 0.7:
                risk_level = 'high'
            elif fraud_probability > 0.4:
                risk_level = 'medium'
            else:
                risk_level = 'low'
        else:
            # Use trained ML model
            feature_vector = [features[name] for name in self.feature_names]
            feature_vector_scaled = self.scaler.transform([feature_vector])
            fraud_probability = self.model.predict_proba(feature_vector_scaled)[0][1]
            is_fraud = fraud_probability > 0.7
            
            if fraud_probability > 0.7:
                risk_level = 'high'
            elif fraud_probability > 0.4:
                risk_level = 'medium'
            else:
                risk_level = 'low'
            
            reasons = ['ML model prediction']
        
        return {
            'is_fraud': is_fraud,
            'fraud_probability': float(fraud_probability),
            'risk_level': risk_level,
            'reasons': reasons,
            'features': features,
        }
    
    def load_model(self):
        """Load trained model from disk"""
        try:
            self.model = joblib.load('fraud_detection_model.pkl')
            self.scaler = joblib.load('fraud_detection_scaler.pkl')
            logger.info("Loaded trained fraud detection model")
        except FileNotFoundError:
            logger.warning("No trained model found, using rule-based detection")

# Initialize models
credit_scoring_model = CreditScoringModel()
fraud_detection_model = FraudDetectionModel()

# Try to load trained models
credit_scoring_model.load_model()
fraud_detection_model.load_model()

if __name__ == "__main__":
    # Test credit scoring
    logger.info("Testing credit scoring model...")
    result = credit_scoring_model.predict_credit_score(user_id=1)
    logger.info(f"Credit Score Result: {json.dumps(result, indent=2)}")
    
    # Test fraud detection
    logger.info("Testing fraud detection model...")
    test_transaction = {
        'user_id': 1,
        'amount': 500000,  # ₦5,000
    }
    fraud_result = fraud_detection_model.detect_fraud(test_transaction)
    logger.info(f"Fraud Detection Result: {json.dumps(fraud_result, indent=2)}")
