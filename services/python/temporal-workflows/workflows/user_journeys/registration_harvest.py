"""
User Journey 1: New Farmer Registration & First Harvest
Channel: USSD
Persona: Amina, 35, cassava farmer in Kano, Nigeria
"""
from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy
from dataclasses import dataclass
from typing import Optional

@dataclass
class RegistrationInput:
    phone_number: str
    name: str
    farm_name: str
    farm_size: float
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None

@dataclass
class HarvestInput:
    user_id: int
    crop_type: str
    quantity: float
    unit: str
    price_per_unit: float

@dataclass
class RegistrationHarvestResult:
    user_id: int
    farm_id: int
    harvest_id: int
    verification_code: str
    ledger_entry_id: str
    success: bool
    message: str


@workflow.defn
class RegisterAndHarvestWorkflow:
    """
    Orchestrates new farmer registration and first harvest recording
    
    Steps:
    1. Create user account
    2. Send OTP verification
    3. Verify OTP
    4. Create farm profile
    5. Record first harvest
    6. Create TigerBeetle ledger entry
    7. Send confirmation SMS
    8. Log to Lakehouse
    """
    
    @workflow.run
    async def run(self, registration: RegistrationInput, harvest: HarvestInput) -> RegistrationHarvestResult:
        """Execute the registration and harvest workflow"""
        
        retry_policy = RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(seconds=10),
        )
        
        # Step 1: Create user account
        user_result = await workflow.execute_activity(
            "create_user_account",
            args=[registration.phone_number, registration.name],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        
        if not user_result["success"]:
            return RegistrationHarvestResult(
                user_id=0,
                farm_id=0,
                harvest_id=0,
                verification_code="",
                ledger_entry_id="",
                success=False,
                message=f"Failed to create user: {user_result['error']}"
            )
        
        user_id = user_result["user_id"]
        verification_code = user_result["verification_code"]
        
        # Step 2: Send OTP via SMS
        await workflow.execute_activity(
            "send_otp_sms",
            args=[registration.phone_number, verification_code],
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=retry_policy,
        )
        
        # Step 3: Wait for OTP verification (signal)
        await workflow.wait_condition(lambda: self.otp_verified)
        
        # Step 4: Create farm profile
        farm_result = await workflow.execute_activity(
            "create_farm_profile",
            args=[{
                "user_id": user_id,
                "farm_name": registration.farm_name,
                "farm_size": registration.farm_size,
                "location_lat": registration.location_lat,
                "location_lng": registration.location_lng,
            }],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        
        farm_id = farm_result["farm_id"]
        
        # Step 5: Record first harvest
        harvest.user_id = user_id
        harvest_result = await workflow.execute_activity(
            "record_harvest",
            args=[harvest],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        
        harvest_id = harvest_result["harvest_id"]
        harvest_value = harvest.quantity * harvest.price_per_unit
        
        # Step 6: Create TigerBeetle ledger entry
        ledger_result = await workflow.execute_activity(
            "create_ledger_entry",
            args=[{
                "user_id": user_id,
                "transaction_type": "harvest_income",
                "amount": harvest_value,
                "currency": "NGN",
                "reference": f"harvest_{harvest_id}",
            }],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        
        ledger_entry_id = ledger_result["entry_id"]
        
        # Step 7: Send confirmation SMS
        confirmation_message = (
            f"Welcome {registration.name}! "
            f"Account created. Farm '{registration.farm_name}' registered. "
            f"First harvest recorded: {harvest.quantity}{harvest.unit} {harvest.crop_type} "
            f"worth ₦{harvest_value:,.2f}. ID: {harvest_id}"
        )
        
        await workflow.execute_activity(
            "send_confirmation_sms",
            args=[registration.phone_number, confirmation_message],
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=retry_policy,
        )
        
        # Step 8: Log to Lakehouse for analytics
        await workflow.execute_activity(
            "log_to_lakehouse",
            args=[{
                "event_type": "registration_harvest",
                "user_id": user_id,
                "farm_id": farm_id,
                "harvest_id": harvest_id,
                "harvest_value": harvest_value,
                "channel": "ussd",
                "timestamp": workflow.now(),
            }],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Publish event to Kafka
        await workflow.execute_activity(
            "publish_kafka_event",
            args=["user.registered", {
                "user_id": user_id,
                "phone_number": registration.phone_number,
                "farm_id": farm_id,
                "first_harvest_id": harvest_id,
            }],
            start_to_close_timeout=timedelta(seconds=5),
        )
        
        return RegistrationHarvestResult(
            user_id=user_id,
            farm_id=farm_id,
            harvest_id=harvest_id,
            verification_code=verification_code,
            ledger_entry_id=ledger_entry_id,
            success=True,
            message="Registration and first harvest completed successfully"
        )
    
    def __init__(self) -> None:
        self.otp_verified = False
    
    @workflow.signal
    async def verify_otp(self, code: str) -> None:
        """Signal to verify OTP"""
        # In real implementation, would validate the code
        self.otp_verified = True
