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