# profiles.js - Character Profile Management System

## Overview

`profiles.js` implements the complete profile management system for IchaCalc, including Discord OAuth authentication, cloud-based profile storage, build sharing between users, and inbox messaging. It provides both UI components (dropdowns, modals) and backend integration via server.js for persistent storage and user management.

**File Size:** 1,300 lines of code
**Type:** ES6 Class Module (ProfileManager)
**Dependencies:** Server.js (Node.js backend), Discord OAuth, browser localStorage

---

## Key Responsibilities

1. **Authentication** - Discord OAuth login/logout, session management
2. **Profile Storage** - Save/load character builds to cloud (via server.js), or to **localStorage** as **Local builds** when the user is not logged in (ids prefixed with `local_`; see **Data Storage**)
3. **Build Sharing** - Share builds with other users via Discord username/ID
4. **Inbox System** - Receive shared builds from other users, load or save them
5. **UI Management** - Builds dropdown, save dialog, share modal, inbox dropdown
6. **State Sync** - Track editing mode, build names, profile ownership
7. **Shaman DPS Gear Compare** — **`getShamanSavedBuildsForCompare()`** / **`window.getShamanSavedBuildsForCompare()`** returns `{ id, name, buildData }[]` for **shaman** saves only (cloud `profiles` + `localBuilds`), with **deep-cloned** `buildData` for the Build Compare picker in `dps.js`.

---

## Architecture Overview

```
ProfileManager (singleton class)
├── Authentication
│   ├── checkAuth() - Verify Discord session
│   ├── updateUI() - Show/hide login state
│   └── startInboxPolling() - Poll for new messages
├── Profile Management
│   ├── saveProfile() - Create or update profile
│   ├── loadProfile() - Load profile from cloud
│   ├── deleteProfile() - Delete profile
│   └── editProfile() - Load profile in edit mode
├── Build Sharing
│   ├── shareBuild() - Send build to another user
│   ├── loadSharedBuild() - Load received build
│   ├── saveSharedBuild() - Save shared build to own profiles
│   └── deleteInboxMessage() - Remove inbox message
├── UI Components
│   ├── Builds Dropdown (quick access to saved builds)
│   ├── Save Dialog (name input for saving builds)
│   ├── Share Modal (send build to Discord user)
│   ├── Inbox Dropdown (view received builds)
│   └── Loading Popup (build loading indicator)
└── State Management
    ├── this.user (Discord user info)
    ├── this.profiles (array of user's builds)
    ├── this.inboxMessages (array of shared builds)
    ├── this.editingProfileId (current editing state)
    └── this.unreadCount (inbox badge counter)
```

---

## Major Sections

### 1. Class Constructor & Initialization (Lines 4-24)

**Purpose:** Initialize ProfileManager state and set up authentication

**State Properties:**
```javascript
this.user = null                 // Discord user: { id, username, avatar }
this.profiles = []               // Array of cloud saved builds
this.localBuilds = []            // Device-only builds (localStorage key `ichacalc_local_builds_v1`)
this.inboxMessages = []          // Array of inbox messages
this.unreadCount = 0             // Number of unread inbox messages
this.editingProfileId = null     // ID of profile being edited (null = new build)
```

**`sameProfileId(a, b)`** — compares ids with `String(a) === String(b)` so DOM `data-id` (string) matches server JSON whether the stored id is a string or a number (legacy). Used for find/findIndex/filter on `this.profiles` and for `encodeURIComponent` in profile URLs.

**Initialization Flow:**
- `init()` is **single-flight** (`_initPromise`): repeated `await init()` returns the same promise; `setupEventListeners` and inbox polling run only once.
- **`app.js`** awaits `profileManager.init()` at the start of its `init()` **before** `runOnboarding()`, so cloud `profiles` and `isDefault` are loaded before onboarding reads the list (avoids races with a second `loadProfiles` overwriting onboarding state).

**Local builds:** `init()` calls `loadLocalBuildsFromStorage()` before `checkAuth()`. When `!this.user` (or when updating a `local_*` id while logged in), `saveProfile()` routes to `saveLocalProfile()` instead of the API. `findBuildById()` resolves both arrays. The My Builds modal shows **Cloud saves** (only when both cloud and local exist) and **Local builds**; the header dropdown lists cloud rows first, then a divider and **Local builds**. Local rows omit default-star and share actions.

