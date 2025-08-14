const express = require('express');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.agent = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Chat endpoint with NLP processing
router.post('/message', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    const agentId = req.agent.agentId;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Process the message with NLP
    const response = await processMessage(message, agentId);
    
    // Save to chat history
    saveChatHistory(agentId, message, response);

    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat history
router.get('/history', authenticateToken, (req, res) => {
  const agentId = req.agent.agentId;
  const db = getDatabase();

  db.all(
    'SELECT message, response, timestamp FROM chat_history WHERE employee_id = ? ORDER BY timestamp DESC LIMIT 50',
    [agentId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching chat history:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.json({ history: rows.reverse() });
    }
  );
});

// NLP Processing Function
async function processMessage(message, agentId) {
  const lowerMessage = message.toLowerCase();
  
  // Check for payout/earnings queries
  if (isPayrollQuery(lowerMessage)) {
    return await handlePayoutQuery(lowerMessage, agentId);
  }
  
  // Check for customer/order queries
  if (isCustomerQuery(lowerMessage)) {
    return await handleCustomerQuery(lowerMessage);
  }
  
  // Default response
  return "I can help you with payouts/commissions and solar order details. Try asking about:\n" +
         "• Payouts for this week, month, year, or last month\n" +
         "• Orders for a specific customer\n" +
         "• Custom date ranges for payouts (from YYYY-MM-DD to YYYY-MM-DD)";
}

// Payout/Payroll Query Detection
function isPayrollQuery(message) {
  const payrollKeywords = ['payroll', 'payout', 'commission', 'commissions', 'payment', 'earnings', 'income'];
  const timeKeywords = ['week', 'month', 'year', 'period', 'range'];
  
  return payrollKeywords.some(keyword => message.includes(keyword)) ||
         timeKeywords.some(keyword => message.includes(keyword));
}

// Customer Query Detection
function isCustomerQuery(message) {
  const customerKeywords = ['customer', 'client', 'order', 'project', 'work'];
  return customerKeywords.some(keyword => message.includes(keyword));
}

// Handle Payout Queries
async function handlePayoutQuery(message, agentId) {
  const db = getDatabase();
  
  let startDate, endDate, periodName;
  
  // Parse date ranges
  if (message.includes('this week')) {
    const dates = getThisWeekDates();
    startDate = dates.start;
    endDate = dates.end;
    periodName = 'This Week';
  } else if (message.includes('this month')) {
    const dates = getThisMonthDates();
    startDate = dates.start;
    endDate = dates.end;
    periodName = 'This Month';
  } else if (message.includes('this year')) {
    const dates = getThisYearDates();
    startDate = dates.start;
    endDate = dates.end;
    periodName = 'This Year';
  } else if (message.includes('last month')) {
    const dates = getLastMonthDates();
    startDate = dates.start;
    endDate = dates.end;
    periodName = 'Last Month';
  } else if (message.includes('between') || message.includes('from') || message.includes('to')) {
    const dates = parseCustomDateRange(message);
    if (dates) {
      startDate = dates.start;
      endDate = dates.end;
      periodName = `Custom Period (${startDate} to ${endDate})`;
    }
  }
  
  if (!startDate || !endDate) {
    return "I couldn't understand the time period. Please specify 'this week', 'this month', 'this year', 'last month', or use 'from YYYY-MM-DD to YYYY-MM-DD' format.";
  }
  
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(Amount) as total FROM payout 
       WHERE EmpID = ? AND PayingDate >= ? AND PayingDate <= ?`,
      [agentId, startDate, endDate],
      (err, row) => {
        if (err) {
          console.error('Payout query error:', err);
          resolve('Sorry, I encountered an error while fetching payout information.');
          return;
        }
        
        const total = row?.total || 0;
        resolve(`**${periodName} Payout Summary**\n\nTotal Amount: $${Number(total).toFixed(2)}\nPeriod: ${startDate} to ${endDate}`);
      }
    );
  });
}

// Handle Customer Queries
async function handleCustomerQuery(message) {
  const db = getDatabase();
  
  // Extract customer name
  let customerName = '';
  if (message.includes('customer')) {
    const parts = message.split('customer');
    if (parts.length > 1) {
      customerName = parts[1].trim();
    }
  } else if (message.includes('for')) {
    const parts = message.split('for');
    if (parts.length > 1) {
      customerName = parts[1].trim();
    }
  }
  
  if (!customerName) {
    return "Please specify a customer name. For example: 'Show orders for John Smith' or 'Customer John Smith'";
  }
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT PID, CustomerName, Email, Phone, ContractPrice, SystemSize, Stage, Redline 
       FROM orders 
       WHERE CustomerName LIKE ? 
       ORDER BY PID DESC 
       LIMIT 10`,
      [`%${customerName}%`],
      (err, rows) => {
        if (err) {
          console.error('Customer query error:', err);
          resolve('Sorry, I encountered an error while fetching customer information.');
          return;
        }
        
        if (!rows || rows.length === 0) {
          resolve(`No orders found for customer: ${customerName}`);
          return;
        }
        
        let response = `**Orders for ${customerName}**\n\n`;
        rows.forEach((order, index) => {
          response += `${index + 1}. **PID ${order.PID}**\n`;
          response += `   Contract: $${Number(order.ContractPrice || 0).toFixed(2)}\n`;
          response += `   System Size: ${order.SystemSize || 'N/A'}\n`;
          response += `   Stage: ${order.Stage || 'N/A'}\n`;
          response += `   Redline: ${order.Redline || 'N/A'}\n`;
          if (order.Email || order.Phone) {
            response += `   Contact: ${order.Email || ''} ${order.Phone ? '(' + order.Phone + ')' : ''}\n`;
          }
          response += '\n';
        });
        
        resolve(response);
      }
    );
  });
}

// Date Helper Functions
function getThisWeekDates() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

function getThisMonthDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

function getThisYearDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

function getLastMonthDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

function parseCustomDateRange(message) {
  // Look for patterns like "from 2024-01-01 to 2024-01-31" or "between 2024-01-01 and 2024-01-31"
  const datePattern = /(\d{4}-\d{2}-\d{2})/g;
  const dates = message.match(datePattern);
  
  if (dates && dates.length >= 2) {
    return {
      start: dates[0],
      end: dates[1]
    };
  }
  
  return null;
}

// Save Chat History
function saveChatHistory(agentId, message, response) {
  const db = getDatabase();
  db.run(
    'INSERT INTO chat_history (employee_id, message, response) VALUES (?, ?, ?)',
    [agentId, message, response],
    (err) => {
      if (err) {
        console.error('Error saving chat history:', err);
      }
    }
  );
}

module.exports = router;
