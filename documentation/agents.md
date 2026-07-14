# Documentation Agent Guidelines

This directory holds reference documentation for the application's data model.

Before writing or modifying code that touches projection data models (table schemas, projections, or the events that feed them), read [`models/README.md`](./models/README.md) for the required context.

Consult the models whenever you edit backend table schemas/projections or the frontend aggregate data that mirrors them (offline snapshots & reducers). The two must stay in sync.
