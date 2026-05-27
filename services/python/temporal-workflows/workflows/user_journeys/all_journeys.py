"""
User Journeys 3-10: Complete Workflow Implementations
All workflows with full Temporal orchestration, middleware integration
"""
from datetime import timedelta, datetime, date
from temporalio import workflow
from temporalio.common import RetryPolicy
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

# ============================================================================
# JOURNEY 3: Marketplace Sale via WhatsApp
# ============================================================================

@dataclass
class MarketplaceSaleInput:
    seller_id: int
    product_name: str
    quantity: float
    unit: str
    price_per_unit: float
    photo_url: Optional[str] = None
    description: Optional[str] = None

@workflow.defn
class MarketplaceSaleWorkflow:
    """
    Journey 3: Marketplace Sale via WhatsApp
    Persona: Fatima, 28, tomato farmer in Kaduna
    """
    
    @workflow.run
    async def run(self, sale_input: MarketplaceSaleInput) -> Dict[str, Any]:
        retry_policy = RetryPolicy(maximum_attempts=3)
        
        # Parse WhatsApp message with GPT-4
        parsed_data = await workflow.execute_activity(
            "parse_whatsapp_message_gpt4",
            args=[sale_input],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        
        # Process product image with GPT-4 Vision (quality check)
        if sale_input.photo_url:
            image_analysis = await workflow.execute_activity(
                "analyze_product_image",
                args=[sale_input.photo_url],
                start_to_close_timeout=timedelta(seconds=30),
            )
            quality_score = image_analysis["quality_score"]
        else:
            quality_score = 0
        
        # Create listing
        listing_result = await workflow.execute_activity(
            "create_marketplace_listing",
            args=[{
                "seller_id": sale_input.seller_id,
                "product_name": sale_input.product_name,
                "quantity": sale_input.quantity,
                "price_per_unit": sale_input.price_per_unit,
                "photo_url": sale_input.photo_url,
                "quality_score": quality_score,
            }],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        listing_id = listing_result["listing_id"]
        
        # Send WhatsApp confirmation
        await workflow.execute_activity(
            "send_whatsapp_message",
            args=[sale_input.seller_id, f"✅ Your listing is live! ID: #{listing_id}"],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Wait for buyer inquiry (signal)
        await workflow.wait_condition(lambda: self.buyer_inquiry_received, timeout=timedelta(days=7))
        
        if self.buyer_inquiry_received:
            # Notify seller
            await workflow.execute_activity(
                "send_whatsapp_message",
                args=[sale_input.seller_id, f"Buyer {self.buyer_name} wants {self.buyer_quantity}kg. Accept?"],
                start_to_close_timeout=timedelta(seconds=10),
            )
            
            # Wait for seller acceptance
            await workflow.wait_condition(lambda: self.seller_accepted, timeout=timedelta(hours=24))
            
            if self.seller_accepted:
                # Create order
                order_result = await workflow.execute_activity(
                    "create_marketplace_order",
                    args=[{
                        "listing_id": listing_id,
                        "buyer_id": self.buyer_id,
                        "seller_id": sale_input.seller_id,
                        "quantity": self.buyer_quantity,
                        "price_per_unit": sale_input.price_per_unit,
                    }],
                    start_to_close_timeout=timedelta(seconds=30),
                )
                
                order_id = order_result["order_id"]
                total_amount = self.buyer_quantity * sale_input.price_per_unit
                
                # Initiate escrow with TigerBeetle
                escrow_result = await workflow.execute_activity(
                    "initiate_escrow",
                    args=[{
                        "order_id": order_id,
                        "buyer_id": self.buyer_id,
                        "seller_id": sale_input.seller_id,
                        "amount": total_amount,
                    }],
                    start_to_close_timeout=timedelta(seconds=30),
                )
                
                # Wait for delivery confirmation
                await workflow.wait_condition(lambda: self.delivery_confirmed, timeout=timedelta(days=3))
                
                if self.delivery_confirmed:
                    # Release funds from escrow
                    await workflow.execute_activity(
                        "release_escrow_funds",
                        args=[escrow_result["escrow_id"], sale_input.seller_id],
                        start_to_close_timeout=timedelta(seconds=30),
                    )
                    
                    # Send payment notification
                    await workflow.execute_activity(
                        "send_whatsapp_message",
                        args=[sale_input.seller_id, f"₦{total_amount:,.2f} credited to your account"],
                        start_to_close_timeout=timedelta(seconds=10),
                    )
        
        # Log to Lakehouse
        await workflow.execute_activity(
            "log_to_lakehouse",
            args=[{"event_type": "marketplace_sale", "listing_id": listing_id}],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        return {"success": True, "listing_id": listing_id}
    
    def __init__(self):
        self.buyer_inquiry_received = False
        self.seller_accepted = False
        self.delivery_confirmed = False
        self.buyer_id = 0
        self.buyer_name = ""
        self.buyer_quantity = 0
    
    @workflow.signal
    async def receive_buyer_inquiry(self, buyer_id: int, buyer_name: str, quantity: float):
        self.buyer_inquiry_received = True
        self.buyer_id = buyer_id
        self.buyer_name = buyer_name
        self.buyer_quantity = quantity
    
    @workflow.signal
    async def accept_order(self):
        self.seller_accepted = True
    
    @workflow.signal
    async def confirm_delivery(self):
        self.delivery_confirmed = True


# ============================================================================
# JOURNEY 4: Weather-Based Planting Advisory
# ============================================================================

@workflow.defn
class PlantingAdvisoryWorkflow:
    """
    Journey 4: Weather-Based Planting Advisory
    Persona: Ibrahim, 50, rice farmer in Katsina
    """
    
    @workflow.run
    async def run(self, user_id: int, farm_lat: float, farm_lng: float) -> Dict[str, Any]:
        # Fetch 7-day weather forecast
        weather_data = await workflow.execute_activity(
            "fetch_weather_forecast",
            args=[farm_lat, farm_lng, 7],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        # Analyze planting conditions
        analysis = await workflow.execute_activity(
            "analyze_planting_conditions",
            args=[weather_data],
            start_to_close_timeout=timedelta(seconds=20),
        )
        
        # Send USSD forecast
        forecast_message = f"Rain expected in {analysis['rain_in_days']} days. {analysis['recommendation']}"
        await workflow.execute_activity(
            "send_ussd_response",
            args=[user_id, forecast_message],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Wait for user planting decision
        await workflow.wait_condition(lambda: self.user_decided_to_plant, timeout=timedelta(hours=24))
        
        if self.user_decided_to_plant:
            # Record planting
            planting_result = await workflow.execute_activity(
                "record_planting",
                args=[{
                    "user_id": user_id,
                    "crop_type": self.crop_type,
                    "area": self.planting_area,
                    "planting_date": datetime.now(),
                }],
                start_to_close_timeout=timedelta(seconds=30),
            )
            
            planting_id = planting_result["planting_id"]
            
            # Send planting advisory SMS
            advisory = f"Plant {self.crop_type} seeds 2-3cm deep. Water daily for 7 days."
            await workflow.execute_activity(
                "send_sms",
                args=[user_id, advisory],
                start_to_close_timeout=timedelta(seconds=10),
            )
            
            # Schedule daily watering reminders (7 days)
            for day in range(1, 8):
                await workflow.execute_activity(
                    "schedule_reminder",
                    args=[{
                        "user_id": user_id,
                        "reminder_type": "watering",
                        "message": f"Day {day}: Water your {self.crop_type} seedlings",
                        "send_at": datetime.now() + timedelta(days=day),
                        "channel": "sms",
                    }],
                    start_to_close_timeout=timedelta(seconds=10),
                )
            
            # Schedule follow-up SMS (Day 8)
            await workflow.execute_activity(
                "schedule_reminder",
                args=[{
                    "user_id": user_id,
                    "reminder_type": "follow_up",
                    "message": "Check seedlings. Report any issues via USSD.",
                    "send_at": datetime.now() + timedelta(days=8),
                    "channel": "sms",
                }],
                start_to_close_timeout=timedelta(seconds=10),
            )
            
            return {"success": True, "planting_id": planting_id}
        
        return {"success": False, "message": "User did not plant"}
    
    def __init__(self):
        self.user_decided_to_plant = False
        self.crop_type = ""
        self.planting_area = 0.0
    
    @workflow.signal
    async def confirm_planting(self, crop_type: str, area: float):
        self.user_decided_to_plant = True
        self.crop_type = crop_type
        self.planting_area = area


# ============================================================================
# JOURNEY 5: Loan Application & Repayment
# ============================================================================

@workflow.defn
class LoanApplicationWorkflow:
    """
    Journey 5: Loan Application & Repayment
    Persona: Ngozi, 38, cassava farmer in Anambra
    """
    
    @workflow.run
    async def run(self, user_id: int, loan_amount: float, purpose: str) -> Dict[str, Any]:
        # Parse loan request with GPT-4
        parsed_request = await workflow.execute_activity(
            "parse_loan_request_gpt4",
            args=[loan_amount, purpose],
            start_to_close_timeout=timedelta(seconds=20),
        )
        
        # Calculate credit score using ML service
        credit_score = await workflow.execute_activity(
            "calculate_credit_score",
            args=[user_id],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        # Determine loan offer
        loan_offer = await workflow.execute_activity(
            "determine_loan_offer",
            args=[user_id, loan_amount, credit_score["score"]],
            start_to_close_timeout=timedelta(seconds=20),
        )
        
        if not loan_offer["approved"]:
            await workflow.execute_activity(
                "send_whatsapp_message",
                args=[user_id, f"Loan application declined: {loan_offer['reason']}"],
                start_to_close_timeout=timedelta(seconds=10),
            )
            return {"success": False, "reason": loan_offer["reason"]}
        
        # Send offer via WhatsApp
        offer_message = f"You qualify for ₦{loan_offer['amount']:,.0f} at {loan_offer['interest_rate']}% interest. Accept?"
        await workflow.execute_activity(
            "send_whatsapp_message",
            args=[user_id, offer_message],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Wait for user acceptance
        await workflow.wait_condition(lambda: self.user_accepted, timeout=timedelta(days=3))
        
        if not self.user_accepted:
            return {"success": False, "reason": "User did not accept offer"}
        
        # Create loan account in TigerBeetle
        loan_result = await workflow.execute_activity(
            "create_loan_account",
            args=[{
                "user_id": user_id,
                "amount": loan_offer["amount"],
                "interest_rate": loan_offer["interest_rate"],
                "purpose": purpose,
            }],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        loan_id = loan_result["loan_id"]
        
        # Disburse funds via TigerBeetle
        await workflow.execute_activity(
            "disburse_loan_funds",
            args=[loan_id, user_id, loan_offer["amount"]],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        # Send confirmation
        await workflow.execute_activity(
            "send_whatsapp_message",
            args=[user_id, f"₦{loan_offer['amount']:,.0f} credited to your account!"],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Schedule monthly repayment checks
        await workflow.execute_activity(
            "schedule_monthly_repayment_workflow",
            args=[loan_id, user_id],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        return {"success": True, "loan_id": loan_id}
    
    def __init__(self):
        self.user_accepted = False
    
    @workflow.signal
    async def accept_loan(self):
        self.user_accepted = True


# ============================================================================
# JOURNEY 6: Crop Disease Detection & Treatment
# ============================================================================

@workflow.defn
class CropDiseaseManagementWorkflow:
    """
    Journey 6: Crop Disease Detection & Treatment
    Persona: Adamu, 45, maize farmer in Sokoto
    """
    
    @workflow.run
    async def run(self, user_id: int, crop_id: int, photo_url: str, description: str) -> Dict[str, Any]:
        # Analyze image with GPT-4 Vision
        diagnosis = await workflow.execute_activity(
            "analyze_crop_disease_image",
            args=[photo_url, description],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        # Get ML-based disease diagnosis
        ml_diagnosis = await workflow.execute_activity(
            "diagnose_disease_ml",
            args=[diagnosis],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        disease_name = ml_diagnosis["disease_name"]
        severity = ml_diagnosis["severity"]
        
        # Record disease in database
        disease_result = await workflow.execute_activity(
            "record_crop_disease",
            args=[{
                "user_id": user_id,
                "crop_id": crop_id,
                "disease_name": disease_name,
                "severity": severity,
                "photo_url": photo_url,
                "ai_diagnosis": ml_diagnosis,
            }],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        disease_id = disease_result["disease_id"]
        
        # Get treatment recommendation
        treatment = await workflow.execute_activity(
            "recommend_treatment",
            args=[disease_name, severity],
            start_to_close_timeout=timedelta(seconds=20),
        )
        
        # Send treatment plan via WhatsApp
        treatment_message = f"{disease_name} detected. {treatment['plan']}. Cost: ₦{treatment['estimated_cost']:,.0f}"
        await workflow.execute_activity(
            "send_whatsapp_message",
            args=[user_id, treatment_message],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Wait for purchase intent signal
        await workflow.wait_condition(lambda: self.user_wants_to_purchase, timeout=timedelta(days=2))
        
        if self.user_wants_to_purchase:
            # Show marketplace listings for treatment products
            listings = await workflow.execute_activity(
                "get_marketplace_listings",
                args=[treatment["product_category"]],
                start_to_close_timeout=timedelta(seconds=20),
            )
            
            await workflow.execute_activity(
                "send_whatsapp_message",
                args=[user_id, f"Available products: {listings}"],
                start_to_close_timeout=timedelta(seconds=10),
            )
        
        # Schedule follow-up reminder (7 days)
        await workflow.execute_activity(
            "schedule_reminder",
            args=[{
                "user_id": user_id,
                "reminder_type": "disease_follow_up",
                "message": "Upload new photo to check improvement",
                "send_at": datetime.now() + timedelta(days=7),
                "channel": "whatsapp",
            }],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        return {"success": True, "disease_id": disease_id}
    
    def __init__(self):
        self.user_wants_to_purchase = False
    
    @workflow.signal
    async def purchase_treatment(self):
        self.user_wants_to_purchase = True


# ============================================================================
# JOURNEY 7: Group Savings & Investment
# ============================================================================

@workflow.defn
class GroupSavingsWorkflow:
    """
    Journey 7: Group Savings & Investment
    Persona: Cooperative of 20 farmers in Oyo State
    """
    
    @workflow.run
    async def run(self, leader_id: int, group_name: str, member_count: int) -> Dict[str, Any]:
        # Create group
        group_result = await workflow.execute_activity(
            "create_savings_group",
            args=[leader_id, group_name],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        group_id = group_result["group_id"]
        
        # Invite members via SMS
        for i in range(member_count):
            await workflow.execute_activity(
                "send_group_invitation_sms",
                args=[group_id, f"member_{i}"],
                start_to_close_timeout=timedelta(seconds=10),
            )
        
        # Wait for member acceptances
        await workflow.wait_condition(lambda: len(self.accepted_members) >= member_count * 0.7, timeout=timedelta(days=7))
        
        # Schedule weekly contribution reminders
        await workflow.execute_activity(
            "schedule_weekly_contribution_reminder",
            args=[group_id],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Wait for investment proposal
        await workflow.wait_condition(lambda: self.investment_proposed, timeout=timedelta(days=90))
        
        if self.investment_proposed:
            # Initiate voting via USSD
            await workflow.execute_activity(
                "initiate_group_voting",
                args=[group_id, self.investment_proposal],
                start_to_close_timeout=timedelta(seconds=30),
            )
            
            # Wait for votes
            await workflow.wait_condition(lambda: self.voting_complete, timeout=timedelta(days=7))
            
            if self.votes_yes > self.votes_no:
                # Process investment with TigerBeetle
                await workflow.execute_activity(
                    "process_group_investment",
                    args=[group_id, self.investment_proposal],
                    start_to_close_timeout=timedelta(seconds=30),
                )
        
        return {"success": True, "group_id": group_id}
    
    def __init__(self):
        self.accepted_members = []
        self.investment_proposed = False
        self.voting_complete = False
        self.votes_yes = 0
        self.votes_no = 0
        self.investment_proposal = {}


# ============================================================================
# JOURNEY 8: Insurance Claim Processing
# ============================================================================

@workflow.defn
class InsuranceClaimWorkflow:
    """
    Journey 8: Insurance Claim Processing
    Persona: Halima, 33, rice farmer in Kebbi
    """
    
    @workflow.run
    async def run(self, user_id: int, policy_id: int, damage_type: str, estimated_loss: float) -> Dict[str, Any]:
        # Initiate claim via USSD
        claim_result = await workflow.execute_activity(
            "create_insurance_claim",
            args=[{
                "user_id": user_id,
                "policy_id": policy_id,
                "damage_type": damage_type,
                "claim_amount": estimated_loss,
            }],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        claim_id = claim_result["claim_id"]
        claim_number = claim_result["claim_number"]
        
        # Request photo evidence via SMS
        await workflow.execute_activity(
            "send_sms",
            args=[user_id, f"Send photo to WhatsApp: +234-XXX-XXXX for claim {claim_number}"],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Wait for photo upload
        await workflow.wait_condition(lambda: len(self.uploaded_photos) >= 1, timeout=timedelta(days=3))
        
        # Analyze damage with GPT-4 Vision
        damage_analysis = await workflow.execute_activity(
            "analyze_damage_photos",
            args=[self.uploaded_photos],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        # Calculate claim amount
        approved_amount = await workflow.execute_activity(
            "calculate_claim_amount",
            args=[damage_analysis, estimated_loss],
            start_to_close_timeout=timedelta(seconds=20),
        )
        
        # Assign to agent
        await workflow.execute_activity(
            "assign_claim_to_agent",
            args=[claim_id],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Wait for agent approval
        await workflow.wait_condition(lambda: self.agent_approved, timeout=timedelta(days=5))
        
        if self.agent_approved:
            # Process payment with TigerBeetle
            await workflow.execute_activity(
                "process_insurance_payment",
                args=[claim_id, user_id, approved_amount],
                start_to_close_timeout=timedelta(seconds=30),
            )
            
            # Send confirmation SMS
            await workflow.execute_activity(
                "send_sms",
                args=[user_id, f"Claim approved! ₦{approved_amount:,.0f} will be paid in 3 days"],
                start_to_close_timeout=timedelta(seconds=10),
            )
        
        return {"success": True, "claim_id": claim_id}
    
    def __init__(self):
        self.uploaded_photos = []
        self.agent_approved = False


# ============================================================================
# JOURNEY 9: Market Price Discovery & Negotiation
# ============================================================================

@workflow.defn
class MarketNegotiationWorkflow:
    """
    Journey 9: Market Price Discovery & Negotiation
    Persona: Yusuf, 40, onion farmer in Kano
    """
    
    @workflow.run
    async def run(self, user_id: int, product: str, quantity: float, asking_price: float) -> Dict[str, Any]:
        # Fetch market prices from Lakehouse
        market_prices = await workflow.execute_activity(
            "fetch_market_prices",
            args=[product],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        # Send price SMS
        price_message = f"Avg: ₦{market_prices['avg']}/kg, High: ₦{market_prices['high']}, Low: ₦{market_prices['low']}"
        await workflow.execute_activity(
            "send_sms",
            args=[user_id, price_message],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Create listing
        listing_result = await workflow.execute_activity(
            "create_marketplace_listing",
            args=[{"seller_id": user_id, "product": product, "quantity": quantity, "price": asking_price}],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        listing_id = listing_result["listing_id"]
        
        # Wait for buyer offers
        await workflow.wait_condition(lambda: len(self.buyer_offers) > 0, timeout=timedelta(days=7))
        
        if len(self.buyer_offers) > 0:
            # Notify seller of offers
            offers_message = "\n".join([f"₦{offer['price']}" for offer in self.buyer_offers])
            await workflow.execute_activity(
                "send_whatsapp_message",
                args=[user_id, f"Offers received:\n{offers_message}"],
                start_to_close_timeout=timedelta(seconds=10),
            )
            
            # Wait for counter-offer or acceptance
            await workflow.wait_condition(lambda: self.seller_responded, timeout=timedelta(days=2))
            
            if self.accepted_offer_id:
                # Create order
                order_result = await workflow.execute_activity(
                    "create_marketplace_order",
                    args=[listing_id, self.accepted_offer_id],
                    start_to_close_timeout=timedelta(seconds=30),
                )
                
                # Initiate escrow
                await workflow.execute_activity(
                    "initiate_escrow",
                    args=[order_result["order_id"], self.final_price * quantity],
                    start_to_close_timeout=timedelta(seconds=30),
                )
        
        return {"success": True, "listing_id": listing_id}
    
    def __init__(self):
        self.buyer_offers = []
        self.seller_responded = False
        self.accepted_offer_id = None
        self.final_price = 0


# ============================================================================
# JOURNEY 10: Annual Farm Performance Report
# ============================================================================

@workflow.defn
class AnnualReportWorkflow:
    """
    Journey 10: Annual Farm Performance Report
    Persona: Emeka, 55, multi-crop farmer in Imo
    """
    
    @workflow.run
    async def run(self, user_id: int, year: int) -> Dict[str, Any]:
        # Aggregate year data from Lakehouse
        year_data = await workflow.execute_activity(
            "aggregate_annual_data",
            args=[user_id, year],
            start_to_close_timeout=timedelta(minutes=5),
        )
        
        # Calculate metrics
        metrics = await workflow.execute_activity(
            "calculate_annual_metrics",
            args=[year_data],
            start_to_close_timeout=timedelta(minutes=2),
        )
        
        # Generate charts
        charts = await workflow.execute_activity(
            "generate_report_charts",
            args=[year_data, metrics],
            start_to_close_timeout=timedelta(minutes=3),
        )
        
        # Create PDF report
        pdf_result = await workflow.execute_activity(
            "create_pdf_annual_report",
            args=[user_id, year, metrics, charts],
            start_to_close_timeout=timedelta(minutes=5),
        )
        
        # Generate ML recommendations
        recommendations = await workflow.execute_activity(
            "generate_ml_recommendations",
            args=[year_data, metrics],
            start_to_close_timeout=timedelta(minutes=2),
        )
        
        # Send WhatsApp report
        await workflow.execute_activity(
            "send_whatsapp_document",
            args=[user_id, "📊 Your 2025 Farm Report is ready!", pdf_result["pdf_url"]],
            start_to_close_timeout=timedelta(seconds=30),
        )
        
        # Wait for user to request plan
        await workflow.wait_condition(lambda: self.user_wants_plan, timeout=timedelta(days=30))
        
        if self.user_wants_plan:
            # Generate planting calendar
            calendar = await workflow.execute_activity(
                "generate_planting_calendar",
                args=[user_id, year + 1, recommendations],
                start_to_close_timeout=timedelta(minutes=2),
            )
            
            # Schedule reminders for planting calendar
            await workflow.execute_activity(
                "schedule_planting_reminders",
                args=[user_id, calendar],
                start_to_close_timeout=timedelta(seconds=30),
            )
        
        return {"success": True, "report_url": pdf_result["pdf_url"]}
    
    def __init__(self):
        self.user_wants_plan = False
    
    @workflow.signal
    async def request_planting_plan(self):
        self.user_wants_plan = True
