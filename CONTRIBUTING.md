# Contributing to ModularCA

Thanks for your interest in contributing! ModularCA is an enterprise Certificate
Authority — security-critical software — so contributions are reviewed with care.
This guide covers how to build the project, the conventions we follow, and how to
get changes merged.

## Reporting Security Issues

**Do not open public issues for security vulnerabilities.** Follow the process in
[SECURITY.md](SECURITY.md) instead.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

## Project Layout

ModularCA is a .NET solution (`ModularCA.sln`) plus several React/TypeScript
single-page apps:

| Project | What it is |
| ------- | ---------- |
| `ModularCA.API` | ASP.NET Core host, controllers, middleware, startup |
| `ModularCA.Core` | Issuance, protocols, scheduling, audit, business logic |
| `ModularCA.Auth` | Authentication, password policy, JWT, authorization |
| `ModularCA.Keystore` | Software keystore + PKCS#11/HSM key handling |
| `ModularCA.Bootstrap` | First-run setup, database provisioning, seeding |
| `ModularCA.Database` | EF Core `DbContext`s and migrations |
| `ModularCA.Shared` | Entities, DTOs, enums, interfaces, utilities |
| `modularca.adminui` | Administrator console |
| `modularca.userui` | End-user self-service portal |
| `modularca.publicui` | Public CA info / CRL / OCSP / ACME directory |
| `modularca.docsui` | Documentation site |
| `modularca.setupui` | First-run setup wizard |

## Prerequisites

- The .NET SDK targeted by the projects (see the `*.csproj` `TargetFramework`).
- Node.js LTS + npm (for the frontends).
- A MySQL-compatible database for running the API locally.

## Building

Backend:

```bash
dotnet restore ModularCA.sln
dotnet build ModularCA.sln
```

Each frontend builds independently, e.g.:

```bash
cd modularca.adminui
npm install
npm run build      # or: npm run dev  for a local dev server
```

Repeat for `modularca.userui`, `modularca.publicui`, `modularca.docsui`, and
`modularca.setupui`.

## Running Tests

```bash
dotnet test ModularCA.sln
```

Please add or update tests for any behavior you change, especially anything that
touches issuance, validation, revocation, authentication, authorization, or
cryptography.

## Database Migrations

The schema is managed with EF Core migrations under
`ModularCA.Database/Migrations`. If your change alters the model, generate a
migration rather than editing the schema by hand:

```bash
dotnet ef migrations add <DescriptiveName> --project ModularCA.Database
```

Use a clear, descriptive migration name.

## Coding Conventions

- **Match the surrounding code** — naming, formatting, and structure should be
  consistent with the file you are editing.
- **Keep XML doc comments current.** When you add or change a public C# method or
  class, add or update its `/// <summary>` so the docs stay accurate.
- Prefer existing shared utilities over reinventing them — for example,
  cryptographic key/algorithm decisions should route through the existing key
  algorithm policy rather than introducing local helpers.
- Security-relevant defaults must stay **secure by default**. Do not add bypasses,
  accept-all validators, default credentials, or anything that weakens the default
  posture. New crypto code paths that accept an algorithm identifier from the wire
  must allow-list, not deny-list.

## Submitting Changes

1. Fork the repository and create a topic branch off `main`.
2. Make focused commits with clear messages.
3. Ensure `dotnet build`, `dotnet test`, and the relevant frontend builds pass.
4. Open a pull request describing **what** changed and **why**. Link any related
   issue. For user-facing or security-relevant changes, call out the impact.
5. A maintainer will review. Please be responsive to feedback — security review
   may take an extra round.

### Sign-off

We use the [Developer Certificate of Origin](https://developercertificate.org/).
Add a `Signed-off-by` line to each commit (`git commit -s`) to certify you wrote
the code or otherwise have the right to submit it under the project license.

## License

By contributing, you agree that your contributions will be licensed under the
same license as this project (see [LICENSE](LICENSE)).
