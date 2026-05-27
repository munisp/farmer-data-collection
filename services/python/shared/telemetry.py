"""
OpenTelemetry Distributed Tracing for Python Services

Provides distributed tracing for:
- FastAPI ML service
- Temporal workflows
- Python microservices

Traces are exported to Jaeger for visualization
"""

import os
import logging
from typing import Optional, Dict, Any

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentation
from opentelemetry.instrumentation.requests import RequestsInstrumentation
from opentelemetry.instrumentation.logging import LoggingInstrumentation

logger = logging.getLogger(__name__)

class TelemetryConfig:
    """Configuration for OpenTelemetry"""
    
    def __init__(
        self,
        service_name: str,
        service_version: str = "1.0.0",
        jaeger_endpoint: str = "http://localhost:14268/api/traces",
        enabled: bool = True
    ):
        self.service_name = service_name
        self.service_version = service_version
        self.jaeger_endpoint = jaeger_endpoint
        self.enabled = enabled


def init_telemetry(config: TelemetryConfig) -> Optional[TracerProvider]:
    """
    Initialize OpenTelemetry with Jaeger exporter
    
    Args:
        config: TelemetryConfig instance
        
    Returns:
        TracerProvider instance or None if disabled
    """
    if not config.enabled:
        logger.info("[Telemetry] Tracing disabled")
        return None
    
    try:
        # Create resource with service information
        resource = Resource.create({
            ResourceAttributes.SERVICE_NAME: config.service_name,
            ResourceAttributes.SERVICE_VERSION: config.service_version,
            ResourceAttributes.DEPLOYMENT_ENVIRONMENT: os.getenv("NODE_ENV", "development"),
        })
        
        # Create OTLP exporter for Jaeger
        exporter = OTLPSpanExporter(
            endpoint=config.jaeger_endpoint,
            headers={},
        )
        
        # Create trace provider
        provider = TracerProvider(resource=resource)
        processor = BatchSpanProcessor(exporter)
        provider.add_span_processor(processor)
        
        # Set global trace provider
        trace.set_tracer_provider(provider)
        
        # Auto-instrument common libraries
        RequestsInstrumentation().instrument()
        LoggingInstrumentation().instrument()
        
        logger.info(f"[Telemetry] OpenTelemetry initialized for {config.service_name}")
        logger.info(f"[Telemetry] Exporting traces to: {config.jaeger_endpoint}")
        
        return provider
        
    except Exception as e:
        logger.error(f"[Telemetry] Failed to initialize OpenTelemetry: {e}")
        return None


def instrument_fastapi(app):
    """
    Instrument FastAPI application with OpenTelemetry
    
    Args:
        app: FastAPI application instance
    """
    try:
        FastAPIInstrumentation.instrument_app(app)
        logger.info("[Telemetry] FastAPI instrumented")
    except Exception as e:
        logger.error(f"[Telemetry] Failed to instrument FastAPI: {e}")


def get_tracer(service_name: str) -> trace.Tracer:
    """
    Get a tracer for the given service
    
    Args:
        service_name: Name of the service
        
    Returns:
        Tracer instance
    """
    return trace.get_tracer(service_name)


def start_span(service_name: str, span_name: str, attributes: Optional[Dict[str, Any]] = None):
    """
    Start a new span with the given name
    
    Args:
        service_name: Name of the service
        span_name: Name of the span
        attributes: Optional attributes to add to the span
        
    Returns:
        Span context manager
    """
    tracer = get_tracer(service_name)
    span = tracer.start_span(span_name)
    
    if attributes:
        for key, value in attributes.items():
            span.set_attribute(key, value)
    
    return span


def add_span_attributes(span: trace.Span, attributes: Dict[str, Any]):
    """
    Add attributes to the current span
    
    Args:
        span: Span instance
        attributes: Dictionary of attributes to add
    """
    for key, value in attributes.items():
        span.set_attribute(key, value)


def add_span_event(span: trace.Span, name: str, attributes: Optional[Dict[str, Any]] = None):
    """
    Add an event to the current span
    
    Args:
        span: Span instance
        name: Event name
        attributes: Optional event attributes
    """
    if attributes:
        span.add_event(name, attributes)
    else:
        span.add_event(name)


def record_error(span: trace.Span, error: Exception):
    """
    Record an error on the span
    
    Args:
        span: Span instance
        error: Exception to record
    """
    span.record_exception(error)
    span.set_attribute("error", True)


def shutdown_telemetry(provider: Optional[TracerProvider]):
    """
    Shutdown the telemetry provider
    
    Args:
        provider: TracerProvider instance
    """
    if provider:
        try:
            provider.shutdown()
            logger.info("[Telemetry] Tracer provider shut down successfully")
        except Exception as e:
            logger.error(f"[Telemetry] Error shutting down tracer provider: {e}")
