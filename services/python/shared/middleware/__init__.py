"""
Middleware Package for Ag-Fintech Platform
Provides idempotent integrations for all middleware services
"""

from .idempotency import (
    IdempotencyService,
    IdempotencyResult,
    ProcessedEventsTracker,
    DistributedLock,
    generate_key,
    generate_transfer_id,
    generate_account_id,
)

from .kafka_client import (
    KafkaClient,
    KafkaConsumer,
    KafkaEvent,
    Topics,
    EventTypes,
    create_event,
    create_deterministic_event,
)

from .redis_client import (
    CacheService,
    RateLimiter,
    SessionStore,
    Session,
)

from .tigerbeetle_client import (
    TigerBeetleClient,
    TigerBeetleAccount,
    TigerBeetleTransfer,
    AccountTypes,
    get_farmer_ledger,
    get_account_id,
    get_transfer_id,
)

from .temporal_client import (
    TemporalClient,
    WorkflowExecution,
    WorkflowStatus,
    TaskQueues,
    LoanApplicationInput,
    DisbursementInput,
    PaymentCollectionInput,
    DataSyncInput,
    NotificationInput,
)

from .keycloak_client import (
    KeycloakClient,
    KeycloakUser,
    has_role,
    has_any_role,
    has_all_roles,
)

from .permify_client import (
    PermifyClient,
    Entity,
    Subject,
    Tuple,
)

from .dapr_client import (
    DaprClient,
    DaprComponents,
    DaprTopics,
)

from .apisix_client import (
    APISIXClient,
    Route,
    Upstream,
    Consumer,
)

from .fluvio_client import (
    FluvioClient,
    FluvioRecord,
    FluvioTopic,
)

__all__ = [
    # Idempotency
    'IdempotencyService',
    'IdempotencyResult',
    'ProcessedEventsTracker',
    'DistributedLock',
    'generate_key',
    'generate_transfer_id',
    'generate_account_id',
    
    # Kafka
    'KafkaClient',
    'KafkaConsumer',
    'KafkaEvent',
    'Topics',
    'EventTypes',
    'create_event',
    'create_deterministic_event',
    
    # Redis
    'CacheService',
    'RateLimiter',
    'SessionStore',
    'Session',
    
    # TigerBeetle
    'TigerBeetleClient',
    'TigerBeetleAccount',
    'TigerBeetleTransfer',
    'AccountTypes',
    'get_farmer_ledger',
    'get_account_id',
    'get_transfer_id',
    
    # Temporal
    'TemporalClient',
    'WorkflowExecution',
    'WorkflowStatus',
    'TaskQueues',
    'LoanApplicationInput',
    'DisbursementInput',
    'PaymentCollectionInput',
    'DataSyncInput',
    'NotificationInput',
    
    # Keycloak
    'KeycloakClient',
    'KeycloakUser',
    'has_role',
    'has_any_role',
    'has_all_roles',
    
    # Permify
    'PermifyClient',
    'Entity',
    'Subject',
    'Tuple',
    
    # Dapr
    'DaprClient',
    'DaprComponents',
    'DaprTopics',
    
    # APISIX
    'APISIXClient',
    'Route',
    'Upstream',
    'Consumer',
    
    # Fluvio
    'FluvioClient',
    'FluvioRecord',
    'FluvioTopic',
]
