const express = require('express');
const router = express.Router();
const Suggestion = require('../models/Suggestion');
const { protect, admin } = require('../middleware/authMiddleware');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const uploadDir = path.join(__dirname, '../uploads');
const isVercel = process.env.VERCEL === '1';

// Only create local uploads folder if NOT on Vercel
if (!isVercel && !fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (err) {
        console.warn('Could not create uploads directory:', err.message);
    }
}

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Storage Engine
let storage;

if (process.env.CLOUDINARY_CLOUD_NAME) {
    // UPLOAD TO CLOUDINARY
    storage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'campus_suggestions',
            allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
        },
    });
    console.log('Using Cloudinary for uploads');
} else {
    // FALLBACK TO LOCAL STORAGE
    const fallbackDir = process.env.VERCEL ? '/tmp' : 'uploads/';
    storage = multer.diskStorage({
        destination(req, file, cb) {
            cb(null, fallbackDir);
        },
        filename(req, file, cb) {
            cb(null, `${Date.now()}-${file.originalname}`);
        }
    });
    console.log(`Using local disk for uploads (${fallbackDir})`);
}

const upload = multer({
    storage,
    limits: { fileSize: 5000000 },
});

// Middleware to log upload attempt
const logUpload = (req, res, next) => {
    console.log('--- File Upload Attempt ---');
    console.log('Cloudinary Configured:', !!process.env.CLOUDINARY_CLOUD_NAME);
    next();
};

// POST /api/suggestions (Private)
router.post('/', protect, logUpload, (req, res, next) => {
    upload.single('attachment')(req, res, (err) => {
        if (err) {
            console.error('Multer/Cloudinary Error:', err);
            return res.status(400).json({ 
                error: 'File upload failed', 
                details: err.message,
                storageType: process.env.CLOUDINARY_CLOUD_NAME ? 'Cloudinary' : 'Local'
            });
        }
        if (req.file) {
            console.log('File uploaded successfully:', req.file.path);
        }
        next();
    });
}, async (req, res) => {
    try {
        const { name, category, message, visibility } = req.body;
        
        let attachmentUrl = null;
        if (req.file) {
            // Cloudinary returns the full URL in .path or .secure_url
            // Local multer returns the local relative path in .path
            if (process.env.CLOUDINARY_CLOUD_NAME) {
                attachmentUrl = req.file.path; // This will be the Cloudinary URL
            } else {
                attachmentUrl = `/${req.file.path.replace(/\\\\/g, '/').replace(/\\/g, '/')}`;
            }
        }

        const newSuggestion = new Suggestion({
            user: req.user ? req.user._id : null,
            name: req.user ? req.user.name : name,
            category,
            message,
            attachmentUrl,
            visibility: visibility === 'personal' ? 'personal' : 'public'
        });
        await newSuggestion.save();
        res.status(201).json(newSuggestion);
    } catch (err) {
        console.error('Database Error:', err);
        res.status(400).json({ error: err.message });
    }
});

// GET /api/suggestions/me (Private/Student)
router.get('/me', protect, async (req, res) => {
    try {
        const suggestions = await Suggestion.find({ user: req.user._id })
            .sort({ createdAt: -1 });
        res.json(suggestions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/suggestions/public (Public)
router.get('/public', async (req, res) => {
    try {
        const suggestions = await Suggestion.find({ visibility: { $ne: 'personal' } })
            // Sort by most upvotes, then newest
            .sort({ upvotes: -1, createdAt: -1 });
        res.json(suggestions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/suggestions (Private/Admin)
router.get('/', protect, admin, async (req, res) => {
    try {
        const suggestions = await Suggestion.find()
            // Sort by most upvotes, then newest
            .sort({ upvotes: -1, createdAt: -1 });
        res.json(suggestions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/suggestions/:id/status (Private/Admin)
router.patch('/:id/status', protect, admin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['Pending', 'Under Review', 'Resolved'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const suggestion = await Suggestion.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        
        if (!suggestion) {
            return res.status(404).json({ error: 'Suggestion not found' });
        }
        
        res.json(suggestion);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/suggestions/:id/reply (Private/Admin)
router.patch('/:id/reply', protect, admin, async (req, res) => {
    try {
        const { adminReply } = req.body;
        
        const suggestion = await Suggestion.findByIdAndUpdate(
            req.params.id,
            { adminReply },
            { new: true }
        );
        
        if (!suggestion) {
            return res.status(404).json({ error: 'Suggestion not found' });
        }
        
        res.json(suggestion);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/suggestions/:id/upvote (Private)
router.post('/:id/upvote', protect, async (req, res) => {
    try {
        const suggestion = await Suggestion.findById(req.params.id);
        
        if (!suggestion) {
            return res.status(404).json({ error: 'Suggestion not found' });
        }
        
        // Check if user has already upvoted
        const userId = req.user._id;
        const index = suggestion.upvotes.indexOf(userId);

        if (index === -1) {
            // Un-voted -> Upvote
            suggestion.upvotes.push(userId);
        } else {
            // Already Voted -> Un-vote (toggle)
            suggestion.upvotes.splice(index, 1);
        }

        await suggestion.save();
        res.json(suggestion);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/suggestions/:id (Private/Admin)
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        await Suggestion.findByIdAndDelete(req.params.id);
        res.json({ message: 'Suggestion deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
