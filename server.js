// server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
const db = new sqlite3.Database("./users.db"); // Path to SQLite database

// Enable CORS for all origins (or specify the React app's origin)
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://ebuhlanti-front-end-8ecc8ec58136.herokuapp.com",
    ], // Allow only your React app to make requests
    methods: ["GET", "POST", "PUT", "DELETE"], // Allow only specific HTTP methods
    credentials: true, // Allow credentials like cookies to be sent
  })
);

app.use(express.json()); // Enable JSON body parsing

// Create a users table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_date TEXT NOT NULL,
      member_name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      amount_request REAL NOT NULL,
      pay_day INTEGER NOT NULL,
      username TEXT NOT NULL,  
      FOREIGN KEY (username) REFERENCES user(username)  
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_date TEXT NOT NULL,
      member_name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      amount_paid REAL NOT NULL,
      request_id REAL NOT NULL,
      username TEXT NOT NULL, 
      FOREIGN KEY (username) REFERENCES user(username),
      FOREIGN KEY (request_id) REFERENCES request(request_id)  
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS receivable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_date TEXT NULL,
      amount_paid REAL NULL,
      repayment_date TEXT NULL,
      amount_repaid REAL NULL,
      username TEXT NOT NULL, 
      request_id INTEGER NULL,
      payment_id INTEGER NULL,
      FOREIGN KEY (username) REFERENCES user(username)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS premium (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_date TEXT NULL,
      amount_paid REAL NULL,
      Description TEXT NULL,
      username TEXT NOT NULL, 
      FOREIGN KEY (username) REFERENCES user(username)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bank_fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fee TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      premium_id TEXT NOT NULL,
      FOREIGN KEY (premium_id) REFERENCES premium(premium_id)
    )
  `);

  db.run(`
    CREATE VIEW IF NOT EXISTS installment_dates AS
  SELECT
      ID,
      CASE
          WHEN strftime('%d', payment_date) <= '10' THEN date(payment_date, '+1 month', 'start of month', '+3 days')
          ELSE date(payment_date, '+2 month', 'start of month', '+2 days')
      END AS first_installment_date,

      CASE
          WHEN strftime('%d', payment_date) <= '10' THEN date(payment_date, '+2 month', 'start of month', '+3 days')
          ELSE date(payment_date, '+3 month', 'start of month', '+2 days')
      END AS second_installment_date,

      CASE
          WHEN strftime('%d', payment_date) <= '10' THEN date(payment_date, '+3 month', 'start of month', '+3 days')
          ELSE date(payment_date, '+4 month', 'start of month', '+2 days')
      END AS third_installment_date
  FROM receivable;
    `);

  db.run(`
      CREATE VIEW IF NOT EXISTS user_heads AS
      select
        username, 
        case
          when username = "Vusi" then 2 
          when username = "Ab" then 8
          when username = "Marcks" then 2
          when username = "Sira" then 4
          when username = "Mgoli" then 2
          when username = "Ncedo" then 6
          when username = "Max" then 4
          else 0 
        end as heads
        from user
      `);
});

// Registration endpoint
app.post("/register", (req, res) => {
  const { username, password, email, role } = req.body;

  // Hash the password using bcrypt
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error("Error hashing password:", err); // Log the error to the console
      return res.status(500).json({ message: "Error hashing password" });
    }

    // Insert the new user into the database
    const stmt = db.prepare(
      "INSERT INTO user (username, password, email, role) VALUES (?, ?, ?, ?)"
    );
    stmt.run(username, hashedPassword, email, role, function (err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed")) {
          return res.status(409).json({ message: "Username is already taken" });
        }
        return res.status(500).json({ message: "Error registering user" });
      }

      res.status(201).json({ message: "User registered successfully" });
    });

    stmt.finalize();
  });
});

// /login endpoint
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  // Check if user exists in the database
  const query = "SELECT * FROM user WHERE username = ?";
  db.get(query, [username], (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ message: "Error retrieving user from database" });
    }

    if (!row) {
      // User not found
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Compare hashed password with the one in the database
    bcrypt.compare(password, row.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ message: "Error comparing passwords" });
      }

      if (!isMatch) {
        // Passwords don't match
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Passwords match, login successful
      res
        .status(200)
        .json({ message: "Login successful", userId: row.id, role: row.role });
    });
  });
});

// /Add request endpoint
app.post("/addRequest", (req, res) => {
  const { request_date, member, client, amount, payday } = req.body;

  if (!request_date || !member || !amount || !payday) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  // Check if user exists in the database
  const query =
    "INSERT INTO request(request_date, member_name, client_name, amount_request, pay_day, username) VALUES(?,?,?,?,?,?)";
  const stmt = db.prepare(query);
  stmt.run(
    request_date,
    member,
    client,
    amount,
    payday,
    member,
    function (err) {
      if (err) {
        console.error("Error inserting request:", err);
        return res.status(500).json({ message: "Error adding request" });
      }

      const auditQuery =
        "INSERT INTO receivable(payment_date, amount_paid, repayment_date, amount_repaid, username, request_id) VALUES(?,?,?,?,?,?)";
      const auditStmt = db.prepare(auditQuery);
      auditStmt.run(
        request_date,
        amount,
        null,
        null,
        member,
        this.lastID,
        function (auditErr) {
          if (auditErr) {
            console.error("Error inserting request received log:", auditErr);
          }
        }
      );

      res.status(200).json({
        message: "Add request captured successfully",
        requestId: this.lastID, // Return the ID of the inserted request
      });
    }
  );
});

// /Add request endpoint
app.post("/addPayment", (req, res) => {
  const { payment_date, member, client, amount, request_id } = req.body;

  if (!payment_date || !member || !amount || !request_id) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  // Check if user exists in the database
  const query =
    "INSERT INTO payment(payment_date, member_name, client_name, amount_paid, username, request_id) VALUES(?,?,?,?,?,?)";
  const stmt = db.prepare(query);
  stmt.run(
    payment_date,
    member,
    client,
    amount,
    member,
    request_id,
    function (err) {
      if (err) {
        console.error("Error inserting payment:", err);
        return res.status(500).json({ message: "Error adding payment" });
      }

      const auditQuery =
        "INSERT INTO receivable(payment_date, amount_paid, repayment_date, amount_repaid, username, payment_id) VALUES(?,?,?,?,?,?)";
      const auditStmt = db.prepare(auditQuery);
      auditStmt.run(
        null,
        null,
        payment_date,
        amount,
        member,
        this.lastID,
        function (auditErr) {
          if (auditErr) {
            console.error("Error inserting request received log:", auditErr);
          }
        }
      );

      res.status(200).json({
        message: "Add payment captured successfully",
        requestId: this.lastID, // Return the ID of the inserted request
      });
    }
  );
});

// /Add premium endpoint
app.post("/addPremium", (req, res) => {
  const { payment_date, member, amount, bank_fees, description } = req.body;

  if (!payment_date || !member || !amount) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  // Check if user exists in the database
  const query =
    "INSERT INTO premium(payment_date, amount_paid, description, username) VALUES(?,?,?,?)";
  const stmt = db.prepare(query);
  stmt.run(payment_date, amount, description, member, function (err) {
    if (err) {
      console.error("Error inserting premium:", err);
      return res.status(500).json({ message: "Error adding premium" });
    }

    const updateQuery =
      "INSERT INTO bank_fees(fee, payment_date, premium_id) VALUES(?,?,?)";
    const stmt = db.prepare(updateQuery);
    stmt.run(bank_fees, payment_date, this.lastID, function (err) {
      if (err) {
        console.error("Error adding bank_fees:", err);
        return res.status(500).json({ message: "Error adding bank_fees" });
      }

      res.status(200).json({
        message: "Add premium captured successfully",
        requestId: this.lastID, // Return the ID of the inserted premium
      });
    });
  });
});

// /updatePremium endpoint (PUT request to update existing premium)
app.put("/updatePremium/:id", (req, res) => {
  const { payment_date, member, amount, description } = req.body;
  const premiumId = req.params.id; // Get the premium ID from the URL parameters

  // Check if all required fields are provided
  if (!payment_date || !member || !amount) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  // Check if the record exists
  const query = "SELECT * FROM premium WHERE id = ?";
  db.get(query, [premiumId], (err, row) => {
    if (err) {
      console.error("Error checking premium:", err);
      return res.status(500).json({ message: "Error checking premium" });
    }

    if (!row) {
      // Premium record not found
      return res.status(404).json({ message: "Premium not found" });
    }

    // Update the premium record
    const updateQuery =
      "UPDATE premium SET payment_date = ?, amount_paid = ?, Description = ?, username = ? WHERE id = ?";
    const stmt = db.prepare(updateQuery);
    stmt.run(
      payment_date,
      amount,
      description,
      member,
      premiumId,
      function (err) {
        if (err) {
          console.error("Error updating premium:", err);
          return res.status(500).json({ message: "Error updating premium" });
        }

        res.status(200).json({
          message: "Premium updated successfully",
          updatedId: premiumId, // Return the updated premium ID
        });
      }
    );
  });
});

// /updateRequest endpoint (PUT request to update existing request)
app.put("/updateRequest/:id", (req, res) => {
  const { request_date, member, client_name, amount_request, pay_day } =
    req.body;
  const requestId = req.params.id; // Get the premium ID from the URL parameters

  // Check if all required fields are provided
  if (!request_date || !member || !amount_request || !pay_day) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  // Check if the record exists
  const query = "SELECT * FROM request WHERE id = ?";
  db.get(query, [requestId], (err, row) => {
    if (err) {
      console.error("Error checking request:", err);
      return res.status(500).json({ message: "Error checking request" });
    }

    if (!row) {
      // Premium record not found
      return res.status(404).json({ message: "Request not found" });
    }

    // Update the premium record
    const updateQuery =
      "UPDATE request SET request_date = ?, member_name = ?, amount_request = ?, pay_day = ?, username = ?, client_name = ? WHERE id = ?";
    const stmt = db.prepare(updateQuery);
    stmt.run(
      request_date,
      member,
      amount_request,
      pay_day,
      member,
      client_name,
      requestId,
      function (err) {
        if (err) {
          console.error("Error updating premium:", err);
          return res.status(500).json({ message: "Error updating premium" });
        }

        // Update the receivable record
        const updateQueryReceivable =
          "UPDATE receivable SET payment_date = ?, amount_paid = ?, username = ? WHERE request_id = ?";
        const stmtR = db.prepare(updateQueryReceivable);
        stmtR.run(
          request_date,
          amount_request,
          member,
          requestId,
          function (err) {
            if (err) {
              console.error("Error updating receivable:", err);
              return res
                .status(500)
                .json({ message: "Error updating receivable" });
            }

            res.status(200).json({
              message: "Request and Receivable updated successfully",
              updatedId: requestId, // Return the updated premium ID
            });
          }
        );
      }
    );
  });
});

// /updatePayment endpoint (PUT request to update existing payment)
app.put("/updatePayment/:id", (req, res) => {
  const { payment_date, member, client_name, amount_paid, request_id } =
    req.body;
  const paymentId = req.params.id; // Get the premium ID from the URL parameters

  // Check if all required fields are provided
  if (!payment_date || !member || !amount_paid || !request_id) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  // Check if the record exists
  const query = "SELECT * FROM payment WHERE id = ?";
  db.get(query, [paymentId], (err, row) => {
    if (err) {
      console.error("Error checking request:", err);
      return res.status(500).json({ message: "Error checking payment" });
    }

    if (!row) {
      // Premium record not found
      return res.status(404).json({ message: "Payment not found" });
    }

    // Update the premium record
    const updateQuery =
      "UPDATE payment SET payment_date = ?, member_name = ?, amount_paid = ?, client_name = ?, request_id = ? WHERE id = ?";
    const stmt = db.prepare(updateQuery);
    stmt.run(
      payment_date,
      member,
      amount_paid,
      client_name,
      request_id,
      paymentId,
      function (err) {
        if (err) {
          console.error("Error updating premium:", err);
          return res.status(500).json({ message: "Error updating premium" });
        }
        // Update the receivable record
        const updateQueryReceivable =
          "UPDATE receivable SET repayment_date = ?, amount_repaid = ?, username = ? WHERE payment_id = ?";
        const stmtR = db.prepare(updateQueryReceivable);
        stmtR.run(payment_date, amount_paid, member, paymentId, function (err) {
          if (err) {
            console.error("Error updating receivable:", err);
            return res
              .status(500)
              .json({ message: "Error updating receivable" });
          }

          res.status(200).json({
            message: "Payment and Receivable updated successfully",
            updatedId: paymentId, // Return the updated premium ID
          });
        });
      }
    );
  });
});

// /deletePremium endpoint (DELETE request to delete multiple premiums by IDs)
app.delete("/deletePremium", (req, res) => {
  const { ids } = req.body; // IDs should be passed as an array of strings in the request body

  if (!ids || ids.length === 0) {
    return res.status(400).json({ message: "No IDs provided" });
  }

  // Prepare the query to delete multiple records
  const placeholders = ids.map(() => "?").join(", "); // Create placeholders for each ID
  const deleteQuery = `DELETE FROM premium WHERE id IN (${placeholders})`;

  // Execute the query
  const stmt = db.prepare(deleteQuery);
  stmt.run(ids, function (err) {
    if (err) {
      console.error("Error deleting premiums:", err);
      return res.status(500).json({ message: "Error deleting premiums" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: "No premiums found to delete" });
    }

    res.status(200).json({
      message: `${this.changes} premium(s) deleted successfully`,
      deletedIds: ids,
    });
  });
});

// /deleteRequest endpoint (DELETE request to delete requests by IDs)
app.delete("/deleteRequest", (req, res) => {
  const { ids } = req.body; // Get the array of IDs from the request body

  if (!ids || ids.length === 0) {
    return res.status(400).json({ message: "No IDs provided" });
  }

  const placeholders = ids.map(() => "?").join(", "); // Create placeholders for each ID
  const deleteQuery = `DELETE FROM request WHERE id IN (${placeholders})`;

  // Execute the query
  const stmt = db.prepare(deleteQuery);
  stmt.run(ids, function (err) {
    if (err) {
      console.error("Error deleting requests:", err);
      return res.status(500).json({ message: "Error deleting requests" });
    }

    if (this.changes === 0) {
      return res
        .status(404)
        .json({ message: "No requests found with the given IDs" });
    }

    const placeholders1 = ids.map(() => "?").join(", "); // Create placeholders for each ID
    const deleteQuery1 = `DELETE FROM receivable WHERE request_id IN (${placeholders1})`;

    // Execute the query
    const stmt1 = db.prepare(deleteQuery1);
    stmt1.run(ids, function (err) {
      if (err) {
        console.error("Error deleting receivables:", err);
        return res.status(500).json({ message: "Error deleting receivables" });
      }

      if (this.changes === 0) {
        return res
          .status(404)
          .json({ message: "No receivables found with the given IDs" });
      }

      res.status(200).json({
        message: `${this.changes} receivables deleted and ${this.changes} requests deleted successfully`,
      });
    });
  });
});

// /deletePayment endpoint (DELETE request to delete payments by IDs)
app.delete("/deletePayment", (req, res) => {
  const { ids } = req.body; // Get the array of IDs from the request body

  if (!ids || ids.length === 0) {
    return res.status(400).json({ message: "No IDs provided" });
  }

  // Prepare the query to delete multiple records based on IDs
  const placeholders = ids.map(() => "?").join(", "); // Create placeholders for each ID
  const deleteQuery = `DELETE FROM payment WHERE id IN (${placeholders})`;

  // Execute the query
  const stmt = db.prepare(deleteQuery);
  stmt.run(ids, function (err) {
    if (err) {
      console.error("Error deleting payments:", err);
      return res.status(500).json({ message: "Error deleting payments" });
    }

    if (this.changes === 0) {
      return res
        .status(404)
        .json({ message: "No payments found with the given IDs" });
    }

    const placeholders1 = ids.map(() => "?").join(", "); // Create placeholders for each ID
    const deleteQuery1 = `DELETE FROM receivable WHERE payment_id IN (${placeholders1})`;

    // Execute the query
    const stmt1 = db.prepare(deleteQuery1);
    stmt1.run(ids, function (err) {
      if (err) {
        console.error("Error deleting receivables:", err);
        return res.status(500).json({ message: "Error deleting receivables" });
      }

      if (this.changes === 0) {
        return res
          .status(404)
          .json({ message: "No receivables found with the given IDs" });
      }

      res.status(200).json({
        message: `${this.changes} receivables deleted and ${this.changes} payments deleted successfully`,
      });
    });
  });
});

app.get("/getAllRequests", (req, res) => {
  // Query to get all requests from the database
  const query = "SELECT * FROM request"; // Replace 'requests' with the actual table name
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching requests:", err);
      return res.status(500).json({ message: "Error retrieving requests" });
    }
    // If no requests are found
    if (rows.length === 0) {
      return res.status(404).json({ message: "No requests found" });
    }

    // Return the list of requests
    res.status(200).json({
      message: "Requests retrieved successfully",
      requests: rows,
    });
  });
});

app.get("/getUserRequests/:username", (req, res) => {
  const username = req.params.username;
  // Query to get all requests from the database
  const query =
    "SELECT request_date, amount_request, id FROM request where username = ? order by 1";
  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching requests:", err);
      return res.status(500).json({ message: "Error retrieving requests" });
    }
    // If no requests are found
    if (rows.length === 0) {
      return res.status(404).json({ message: "No requests found" });
    }

    // Return the list of requests
    res.status(200).json({
      message: "Requests retrieved successfully",
      requests: rows,
    });
  });
});

app.get("/getAllReceivables", (req, res) => {
  // Query to get all receivables from the database
  const query = "SELECT * FROM receivable";
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching receivables:", err);
      return res.status(500).json({ message: "Error receivables requests" });
    }
    // If no requests are found
    if (rows.length === 0) {
      return res.status(404).json({ message: "No receivables found" });
    }

    // Return the list of receivables
    res.status(200).json({
      message: "Receivables retrieved successfully",
      requests: rows,
    });
  });
});

app.get("/getAllPayments", (req, res) => {
  // Query to get all payments from the database
  const query = "SELECT * FROM payment";

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching payments:", err);
      return res.status(500).json({ message: "Error retrieving payments" });
    }

    // If no payments are found
    if (rows.length === 0) {
      return res.status(404).json({ message: "No payments found" });
    }

    // Return the list of payments
    res.status(200).json({
      message: "Payments retrieved successfully",
      payments: rows,
    });
  });
});

app.get("/getAllPremiums", (req, res) => {
  // Query to get all payments from the database
  const query = "SELECT * FROM premium";

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching premiums:", err);
      return res.status(500).json({ message: "Error retrieving premiums" });
    }

    // If no payments are found
    if (rows.length === 0) {
      return res.status(404).json({ message: "No premiums found" });
    }

    // Return the list of payments
    res.status(200).json({
      message: "Premiums retrieved successfully",
      premiums: rows,
    });
  });
});

app.get("/getATB/:username", (req, res) => {
  // Retrieve username from the request parameters
  const username = req.params.username;

  // Query to calculate ATB by summing amount_paid from premium, request, and payment
  const query = `
    SELECT 
      (SELECT IFNULL(SUM(p.amount_paid), 0) FROM premium p WHERE p.username = ?) AS premium_sum,
      (SELECT IFNULL(SUM(r.amount_request), 0) FROM request r WHERE r.username = ?) AS request_sum,
      (SELECT IFNULL(SUM(pay.amount_paid), 0) FROM payment pay WHERE pay.username = ?) AS payment_sum
  `;

  // Execute the query with the username parameter
  db.all(query, [username, username, username], (err, rows) => {
    if (err) {
      console.error("Error fetching ATB:", err);
      return res.status(500).json({ message: "Error retrieving ATB" });
    }

    // If no rows are found (i.e., no data for the given username)
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for the specified username" });
    }

    // Get the sums from the query results
    const premiumSum = rows[0].premium_sum;
    const requestSum = rows[0].request_sum;
    const paymentSum = rows[0].payment_sum;

    // Apply the formula: ATB = premiumSum - requestSum + paymentSum
    const atb = premiumSum - requestSum + paymentSum;

    // Return the calculated ATB value
    res.status(200).json({
      message: "ATB retrieved successfully",
      atb: atb.toFixed(2),
    });
  });
});

app.get("/getTotalDisbursed/:username", (req, res) => {
  // Retrieve username from the request parameters
  const username = req.params.username;
  const query =
    "SELECT IFNULL(SUM(r.amount_request), 0) as total_requests FROM request r WHERE r.username = ?";

  // Execute the query with the username parameter
  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching ATB:", err);
      return res.status(500).json({ message: "Error retrieving ATB" });
    }

    // If no rows are found (i.e., no data for the given username)
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for the specified username" });
    }

    // Return the calculated ATB value
    res.status(200).json({
      message: "Total Requests retrieved successfully",
      totalRequest: rows[0].total_requests,
    });
  });
});

app.get("/getTotalPayments/:username", (req, res) => {
  // Retrieve username from the request parameters
  const username = req.params.username;
  const query =
    "SELECT IFNULL(SUM(r.amount_paid), 0) as total_paid FROM payment r WHERE r.username = ?";

  // Execute the query with the username parameter
  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching ATB:", err);
      return res.status(500).json({ message: "Error retrieving ATB" });
    }

    // If no rows are found (i.e., no data for the given username)
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for the specified username" });
    }

    // Return the calculated ATB value
    res.status(200).json({
      message: "Total Requests retrieved successfully",
      totalPaid: rows[0].total_paid,
    });
  });
});

app.get("/getTotalOutstanding/:username", (req, res) => {
  // Retrieve username from the request parameters
  const username = req.params.username;
  const query = `
  SELECT SUM(COALESCE(amount_paid, 0)*1.3 - COALESCE(amount_repaid, 0)) AS total_balance FROM receivable where username = ?;
