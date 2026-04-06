const path = require('path');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const suggestionRoutes = require('./routes/suggestionRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// ✅ ADD THIS (fix COOP issue)
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/auth', authRoutes);

// Define a simple health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is running correctly',
    timestamp: new Date().toISOString()
  });
});

// Root route to prevent "Cannot GET /" on Vercel deployment
app.get('/', (req, res) => {
  res.send('Campus Suggestion Box Backend API is running.');
});

// ✅ BETTER Mongo connection (important for Vercel)
let cachedDb = null;

const connectDB = async () => {
  if (cachedDb) return;
  
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from environment variables.");
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    cachedDb = conn.connection;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

if (require.main === module) {
  // Run locally on `npm start`
  connectDB().then(() => {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }).catch(err => {
    console.error("Local Server Start Error:", err);
  });
} else {
  // Export for Vercel Serverless (With Error Reporting)
  module.exports = async (req, res) => {
    try {
      await connectDB();
      return app(req, res);
    } catch (err) {
      console.error("Vercel Serverless Error:", err.message);
      res.status(500).json({ 
        success: false, 
        message: "Server failed to connect to database.",
        error: err.message 
      });
    }
  };
}