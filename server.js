import express from 'express';
import axios from 'axios';
import { initializeAuth, Log } from './utils/logger.js';

const app = express();
app.use(express.json());

// Mandatory tracking middleware to log incoming requests
app.use(async (req, res, next) => {
    const timestamp = new Date().toISOString();
    await Log('backend', 'info', 'middleware', `${req.method} request received at ${req.url}`);
    next();
});

/**
 * Stage 6 Core Engine: Priority Inbox Sorting Mechanism
 * Weights: Placement = 3, Result = 2, Event = 1
 */
function processPriorityInbox(notifications, limit = 10) {
    const weights = {
        'placement': 3,
        'result': 2,
        'event': 1
    };

    return notifications
        .map(item => {
            // Safe extraction supporting both uppercase and lowercase response fields from the API
            const typeStr = (item.Type || item.type || '').toLowerCase();
            return {
                id: item.ID || item.id,
                type: typeStr,
                message: item.Message || item.message,
                timestamp: new Date(item.Timestamp || item.timestamp),
                weight: weights[typeStr] || 0
            };
        })
        // Sort Phase: Primary key = weight (descending), Secondary key = timestamp (descending)
        .sort((a, b) => {
            if (b.weight !== a.weight) {
                return b.weight - a.weight; 
            }
            return b.timestamp - a.timestamp; 
        })
        .slice(0, limit);
}

// Target GET Route for the Priority Engine View
app.get('/api/v1/notifications/priority', async (req, res) => {
    // Dynamically handle 'n' query parameters (defaults to top 10 if blank)
    const limit = parseInt(req.query.n, 10) || 10;

    try {
        // Pull live telemetry stream data from the official external service
        const response = await axios.get('http://4.224.186.213/evaluation-service/notifications');
        const rawList = response.data.notifications || response.data || [];
        
        // Execute prioritization rules
        const sortedInbox = processPriorityInbox(rawList, limit);

        await Log('backend', 'info', 'service', `Successfully processed priority sorting for top ${limit} items.`);

        return res.status(200).json({
            success: true,
            n: limit,
            count: sortedInbox.length,
            notifications: sortedInbox
        });
    } catch (error) {
        await Log('backend', 'error', 'service', `Priority compilation failed: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: "Failed to connect to upstream service or process notifications matrix."
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`Server running smoothly on port ${PORT}`);
    
    // 1. Log into the test server automatically using your saved client keys
    await initializeAuth();

    // 2. Fire an initial sanity check log to verify the full network pipeline works
    await Log('backend', 'info', 'middleware', 'Application tracking module successfully active.');
});