`;

  // Execute the query with the username parameter
  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching total outstanding:", err);
      return res
        .status(500)
        .json({ message: "Error retrieving total outstanding" });
    }

    // If no rows are found (i.e., no data for the given username)
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for the specified username" });
    }

    // Return the calculated ATB value
    res.status(200).json({
      message: "Total Outstanding retrieved successfully",
      outstanding: rows[0].total_balance,
    });
  });
});

app.get("/getArrearsAmount/:username", (req, res) => {
  // Retrieve username from the request parameters
  const username = req.params.username;
  const query = `
SELECT 
    ROUND(sum(p.amount_paid - ROUND((r.amount_request / 3) * 1.3,2)),2) as arrears_amount
FROM 
    request r
INNER JOIN 
    payment p ON p.request_id = r.id
INNER JOIN 
    installment_dates ind ON ind.id = r.id
WHERE 
    r.username = ?;
`;

  // Execute the query with the username parameter
  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching expected and arrears amounts:", err);
      return res
        .status(500)
        .json({ message: "Error retrieving expected and arrears amounts" });
    }

    // If no rows are found (i.e., no data for the given username)
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for the specified username" });
    }

    // Return the calculated ATB value
    res.status(200).json({
      message: "Arrears amount retrieved successfully",
      arrears: rows[0].arrears_amount,
    });
  });
});

app.get("/getPremiumArrearsAmount/:username", (req, res) => {
  // Retrieve username from the request parameters
  const username = req.params.username;
  const query = `
