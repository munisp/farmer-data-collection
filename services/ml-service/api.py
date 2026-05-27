"""
ML Service API

Flask REST API for credit scoring and fraud detection
"""

import os
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from credit_scoring import credit_scoring_model, fraud_detection_model

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'ml-service',
    }), 200

@app.route('/api/v1/credit-score', methods=['POST'])
def predict_credit_score():
    """Predict credit score for a user"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        result = credit_scoring_model.predict_credit_score(user_id)
        
        logger.info(f"Credit score prediction for user {user_id}: {result['score']}")
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error predicting credit score: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/fraud-detection', methods=['POST'])
def detect_fraud():
    """Detect fraud in a transaction"""
    try:
        data = request.get_json()
        
        required_fields = ['user_id', 'amount']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'{field} is required'}), 400
        
        result = fraud_detection_model.detect_fraud(data)
        
        logger.info(f"Fraud detection for user {data['user_id']}: {result['risk_level']}")
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error detecting fraud: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/v1/loan-recommendation', methods=['POST'])
def recommend_loan_amount():
    """Recommend loan amount based on credit score"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        # Get credit score
        credit_result = credit_scoring_model.predict_credit_score(user_id)
        score = credit_result['score']
        
        # Calculate recommended loan amount based on score
        if score >= 750:
            max_loan = 5000000  # ₦50,000
            interest_rate = 12.0
        elif score >= 700:
            max_loan = 3000000  # ₦30,000
            interest_rate = 15.0
        elif score >= 650:
            max_loan = 2000000  # ₦20,000
            interest_rate = 18.0
        elif score >= 600:
            max_loan = 1000000  # ₦10,000
            interest_rate = 22.0
        elif score >= 500:
            max_loan = 500000   # ₦5,000
            interest_rate = 25.0
        else:
            max_loan = 0
            interest_rate = 30.0
        
        result = {
            'credit_score': score,
            'risk_category': credit_result['risk_category'],
            'max_loan_amount': max_loan,
            'recommended_interest_rate': interest_rate,
            'terms_available': [6, 12, 18, 24] if max_loan > 0 else [],
            'approval_probability': min(1.0, score / 850),
        }
        
        logger.info(f"Loan recommendation for user {user_id}: ₦{max_loan/100:.2f}")
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error recommending loan: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('ML_SERVICE_PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
