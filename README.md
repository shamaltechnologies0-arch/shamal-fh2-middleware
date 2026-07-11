# Shamal FH2 External Viewer Middleware

This middleware layer serves as the bridge between DJI FlightHub 2 data and external viewing platforms. It provides secure, restricted access to approved flight data for third-party integrators (such as CAFM platforms and custom dashboards), ensuring that external users connect only to Shamal’s platform, not directly to DJI FH2.

## Key Features

- **Data Abstraction:** Reads and sanitizes approved data from DJI FlightHub 2.
- **Restricted Access:** Exposes specific, controlled endpoints for authorized viewers.
- **Clear Integration:** Provides standardized handoff documentation for external integrators.

## Quick Start Guide

1.  **Setup Environment:**