```javascript
async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
        this.loadLocalBuildsFromStorage();
        await this.checkAuth();
        if (!this._listenersBound) {
            this.setupEventListeners();
            this._listenersBound = true;
        }
        if (this.user) this.startInboxPolling();
    })();
    return this._initPromise;
}
```

**`loadProfiles()`** — uses `response.ok`, requires `Array.isArray(data.profiles)`, sets `cache: 'no-store'` on fetch, then **`syncBuildListUI()`** (renders builds dropdown, **`#profiles-list`** in the My Builds modal when present, and `#profiles-empty`) so lists stay in sync without a full refresh.

**`syncBuildListUI()`** — updates `#builds-dropdown-list` via `renderBuildsDropdown()`; if `#profiles-list` exists, clears it or calls `renderProfiles()` to match `this.profiles`, and toggles `#profiles-empty` like `openProfilesModal()`.

---

### 2. Authentication System (Lines 26-71)

**Purpose:** Handle Discord OAuth login/logout and session verification

**Logout button:** `#logout-btn` is icon-only (no red fill or border); hover tints the SVG area. Click goes to `/auth/logout`.

**Key Functions:**

#### `checkAuth()`
Verifies user authentication status with backend:
```javascript
const response = await fetch('/user');
const data = await response.json();
if (data.authenticated) {
    this.user = data.user;
    this.updateUI(true);
    await this.loadProfiles();
    await this.loadInbox();
}
```

**Discord User Object:**
```javascript
{
    id: "123456789",              // Discord user ID
    username: "PlayerName",       // Discord username
    avatar: "abc123def456"        // Avatar hash (used to build CDN URL)
}
```

#### `updateUI(authenticated)`
Updates UI to show login button or user info:
- Shows/hides login button
- Displays user avatar and username
- Constructs Discord CDN avatar URL: `https://cdn.discordapp.com/avatars/{id}/{avatar}.png`

**Avatar URL Fallback:**
If user has no custom avatar, uses default Discord avatar:
```javascript
const avatarUrl = this.user.avatar
    ? `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
```

---

### 3. Event Listeners Setup (Lines 73-162)

**Purpose:** Attach all DOM event handlers for buttons, modals, dropdowns

**Key Event Handlers:**

#### Login/Logout
```javascript
document.getElementById('login-btn').addEventListener('click', () => {
    window.location.href = '/auth/discord';  // Redirect to Discord OAuth
});

