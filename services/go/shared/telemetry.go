package shared

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
	"go.opentelemetry.io/otel/trace"
)

// TelemetryConfig holds OpenTelemetry configuration
type TelemetryConfig struct {
	ServiceName    string
	ServiceVersion string
	JaegerEndpoint string
	Enabled        bool
}

// InitTelemetry initializes OpenTelemetry with Jaeger exporter
func InitTelemetry(config TelemetryConfig) (func(context.Context) error, error) {
	if !config.Enabled {
		log.Println("[Telemetry] Tracing disabled")
		return func(ctx context.Context) error { return nil }, nil
	}

	// Default Jaeger endpoint
	if config.JaegerEndpoint == "" {
		config.JaegerEndpoint = "http://localhost:14268/api/traces"
	}

	// Create OTLP exporter
	ctx := context.Background()
	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint("localhost:14268"),
		otlptracehttp.WithInsecure(),
		otlptracehttp.WithURLPath("/api/traces"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create OTLP exporter: %w", err)
	}

	// Create resource with service information
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(config.ServiceName),
			semconv.ServiceVersionKey.String(config.ServiceVersion),
			attribute.String("environment", getEnv("NODE_ENV", "development")),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Create trace provider
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)

	// Set global trace provider
	otel.SetTracerProvider(tp)

	// Set global propagator for context propagation
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	log.Printf("[Telemetry] OpenTelemetry initialized for %s", config.ServiceName)
	log.Printf("[Telemetry] Exporting traces to: %s", config.JaegerEndpoint)

	// Return shutdown function
	shutdown := func(ctx context.Context) error {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		
		if err := tp.Shutdown(ctx); err != nil {
			return fmt.Errorf("failed to shutdown tracer provider: %w", err)
		}
		
		log.Println("[Telemetry] Tracer provider shut down successfully")
		return nil
	}

	return shutdown, nil
}

// GetTracer returns a tracer for the given service
func GetTracer(serviceName string) trace.Tracer {
	return otel.Tracer(serviceName)
}

// StartSpan creates a new span with the given name
func StartSpan(ctx context.Context, serviceName, spanName string) (context.Context, trace.Span) {
	tracer := GetTracer(serviceName)
	return tracer.Start(ctx, spanName)
}

// AddSpanAttributes adds attributes to the current span
func AddSpanAttributes(span trace.Span, attrs map[string]interface{}) {
	for key, value := range attrs {
		switch v := value.(type) {
		case string:
			span.SetAttributes(attribute.String(key, v))
		case int:
			span.SetAttributes(attribute.Int(key, v))
		case int64:
			span.SetAttributes(attribute.Int64(key, v))
		case float64:
			span.SetAttributes(attribute.Float64(key, v))
		case bool:
			span.SetAttributes(attribute.Bool(key, v))
		default:
			span.SetAttributes(attribute.String(key, fmt.Sprintf("%v", v)))
		}
	}
}

// AddSpanEvent adds an event to the current span
func AddSpanEvent(span trace.Span, name string, attrs map[string]interface{}) {
	var attributes []attribute.KeyValue
	for key, value := range attrs {
		switch v := value.(type) {
		case string:
			attributes = append(attributes, attribute.String(key, v))
		case int:
			attributes = append(attributes, attribute.Int(key, v))
		case int64:
			attributes = append(attributes, attribute.Int64(key, v))
		case float64:
			attributes = append(attributes, attribute.Float64(key, v))
		case bool:
			attributes = append(attributes, attribute.Bool(key, v))
		default:
			attributes = append(attributes, attribute.String(key, fmt.Sprintf("%v", v)))
		}
	}
	span.AddEvent(name, trace.WithAttributes(attributes...))
}

// RecordError records an error on the span
func RecordError(span trace.Span, err error) {
	if err != nil {
		span.RecordError(err)
		span.SetAttributes(attribute.Bool("error", true))
	}
}

// Helper function to get environment variable with default
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
