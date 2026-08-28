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

function isSiteAdmin(req) {
    const adminId = process.env.SITE_ADMIN_DISCORD_ID;
    if (!adminId) return false;
    try {
        if (typeof req.isAuthenticated !== 'function' || !req.isAuthenticated()) return false;
        return String(req.user?.id) === String(adminId);
    } catch {
        return false;
    }
}

function requireBugAdmin(req, res, next) {
    if (!isSiteAdmin(req)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    next();
}

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
const sessionsDir = path.join(dataDir, 'sessions');
const buildsDir = path.join(__dirname, 'builds');
const gearPlansDir = path.join(__dirname, 'gear-plans');
const communityGearPlansDir = path.join(dataDir, 'community-gear-plans');

[dataDir, usersDir, inboxDir, sessionsDir, buildsDir, gearPlansDir, communityGearPlansDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const communityIndexPath = path.join(communityGearPlansDir, 'index.json');
/** Hard ceiling for a single list response. Omitted/`all=1` returns every match up to this. */
const COMMUNITY_LIST_MAX = 5000;

function readCommunityIndex() {
    try {
        if (!fs.existsSync(communityIndexPath)) return [];
        const raw = JSON.parse(fs.readFileSync(communityIndexPath, 'utf-8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function writeCommunityIndex(entries) {
    fs.writeFileSync(communityIndexPath, JSON.stringify(entries, null, 2));
}

function sortCommunityIndexEntries(entries) {
    return [...entries].sort((a, b) => {
        const scoreA = (Number(a.upvotes) || 0) - (Number(a.downvotes) || 0);
        const scoreB = (Number(b.upvotes) || 0) - (Number(b.downvotes) || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
}

function communityIndexEntryFromPlan(plan) {
    if (!plan) return null;
    return toCommunityEntry(plan, { username: plan.authorName, id: plan.authorId }, {
        votes: plan.votes,
        upvotes: plan.upvotes,
        downvotes: plan.downvotes,
        createdAt: plan.createdAt,
    });
}

/** Keep index.json aligned with on-disk plan files and unpublished cloud saves. */
function reconcileCommunityIndex() {
    const current = readCommunityIndex();
    const byId = new Map();
    for (const e of current) {
        const id = sanitizeCommunityPlanId(e && e.id);
        if (id) byId.set(id, e);
    }
    let changed = false;
    let names = [];
    try {
        names = fs.readdirSync(communityGearPlansDir);
    } catch {
        return current;
    }
    const fileIds = new Set();
    for (const name of names) {
        if (!name.endsWith('.json') || name === 'index.json') continue;
        const id = sanitizeCommunityPlanId(path.basename(name, '.json'));
        if (!id) continue;
        fileIds.add(id);
        if (byId.has(id)) continue;
        try {
            const loaded = loadCommunityPlanFile(id);
            const entry = communityIndexEntryFromPlan(loaded && loaded.plan);
            if (entry) {
                byId.set(id, entry);
                changed = true;
            }
        } catch (_) { /* skip unreadable plan file */ }
    }
    for (const id of [...byId.keys()]) {
        if (!fileIds.has(id)) {
            byId.delete(id);
            changed = true;
        }
    }
    try {
        const userNames = fs.readdirSync(usersDir).filter((f) => f.endsWith('.json'));
        for (const uf of userNames) {
            let user;
            try {
                user = JSON.parse(fs.readFileSync(path.join(usersDir, uf), 'utf-8'));
            } catch (_) {
                continue;
            }
            const authorId = String(user.id || path.basename(uf, '.json'));
            for (const plan of user.gearPlans || []) {
                if (plan.community === false) continue;
                const id = sanitizeCommunityPlanId(plan.id);
                if (!id || byId.has(id) || fileIds.has(id)) continue;
                try {
                    const entry = publishCommunityGearPlan(plan, {
                        username: plan.authorName || user.username || 'Anonymous',
                        id: plan.authorId || authorId,
                    });
                    if (entry) {
                        byId.set(id, entry);
                        fileIds.add(id);
                        changed = true;
                    }
                } catch (_) { /* skip plans that cannot be published */ }
            }
        }
    } catch (_) { /* users dir missing */ }
    if (!changed) return current;
    const next = sortCommunityIndexEntries([...byId.values()]);
    writeCommunityIndex(next);
    return next;
}

function sanitizeCommunityPlanId(id) {
    const s = String(id || '');
    return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null;
}

function normalizeRoles(roles) {
    const allowed = new Set(['dps', 'tank', 'healer']);
    const arr = Array.isArray(roles) ? roles : (roles != null && roles !== '' ? [roles] : []);
    const out = [];
    for (const r of arr) {
        const key = String(r).toLowerCase().trim();
        if (allowed.has(key) && !out.includes(key)) out.push(key);
    }
    return out;
}

function sanitizeIconKey(icon) {
    if (icon == null) return '';
    const key = String(icon)
        .replace(/^https?:\/\/[^/]+\/.*\//i, '')
        .replace(/\.(jpg|png|blp)$/i, '')
        .toLowerCase()
        .trim();
    return /^[a-z0-9_]+$/.test(key) ? key : '';
}

function sanitizePlanDescription(desc) {
    return String(desc == null ? '' : desc).replace(/\s+/g, ' ').trim().slice(0, 180);
}

function sanitizePlanName(name, fallback = 'Gear Plan') {
    const cleaned = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 64);
    return cleaned || fallback;
}

/** Resolve community author for an existing plan id (index or file). */
function getCommunityPlanAuthorId(planId) {
    const id = sanitizeCommunityPlanId(planId);
    if (!id) return null;
    const fromIndex = readCommunityIndex().find(e => String(e.id) === String(id));
    if (fromIndex?.authorId != null) return String(fromIndex.authorId);
    try {
        const loaded = loadCommunityPlanFile(id);
        if (loaded?.plan?.authorId != null) return String(loaded.plan.authorId);
    } catch (_) { /* ignore */ }
    return null;
}

/** Talent tree key order matches classTalents Object.keys for each class. */
const CLASS_TALENT_TREE_KEYS = {
    warrior: ['arms', 'fury', 'protection'],
    paladin: ['holy', 'protection', 'retribution'],
    hunter: ['beastmastery', 'marksmanship', 'survival'],
    rogue: ['assassination', 'combat', 'subtlety'],
    priest: ['discipline', 'holy', 'shadow'],
    shaman: ['elemental', 'enhancement', 'restoration'],
    mage: ['arcane', 'fire', 'frost'],
    warlock: ['affliction', 'demonology', 'destruction'],
    druid: ['balance', 'feralCombat', 'restoration'],
};

function computeTalentSpread(plan) {
    const talents = plan?.talents && typeof plan.talents === 'object' ? plan.talents : {};
    const cls = String(plan?.class || '').toLowerCase();
    let trees = CLASS_TALENT_TREE_KEYS[cls];
    if (!trees) {
        const prefixes = new Set();
        for (const key of Object.keys(talents)) {
            const i = key.indexOf('-');
            if (i > 0) prefixes.add(key.slice(0, i));
        }
        trees = [...prefixes].sort();
        if (!trees.length) return [0, 0, 0];
    }
    return trees.map((tk) => {
        let n = 0;
        for (const [key, val] of Object.entries(talents)) {
            if (key === tk || key.startsWith(`${tk}-`)) n += Number(val) || 0;
        }
        return n;
    });
}

function sanitizeVoterId(raw) {
    const s = String(raw || '').trim().slice(0, 80);
    return /^[A-Za-z0-9_.:-]{4,80}$/.test(s) ? s : null;
}

function recountVotes(votes) {
    let upvotes = 0;
    let downvotes = 0;
    if (votes && typeof votes === 'object') {
        for (const dir of Object.values(votes)) {
            if (dir === 'up') upvotes += 1;
            else if (dir === 'down') downvotes += 1;
        }
    }
    return { upvotes, downvotes };
}

function loadCommunityPlanFile(id) {
    const planPath = path.join(communityGearPlansDir, `${id}.json`);
    if (!fs.existsSync(planPath)) return null;
    return { planPath, plan: JSON.parse(fs.readFileSync(planPath, 'utf-8')) };
}

function publicCommunityEntry(entry, voterId) {
    const upvotes = Number(entry.upvotes) || 0;
    const downvotes = Number(entry.downvotes) || 0;
    const out = {
        id: entry.id,
        name: entry.name,
        class: entry.class,
        role: normalizeRoles(entry.role),
        spec: entry.spec || '',
        icon: entry.icon || 'inv_misc_questionmark',
        description: sanitizePlanDescription(entry.description),
        authorName: entry.authorName || 'Anonymous',
        authorId: entry.authorId,
        updatedAt: entry.updatedAt,
        createdAt: entry.createdAt,
        upvotes,
        downvotes,
        score: upvotes - downvotes,
        talentSpread: Array.isArray(entry.talentSpread) ? entry.talentSpread : [0, 0, 0],
    };
    if (voterId && entry.votes && typeof entry.votes === 'object' && entry.votes[voterId]) {
        out.myVote = entry.votes[voterId];
    } else {
        out.myVote = null;
    }
    return out;
}

/** Public community listing + stored plan (no session secrets). */
function toCommunityEntry(plan, author, previous) {
    const id = sanitizeCommunityPlanId(plan.id);
    if (!id) return null;
    const roles = normalizeRoles(plan.role);
    const icon = sanitizeIconKey(plan.icon) || 'inv_misc_questionmark';
    const authorName = (author && author.username)
        ? String(author.username)
        : (plan.authorName ? String(plan.authorName) : 'Anonymous');
    const authorId = (author && author.id)
        ? String(author.id)
        : (plan.authorId ? String(plan.authorId) : undefined);
    const prevVotes = (previous && previous.votes && typeof previous.votes === 'object')
        ? previous.votes
        : {};
    const { upvotes, downvotes } = recountVotes(prevVotes);
    return {
        id,
        name: String(plan.name || 'Untitled').slice(0, 64),
        class: String(plan.class || '').toLowerCase().slice(0, 32),
        role: roles,
        spec: String(plan.spec || '').slice(0, 64),
        icon,
        description: sanitizePlanDescription(plan.description),
        authorName: authorName.slice(0, 64),
        authorId,
        updatedAt: plan.updatedAt || new Date().toISOString(),
        createdAt: (previous && previous.createdAt) || plan.createdAt || plan.updatedAt || new Date().toISOString(),
        upvotes,
        downvotes,
        votes: prevVotes,
        talentSpread: computeTalentSpread(plan),
    };
}

function publishCommunityGearPlan(plan, author) {
    const prevId = sanitizeCommunityPlanId(plan.id);
    let previous = null;
    if (prevId) {
        const existing = readCommunityIndex().find(e => String(e.id) === String(prevId));
        if (existing) previous = existing;
        else {
            try {
                const loaded = loadCommunityPlanFile(prevId);
                if (loaded?.plan) {
                    previous = {
                        votes: loaded.plan.votes || {},
                        upvotes: loaded.plan.upvotes,
                        downvotes: loaded.plan.downvotes,
                        createdAt: loaded.plan.createdAt,
                        authorId: loaded.plan.authorId,
                    };
                }
            } catch (_) { /* ignore */ }
        }
        // Only the original author may overwrite an existing community plan id
        const existingAuthor = previous?.authorId != null
            ? String(previous.authorId)
            : getCommunityPlanAuthorId(prevId);
        const requesterId = author?.id != null ? String(author.id) : '';
        if (existingAuthor && requesterId && existingAuthor !== requesterId) {
            const err = new Error('Only the original author can overwrite this community gear plan');
            err.code = 'NOT_AUTHOR';
            throw err;
        }
    }
    const entry = toCommunityEntry(plan, author, previous);
    if (!entry) return null;
    const fullPath = path.join(communityGearPlansDir, `${entry.id}.json`);
    const sanitizedPlan = {
        ...plan,
        id: entry.id,
        name: entry.name,
        role: entry.role,
        spec: entry.spec,
        icon: entry.icon,
        description: entry.description,
        community: true,
        authorName: entry.authorName,
        authorId: entry.authorId,
        updatedAt: entry.updatedAt,
        createdAt: entry.createdAt,
        upvotes: entry.upvotes,
        downvotes: entry.downvotes,
        votes: entry.votes,
        talentSpread: entry.talentSpread,
    };
    delete sanitizedPlan.session;
    delete sanitizedPlan.token;
    delete sanitizedPlan.accessToken;
    delete sanitizedPlan.refreshToken;
    fs.writeFileSync(fullPath, JSON.stringify(sanitizedPlan, null, 2));

    const index = readCommunityIndex().filter(e => String(e.id) !== String(entry.id));
    index.unshift({ ...entry });
    index.sort((a, b) => {
        const scoreA = (Number(a.upvotes) || 0) - (Number(a.downvotes) || 0);
        const scoreB = (Number(b.upvotes) || 0) - (Number(b.downvotes) || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    writeCommunityIndex(index);
    return entry;
}

function applyCommunityVote(planId, voterId, direction) {
    const id = sanitizeCommunityPlanId(planId);
    if (!id || !voterId) return null;
    const loaded = loadCommunityPlanFile(id);
    if (!loaded) return null;
    const { planPath, plan } = loaded;
    const votes = (plan.votes && typeof plan.votes === 'object') ? { ...plan.votes } : {};
    if (direction === null || direction === 'null' || direction === '') {
        delete votes[voterId];
    } else if (direction === 'up' || direction === 'down') {
        if (votes[voterId] === direction) delete votes[voterId]; // toggle off
        else votes[voterId] = direction;
    } else {
        return null;
    }
    const { upvotes, downvotes } = recountVotes(votes);
    plan.votes = votes;
    plan.upvotes = upvotes;
    plan.downvotes = downvotes;
    if (!Array.isArray(plan.talentSpread)) plan.talentSpread = computeTalentSpread(plan);
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

    const index = readCommunityIndex();
    const idx = index.findIndex(e => String(e.id) === String(id));
    if (idx >= 0) {
        index[idx] = {
            ...index[idx],
            upvotes,
            downvotes,
            votes,
            talentSpread: plan.talentSpread,
        };
    } else {
        index.push(toCommunityEntry(plan, { username: plan.authorName, id: plan.authorId }, {
            votes, upvotes, downvotes, createdAt: plan.createdAt,
        }));
    }
    writeCommunityIndex(index);
    const entry = index.find(e => String(e.id) === String(id));
    return publicCommunityEntry(entry || {
        id, name: plan.name, class: plan.class, role: plan.role, spec: plan.spec,
        icon: plan.icon, authorName: plan.authorName, authorId: plan.authorId,
        updatedAt: plan.updatedAt, createdAt: plan.createdAt,
        upvotes, downvotes, votes, talentSpread: plan.talentSpread,
    }, voterId);
}

function unpublishCommunityGearPlan(planId) {
    const id = sanitizeCommunityPlanId(planId);
    if (!id) return;
    const fullPath = path.join(communityGearPlansDir, `${id}.json`);
    if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (_) { /* ignore */ }
    }
    writeCommunityIndex(readCommunityIndex().filter(e => String(e.id) !== String(id)));
}

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

// Serve pre-compressed loot JSON files
app.get('/data/loot/*.json', (req, res, next) => {
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
// Skip /bug-reports* so the on-disk bug-reports/ folder does not 301/steal API routes.
const siteStatic = express.static(__dirname, {
    maxAge: '1h',
    setHeaders(staticRes, filePath) {
        if (filePath.endsWith('.html')) {
            staticRes.setHeader('Cache-Control', 'no-cache');
        }
    }
});
app.use((req, res, next) => {
    if (req.path === '/bug-reports' || req.path.startsWith('/bug-reports/')) {
        return next();
    }
    return siteStatic(req, res, next);
});
// ─────────────────────────────────────────────────────────────────────────────

// Middleware to parse JSON bodies
app.use(express.json());

// Setup authentication if enabled
if (authEnabled) {
    const session = require('express-session');
    const FileStore = require('session-file-store')(session);
    const passport = require('passport');
    const DiscordStrategy = require('passport-discord-auth').Strategy;

    // Trust proxy - required when running behind Nginx reverse proxy
    app.set('trust proxy', 1);

    const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE === '1'
        || process.env.SESSION_COOKIE_SECURE === 'true';

    // Persist sessions on disk so deploy restarts (systemctl restart) do not log users out.
    // Default MemoryStore clears all sessions when server.js exits.
    app.use(session({
        secret: process.env.SESSION_SECRET,
        store: new FileStore({
            path: sessionsDir,
            ttl: Math.floor(sessionMaxAgeMs / 1000),
            retries: 1,
            logFn: () => {}
        }),
        resave: false,
        saveUninitialized: true, // Required for OAuth: Passport must persist the state before the Discord redirect
        name: 'ichacalc.sid',
        cookie: {
            maxAge: sessionMaxAgeMs,
            secure: sessionCookieSecure,
            httpOnly: true,
            sameSite: 'lax',
            path: '/'
        },
        proxy: true
    }));
    console.log(`Session store: ${sessionsDir}`);

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
        isAdmin: isSiteAdmin(req),
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

// User cloud gear plans (authenticated)
app.get('/user-gear-plans', requireAuth, (req, res) => {
    try {
        const userFile = path.join(usersDir, `${req.user.id}.json`);
        const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, gearPlans: user.gearPlans || [] });
    } catch (error) {
        console.error('Error fetching gear plans:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/user-gear-plans', requireAuth, (req, res) => {
        try {
            const { plan } = req.body;
            if (!plan || plan.kind !== 'gearPlan') {
                return res.status(400).json({ success: false, error: 'Invalid gear plan' });
            }
            const roles = normalizeRoles(plan.role);
            const spec = String(plan.spec || '').trim();
            if (!roles.length || !spec) {
                return res.status(400).json({
                    success: false,
                    error: 'Gear plans require at least one role and a talent-tree focus (spec)',
                });
            }
            const userFile = path.join(usersDir, `${req.user.id}.json`);
            const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
            if (!user.gearPlans) user.gearPlans = [];

            const now = new Date().toISOString();
            const icon = sanitizeIconKey(plan.icon) || 'inv_misc_questionmark';
            const description = sanitizePlanDescription(plan.description);
            const planName = sanitizePlanName(plan.name, 'Gear Plan');
            const authorMeta = {
                username: req.user.username || 'Anonymous',
                id: String(req.user.id),
            };
            const publishToCommunity = plan.community !== false;
            let planId = plan.id ? String(plan.id) : '';
            // Never let a non-author reuse someone else's community plan id
            if (planId) {
                const communityAuthor = getCommunityPlanAuthorId(planId);
                if (communityAuthor && communityAuthor !== authorMeta.id) {
                    if (publishToCommunity) {
                        return res.status(403).json({
                            success: false,
                            error: 'Only the original author can overwrite this community gear plan. Use Save as New.',
                            code: 'NOT_AUTHOR',
                        });
                    }
                    // Personal (non-community) copy: mint a new id instead of clobbering
                    planId = '';
                }
            }
            let saved;
            const base = {
                ...plan,
                name: planName,
                role: roles,
                spec,
                icon,
                description,
                community: publishToCommunity,
                authorName: authorMeta.username,
                authorId: authorMeta.id,
            };
            if (plan.sourceCommunityId) {
                base.sourceCommunityId = String(plan.sourceCommunityId).slice(0, 64);
            }
            if (planId) {
                const idx = user.gearPlans.findIndex(p => String(p.id) === String(planId));
                if (idx >= 0) {
                    user.gearPlans[idx] = {
                        ...base,
                        id: planId,
                        createdAt: user.gearPlans[idx].createdAt || now,
                        updatedAt: now,
                        favorite: !!user.gearPlans[idx].favorite,
                    };
                    saved = user.gearPlans[idx];
                } else {
                    saved = { ...base, id: planId, createdAt: now, updatedAt: now };
                    user.gearPlans.push(saved);
                }
            } else {
                // Idempotent favorite/copy: update existing personal copy of same community source
                const srcId = plan.sourceCommunityId ? String(plan.sourceCommunityId) : '';
                const existingCopyIdx = srcId
                    ? user.gearPlans.findIndex(p => String(p.sourceCommunityId || '') === srcId)
                    : -1;
                if (existingCopyIdx >= 0) {
                    user.gearPlans[existingCopyIdx] = {
                        ...user.gearPlans[existingCopyIdx],
                        ...base,
                        id: user.gearPlans[existingCopyIdx].id,
                        createdAt: user.gearPlans[existingCopyIdx].createdAt || now,
                        updatedAt: now,
                        favorite: true,
                        community: false,
                    };
                    saved = user.gearPlans[existingCopyIdx];
                } else {
                    saved = {
                        ...base,
                        id: `gp_${Date.now()}`,
                        createdAt: now,
                        updatedAt: now,
                        favorite: !!plan.favorite,
                    };
                    user.gearPlans.push(saved);
                }
            }
            fs.writeFileSync(userFile, JSON.stringify(user, null, 2));
            if (saved.community !== false) {
                try {
                    publishCommunityGearPlan(saved, authorMeta);
                } catch (pubErr) {
                    if (pubErr && pubErr.code === 'NOT_AUTHOR') {
                        return res.status(403).json({
                            success: false,
                            error: pubErr.message,
                            code: 'NOT_AUTHOR',
                        });
                    }
                    console.error('[CommunityGearPlans] publish failed:', pubErr);
                }
            }
            res.json({ success: true, plan: saved });
        } catch (error) {
            console.error('Error saving gear plan:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

app.patch('/user-gear-plans/:id/favorite', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        const userFile = path.join(usersDir, `${req.user.id}.json`);
        const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
        const plans = user.gearPlans || [];
        const target = plans.find(p => String(p.id) === String(id));
        if (!target) {
            return res.status(404).json({ success: false, error: 'Gear plan not found' });
        }
        const next = !target.favorite;
        for (const p of plans) p.favorite = false;
        target.favorite = next;
        user.gearPlans = plans;
        fs.writeFileSync(userFile, JSON.stringify(user, null, 2));
        res.json({ success: true, gearPlans: plans });
    } catch (error) {
        console.error('Error toggling gear plan favorite:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/user-gear-plans/:id', requireAuth, (req, res) => {
        try {
            const { id } = req.params;
            const userFile = path.join(usersDir, `${req.user.id}.json`);
            const user = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
            user.gearPlans = (user.gearPlans || []).filter(p => String(p.id) !== String(id));
            fs.writeFileSync(userFile, JSON.stringify(user, null, 2));
            try {
                unpublishCommunityGearPlan(id);
            } catch (unpubErr) {
                console.error('[CommunityGearPlans] unpublish failed:', unpubErr);
            }
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting gear plan:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

} // End if (authEnabled)

// =======================
// Bug Report Routes
// =======================

// Serve bug report screenshots - handle any file in the timestamp directory
app.get('/bug-reports/:timestamp/:filename', requireBugAdmin, (req, res) => {
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

app.get('/bug-report-status', (req, res) => {
    try {
        const dirs = String(req.query.dirs || '')
            .split(',')
            .map((s) => s.trim())
            .filter((d) => /^[0-9TZ.\-]+$/i.test(d))
            .slice(0, 80);
        const reports = [];
        for (const dir of dirs) {
            const reportPath = path.join(bugReportsDir, dir, 'report.json');
            if (!fs.existsSync(reportPath)) continue;
            const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
            reports.push({ timestampDir: dir, status: reportData.status || 'open' });
        }
        res.set({ 'Cache-Control': 'no-store' });
        res.json({ success: true, reports });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all bug reports
app.get('/bug-reports', requireBugAdmin, (req, res) => {
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
app.patch('/bug-reports/:timestamp/status', requireBugAdmin, (req, res) => {
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

function generatePlanId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Save a gear plan (public share URL)
app.post('/gear-plans', (req, res) => {
    try {
        const planData = req.body;
        if (!planData || planData.kind !== 'gearPlan') {
            return res.status(400).json({ success: false, error: 'Invalid gear plan data' });
        }
        let planId = generatePlanId();
        let planPath = path.join(gearPlansDir, `${planId}.json`);
        while (fs.existsSync(planPath)) {
            planId = generatePlanId();
            planPath = path.join(gearPlansDir, `${planId}.json`);
        }
        const withMeta = {
            ...planData,
            name: sanitizePlanName(planData.name, 'Gear Plan'),
            _meta: { id: planId, createdAt: new Date().toISOString() },
        };
        fs.writeFileSync(planPath, JSON.stringify(withMeta, null, 2));
        res.json({ success: true, planId });
    } catch (error) {
        console.error('[GearPlans] Error saving:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/gear-plans/:planId', (req, res) => {
    try {
        const { planId } = req.params;
        if (!/^[A-Za-z0-9]+$/.test(planId)) {
            return res.status(400).json({ success: false, error: 'Invalid plan ID' });
        }
        const planPath = path.join(gearPlansDir, `${planId}.json`);
        if (!fs.existsSync(planPath)) {
            return res.status(404).json({ success: false, error: 'Gear plan not found' });
        }
        const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
        res.json({ success: true, plan });
    } catch (error) {
        console.error('[GearPlans] Error loading:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Community gear plan browser (public — guests + logged-in)
app.get('/community-gear-plans', (req, res) => {
    try {
        const q = String(req.query.q || '').trim().toLowerCase();
        const classFilter = String(req.query.class || '').trim().toLowerCase();
        const roleFilter = String(req.query.role || '').trim().toLowerCase();
        const specFilter = String(req.query.spec || '').trim().toLowerCase();
        const sort = String(req.query.sort || 'popular').trim().toLowerCase();
        const voterId = sanitizeVoterId(req.query.voterId);
        let entries = reconcileCommunityIndex();
        if (classFilter) {
            entries = entries.filter(e => String(e.class || '').toLowerCase() === classFilter);
        }
        if (roleFilter) {
            entries = entries.filter(e => normalizeRoles(e.role).includes(roleFilter));
        }
        if (specFilter) {
            entries = entries.filter(e => String(e.spec || '').toLowerCase() === specFilter);
        }
        if (q) {
            entries = entries.filter(e => {
                const hay = [e.name, e.authorName, e.description, e.spec, e.class]
                    .map(x => String(x || '').toLowerCase()).join(' ');
                return hay.includes(q);
            });
        }
        entries = [...entries].sort((a, b) => {
            if (sort === 'recent') {
                return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
            }
            const scoreA = (Number(a.upvotes) || 0) - (Number(a.downvotes) || 0);
            const scoreB = (Number(b.upvotes) || 0) - (Number(b.downvotes) || 0);
            if (scoreB !== scoreA) return scoreB - scoreA;
            const upDiff = (Number(b.upvotes) || 0) - (Number(a.upvotes) || 0);
            if (upDiff !== 0) return upDiff;
            return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        });
        res.set('Cache-Control', 'no-store');
        const total = entries.length;
        const wantAll = String(req.query.all || '') === '1'
            || String(req.query.limit || '').toLowerCase() === 'all';
        const limitRaw = parseInt(req.query.limit, 10);
        const offsetRaw = parseInt(req.query.offset, 10);
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
        // Default / all=1: return the full filtered set (capped at COMMUNITY_LIST_MAX).
        const limit = wantAll || !Number.isFinite(limitRaw)
            ? Math.min(COMMUNITY_LIST_MAX, Math.max(total - offset, 0))
            : Math.min(Math.max(limitRaw, 1), COMMUNITY_LIST_MAX);
        const page = entries.slice(offset, offset + Math.max(limit, 0));
        res.json({
            success: true,
            plans: page.map(e => publicCommunityEntry(e, voterId)),
            total,
            hasMore: offset + page.length < total,
            offset,
            limit,
        });
    } catch (error) {
        console.error('[CommunityGearPlans] list error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/community-gear-plans/:id', (req, res) => {
    try {
        const id = sanitizeCommunityPlanId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, error: 'Invalid plan ID' });
        }
        const planPath = path.join(communityGearPlansDir, `${id}.json`);
        if (!fs.existsSync(planPath)) {
            return res.status(404).json({ success: false, error: 'Community gear plan not found' });
        }
        const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
        delete plan.session;
        delete plan.token;
        delete plan.accessToken;
        delete plan.refreshToken;
        // Do not leak full vote map to clients
        const voterId = sanitizeVoterId(req.query.voterId);
        const myVote = (voterId && plan.votes && plan.votes[voterId]) ? plan.votes[voterId] : null;
        delete plan.votes;
        plan.upvotes = Number(plan.upvotes) || 0;
        plan.downvotes = Number(plan.downvotes) || 0;
        plan.myVote = myVote;
        if (!Array.isArray(plan.talentSpread)) plan.talentSpread = computeTalentSpread(plan);
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, plan });
    } catch (error) {
        console.error('[CommunityGearPlans] get error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/community-gear-plans/:id/vote', (req, res) => {
    try {
        const id = sanitizeCommunityPlanId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, error: 'Invalid plan ID' });
        }
        let voterId = null;
        try {
            if (typeof req.isAuthenticated === 'function' && req.isAuthenticated() && req.user?.id) {
                voterId = sanitizeVoterId(`discord:${req.user.id}`);
            }
        } catch (_) { /* ignore */ }
        if (!voterId) voterId = sanitizeVoterId(req.body?.voterId);
        if (!voterId) {
            return res.status(400).json({ success: false, error: 'voterId required' });
        }
        let direction = req.body?.direction;
        if (direction === undefined) direction = null;
        if (direction !== 'up' && direction !== 'down' && direction !== null) {
            return res.status(400).json({ success: false, error: 'direction must be up, down, or null' });
        }
        const result = applyCommunityVote(id, voterId, direction);
        if (!result) {
            return res.status(404).json({ success: false, error: 'Community gear plan not found' });
        }
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, plan: result });
    } catch (error) {
        console.error('[CommunityGearPlans] vote error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// SPA: Gear Planner deep links serve the same index.html as /
app.get(['/gear-planner', '/gp', '/gear-planner/', '/gp/'], (req, res) => {
    const distIndex = path.join(__dirname, 'dist', 'index.html');
    const rootIndex = path.join(__dirname, 'index.html');
    res.sendFile(fs.existsSync(distIndex) ? distIndex : rootIndex);
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
