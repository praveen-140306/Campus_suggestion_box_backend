const mongoose = require('mongoose');

const SuggestionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Keep optional for now to support backwards compatibility with legacy anonymous data
    },
    name: { type: String, default: 'Anonymous' },
    category: {
        type: String,
        required: true,
        enum: ['Academics', 'Facilities', 'Events', 'Others']
    },
    message: { type: String, required: true },
    status: {
        type: String,
        enum: ['Pending', 'Under Review', 'Resolved'],
        default: 'Pending'
    },
    adminReply: { type: String },
    attachmentUrl: { type: String },
    visibility: {
        type: String,
        enum: ['public', 'personal'],
        default: 'public'
    },
    upvotes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Suggestion', SuggestionSchema);