select (sum(p.amount_paid) - 1000) - ((h.heads * 1000) + 1000) * (SELECT 
    (strftime('%Y', 'now') - 2024) * 12 + 
    (strftime('%m', 'now') - 12)) as premium_arrears
  from user_heads h
  inner join premium p on p.username = h.username 
 where h.username = ?
`;

  // Execute the query with the username parameter
  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error(
        "Error fetching expected and premium arrears amounts:",
        err
      );
      return res.status(500).json({
        message: "Error retrieving expected and premium arrears amounts",
      });
    }

    // If no rows are found (i.e., no data for the given username)
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for the specified username" });
    }

    // Return the calculated ATB value
    res.status(200).json({
      message: "Premium arrears amount retrieved successfully",
      premiumArrears: rows[0].premium_arrears,
    });
  });
});

app.get("/getExpectedAmount/:username", (req, res) => {
  // Retrieve username from the request parameters
  const username = req.params.username;
  const query = `
WITH expected_amount_cte AS (
  SELECT r.request_date,
         r.id,
         r.amount_request,
         p.payment_date,
         p.amount_paid,
    CASE
      WHEN first_installment_date = date('now', '+1 month', 'start of month', '+3 days') OR first_installment_date = date('now', '+1 month', 'start of month', '+2 days') THEN ROUND((r.amount_request / 3) * 1.3,2)
      WHEN second_installment_date = date('now', '+1 month', 'start of month', '+3 days') OR second_installment_date = date('now', '+1 month', 'start of month', '+2 days') THEN ROUND((r.amount_request / 3) * 1.3,2)
      WHEN third_installment_date = date('now', '+1 month', 'start of month', '+3 days') OR third_installment_date = date('now', '+1 month', 'start of month', '+2 days') THEN ROUND((r.amount_request / 3) * 1.3,2)
      ELSE 0
    END AS expected_amount
    FROM request r
INNER JOIN installment_dates ind ON ind.id = r.id
LEFT JOIN payment p ON p.request_id = r.id
WHERE r.username = ?
GROUP BY r.id
HAVING COUNT(r.id) != 3
ORDER BY p.payment_date DESC
)
SELECT SUM(CASE
            WHEN p.payment_date IS NULL THEN expected_amount ELSE 0
           END) AS total_expected_monthly
  FROM expected_amount_cte eac
