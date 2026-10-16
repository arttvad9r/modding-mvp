# Security policy

The project handles model output, generated code, API credentials, authenticated beta users, queues and private artifacts. Reports that cross those boundaries are security-sensitive.

## Reporting

Do not place credentials, presigned URLs, production host details, exploit payloads, or user data in a public issue. Use GitHub's private vulnerability-reporting channel when available; otherwise contact the repository owner through GitHub and request a private channel first.

## Relevant boundaries

High-priority reports include:

- generated output escaping the allow-listed ModSpec/generator model;
- arbitrary file, process or network access through planner/repair inputs;
- authentication or per-user ownership bypass;
- queue/job state manipulation across users;
- leakage or reuse of S3 credentials, presigned URLs or private artifacts;
- secrets reaching logs, telemetry, fixtures or committed `.env` files;
- deployment paths that accidentally expose internal services.

The fixed credentials in local Docker/integration fixtures are test-only values and are not valid deployment credentials.
