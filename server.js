require('dotenv').config({ path: 'discord.env' });
// Use reliable DNS for Discord API (fixes getaddrinfo EAI_AGAIN on Pi-hole / bad stub resolvers).
// Optional: OAUTH_DNS_SERVERS=1.1.1.1,8.8.8.8 in discord.env; defaults shown below.
try {
    const dns = require('dns');
    const list = process.env.OAUTH_DNS_SERVERS
        ? process.env.OAUTH_DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean)
        : ['1.1.1.1', '8.8.8.8'];
    if (list.length) dns.setServers(list);
} catch (_) { /* ignore */ }

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Try to load Discord auth features (optional)
let authEnabled = false;
try {
    const session = require('express-session');
    const passport = require('passport');
    const DiscordStrategy = require('passport-discord-auth').Strategy;

    // Check if all required env vars are present
    if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_CALLBACK_URL && process.env.SESSION_SECRET) {
        authEnabled = true;
        console.log('Discord authentication enabled');
    } else {
        console.log('Discord authentication disabled (missing credentials)');
    }
} catch (error) {
    console.log('Discord authentication disabled (dependencies not installed)');
}

// Create bug-reports directory if it doesn't exist
const bugReportsDir = path.join(__dirname, 'bug-reports');
if (!fs.existsSync(bugReportsDir)) {
    fs.mkdirSync(bugReportsDir, { recursive: true });
}

// Create data directories for profiles and inbox
const dataDir = path.join(__dirname, 'data');
const usersDir = path.join(dataDir, 'users');
const inboxDir = path.join(dataDir, 'inbox');
const buildsDir = path.join(__dirname, 'builds');

