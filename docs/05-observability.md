# Observability

- Prometheus scrapes `/metrics` endpoints exposed by master and worker processes.
- The OTEL collector receives traces via OTLP and currently exports them to the console; swap the exporter to Jaeger/Tempo when ready.
- Grafana dashboards live under `infra/docker/grafana/dashboards` and are auto-provisioned on startup.
- Each service initialises telemetry through `@anankor/telemetry` to ensure consistent resource attributes and instrumentation coverage.
