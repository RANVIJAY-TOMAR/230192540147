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

---

## Stage 4: High-Concurrency Architectural Mitigation Strategy

### 1. Scalability Bottleneck Analysis
When 50,000 students hit the notification API concurrently on every single page load, the system experiences a classical **Thundering Herd Problem**. Every page navigation forces a round-trip query to the persistent primary database cluster. 

This causes immediate architectural failure modes:
* **Connection Pool Exhaustion:** The database runs out of available socket descriptors to handle incoming concurrent TCP requests, causing connection timeouts (`ECONNREFUSED`).
* **CPU and Disk IOPS Spikes:** Processing the same sorting and filtration steps millions of times sequentially pushes CPU usage to 100% and saturates the Storage Area Network (SAN) read input/output bandwidth.

---

### 2. Proposed System Design Intervention: Distributed In-Memory Caching

To shield our persistent PostgreSQL database from this brute-force traffic, we must decouple read operations from the core disk storage layer by implementing a high-throughput, in-memory caching tier using **Redis**.

Rather than querying the core database every single time a student reloads their dashboard, the application server checks a lightning-fast memory cache first.
[ 50,000 Concurrent Students ]
                 │
                 ▼
       [ API Gateway / Express ]
                 │
      ┌──────────┴──────────┐
      │ (Cache Hit)         │ (Cache Miss)
      ▼                     ▼
 [ Redis Cache ]     [ PostgreSQL DB ]
 (Sub-millisecond)          │
      ▲                     │ (Writes back to update cache)
      └─────────────────────┘

#### Cache Key Stratification Policy:
* **Key Format Structure:** `student:cache:{student_id}:notifications`
* **Data Payload Strategy:** Stringified JSON arrays containing the optimized list of the student's top unread notifications.
* **TTL (Time-To-Live) Threshold:** Configured with a sliding window expiration of **300 seconds (5 minutes)**. This guarantees that memory is auto-recycled frequently, and even if a student opens multiple browser tabs rapidly, the database is hit at most once every 5 minutes per user.

---

### 3. Asymmetric Cache Invalidation Framework

To prevent the cache from serving stale, outdated data when important new notifications (like an active Placement drive) are released, an asymmetric **Cache-Aside + Write-Through write strategy** is applied:

1. **Passive Eviction via TTL:** If no new data is posted, the cache naturally expires after 5 minutes, pulling fresh updates smoothly on the next query trip.
2. **Active Explicit Invalidation:** The exact millisecond an administrator posts a ne

---

## Stage 5: Distributed Message Queues & Architectural Fault Tolerance

### 1. Legacy Loop Vulnerabilities
The legacy synchronous execution loop (`notify_all`) introduces critical real-world bottlenecks:
* **Blocking the Main Thread:** Handling external network requests inside a raw loop freezes the server, making the app unresponsive to other users.
* **Lack of Fault Recovery:** If an external email provider fails mid-way, the entire process crashes, leaving thousands of users without alerts.

### 2. Modern Decoupled Solution: Asynchronous Queues
To handle 50,000 students safely, we separate the request from the work using a background **Message Queue**. The main server accepts the task instantly, and background workers process the emails at a controlled, safe speed.

### 3. High-Performance Pseudocode Setup
```javascript
// Server immediately accepts the job and frees up connections
async function handleNotifyAllRequest(req, res) {
  await notificationQueue.add('broadcast_job', { 
    studentIds: req.body.studentIds, 
    message: req.body.message 
  });
  return res.status(202).json({ success: true, message: "Queued successfully." });
}
---

## Stage 6: Priority Inbox Real-Time Sorting Algorithm

### 1. Approach and Solution Design
The Priority Inbox drops standard sequential database reads in favor of a dynamic linear-weighted array parsing pipeline. When data hits the system gateway from the protected microservice route, it undergoes an extraction process that standardizes the field names and applies custom weight coefficients:
* **Placement Alerts:** Given top weight classification (`3`) due to critical deadline dependencies.
* **Academic Result Dispatches:** Given intermediate classification (`2`).
* **General Events:** Given standard classification (`1`).

### 2. Computational Multi-Key Sorting Mechanics
Sorting uses a compound comparator pattern. The JavaScript V8 sorting architecture executes structural sorting routines under $O(K \log K)$ runtime footprints (where $K$ represents the total capacity bounds of elements retrieved from the upstream system). 

If category weights are unequal, the higher weight jumps straight to the top. If weights match precisely, the tie-breaker checks the Unix timestamp coordinates, putting the newest notifications first.

### 3. Scalable Memory Management Interventions
To maintain a high-performance profile even as endless notifications flow in, we restrict data usage using short-circuit array bounds:
* **In-Memory Streaming Buffers:** Instead of running unbounded array copies, incoming JSON streams are piped straight through a parsing filter.
* **Truncated Array Slicing:** Applying `.slice(0, limit)` early prevents bloated data transfers to the student's browser dashboard, saving memory bandwidth across all systems.