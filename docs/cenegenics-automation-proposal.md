# Cenegenics Patient Journey – Daily Thread Automation Proposal

**Client:** Cenegenics  
**Prepared for:** Daily Thread  
**Date:** February 22, 2025

---

## Daily Thread – Capabilities Overview

**Daily Thread** (LibreChatEnterprise) is an AI chat platform with:

| Capability | Description |
|------------|-------------|
| **Native CRM** | Contacts, Organizations, Deals, Pipelines, Activities (project-scoped) |
| **AI Agents** | Custom agents with tools, MCP, file search, code execution |
| **Email My Agent** | Inbound email → agent processes → AI reply via Postmark |
| **Scheduled Workflows** | Multi-step agent chains on cron schedules |
| **MCP Integrations** | **HubSpot** (CRM), **Google Workspace** (Drive, Docs, Calendar, Gmail, Sheets, Tasks), **MS 365** (Outlook, Teams, Graph API) |
| **File Search / RAG** | Search and reason over uploaded documents |
| **Projects** | Multi-tenancy for different teams/clients |

---

## Cenegenics Patient Journey – Current Workflow

**Lead → Evaluation → Program → Ongoing Care**

1. **Lead Intake & Initial Communication** – Salesforce (current) → HubSpot (future); Dr. Eye consults; notes in CRM; email follow-ups; welcome email on conversion
2. **Pre-Evaluation Coordination** – Hayley, phlebotomist; Google Drive for prep docs; at-home blood draw; labs before in-office eval
3. **Evaluation Day** – 7-hour comprehensive assessment; labs, diagnostics, history compiled into one profile for Dr. Eye
4. **Physician Review & Recommendation Creation** – Dr. Eye reviews, creates recommendation sheet, hands off packet at end of visit
5. **Program Enrollment** – Patient onboarded; hormone optimization, vitamins, longevity protocols
6. **Ongoing Patient Management** – Monthly physician calls, quarterly labs, CRM for relationship management

---

## Automation Opportunities by Stage

### 1. Lead Intake & Initial Communication

**Daily Thread:**

- **HubSpot MCP** (when they move): Agents can read/write HubSpot contacts, deals, and notes.
- **Native CRM** (alternative): Pipeline `Lead → Qualified → Evaluation Scheduled → Program Enrollment`; agents create/update contacts and deals.
- **Email My Agent**: Lead emails a shared address → agent answers FAQs, logs contact, and can create/update CRM records.
- **Scheduled workflow**: On new lead, agent sends a templated welcome email and creates a CRM contact/deal.

### 2. Pre-Evaluation Coordination

**Daily Thread:**

- **Google Workspace MCP**: Agents access Drive (prep docs), Calendar (appointments), Gmail (reminders).
- **Scheduled workflow**: X days before eval, agent sends prep reminder with links to Drive docs.
- **Agent assistant**: “What’s the status for patient X?” → agent checks Drive, Calendar, CRM and summarizes.
- **Phlebotomist scheduling**: Agent can read/write Calendar events and send confirmation emails.

### 3. Evaluation Day (7-Hour Assessment)

**Daily Thread:**

- **File search / RAG**: Agent can search and summarize labs, diagnostics, history from uploaded files.
- **Document summarization**: Agent compiles a concise summary for Dr. Eye from multiple sources.
- **Recommendation drafting**: Agent can draft recommendation text from structured inputs; Dr. Eye reviews and edits.

### 4. Physician Review & Recommendation Creation

**Daily Thread:**

- **Agent assistant**: “Summarize findings for patient X” → agent pulls from CRM, Drive, and prior notes.
- **Template generation**: Agent fills recommendation templates from structured data.
- **Activity logging**: `crm_log_activity` records recommendation creation and handoff.

### 5. Program Enrollment & Treatment Initiation

**Daily Thread:**

- **Deal stage update**: Move deal to “Program Enrollment” or “Active Program”.
- **Activity logging**: Log enrollment, prescriptions, and first treatment.
- **Welcome/onboarding email**: Scheduled workflow sends program-specific welcome and next steps.

### 6. Ongoing Patient Management & Retention

**Daily Thread:**

- **Scheduled workflows**:
  - Monthly: “Upcoming physician call for patient X” reminder to Dr. Eye/Brock.
  - Quarterly: Outreach for lab follow-ups.
- **CRM activities**: Log calls, emails, and outcomes via `crm_log_activity`.
- **Agent assistant**: “Who needs follow-up this month?” → agent queries deals/activities and suggests outreach.
- **Email My Agent**: Patients can email for questions; agent replies and logs the interaction.

---

## Would Cenegenics Use the Web Interface?

**Short answer:** Yes, but mainly for coordination and ad-hoc lookups, not as the primary workflow surface.

### Where the web interface fits

| Use case | Who | How often |
|---------|-----|-----------|
| **Ad-hoc queries** (“What’s the status of patient X?”) | Hayley, Dr. Eye, Brock | Daily |
| **Quick lookups** (“Who needs physician calls this month?”) | Brock, Dr. Eye | Weekly |
| **Workflow monitoring** (view scheduled runs, history) | Admin, Hayley | As needed |
| **Agent/CRM configuration** (pipelines, schedules, agents) | Admin | One-time + periodic |
| **Manual override** when something goes wrong | Hayley, Admin | Occasional |

### Where they don’t need the web interface

- **Automated workflows** – scheduled reminders, welcome emails, follow-up outreach run in the background.
- **Email My Agent** – patients and staff interact via email; no need to open the app.
- **CRM data entry** – if they stay on HubSpot/Salesforce, that’s where they’ll manage records.

### Practical recommendation

- **Primary users:** Hayley (Service Coordinator), Brock, Dr. Eye – for quick status checks and summaries.
- **Secondary users:** Admin – for setup, configuration, and maintenance.
- **Most value:** Background automation and Email My Agent; the web UI is mainly for coordination and ad-hoc support.

---

## Suggested Implementation Phases

| Phase | Focus | Daily Thread Components |
|-------|--------|-------------------------|
| **1** | Lead → patient pipeline | Native CRM or HubSpot MCP, pipeline stages, Email My Agent for lead inquiries |
| **2** | Pre-eval coordination | Google Workspace MCP, scheduled reminders, Drive/Calendar access |
| **3** | Ongoing care cadence | Scheduled workflows for monthly/quarterly outreach, activity logging |
| **4** | Evaluation support | File search, document summarization, recommendation drafting |

---

## Gaps and Considerations

1. **Salesforce**: No Salesforce MCP in the codebase. HubSpot MCP fits their planned move to HubSpot.
2. **HIPAA**: Healthcare data requires HIPAA-compliant hosting, encryption, and BAA with providers (e.g., Postmark, cloud storage).
3. **Phlebotomist scheduling**: Needs a defined system (e.g., Calendly, Acuity) that can be integrated via API or MCP.
4. **Lab integration**: Lab results would need an API or structured import; file upload + RAG can work for documents.

---

## Positioning for Cenegenics

Daily Thread can support Cenegenics by:

- **Unifying** lead/patient data (CRM), documents (Drive), and communication (email) in one AI layer.
- **Automating** welcome emails, prep reminders, and follow-up outreach.
- **Assisting** Dr. Eye and Hayley with status checks, summaries, and recommendation drafting.
- **Aligning** with their HubSpot migration via the HubSpot MCP.