[dataDir, usersDir, inboxDir, buildsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportDir = path.join(bugReportsDir, timestamp);
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        req.reportDir = reportDir; // Store for later use
        cb(null, reportDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `screenshot${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept images only
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'), false);
        }
        cb(null, true);
    }
});

// ─── Static assets served BEFORE session/auth middleware ─────────────────────
// This bypasses session parsing and passport deserialization for every .js/.css
// file, which previously serialised all 40+ parallel module requests through
// Node's single thread and was the primary cause of slow initial load times.

// Serve pre-compressed item JSON files
app.get('/data/items/*.json', (req, res, next) => {
    const requestedPath = path.join(__dirname, req.path);
    const gzipPath = requestedPath + '.gz';
    const acceptsGzip = req.headers['accept-encoding']?.includes('gzip');
    if (acceptsGzip && fs.existsSync(gzipPath)) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.sendFile(gzipPath);
    } else {
        next();
    }
});

// Serve all other static files (JS, CSS, images, etc.)
app.use(express.static(__dirname, {
    maxAge: '1h',
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));
// ─────────────────────────────────────────────────────────────────────────────

// Middleware to parse JSON bodies
app.use(express.json());

// Setup authentication if enabled
if (authEnabled) {
    const session = require('express-session');
    const passport = require('passport');
    const DiscordStrategy = require('passport-discord-auth').Strategy;

    // Trust proxy - required when running behind Nginx reverse proxy
    app.set('trust proxy', 1);

    // Configure session
    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: true,
        saveUninitialized: true, // Required for OAuth: Passport must persist the state before the Discord redirect
        name: 'ichacalc.sid',
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            secure: false,
            httpOnly: true,
            sameSite: 'lax',
            path: '/'
        },
        proxy: true
    }));

    // Initialize Passport
    app.use(passport.initialize());
    app.use(passport.session());

    // Configure Discord Strategy
    passport.use(new DiscordStrategy({
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackUrl: process.env.DISCORD_CALLBACK_URL,
        scope: ['identify', 'email']
    }, (accessToken, refreshToken, profile, done) => {
        const userData = {
            id: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            avatar: profile.avatar,
            email: profile.email
        };

        const userFile = path.join(usersDir, `${profile.id}.json`);
        try {
            let userRecord;
            if (fs.existsSync(userFile)) {
                userRecord = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
                userRecord.username = userData.username;
                userRecord.discriminator = userData.discriminator;
                userRecord.avatar = userData.avatar;
                userRecord.email = userData.email;
                userRecord.lastLogin = new Date().toISOString();
            } else {
                userRecord = {
                    ...userData,
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString(),
                    profiles: []
                };
            }
            fs.writeFileSync(userFile, JSON.stringify(userRecord, null, 2));
            return done(null, userRecord);
        } catch (error) {
            return done(error, null);
        }
    }));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser((id, done) => {
        const userFile = path.join(usersDir, `${id}.json`);
        try {
            if (fs.existsSync(userFile)) {
                const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
                done(null, user);
            } else {
                done(new Error('User not found'), null);
            }
        } catch (error) {
            done(error, null);
        }
    });
}

// =======================
// Authentication Routes (only if auth is enabled)
// =======================

if (authEnabled) {
    const passport = require('passport');

// =======================
// Authentication Routes
// =======================

// Initiate Discord OAuth
app.get('/auth/discord', passport.authenticate('discord'));

// Discord OAuth callback
// Passport 0.7.0 regenerates the session ID on login, but the new Set-Cookie
// can get lost through the server.py reverse proxy. Prevent regeneration so
// the browser keeps the cookie it already received from /auth/discord.
app.get('/auth/callback',
    (req, res, next) => {
        const regen = req.session.regenerate;
        req.session.regenerate = (cb) => { cb(); };
        next();
    },
    passport.authenticate('discord', { failureRedirect: '/?auth=fail' }),
    (req, res) => {
        console.log('[callback] user:', req.user?.username, 'sessionID:', req.sessionID);
        req.session.save((err) => {
            if (err) console.error('[callback] Session save error:', err);
            console.log('[callback] saved, passport:', JSON.stringify(req.session.passport));
            res.redirect('/');
        });
    }
);

// Logout
app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.redirect('/');
    });
});

// Get current user info
app.get('/user', (req, res) => {
    res.set('Cache-Control', 'no-store');
    console.log('[/user] sessionID:', req.sessionID, 'isAuth:', req.isAuthenticated(), 'hasPassport:', !!req.session?.passport);
    if (!req.isAuthenticated()) {
        return res.json({ authenticated: false });
    }
    res.json({
        authenticated: true,
        user: {
            id: req.user.id,
            username: req.user.username,
            discriminator: req.user.discriminator,
            avatar: req.user.avatar
        }
    });
});

// =======================
// Profile Management Routes
// =======================

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    next();
};

/** Profile ids may be string or number in stored JSON; Express :id is always a string. */
function profileMatchesParamId(profile, rawId) {
    if (!profile || rawId === undefined || rawId === null) return false;
    return String(profile.id) === String(rawId);
}

// Get user's profiles
app.get('/profiles', requireAuth, (req, res) => {
    try {
        const userFile = path.join(usersDir, `${req.user.id}.json`);
        const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, profiles: user.profiles || [] });
    } catch (error) {
        console.error('Error fetching profiles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save a new profile
app.post('/profiles', requireAuth, (req, res) => {
    try {
        const { name, buildData, isDefault } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Profile name is required' });
        }

        const userFile = path.join(usersDir, `${req.user.id}.json`);
        const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));

        if (!user.profiles) {
            user.profiles = [];
        }

        // If marking as default, clear existing default first
        if (isDefault) {
            user.profiles = user.profiles.map(p => {
                const { isDefault: _d, ...rest } = p;
                return rest;
            });
        }

        const newProfile = {
            id: Date.now().toString(),
            name,
            buildData,
            ...(isDefault ? { isDefault: true } : {}),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        user.profiles.push(newProfile);

        fs.writeFileSync(userFile, JSON.stringify(user, null, 2));

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, profile: newProfile });
    } catch (error) {
        console.error('Error saving profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set a profile as the default build (register before PATCH /profiles/:id so the path is never captured as :id)
app.patch('/profiles/:id/set-default', requireAuth, (req, res) => {
    try {
        const { id } = req.params;

        const userFile = path.join(usersDir, `${req.user.id}.json`);
        const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));

        if (!user.profiles) {
            return res.status(404).json({ success: false, error: 'No profiles found' });
        }

        // Clear default on all profiles, set on target
        let found = false;
        user.profiles = user.profiles.map(p => {
            if (profileMatchesParamId(p, id)) {
                found = true;
                return { ...p, isDefault: true };
            }
            const { isDefault, ...rest } = p;
            return rest;
        });

        if (!found) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        fs.writeFileSync(userFile, JSON.stringify(user, null, 2));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, profiles: user.profiles });
    } catch (error) {
        console.error('Error setting default profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update a profile
app.patch('/profiles/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        const { name, buildData } = req.body;

        const userFile = path.join(usersDir, `${req.user.id}.json`);
        const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));

        const profileIndex = user.profiles.findIndex(p => profileMatchesParamId(p, id));
        if (profileIndex === -1) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        // Update profile fields (preserve isDefault and other metadata)
        if (name !== undefined) user.profiles[profileIndex].name = name;
        if (buildData !== undefined) user.profiles[profileIndex].buildData = buildData;
        user.profiles[profileIndex].updatedAt = new Date().toISOString();

        fs.writeFileSync(userFile, JSON.stringify(user, null, 2));

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, profile: user.profiles[profileIndex] });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a profile
app.delete('/profiles/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;

        const userFile = path.join(usersDir, `${req.user.id}.json`);
        const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));

        const profileIndex = user.profiles.findIndex(p => profileMatchesParamId(p, id));
        if (profileIndex === -1) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        user.profiles.splice(profileIndex, 1);
        fs.writeFileSync(userFile, JSON.stringify(user, null, 2));

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, message: 'Profile deleted successfully' });
    } catch (error) {
        console.error('Error deleting profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =======================
// Share & Inbox Routes
// =======================

// Share a build with another user
app.post('/share', requireAuth, (req, res) => {
    try {
        let { recipientId, buildData, message } = req.body;

        if (!recipientId || !buildData) {
            return res.status(400).json({
                success: false,
                error: 'Recipient ID and build data are required'
            });
        }

        // If recipientId is not a number (Discord ID), try to find user by username
        let recipientFile = path.join(usersDir, `${recipientId}.json`);

        if (!fs.existsSync(recipientFile)) {
            // Try to find user by username
            const userFiles = fs.readdirSync(usersDir);
            let foundUser = null;

            for (const file of userFiles) {
                if (file.endsWith('.json')) {
                    try {
                        const userData = JSON.parse(fs.readFileSync(path.join(usersDir, file), 'utf-8'));
                        // Case-insensitive username match
                        if (userData.username && userData.username.toLowerCase() === recipientId.toLowerCase()) {
                            foundUser = userData;
                            recipientId = userData.id;
                            recipientFile = path.join(usersDir, file);
                            break;
                        }
                    } catch (err) {
                        // Skip invalid files
                        continue;
                    }
                }
            }

            if (!foundUser) {
                return res.status(404).json({
                    success: false,
                    error: `User '${recipientId}' not found. Make sure they have logged in at least once.`
                });
            }
        }

        // Create inbox directory for recipient if it doesn't exist
        const recipientInboxDir = path.join(inboxDir, recipientId);
        if (!fs.existsSync(recipientInboxDir)) {
            fs.mkdirSync(recipientInboxDir, { recursive: true });
        }

        // Create shared build message
        const messageId = Date.now().toString();
        const sharedMessage = {
            id: messageId,
            from: {
                id: req.user.id,
                username: req.user.username,
                discriminator: req.user.discriminator,
                avatar: req.user.avatar
            },
            buildData,
            message: message || '',
            timestamp: new Date().toISOString(),
            read: false
        };

        const messageFile = path.join(recipientInboxDir, `${messageId}.json`);
        fs.writeFileSync(messageFile, JSON.stringify(sharedMessage, null, 2));

        res.json({
            success: true,
            message: 'Build shared successfully',
            messageId
        });
    } catch (error) {
        console.error('Error sharing build:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user's inbox messages
app.get('/inbox', requireAuth, (req, res) => {
    try {
        const userInboxDir = path.join(inboxDir, req.user.id);

        if (!fs.existsSync(userInboxDir)) {
            return res.json({ success: true, messages: [], unreadCount: 0 });
        }

        const messageFiles = fs.readdirSync(userInboxDir)
            .filter(file => file.endsWith('.json'))
            .sort()
            .reverse(); // Most recent first

        const messages = messageFiles.map(file => {
            const messagePath = path.join(userInboxDir, file);
            return JSON.parse(fs.readFileSync(messagePath, 'utf-8'));
        });

        const unreadCount = messages.filter(m => !m.read).length;

        res.json({ success: true, messages, unreadCount });
    } catch (error) {
        console.error('Error fetching inbox:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark message as read
app.patch('/api/inbox/:messageId', requireAuth, (req, res) => {
    try {
        const { messageId } = req.params;
        const { read } = req.body;

        const messagePath = path.join(inboxDir, req.user.id, `${messageId}.json`);

        if (!fs.existsSync(messagePath)) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        const message = JSON.parse(fs.readFileSync(messagePath, 'utf-8'));
        message.read = read !== undefined ? read : true;

        fs.writeFileSync(messagePath, JSON.stringify(message, null, 2));

        res.json({ success: true, message: 'Message updated successfully' });
    } catch (error) {
        console.error('Error updating message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete inbox message
app.delete('/inbox/:messageId', requireAuth, (req, res) => {
    try {
        const { messageId } = req.params;
        const messagePath = path.join(inboxDir, req.user.id, `${messageId}.json`);

        if (!fs.existsSync(messagePath)) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        fs.unlinkSync(messagePath);

        res.json({ success: true, message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

} // End if (authEnabled)

// =======================
// Bug Report Routes
// =======================

// Serve bug report screenshots - handle any file in the timestamp directory
app.get('/bug-reports/:timestamp/:filename', (req, res) => {
    const timestamp = req.params.timestamp;
    const filename = req.params.filename;
    const filePath = path.join(bugReportsDir, timestamp, filename);
    
    // Security check: ensure the path is within bugReportsDir
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(bugReportsDir);
    if (!resolvedPath.startsWith(resolvedDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(resolvedPath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Get all bug reports
app.get('/bug-reports', (req, res) => {
    try {
        const reports = [];
        
        if (!fs.existsSync(bugReportsDir)) {
            // Set cache control headers to prevent caching
            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            return res.json({ success: true, reports: [] });
        }
        
        const reportDirs = fs.readdirSync(bugReportsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .sort()
            .reverse(); // Most recent first
        
        for (const dir of reportDirs) {
            const reportPath = path.join(bugReportsDir, dir, 'report.json');
            if (fs.existsSync(reportPath)) {
                try {
                    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
                    
                    // Check if screenshot exists (check for common image extensions)
                    const screenshotExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
                    let hasScreenshot = false;
                    let screenshotFilename = null;
                    
                    for (const ext of screenshotExtensions) {
                        const screenshotPath = path.join(bugReportsDir, dir, `screenshot${ext}`);
                        if (fs.existsSync(screenshotPath)) {
                            hasScreenshot = true;
                            screenshotFilename = `screenshot${ext}`;
                            break;
                        }
                    }
                    
                    // Also check if report.json specifies a screenshot filename
                    if (!hasScreenshot && reportData.screenshot) {
                        const specifiedPath = path.join(bugReportsDir, dir, reportData.screenshot);
                        if (fs.existsSync(specifiedPath)) {
                            hasScreenshot = true;
                            screenshotFilename = reportData.screenshot;
                        }
                    }
                    
                    reportData.hasScreenshot = hasScreenshot;
                    reportData.screenshotFilename = screenshotFilename;
                    reportData.timestampDir = dir;
                    // Ensure status exists (default to 'open' for old reports)
                    if (!reportData.status) {
                        reportData.status = 'open';
                    }
                    reports.push(reportData);
                } catch (err) {
                    console.error(`Error reading report ${dir}:`, err);
                }
            }
        }
        
        // Set cache control headers to prevent caching
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.json({ success: true, reports });
    } catch (error) {
        console.error('Error fetching bug reports:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update bug report status
app.patch('/bug-reports/:timestamp/status', (req, res) => {
    try {
        const { timestamp } = req.params;
        const { status } = req.body;

        if (!status || (status !== 'open' && status !== 'fixed')) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid status. Must be "open" or "fixed".' 
            });
        }

        const reportPath = path.join(bugReportsDir, timestamp, 'report.json');
        
        if (!fs.existsSync(reportPath)) {
            return res.status(404).json({ 
                success: false, 
                error: 'Bug report not found.' 
            });
        }

        // Read existing report
        const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        
        // Update status
        reportData.status = status;
        
        // Save updated report
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

        // Set cache control headers
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.json({ success: true, message: 'Bug report status updated successfully' });
    } catch (error) {
        console.error('Error updating bug report status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle bug report submissions
app.post('/bug-report', upload.single('screenshot'), (req, res) => {
    try {
        const { title, description, contact, timestamp, userAgent, url } = req.body;

        // Create report data
        const reportData = {
            title: title || 'No title provided',
            description,
            contact: contact || 'No contact provided',
            timestamp: timestamp || new Date().toISOString(),
            userAgent,
            url,
            screenshot: req.file ? req.file.filename : null,
            status: 'open' // Default status for new reports
        };

        // Determine the report directory
        let reportDir;
        if (req.reportDir) {
            reportDir = req.reportDir;
        } else {
            // If no file uploaded, create directory for text-only report
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            reportDir = path.join(bugReportsDir, ts);
            if (!fs.existsSync(reportDir)) {
                fs.mkdirSync(reportDir, { recursive: true });
            }
        }

        // Save report data as JSON
        const reportPath = path.join(reportDir, 'report.json');
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

        // Extract the timestamp directory name for the client to store
        const timestampDir = path.basename(reportDir);

        console.log(`Bug report saved to: ${reportDir}`);

        res.json({ 
            success: true, 
            message: 'Bug report submitted successfully',
            timestampDir: timestampDir // Return the exact directory name used
        });
    } catch (error) {
        console.error('Error saving bug report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// Build Sharing API (public, no auth required)
// ============================================================================

// Generate a short unique ID for builds
function generateBuildId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Save a build (public, no auth required)
app.post('/builds', (req, res) => {
    try {
        const buildData = req.body;
        
        if (!buildData || typeof buildData !== 'object') {
            return res.status(400).json({ success: false, error: 'Invalid build data' });
        }
        
        // Generate unique build ID
        let buildId = generateBuildId();
        let buildPath = path.join(buildsDir, `${buildId}.json`);
        
        // Ensure unique ID (very unlikely collision, but just in case)
        while (fs.existsSync(buildPath)) {
            buildId = generateBuildId();
            buildPath = path.join(buildsDir, `${buildId}.json`);
        }
        
        // Add metadata
        const buildWithMeta = {
            ...buildData,
            _meta: {
                id: buildId,
                createdAt: new Date().toISOString()
            }
        };
        
        // Save build
        fs.writeFileSync(buildPath, JSON.stringify(buildWithMeta, null, 2));
        
        console.log(`[Builds] Saved build: ${buildId}`);
        
        res.json({ success: true, buildId });
    } catch (error) {
        console.error('[Builds] Error saving build:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Load a build (public, no auth required)
app.get('/builds/:buildId', (req, res) => {
    try {
        const { buildId } = req.params;
        
        // Sanitize buildId to prevent path traversal
        if (!/^[A-Za-z0-9]+$/.test(buildId)) {
            return res.status(400).json({ success: false, error: 'Invalid build ID format' });
        }
        
        const buildPath = path.join(buildsDir, `${buildId}.json`);
        
        if (!fs.existsSync(buildPath)) {
            console.log(`[Builds] Build not found: ${buildId}`);
            return res.status(404).json({ success: false, error: 'Build not found' });
        }
        
        const buildData = JSON.parse(fs.readFileSync(buildPath, 'utf-8'));
        
        console.log(`[Builds] Loaded build: ${buildId}`);
        
        res.json({ success: true, build: buildData });
    } catch (error) {
        console.error('[Builds] Error loading build:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File size too large. Maximum size is 5MB.'
            });
        }
    }
    if (error.oauthError) {
        const oe = error.oauthError;
        if (oe.statusCode && oe.data) {
            console.error('[OAuth token] HTTP', oe.statusCode, oe.data);
        } else {
            console.error('[OAuth token]', oe);
        }
    }
    res.status(500).json({ success: false, error: error.message });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`IchaCalc server running on http://0.0.0.0:${PORT}`);
    console.log(`Bug reports will be saved to: ${bugReportsDir}`);
});
