# SIMS — Secure Investigation Management System

A secure, case-centric digital document and investigation management system for organizing legal and investigation records with controlled access, integrity verification, auditability, evidence custody, and investigation workflows.

> **SIH 2026 — Problem Statement SIH26190**
>
> Theme: Blockchain & Cybersecurity  
> Category: Software

## Overview

SIMS is designed around the **case as the central unit of investigation**.

It brings together:

- Investigation cases
- Legal and investigation documents
- Digital evidence
- Evidence chain of custody
- Investigation timeline
- Audit records
- Reports and reviews
- Integrity verification
- Investigation readiness
- Role, case and jurisdiction-based access control
- Case relationships and investigation context

The current prototype uses **synthetic demonstration data** and is not an official government deployment.

---

## Key Features

### Secure Authentication & Authorization

- Session-based authentication
- Role-based access control
- Case-level authorization
- Jurisdiction-aware access
- Protected investigation actions
- Restricted evidence and document operations

### Secure Document Management

- Upload investigation documents
- Encrypted private vault storage
- Document metadata
- Document versions
- SHA-256 integrity verification
- Controlled document access
- Audit logging

### Evidence Management

- Evidence registration
- Evidence classification
- SHA-256 integrity verification
- Secure vault storage
- Evidence custody tracking
- Custody transfer history

### Investigation Timeline

Combines investigation activity into a unified case timeline, including relevant:

- Case events
- Diary entries
- Documents
- Evidence
- Custody events
- Reports

### Audit & Accountability

SIMS records important system actions for traceability and investigation review.

### Integrity Ledger

The prototype includes a local permissioned append-only hash ledger for development/prototype integrity anchoring.

The ledger stores integrity metadata and hashes rather than confidential document contents.

### Investigation Readiness

Provides a structured view of case records and review requirements.

This is an operational readiness mechanism and **not a legal certification or guarantee of admissibility**.

### Reports & Reviews

Supports investigation reports, report versions, submissions and review workflows.

---

# Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide React
- D3
- jsPDF

## Backend

- Node.js
- Express
- TypeScript
- REST APIs
- Zod validation
- Multer

## Database

- PostgreSQL
- `pg`
- Prisma client/development dependencies

## Security

- Session-based authentication
- bcrypt password hashing
- AES-256-GCM encrypted vault
- SHA-256 integrity verification
- Role/case/jurisdiction authorization
- Audit trail
- Evidence custody records
- Local permissioned integrity ledger

---

# Requirements

Install the following before running SIMS:

- Node.js
- npm
- PostgreSQL

Git is required if cloning the repository.

---

# Clone the Repository

```bash
git clone https://github.com/jyothirmaigowda/SIMS-Secure-Investigation-Management.git
cd SIMS-Secure-Investigation-Management
