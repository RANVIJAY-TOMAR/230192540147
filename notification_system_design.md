# Campus Notifications Microservice Architecture

## Stage 1: REST API Design, Contract, and JSON Schema Definition

### 1. Core Platform Capabilities & Action Matrix
The platform supports three distinct notification domains across a multi-entity canvas (Students, Admins, and Faculty):
* **Placement Channels:** Urgent, high-priority tracking updates for application deadlines, interviews, and company shortlists.
* **Event Channels:** Informational and interactive scheduling alerts regarding hackathons, symposiums, and college fests.
* **Result Channels:** Read-heavy transactional dispatches announcing academic grades, exam performance, or re-evaluations.

---

### 2. Endpoints & API Contract Specification

#### A. Fetch Notifications for a Authenticated Student
* **Path:** `GET /api/v1/notifications`
* **Purpose:** Fetches a paginated, filterable stream of notifications tailored to the logged-in student.
* **Query Parameters:**
    * `page` (integer, optional, default: 1)
    * `limit` (integer, optional, default: 20)
    * `type` (string, optional: `placement`, `event`, `result`)
    * `isRead` (boolean, optional)
* **Success Response (200 OK):**
```json
{
  "success": true,
  "meta": {
    "totalCount": 142,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  },
  "data": [
    {
      "notificationId": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "type": "result",
      "title": "End-Sem Performance Release",
      "message": "Mid-sem evaluations for CSDS branch have been compiled.",
      "isRead": false,
      "createdAt": "2026-06-26T11:05:00Z"
    }
  ]
}
---

## Stage 2: Database Storage Architecture & Structural Schema Design

### 1. Persistent Storage Paradigm Strategy
The storage strategy utilizes a **PostgreSQL Relational Database Engine**. Relational mapping ensures strict compliance with institutional data models. Foreign key cascading constraints guarantee that if an academic cohort or account profile changes, notification records maintain reference integrity. This architecture handles multi-table joins (e.g., mapping a student profile to their received broadcast inbox) with standard indexing optimizations to prevent query degradation as scale hits hundreds of thousands of entries.

---

### 2. Concrete Data Definition Language (DDL) Schema

```sql
-- Create custom Enums to restrict payload attributes cleanly
CREATE TYPE notification_channel AS ENUM ('placement', 'event', 'result');

-- Table 1: Core Notifications Ledger (Stores structural broadcast data)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type notification_channel NOT NULL,
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    target_cohort VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Table 2: Student Notification States (Tracks delivery and read matrix per user)
CREATE TABLE student_notification_states (
    id BIGSERIAL PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT unique_student_notification UNIQUE (student_id, notification_id)
);

-- Optimize core transactional access patterns via declarative indexes
CREATE INDEX idx_notifications_cohort_date ON notifications(target_cohort, created_at DESC);
CREATE INDEX idx_student_unread_lookup ON student_notification_states(student_id, is_read) WHERE is_read = FALSE;

---

## Stage 3: Query Optimization & Indexing Performance Analysis

### 1. Diagnostic Breakdown: Why the Legacy Query Performs Poorly

The initial legacy query provided for evaluation is:
```sql
SELECT * FROM notifications 
WHERE studentID = 1042 AND isRead = false 
ORDER BY createdAt DESC;