LEFT JOIN payment p ON p.request_id = eac.id AND p.payment_date > date('now', 'start of month', '+2 days')
`;

  // Execute the query with the username parameter
  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching expected and arrears amounts:", err);
      return res
        .status(500)
        .json({ message: "Error retrieving expected and arrears amounts" });
    }

    // If no rows are found (i.e., no data for the given username)
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for the specified username" });
    }
    res.status(200).json({
      message: "Expected amount retrieved successfully",
      expectedAmount: rows[0].total_expected_monthly ?? 0,
    });
  });
});

app.get("/getTotalPayments/:username", (req, res) => {
  // Retrieve username from the request parameters
  const username = req.params.username;
  const query =
    "SELECT  as total_expected FROM receivable r WHERE r.username = ?";

  // Execute the query with the username parameter
  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching ATB:", err);
      return res.status(500).json({ message: "Error retrieving ATB" });
    }

    // If no rows are found (i.e., no data for the given username)
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No data found for the specified username" });
    }

    // Return the calculated ATB value
    res.status(200).json({
      message: "Total Requests retrieved successfully",
      totalPaid: rows[0].expected_amount_due,
    });
  });
});

app.get("/getGuaranteedSplit/:username", (req, res) => {
  // Query to get all payments from the database
  const username = req.params.username;
  const query =
    "SELECT ROUND(sum(amount_paid),2) - 1000 AS paid_premiums FROM premium where username = ?";

  db.all(query, [username], (err, rows) => {
    if (err) {
      console.error("Error fetching premiums:", err);
      return res.status(500).json({ message: "Error retrieving premiums" });
    }

    // If no payments are found
    if (rows.length === 0) {
      return res.status(404).json({ message: "No premiums found" });
    }

    // Return the list of payments
    res.status(200).json({
      message: "Premiums retrieved successfully",
      guaranteedSplit: rows[0].paid_premiums * 1.3,
    });
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