document.getElementById('logout-btn').addEventListener('click', () => {
    window.location.href = '/auth/logout';   // Clear session
});
```

#### Builds Dropdown Toggle
```javascript
document.getElementById('profiles-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    this.closeInboxDropdown();    // Close inbox if open
    this.toggleBuildsDropdown();   // Toggle builds dropdown
});
```

#### Inbox Dropdown Toggle
```javascript
document.getElementById('inbox-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    this.closeBuildsDropdown();   // Close builds if open
    this.toggleInboxDropdown();    // Toggle inbox dropdown
});
```

#### Close Dropdowns on Outside Click
```javascript
document.addEventListener('click', (e) => {
    // Close dropdowns if clicking outside them
    if (buildsDropdown && !buildsDropdown.contains(e.target) && ...) {
        this.closeBuildsDropdown();
    }
    if (inboxDropdown && !inboxDropdown.contains(e.target) && ...) {
        this.closeInboxDropdown();
    }
});
```

#### Save Build Button
```javascript
document.getElementById('saveBuildBtn').addEventListener('click', () => {
    this.openSaveProfileDialog();  // Open save dialog
});
```

---

### 4. Profile Loading & Storage (Lines 164-190)

**Purpose:** Load user's profiles and inbox from backend

#### `loadProfiles()`
Fetches all saved builds for current user with `credentials: 'include'` (session cookie). Same for `loadInbox`, save/update/delete profile, and share where applicable.
```javascript
async loadProfiles() {
    const response = await fetch('/profiles', { credentials: 'include' });
    const data = await response.json();
    if (data.success) {
        this.profiles = data.profiles;
    }
}
```

**Profile Data Structure:**
```javascript
{
    id: "abc123",                  // Profile ID (database key)
    name: "My Tank Build",         // User-provided name
    createdAt: "2024-01-01T00:00:00Z",
    buildData: {                   // Full build snapshot
        class: "warrior",
        race: "orc",
        characterName: "Tankadin",
        server: "nordanaar",
        attackerLevel: 63,
        gear: { ... },             // Equipped items
        enchants: { ... },         // Enchants
        talents: { ... },          // Talent tree
        buffs: [ ... ],            // Active buffs
        shamanDpsPriority: { ... }, // optional (shaman)
        statWeights: [ ... ],      // optional: shaman ST weights for this build
        statWeightsAoe: [ ... ]    // optional: shaman AOE weights
    }
}
```

#### `loadInbox()`
Fetches inbox messages (shared builds):
```javascript
async loadInbox() {
    const response = await fetch('/inbox');
    const data = await response.json();
    if (data.success) {
        this.inboxMessages = data.messages;
        this.unreadCount = data.unreadCount;
        this.updateInboxBadge();
    }
}
```

**Inbox Message Structure:**
```javascript
{
    id: "msg123",
    from: {                        // Sender info
        id: "456789",
        username: "Friend",
        avatar: "xyz789"
    },
    buildData: { ... },           // Shared build
    message: "Check out my build!", // Optional message
    timestamp: "2024-01-01T00:00:00Z",
    read: false                   // Read status
}
```

---

### 5. Builds Dropdown UI (Lines 240-401)

**Purpose:** Display list of saved builds with quick actions

#### `renderBuildsDropdown()`
Generates HTML for builds dropdown:
```javascript
renderBuildsDropdown() {
    const list = document.getElementById('builds-dropdown-list');

    if (this.profiles.length === 0) {
        list.innerHTML = '<div class="builds-dropdown-empty">No saved builds yet...</div>';
        return;
    }

    list.innerHTML = this.profiles.map(profile => {
        // Extract character info
        const charName = profile.buildData.characterName || '';
        const className = profile.buildData.class || '';
        const raceRaw = profile.buildData.race || '';

        return `
            <div class="builds-dropdown-item" data-id="${profile.id}">
                <div class="builds-dropdown-item-info">
                    <div class="builds-dropdown-item-name">${profile.name}</div>
                    <div class="builds-dropdown-item-details">${charName} · ${race} ${class}</div>
                </div>
                <div class="builds-dropdown-item-actions">
                    <button class="share-btn">Share</button>
                    <button class="delete-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}
```

**Dropdown Actions:**

1. **Load Build** - Click on item to load build
   ```javascript
   item.addEventListener('click', (e) => {
       if (!e.target.closest('.builds-dropdown-action-btn')) {
           this.loadProfileFromDropdown(id);  // Load build into calculator
       }
   });
   ```

2. **Share Build** - Click share button
   ```javascript
   item.querySelector('.share-btn').addEventListener('click', (e) => {
       e.stopPropagation();
       this.openShareModal(profile);  // Open share dialog
   });
   ```

3. **Delete Build** - Click delete button
   ```javascript
   item.querySelector('.delete-btn').addEventListener('click', (e) => {
       e.stopPropagation();
       this.deleteProfileFromDropdown(id);  // Confirm and delete
   });
   ```

---

### 6. Profile Save & Load Operations (Lines 647-803)

**Purpose:** Save new builds or update existing ones, load builds into calculator

#### `openSaveProfileDialog()`
Opens save dialog with smart name pre-filling:
```javascript
openSaveProfileDialog() {
    const dialog = document.getElementById('save-profile-dialog');
    const input = document.getElementById('profile-name-input');

    // Check if build name is already set
    const buildName = this.getBuildName();

    if (buildName) {
        input.value = buildName;
        setTimeout(() => this.saveProfile(), 0);  // Auto-save if name exists
        return;
    }

    // If editing, pre-fill with existing name
    if (this.editingProfileId) {
        const profile = this.profiles.find(p => p.id === this.editingProfileId);
        input.value = profile ? profile.name : '';
    }

    dialog.style.display = 'flex';
    input.focus();
}
```

#### `saveProfile()`
Saves or updates profile to cloud:
```javascript
async saveProfile() {
    const name = document.getElementById('profile-name-input').value.trim();

    if (!name) {
        notify.error('Please enter a profile name');
        return;
    }

    // Get current build data from app
    const buildData = window.buildManager?.getBuildData() || {};

    // Check if updating existing profile
    if (this.editingProfileId) {
        const response = await fetch(`/profiles/${this.editingProfileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, buildData })
        });

        if (data.success) {
            // Update local array
            const profileIndex = this.profiles.findIndex(p => p.id === this.editingProfileId);
            if (profileIndex !== -1) {
                this.profiles[profileIndex] = data.profile;
            }
            this.editingProfileId = null;
            notify.success('Build updated successfully!');
        }
    } else {
        // Create new profile
        const response = await fetch('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, buildData })
        });

        if (data.success) {
            this.profiles.push(data.profile);
            notify.success('Build saved successfully!');
        }
    }
}
```

**Build Data Format (getBuildData from buildManager):**
```javascript
{
    class: "paladin",
    race: "dwarf",
    attackerLevel: 63,
    characterName: "Tankadin",
    server: "nordanaar",
    gear: {
        head: { id: 12345, name: "Epic Helmet", ... },
        neck: { ... },
        // ... all 19 slots
    },
    enchants: {
        head: { id: 67890, name: "+8 Stamina", ... },
        // ... enchants for each slot
    },
    talents: {
        holy: { ... },
        protection: { ... },
        retribution: { ... }
    },
    buffs: [
        { id: "motw", name: "Mark of the Wild", ... },
        // ... all active buffs
    ]
}
```

#### `normalizeProfileBuildData(profile)`
Returns usable `buildData` for a profile, including legacy `gearBuild` / `talentBuild` / `characterData` conversion. Shared by `loadProfile` and `editProfile`.

#### `loadProfile(profileId, options?)`
Loads a saved build into the calculator. Uses `addTabWithLoadedBuild` when available (unnamed tab is overwritten). Returns `true` on success, `false` on missing profile, invalid data, or error.

- **`options.silent`**: If true, skips the success toast (used when applying the default build at startup after Discord login).

Uses `normalizeProfileBuildData(profile)`, then loads via `addTabWithLoadedBuild` when defined, otherwise `loadBuildData` + `showBuildTitle`. Closes the profiles modal on success.

#### `setDefaultBuild(id)`
Calls `PATCH /profiles/:id/set-default` with `credentials: 'include'`. On success, assigns `this.profiles` from `data.profiles` only when it is an array; otherwise calls `loadProfiles()` so a bad or unexpected response body cannot replace the list with `undefined`.

---

### 7. Build Sharing System (Lines 885-964)

**Purpose:** Share builds with other users via Discord username/ID

#### `openShareModal(profile)`
Opens share dialog:
```javascript
openShareModal(profile) {
    const modal = document.getElementById('share-modal');
    const input = document.getElementById('recipient-id-input');
    const messageInput = document.getElementById('share-message-input');

    input.value = '';
    messageInput.value = '';
    modal.dataset.profileId = profile.id;
    modal.style.display = 'flex';
    input.focus();
}
```

#### `shareBuild()`
Sends build to recipient:
```javascript
async shareBuild() {
    const profileId = modal.dataset.profileId;
    const recipientId = document.getElementById('recipient-id-input').value.trim();
    const message = document.getElementById('share-message-input').value.trim();

    if (!recipientId) {
        status.textContent = 'Please enter a recipient username or Discord ID';
        return;
    }

    const profile = this.profiles.find(p => p.id === profileId);
    if (!profile) return;

    // Prepare build data with profile name
    const buildDataToShare = {
        ...profile.buildData,
        profileName: profile.name
    };

    const response = await fetch('/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            recipientId,
            buildData: buildDataToShare,
            message
        })
    });

    if (data.success) {
        status.textContent = 'Build shared successfully!';
        setTimeout(() => modal.style.display = 'none', 2000);
    }
}
```

**Share API Endpoint:**
- Backend looks up recipient by Discord username or ID
- Creates inbox message for recipient
- Stores build data and sender info
- Returns success/error response

---

### 8. Inbox System (Lines 424-551, 966-1253)

**Purpose:** Receive and manage shared builds from other users

#### `renderInboxDropdown()`
Displays inbox messages in dropdown:
```javascript
renderInboxDropdown() {
    const list = document.getElementById('inbox-dropdown-list');

    if (this.inboxMessages.length === 0) {
        list.innerHTML = '<div class="inbox-dropdown-empty">No messages in your inbox</div>';
        return;
    }

    list.innerHTML = this.inboxMessages.map(msg => {
        const senderAvatar = msg.from.avatar
            ? `https://cdn.discordapp.com/avatars/${msg.from.id}/${msg.from.avatar}.png`
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const buildName = msg.buildData?.profileName || 'Shared Build';
        const messagePreview = msg.message ? msg.message.substring(0, 50) + '...' : '';

        return `
            <div class="inbox-dropdown-item ${msg.read ? '' : 'unread'}" data-id="${msg.id}">
                <div class="inbox-dropdown-item-header">
                    <img src="${senderAvatar}" class="inbox-dropdown-item-avatar">
                    <span class="inbox-dropdown-item-sender">${msg.from.username}</span>
                    <span class="inbox-dropdown-item-date">${dateStr}</span>
                </div>
                <div class="inbox-dropdown-item-build">${buildName}</div>
                <div class="inbox-dropdown-item-message">${messagePreview}</div>
                <div class="inbox-dropdown-item-actions">
                    <button class="load-btn">Load Build</button>
                    <button class="save-btn">Save to My Builds</button>
                    <button class="delete-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}
```

**Inbox Actions:**

1. **Load Build** - Load shared build into calculator
   ```javascript
   item.querySelector('.load-btn').addEventListener('click', async (e) => {
       e.stopPropagation();
       await this.loadSharedBuild(msg);
       await this.markAsReadAndRemove(msgId);
   });
   ```

2. **Save to My Builds** - Save shared build to own profiles
   ```javascript
   item.querySelector('.save-btn').addEventListener('click', async (e) => {
       e.stopPropagation();
       await this.saveSharedBuild(msg);
       await this.markAsReadAndRemove(msgId);
   });
   ```

3. **Delete** - Remove inbox message
   ```javascript
   item.querySelector('.delete-btn').addEventListener('click', async (e) => {
       e.stopPropagation();
       await this.deleteInboxMessage(msgId);
   });
   ```

#### `loadSharedBuild(message)`
Loads a shared build from inbox:
```javascript
async loadSharedBuild(message) {
    try {
        let buildData = message.buildData;

        // Check format and convert if needed
        const isNewFormat = buildData.gear || buildData.class;
        const isOldFormat = buildData.gearBuild || buildData.talentBuild;

        if (!isNewFormat && isOldFormat) {
            // Convert old format
            buildData = {
                class: buildData.characterData?.class || '',
                race: buildData.characterData?.race || '',
                gear: buildData.gearBuild || {},
                talents: buildData.talentBuild || {},
                buffs: buildData.characterData?.buffs || []
            };
        }

        if (window.buildManager) {
            await window.buildManager.loadBuildData(buildData);

            // Close dropdown and show build title
            this.closeInboxDropdown();
            if (buildData.profileName) {
                this.showBuildTitle(buildData.profileName);
            }

            notify.success('Build loaded successfully!');
        }
    } catch (error) {
        console.error('Error loading shared build:', error);
        notify.error('Failed to load build: ' + error.message);
    }
}
```

#### `saveSharedBuild(message)`
Saves a shared build to user's profiles:
```javascript
async saveSharedBuild(message) {
    try {
        let buildData = message.buildData;

        // Convert old format if needed
        if (!buildData.gear && buildData.gearBuild) {
            buildData = {
                class: buildData.characterData?.class || '',
                race: buildData.characterData?.race || '',
                gear: buildData.gearBuild || {},
                talents: buildData.talentBuild || {},
                buffs: buildData.characterData?.buffs || []
            };
        }

        // Use shared build name or generate one
        const buildName = buildData.profileName || `Build from ${message.from.username}`;

        // Save to profiles
        const response = await fetch('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: buildName, buildData })
        });

        if (data.success && data.profile) {
            this.profiles.push(data.profile);
            notify.success(`Build "${buildName}" saved to your builds!`);
        }
    } catch (error) {
        console.error('Error saving shared build:', error);
        notify.error('Failed to save build: ' + error.message);
    }
}
```

#### `updateInboxBadge()`
Updates unread count badges:
```javascript
updateInboxBadge() {
    const badge = document.getElementById('inbox-badge');
    const countText = document.getElementById('inbox-count-text');
    const btnBadge = document.getElementById('inbox-badge-btn');

    if (this.unreadCount > 0) {
        if (badge) {
            badge.textContent = this.unreadCount;
            badge.style.display = 'block';
        }
        if (countText) {
            countText.textContent = `(${this.unreadCount})`;
            countText.style.display = 'inline';
        }
        if (btnBadge) {
            btnBadge.textContent = this.unreadCount;
            btnBadge.style.display = 'block';
        }
    } else {
        if (badge) badge.style.display = 'none';
        if (countText) countText.style.display = 'none';
        if (btnBadge) btnBadge.style.display = 'none';
    }
}
```

---

### 9. Inbox Polling & Badge Updates (Lines 1255-1260, 192-221)

**Purpose:** Auto-refresh inbox and update notification badges

#### `startInboxPolling()`
Polls backend every 30 seconds for new messages:
```javascript
startInboxPolling() {
    setInterval(async () => {
        await this.loadInbox();  // Refresh inbox from server
    }, 30000);  // 30 seconds
}
```

**Polling Behavior:**
- Only starts if user is authenticated
- Fetches `/inbox` endpoint
- Updates `this.inboxMessages` and `this.unreadCount`
- Triggers badge update via `updateInboxBadge()`

---

### 10. Loading Popup (Lines 403-422)

**Purpose:** Show/hide loading indicator when loading builds

#### `showBuildLoading(buildName)`
Shows loading popup with build name:
```javascript
showBuildLoading(buildName = 'build') {
    const overlay = document.getElementById('build-loading-overlay');
    const popup = document.getElementById('build-loading-popup');
    const text = popup?.querySelector('.build-loading-text');

    if (text) {
        text.textContent = `Loading ${buildName}...`;
    }

    overlay?.classList.add('show');
    popup?.classList.add('show');
}
```

#### `hideBuildLoading()`
Hides loading popup:
```javascript
hideBuildLoading() {
    const overlay = document.getElementById('build-loading-overlay');
    const popup = document.getElementById('build-loading-popup');

    overlay?.classList.remove('show');
    popup?.classList.remove('show');
}
```

**Usage Example:**
```javascript
this.showBuildLoading(profile.name);
try {
    await window.buildManager.loadBuildData(profile.buildData);
    notify.success(`Loaded build: ${profile.name}`);
} finally {
    this.hideBuildLoading();
}
```

---

### 11. Utility Functions (Lines 1262-1288)

**Purpose:** Helper functions for build title display and HTML escaping

#### `showBuildTitle(buildName, isEditing)`
Sets build name in title input:
```javascript
showBuildTitle(buildName, isEditing = false) {
    const nameInput = document.getElementById('build-name-input');
    if (nameInput) {
        nameInput.value = buildName || '';
    }
}
```

#### `hideBuildTitle()`
Clears build title:
```javascript
hideBuildTitle() {
    const nameInput = document.getElementById('build-name-input');
    if (nameInput) {
        nameInput.value = '';
    }
}
```

#### `getBuildName()`
Gets current build name from input:
```javascript
getBuildName() {
    const nameInput = document.getElementById('build-name-input');
    return nameInput ? nameInput.value.trim() : '';
}
```

#### `escapeHtml(text)`
Prevents XSS by escaping HTML:
```javascript
escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

---

## Server Integration

### Backend Endpoints (server.js)

**Authentication:**
- `GET /auth/discord` - Redirect to Discord OAuth
- `GET /auth/discord/callback` - OAuth callback handler
- `GET /auth/logout` - Clear session
- `GET /user` - Get current user info

**Profile Management:**
- `GET /profiles` - List all profiles for current user
- `POST /profiles` - Create new profile
- `PATCH /profiles/:id` - Update existing profile
- `DELETE /profiles/:id` - Delete profile

**Build Sharing:**
- `POST /share` - Share build with recipient (by Discord ID/username)

**Inbox:**
- `GET /inbox` - Get inbox messages
- `PATCH /api/inbox/:id` - Mark message as read
- `DELETE /inbox/:id` - Delete inbox message

---

## Data Storage

### Local Storage
- **Guest / “Save on this device” builds** are stored under **`ichacalc_local_builds_v1`** (`ProfileManager.loadLocalBuildsFromStorage` / `persistLocalBuilds`). Entry ids use the **`local_`** prefix (`isLocalProfileId`).
- **Logged-in cloud builds** live in SQLite via **`server.js`** (`GET /profiles`, etc.).

### Cloud Storage (SQLite via server.js)
- **Users Table:** Discord user info, session tokens
- **Profiles Table:** User ID, profile name, build data (JSON), timestamps
- **Inbox Table:** Sender ID, recipient ID, build data (JSON), message, read status, timestamps

---

## Build Format Compatibility

### Current Format (v2)
```javascript
{
    class: "warrior",
    race: "orc",
    characterName: "Tankadin",
    server: "nordanaar",
    attackerLevel: 63,
    gear: { head: {...}, neck: {...}, ... },
    enchants: { head: {...}, ... },
    talents: { ... },
    buffs: [ ... ]
}
```

### Legacy Format (v1)
```javascript
{
    characterData: { class, race, level, characterName, server, buffs },
    gearBuild: { head, neck, ... },
    talentBuild: { ... }
}
```

**Automatic Conversion:**
ProfileManager detects old format and converts to new format when loading:
```javascript
if (!buildData && profile.gearBuild) {
    buildData = {
        class: profile.characterData?.class || '',
        race: profile.characterData?.race || '',
        gear: profile.gearBuild || {},
        enchants: profile.gearBuild?.enchants || {},
        talents: profile.talentBuild || {},
        buffs: profile.characterData?.buffs || []
    };
}
```

---

## Editing Mode

### Edit vs. New Build
When loading a profile, ProfileManager tracks whether it's being edited:

**Edit Mode:**
```javascript
this.editingProfileId = profileId;  // Set when loading existing profile
```

**New Build Mode:**
```javascript
this.editingProfileId = null;       // Clear when creating new build
```

**Save Behavior:**
- If `editingProfileId` is set: `PATCH /profiles/:id` (update)
- If `editingProfileId` is null: `POST /profiles` (create new)

---

## How to Add New Features

### Adding a New Profile Field

1. **Update buildData structure in buildManager.js:**
   ```javascript
   getBuildData() {
       return {
           // ... existing fields
           newField: this.getNewFieldValue()
       };
   }
   ```

2. **Update loadBuildData in buildManager.js:**
   ```javascript
   loadBuildData(data) {
       // ... existing loading
       if (data.newField) {
           this.applyNewField(data.newField);
       }
   }
   ```

3. **No changes needed in profiles.js** - it automatically includes all fields from buildManager

### Adding a New Sharing Feature

1. **Add new inbox action button in renderInboxDropdown():**
   ```javascript
   <button class="new-action-btn" data-id="${msg.id}">New Action</button>
   ```

2. **Add event listener after rendering:**
   ```javascript
   item.querySelector('.new-action-btn').addEventListener('click', async (e) => {
       e.stopPropagation();
       await this.handleNewAction(msgId);
   });
   ```

3. **Implement handler function:**
   ```javascript
   async handleNewAction(messageId) {
       const msg = this.inboxMessages.find(m => m.id === messageId);
       // ... perform action
   }
   ```

---

## Gear Planner cloud + community APIs

- `fetchGearPlans()` / `saveGearPlan(plan)` / `deleteGearPlan(id)` / `setGearPlanFavorite(id)` — authenticated `/user-gear-plans` CRUD. Saves require `role[]` + `spec`; server publishes to the community pool.
- `fetchCommunityGearPlans(filters)` — `GET /community-gear-plans?q&class&role&spec&sort&voterId&limit&offset` (public; guests OK; default sort popular). Returns `{ plans, total, hasMore, offset, limit }` (server filters the full index before paging).
- `fetchCommunityGearPlan(id)` — `GET /community-gear-plans/:id` full plan for `setGearPlan`.
- `voteCommunityGearPlan(id, direction, voterId)` — `POST /community-gear-plans/:id/vote` with `{ direction: 'up'|'down'|null, voterId }`.
- `shareGearPlan(plan, recipientId, message)` — Discord inbox share (`kind: gearPlan`).

---

## Related Files

- **server.js** - Node.js backend for profiles, auth, sharing, community gear plans
- **buildManager.js** - `getBuildData()` and `loadBuildData()` functions
- **app.js** - Exports `window.buildManager` for profiles.js to use
- **notify.js** - Toast notifications for success/error messages
- **modules/gear/gearPlannerView.js** - Gear Planner UI (save tags, community search)
- **index.html** - DOM structure for dropdowns, modals, buttons
