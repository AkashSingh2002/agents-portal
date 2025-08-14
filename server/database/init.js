const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'brand_metrics.db');
const db = new sqlite3.Database(dbPath);

async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Drop legacy tables that conflict with new schema if they exist
      db.run(`DROP TABLE IF EXISTS orders`);
      db.run(`DROP TABLE IF EXISTS chat_history`);

      // Create user_employees table
      db.run(`
        CREATE TABLE IF NOT EXISTS user_employees (
          EmpID INTEGER PRIMARY KEY AUTOINCREMENT,
          Name TEXT NOT NULL,
          Email TEXT UNIQUE NOT NULL,
          Phone TEXT,
          Position TEXT,
          City TEXT,
          Status TEXT CHECK(Status IN ('Active','Inactive')) DEFAULT 'Active',
          Password TEXT NOT NULL
        )
      `);

      // Create orders table per assignment schema
      db.run(`
        CREATE TABLE IF NOT EXISTS orders (
          PID INTEGER PRIMARY KEY AUTOINCREMENT,
          CustomerName TEXT NOT NULL,
          Email TEXT,
          Phone TEXT,
          Closer INTEGER,
          ContractPrice DECIMAL(12,2),
          SystemSize TEXT,
          Stage TEXT,
          Redline TEXT,
          FOREIGN KEY (Closer) REFERENCES user_employees(EmpID) ON DELETE SET NULL
        )
      `);

      // Create payout table per assignment schema
      db.run(`
        CREATE TABLE IF NOT EXISTS payout (
          ID INTEGER PRIMARY KEY AUTOINCREMENT,
          PID INTEGER,
          EmpID INTEGER,
          Amount DECIMAL(12,2),
          Type TEXT CHECK(Type IN ('M1','M2','M3','Clawback')),
          PayingDate DATE,
          FOREIGN KEY (PID) REFERENCES orders(PID) ON DELETE CASCADE,
          FOREIGN KEY (EmpID) REFERENCES user_employees(EmpID) ON DELETE CASCADE
        )
      `);

      // Create chat_history table keyed to employees
      db.run(`
        CREATE TABLE IF NOT EXISTS chat_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL,
          message TEXT NOT NULL,
          response TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES user_employees (EmpID)
        )
      `);

      // Insert seed data for assignment schema
      insertSeedData()
        .then(() => {
          console.log('Seed data inserted successfully');
          resolve();
        })
        .catch(reject);
    });
  });
}

async function insertSeedData() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM user_employees", (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row && row.count > 0) {
        console.log('Seed data already exists, skipping...');
        resolve();
        return;
      }

      const employees = [
        ['John Doe', 'john@example.com', '9876543210', 'Sales Closer', 'New York', 'Active', 'password123'],
        ['Jane Smith', 'jane@example.com', '9876543211', 'Sales Manager', 'Los Angeles', 'Active', 'password123'],
        ['Mike Brown', 'mike@example.com', '9876543212', 'Installer', 'Chicago', 'Inactive', 'password123']
      ];

      // Insert employees with bcrypt-hashed passwords
      let insertedEmployees = 0;
      const employeeIds = [];

      employees.forEach((emp, index) => {
        const [name, email, phone, position, city, status, plainPassword] = emp;
        bcrypt.hash(plainPassword, 10, (hashErr, hash) => {
          if (hashErr) {
            console.error('Error hashing password for', email, hashErr);
            // Still proceed with plain to avoid blocking, but prefer hashed
          }
          db.run(
            `INSERT INTO user_employees (Name, Email, Phone, Position, City, Status, Password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, email, phone, position, city, status, hash || plainPassword],
            function(insertErr) {
              if (insertErr) {
                console.error('Error inserting employee:', insertErr);
              } else {
                employeeIds[index] = this.lastID;
              }
              insertedEmployees++;
              if (insertedEmployees === employees.length) {
                insertOrders(resolve, reject);
              }
            }
          );
        });
      });
    });
  });
}

function insertOrders(resolve, reject) {
  const ordersData = [
    ['Alice Johnson', 'alice@example.com', '9998887777', 1, 15000.00, '6kW', 'PTO', 'Yes'],
    ['Bob Williams', 'bob@example.com', '8887776666', 2, 20000.00, '8kW', 'Installation', 'No'],
    ['Charlie Green', 'charlie@example.com', '7776665555', 1, 18000.00, '7kW', 'Design', 'Yes'],
    ['Diana Rose', 'diana@example.com', '6665554444', 3, 22000.00, '9kW', 'Site Survey', 'No'],
    ['Ethan Clark', 'ethan@example.com', '5554443333', 2, 25000.00, '10kW', 'Permitting', 'Yes'],
    ['Fiona Lee', 'fiona@example.com', '4443332222', 1, 12000.00, '5kW', 'Installation', 'Yes'],
    ['George Adams', 'george@example.com', '3332221111', 2, 30000.00, '12kW', 'PTO', 'No'],
    ['Hannah Scott', 'hannah@example.com', '2221110000', 3, 14000.00, '6kW', 'Design', 'Yes'],
    ['Ian Thomas', 'ian@example.com', '1110009999', 1, 19000.00, '7.5kW', 'Installation', 'No'],
    ['Julia White', 'julia@example.com', '0009998888', 2, 21000.00, '8kW', 'Site Survey', 'Yes'],
    ['Kevin Harris', 'kevin@example.com', '9998887776', 3, 17500.00, '6.5kW', 'Design', 'No'],
    ['Laura Young', 'laura@example.com', '8887776665', 1, 26000.00, '11kW', 'Installation', 'Yes'],
    ['Michael King', 'michael@example.com', '7776665554', 2, 28000.00, '12kW', 'PTO', 'Yes'],
    ['Nina Baker', 'nina@example.com', '6665554443', 3, 13500.00, '5.5kW', 'Permitting', 'No'],
    ['Oliver Perez', 'oliver@example.com', '5554443332', 1, 24000.00, '10kW', 'Installation', 'Yes'],
    ['Paula Reed', 'paula@example.com', '4443332221', 2, 15500.00, '6.5kW', 'Design', 'No'],
    ['Quinn Foster', 'quinn@example.com', '3332221110', 3, 20000.00, '8kW', 'Site Survey', 'Yes'],
    ['Rachel Evans', 'rachel@example.com', '2221110009', 1, 17000.00, '7kW', 'Installation', 'No'],
    ['Samuel Price', 'samuel@example.com', '1110009998', 2, 22500.00, '9.5kW', 'PTO', 'Yes'],
    ['Tina Ward', 'tina@example.com', '0009998887', 3, 15000.00, '6kW', 'Permitting', 'No']
  ];

  let inserted = 0;
  ordersData.forEach((data) => {
    db.run(
      `INSERT INTO orders (CustomerName, Email, Phone, Closer, ContractPrice, SystemSize, Stage, Redline) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      data,
      function(err) {
        if (err) {
          console.error('Error inserting order:', err);
        }
        inserted++;
        if (inserted === ordersData.length) {
          insertPayouts(resolve, reject);
        }
      }
    );
  });
}

function insertPayouts(resolve, reject) {
  const payouts = [
    [1, 1, 500.00, 'M1', '2025-08-01'],
    [2, 2, 800.00, 'M1', '2025-08-02'],
    [3, 1, 600.00, 'M1', '2025-08-03'],
    [4, 3, 750.00, 'M1', '2025-08-04'],
    [5, 2, 900.00, 'M1', '2025-08-05'],
    [6, 1, 450.00, 'M2', '2025-08-06'],
    [7, 2, 1000.00, 'M2', '2025-08-07'],
    [8, 3, 500.00, 'M2', '2025-08-08'],
    [9, 1, 700.00, 'M2', '2025-08-09'],
    [10, 2, 800.00, 'M3', '2025-08-10'],
    [11, 3, 400.00, 'M3', '2025-08-11'],
    [12, 1, 950.00, 'M3', '2025-08-12'],
    [13, 2, 1100.00, 'M3', '2025-08-13'],
    [14, 3, -300.00, 'Clawback', '2025-08-14'],
    [15, 1, 1200.00, 'M1', '2025-08-15'],
    [16, 2, 600.00, 'M2', '2025-08-16'],
    [17, 3, 500.00, 'M3', '2025-08-17'],
    [18, 1, -200.00, 'Clawback', '2025-08-18'],
    [19, 2, 900.00, 'M1', '2025-08-19'],
    [20, 3, 700.00, 'M2', '2025-08-20']
  ];

  let inserted = 0;
  payouts.forEach((p) => {
    db.run(
      `INSERT INTO payout (PID, EmpID, Amount, Type, PayingDate) VALUES (?, ?, ?, ?, ?)`,
      p,
      function(err) {
        if (err) {
          console.error('Error inserting payout:', err);
        }
        inserted++;
        if (inserted === payouts.length) {
          console.log('All seed data inserted successfully');
          resolve();
        }
      }
    );
  });
}

function getDatabase() {
  return db;
}

module.exports = {
  initializeDatabase,
  getDatabase
};
