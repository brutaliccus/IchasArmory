// Profile Management Module
// Handles Discord OAuth, profile saving/loading, and build sharing

const LOCAL_BUILDS_STORAGE_KEY = 'ichacalc_local_builds_v1';

class ProfileManager {
    constructor() {
        this.user = null;
        this.profiles = [];
        /** @type {Array<{id:string,name:string,buildData:object,createdAt?:string,updatedAt?:string}>} */
        this.localBuilds = [];
        this.inboxMessages = [];
        this.unreadCount = 0;
        this._localReadIds = new Set();
        this.editingProfileId = null; // Track which profile is being edited
    }

    /** Compare stored profile ids (dataset is string; server JSON may use string or number). */
    sameProfileId(a, b) {
        return String(a) === String(b);
    }

    isLocalProfileId(id) {
        return String(id).startsWith('local_');
    }

    loadLocalBuildsFromStorage() {
        try {
            const raw = localStorage.getItem(LOCAL_BUILDS_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            this.localBuilds = Array.isArray(parsed) ? parsed.filter(p => p && p.id) : [];
        } catch (e) {
            console.warn('[Profiles] Failed to read local builds:', e);
            this.localBuilds = [];
        }
    }

    persistLocalBuilds() {
        try {
            localStorage.setItem(LOCAL_BUILDS_STORAGE_KEY, JSON.stringify(this.localBuilds));
        } catch (e) {
            console.error('[Profiles] Failed to persist local builds:', e);
            notify.error('Could not save to browser storage');
        }
    }

    newLocalBuildId() {
        const suffix = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        return `local_${suffix}`;
    }

    /** Cloud or local saved build by id. */
    findBuildById(id) {
        return this.profiles.find(p => this.sameProfileId(p.id, id))
            || this.localBuilds.find(p => this.sameProfileId(p.id, id));
    }

    clearStaleCloudEditingState() {
        if (!this.user && this.editingProfileId && !this.isLocalProfileId(this.editingProfileId)) {
            this.editingProfileId = null;
        }
    }

    /**
     * Single-flight init so app bootstrap can await before onboarding.
     * Prevents races where runOnboarding sets profiles then checkAuth loadProfiles overwrites.
     */
    async init() {
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            this.loadLocalBuildsFromStorage();
            await this.checkAuth();
            if (!this._listenersBound) {
                this.setupEventListeners();
                this._listenersBound = true;
            }
            if (this.user) {
                this.startInboxPolling();
            }
        })();
        return this._initPromise;
    }

    async checkAuth() {
        try {
            const response = await fetch('/user', { credentials: 'include' });

            if (!response.ok) {
                console.warn('[Auth] /user failed:', response.status, response.statusText);
                this.updateUI(false);
                return;
            }

            const data = await response.json();
            console.log('[Auth] /user response:', JSON.stringify(data));

            if (data.authenticated) {
                this.user = data.user;
                this.isAdmin = !!data.isAdmin;
                this.updateUI(true);
            } else {
                this.isAdmin = false;
                this.updateUI(false);
                return;
            }
        } catch (error) {
            console.error('[Auth] Error checking auth:', error);
            this.updateUI(false);
            return;
        }

        // Load profile data separately so failures don't revert the login UI
        try { await this.loadProfiles(); } catch (e) { console.error('Error loading profiles:', e); }
        try { await this.loadInbox(); } catch (e) { console.error('Error loading inbox:', e); }
    }

    updateUI(authenticated) {
        const loginBtn = document.getElementById('login-btn');
        const userInfo = document.getElementById('user-info');

        if (authenticated && this.user) {
            loginBtn.style.display = 'none';
            userInfo.style.display = 'flex';

            // Update user info
            document.getElementById('user-name').textContent = this.user.username;
            const avatarUrl = this.user.avatar
                ? `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png`
                : 'https://cdn.discordapp.com/embed/avatars/0.png';
            document.getElementById('user-avatar').src = avatarUrl;
        } else {
            this.isAdmin = false;
            loginBtn.style.display = 'flex';
            userInfo.style.display = 'none';
        }

        document.querySelectorAll('.auth-only-nav').forEach(el => {
            el.style.display = authenticated ? 'inline-flex' : 'none';
        });
        const viewBtn = document.getElementById('view-bug-reports-btn');
        if (viewBtn) {
            viewBtn.style.display = (authenticated && this.isAdmin) ? 'flex' : 'none';
        }
        window.bugReportModule?.setAdminViewer?.(!!(authenticated && this.isAdmin));
    }

    setupEventListeners() {
        // Login button
        document.getElementById('login-btn')?.addEventListener('click', () => {
            window.location.href = '/auth/discord';
        });

        // Logout button
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            window.location.href = '/auth/logout';
        });

        // Profiles button - toggle dropdown
        document.getElementById('profiles-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeInboxDropdown(); // Close inbox if open
            this.toggleBuildsDropdown();
        });

        // Inbox button - toggle dropdown
        document.getElementById('inbox-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeBuildsDropdown(); // Close builds if open
            this.toggleInboxDropdown();
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            const buildsDropdown = document.getElementById('builds-dropdown');
            const buildsBtn = document.getElementById('profiles-btn');
            if (buildsDropdown && !buildsDropdown.contains(e.target) && e.target !== buildsBtn && !buildsBtn?.contains(e.target)) {
                this.closeBuildsDropdown();
            }
            
            const inboxDropdown = document.getElementById('inbox-dropdown');
            const inboxBtn = document.getElementById('inbox-btn');
            if (inboxDropdown && !inboxDropdown.contains(e.target) && e.target !== inboxBtn && !inboxBtn?.contains(e.target)) {
                this.closeInboxDropdown();
            }
        });

        // Profile modal close (keep for share modal access)
        document.getElementById('profiles-modal-close')?.addEventListener('click', () => {
            document.getElementById('profiles-modal').style.display = 'none';
        });

        // Save build button (in main GUI)
        document.getElementById('saveBuildBtn')?.addEventListener('click', () => {
            this.openSaveProfileDialog();
        });

        // Save profile dialog
        document.getElementById('save-profile-dialog-close')?.addEventListener('click', () => {
            document.getElementById('save-profile-dialog').style.display = 'none';
        });

        document.getElementById('save-profile-confirm')?.addEventListener('click', () => {
            this.saveProfile();
        });

        document.getElementById('save-profile-cancel')?.addEventListener('click', () => {
            document.getElementById('save-profile-dialog').style.display = 'none';
        });

        // Overwrite confirmation modal
        document.getElementById('save-overwrite-dialog-close')?.addEventListener('click', () => {
            document.getElementById('save-overwrite-dialog').style.display = 'none';
        });

        document.getElementById('save-overwrite-cancel')?.addEventListener('click', () => {
            document.getElementById('save-overwrite-dialog').style.display = 'none';
        });

        document.getElementById('save-overwrite-confirm')?.addEventListener('click', () => {
            document.getElementById('save-overwrite-dialog').style.display = 'none';
            // Overwrite: keep editingProfileId, sync name input, save
            const buildName = this.getBuildName();
            document.getElementById('profile-name-input').value = buildName;
            this.saveProfile();
        });

        document.getElementById('save-new-confirm')?.addEventListener('click', () => {
            document.getElementById('save-overwrite-dialog').style.display = 'none';
            // Save as new: clear editing state so saveProfile creates a fresh entry
            this.editingProfileId = null;
            const buildName = this.getBuildName();
            document.getElementById('profile-name-input').value = buildName;
            this.saveProfile();
        });

        // Inbox modal close
        document.getElementById('inbox-modal-close')?.addEventListener('click', () => {
            document.getElementById('inbox-modal').style.display = 'none';
        });

        // Share modal close
        document.getElementById('share-modal-close')?.addEventListener('click', () => {
            document.getElementById('share-modal').style.display = 'none';
        });

        document.getElementById('share-build-cancel')?.addEventListener('click', () => {
            document.getElementById('share-modal').style.display = 'none';
        });

        document.getElementById('share-build-confirm')?.addEventListener('click', () => {
            this.shareBuild();
        });

        // Close modals when clicking outside
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    /** Keep builds dropdown, My Builds modal list, and empty state in sync with this.profiles. */
    syncBuildListUI() {
        const list = document.getElementById('builds-dropdown-list');
        if (list) {
            this.renderBuildsDropdown();
        }

        const plist = document.getElementById('profiles-list');
        const empty = document.getElementById('profiles-empty');
        const hasAny = this.profiles.length > 0 || this.localBuilds.length > 0;
        if (plist) {
            if (!hasAny) {
                plist.innerHTML = '';
                if (empty) empty.style.display = 'block';
            } else {
                if (empty) empty.style.display = 'none';
                this.renderProfiles();
            }
        } else if (empty) {
            empty.style.display = hasAny ? 'none' : 'block';
        }
    }

    async loadProfiles() {
        try {
            const response = await fetch('/profiles', {
                credentials: 'include',
                cache: 'no-store'
            });
            let data = {};
            try {
                data = await response.json();
            } catch (_) {
                data = {};
            }

            if (response.ok && data.success && Array.isArray(data.profiles)) {
                this.profiles = data.profiles;
            } else if (!response.ok) {
                console.warn('[Profiles] GET /profiles failed:', response.status, data?.error || '');
            }
            this.syncBuildListUI();
        } catch (error) {
            console.error('Error loading profiles:', error);
            this.syncBuildListUI();
        }
    }

    async loadInbox() {
        try {
            const response = await fetch('/inbox', { credentials: 'include' });
            const data = await response.json();

            if (data.success) {
                this.inboxMessages = data.messages;

                // Preserve locally-read state for messages the server hasn't caught up on
                if (this._localReadIds.size > 0) {
                    for (const msg of this.inboxMessages) {
                        if (!msg.read && this._localReadIds.has(String(msg.id))) {
                            msg.read = true;
                        }
                    }
                }

                this.unreadCount = this.inboxMessages.filter(m => !m.read).length;
                this.updateInboxBadge();
            }
        } catch (error) {
            console.error('Error loading inbox:', error);
        }
    }

    updateInboxBadge() {
        // Update avatar badge (if exists)
        const badge = document.getElementById('inbox-badge');
        const countText = document.getElementById('inbox-count-text');

        if (this.unreadCount > 0) {
            if (badge) {
                badge.textContent = this.unreadCount;
                badge.style.display = 'block';
            }
            if (countText) {
                countText.textContent = `(${this.unreadCount})`;
                countText.style.display = 'inline';
            }
        } else {
            if (badge) badge.style.display = 'none';
            if (countText) countText.style.display = 'none';
        }
        
        // Update button badge
        const btnBadge = document.getElementById('inbox-badge-btn');
        if (btnBadge) {
            if (this.unreadCount > 0) {
                btnBadge.textContent = this.unreadCount;
                btnBadge.style.display = 'block';
            } else {
                btnBadge.style.display = 'none';
            }
        }
    }

    openProfilesModal() {
        const modal = document.getElementById('profiles-modal');
        const list = document.getElementById('profiles-list');
        const empty = document.getElementById('profiles-empty');
        const hasAny = this.profiles.length > 0 || this.localBuilds.length > 0;

        if (!hasAny) {
            list.innerHTML = '';
            empty.style.display = 'block';
        } else {
            empty.style.display = 'none';
            this.renderProfiles();
        }

        modal.style.display = 'flex';
    }

    // Builds Dropdown Methods
    toggleBuildsDropdown() {
        const dropdown = document.getElementById('builds-dropdown');
        if (dropdown.classList.contains('open')) {
            this.closeBuildsDropdown();
        } else {
            this.openBuildsDropdown();
        }
    }

    openBuildsDropdown() {
        const dropdown = document.getElementById('builds-dropdown');
        this.renderBuildsDropdown();
        dropdown.classList.add('open');
    }

    closeBuildsDropdown() {
        const dropdown = document.getElementById('builds-dropdown');
        dropdown.classList.remove('open');
    }

    _buildDropdownItemHtml(profile, isLocal) {
        let details = '';
        if (profile.buildData) {
            const charName = profile.buildData.characterName || '';
            const className = profile.buildData.class || '';
            const raceRaw = profile.buildData.race || '';

            const classDisplay = className.charAt(0).toUpperCase() + className.slice(1);
            const raceDisplay = raceRaw.charAt(0).toUpperCase() + raceRaw.slice(1).replace('elf', ' Elf');

            if (charName) {
                details = charName;
                if (classDisplay && raceDisplay) {
                    details += ` · ${raceDisplay} ${classDisplay}`;
                }
            } else if (classDisplay) {
                details = `${raceDisplay} ${classDisplay}`;
            }
        }

        const defaultBadge = !isLocal && profile.isDefault ? '<span class="default-badge">default</span>' : '';
        const localBadge = isLocal ? '<span class="default-badge local-device-badge">local</span>' : '';

        const defaultBtn = !isLocal ? `
                        <button class="builds-dropdown-action-btn default-btn ${profile.isDefault ? 'is-default' : ''}" data-id="${profile.id}" title="${profile.isDefault ? 'Default build' : 'Set as default'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${profile.isDefault ? '#ffd700' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        </button>` : '';
        const shareBtn = !isLocal ? `
                        <button class="builds-dropdown-action-btn share-btn" data-id="${profile.id}" title="Share">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                        </button>` : '';

        return `
                <div class="builds-dropdown-item" data-id="${profile.id}" data-local="${isLocal ? '1' : ''}">
                    <div class="builds-dropdown-item-info">
                        <div class="builds-dropdown-item-name">${this.escapeHtml(profile.name)}${defaultBadge}${localBadge}</div>
                        ${details ? `<div class="builds-dropdown-item-details">${this.escapeHtml(details)}</div>` : ''}
                    </div>
                    <div class="builds-dropdown-item-actions">${defaultBtn}${shareBtn}
                        <button class="builds-dropdown-action-btn delete-btn" data-id="${profile.id}" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
    }

    renderBuildsDropdown() {
        const list = document.getElementById('builds-dropdown-list');

        if (this.profiles.length === 0 && this.localBuilds.length === 0) {
            list.innerHTML = '<div class="builds-dropdown-empty">No saved builds yet.<br>Click "Save Build" to save your current build!</div>';
            return;
        }

        const parts = [];
        if (this.profiles.length > 0) {
            parts.push(...this.profiles.map(p => this._buildDropdownItemHtml(p, false)));
        }
        if (this.localBuilds.length > 0) {
            if (this.profiles.length > 0) {
                parts.push('<div class="builds-dropdown-divider" role="separator"></div>');
            }
            parts.push('<div class="builds-dropdown-section-label">Local builds</div>');
            parts.push(...this.localBuilds.map(p => this._buildDropdownItemHtml(p, true)));
        }
        list.innerHTML = parts.join('');

        list.querySelectorAll('.builds-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.builds-dropdown-action-btn')) {
                    const id = item.dataset.id;
                    this.loadProfileFromDropdown(id);
                }
            });

            item.querySelector('.default-btn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                await this.setDefaultBuild(id);
            });

            item.querySelector('.share-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                const profile = this.profiles.find(p => this.sameProfileId(p.id, id));
                if (profile) {
                    this.closeBuildsDropdown();
                    this.openShareModal(profile);
                }
            });

            item.querySelector('.delete-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                this.deleteProfileFromDropdown(id);
            });
        });
    }

    async loadProfileFromDropdown(id) {
        const profile = this.findBuildById(id);
        if (!profile) return;

        // Close dropdown first
        this.closeBuildsDropdown();

        // Show loading popup
        this.showBuildLoading(profile.name);

        try {
            // Small delay to show loading state
            await new Promise(resolve => setTimeout(resolve, 100));

            if (profile.buildData && window.buildManager) {
                if (typeof window.buildManager.addTabWithLoadedBuild === 'function') {
                    await window.buildManager.addTabWithLoadedBuild(profile.name, profile.buildData);
                } else {
                    await window.buildManager.loadBuildData(profile.buildData);
                    this.showBuildTitle(profile.name);
                }
                this.editingProfileId = profile.id;
                notify.success(`Loaded build: ${profile.name}`);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            notify.error('Failed to load build');
        } finally {
            // Hide loading popup
            this.hideBuildLoading();
        }
    }

    async deleteProfileFromDropdown(id) {
        const profile = this.findBuildById(id);
        if (!profile) return;

        if (!confirm(`Delete build "${profile.name}"?`)) return;

        if (this.isLocalProfileId(id)) {
            this.localBuilds = this.localBuilds.filter(p => !this.sameProfileId(p.id, id));
            this.persistLocalBuilds();
            this.syncBuildListUI();
            notify.success('Build deleted');
            return;
        }

        try {
            const response = await fetch(`/profiles/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await response.json();

            if (data.success) {
                this.profiles = this.profiles.filter(p => !this.sameProfileId(p.id, id));
                this.syncBuildListUI();
                notify.success('Build deleted');
            } else {
                notify.error('Failed to delete build');
            }
        } catch (error) {
            console.error('Error deleting profile:', error);
            notify.error('Failed to delete build');
        }
    }

    async setDefaultBuild(id) {
        const profile = this.profiles.find(p => this.sameProfileId(p.id, id));
        if (!profile) return;

        if (profile.isDefault) {
            // Already default — nothing to do
            return;
        }

        try {
            const response = await fetch(`/profiles/${encodeURIComponent(id)}/set-default`, {
                method: 'PATCH',
                credentials: 'include'
            });
            const data = await response.json();

            if (data.success) {
                if (Array.isArray(data.profiles)) {
                    this.profiles = data.profiles;
                } else {
                    await this.loadProfiles();
                }
                this.syncBuildListUI();
                notify.success(`"${profile.name}" set as default build`);
            } else {
                notify.error('Failed to set default build');
            }
        } catch (error) {
            console.error('Error setting default build:', error);
            notify.error('Failed to set default build');
        }
    }

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

    hideBuildLoading() {
        const overlay = document.getElementById('build-loading-overlay');
        const popup = document.getElementById('build-loading-popup');
        
        overlay?.classList.remove('show');
        popup?.classList.remove('show');
    }

    // Inbox Dropdown Methods
    toggleInboxDropdown() {
        const dropdown = document.getElementById('inbox-dropdown');
        if (dropdown.classList.contains('open')) {
            this.closeInboxDropdown();
        } else {
            this.openInboxDropdown();
        }
    }

    openInboxDropdown() {
        const dropdown = document.getElementById('inbox-dropdown');
        this.renderInboxDropdown();
        dropdown.classList.add('open');
    }

    closeInboxDropdown() {
        const dropdown = document.getElementById('inbox-dropdown');
        dropdown?.classList.remove('open');
    }

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
            const messagePreview = msg.message ? msg.message.substring(0, 50) + (msg.message.length > 50 ? '...' : '') : '';
            const dateStr = new Date(msg.timestamp).toLocaleDateString();

            return `
                <div class="inbox-dropdown-item ${msg.read ? '' : 'unread'}" data-id="${msg.id}">
                    <div class="inbox-dropdown-item-header">
                        <img src="${senderAvatar}" class="inbox-dropdown-item-avatar" alt="">
                        <span class="inbox-dropdown-item-sender">${this.escapeHtml(msg.from.username)}</span>
                        <span class="inbox-dropdown-item-date">${dateStr}</span>
                    </div>
                    <div class="inbox-dropdown-item-build">${this.escapeHtml(buildName)}</div>
                    ${messagePreview ? `<div class="inbox-dropdown-item-message">${this.escapeHtml(messagePreview)}</div>` : ''}
                    <div class="inbox-dropdown-item-actions">
                        <button class="inbox-dropdown-action-btn load-btn" data-id="${msg.id}" title="Load Build">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="inbox-dropdown-action-btn save-btn" data-id="${msg.id}" title="Save to My Builds">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                        </button>
                        ${!msg.read ? `<button class="inbox-dropdown-action-btn read-btn" data-id="${msg.id}" title="Mark as Read">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="22 13 16 13 14 16 10 16 8 13 2 13"></polyline>
                                <path d="M5.47 5.19L2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.47-7.81A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.83 1.19z"></path>
                            </svg>
                        </button>` : ''}
                        <button class="inbox-dropdown-action-btn delete-btn" data-id="${msg.id}" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        list.querySelectorAll('.inbox-dropdown-item').forEach(item => {
            const msgId = item.dataset.id;
            
            // Load button
            item.querySelector('.load-btn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                const msg = this.inboxMessages.find(m => m.id === msgId);
                if (msg) {
                    this.closeInboxDropdown();
                    this.showBuildLoading(msg.buildData?.profileName || 'shared build');
                    try {
                        await this.loadSharedBuild(msg);
                    } finally {
                        this.hideBuildLoading();
                    }
                    await this.markAsReadAndRemove(msgId);
                }
            });

            // Save button
            item.querySelector('.save-btn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                const msg = this.inboxMessages.find(m => m.id === msgId);
                if (msg) {
                    await this.saveSharedBuild(msg);
                    await this.markAsReadAndRemove(msgId);
                    this.renderInboxDropdown();
                }
            });

            // Mark as Read button
            item.querySelector('.read-btn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.markAsRead(msgId);
                this.renderInboxDropdown();
                this.updateUnreadBadge();
            });

            // Delete button
            item.querySelector('.delete-btn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteInboxMessage(msgId);
                this.renderInboxDropdown();
                this.updateUnreadBadge();
            });
        });
    }

    updateUnreadBadge() {
        const unreadCount = this.inboxMessages.filter(m => !m.read).length;
        const badge = document.getElementById('inbox-badge-btn');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    /**
     * @param {object} profile
     * @param {boolean} isLocal
     * @returns {HTMLElement}
     */
    _createProfileListItem(profile, isLocal) {
        const item = document.createElement('div');
        item.className = 'profile-item';

        let characterInfo = '';
        if (profile.buildData) {
            const charName = profile.buildData.characterName || 'Unknown';
            const server = profile.buildData.server || 'Unknown';
            const className = profile.buildData.class || '';
            const race = profile.buildData.race || '';

            const classDisplay = className.charAt(0).toUpperCase() + className.slice(1);
            const raceDisplay = race.charAt(0).toUpperCase() + race.slice(1).replace('elf', ' Elf');
            const serverDisplay = server.charAt(0).toUpperCase() + server.slice(1);

            characterInfo = `${charName} - ${serverDisplay}`;
            if (classDisplay && raceDisplay) {
                characterInfo += ` (${raceDisplay} ${classDisplay})`;
            }
        }

        const savedTs = profile.updatedAt || profile.createdAt;
        const savedLabel = savedTs && !Number.isNaN(Date.parse(savedTs))
            ? new Date(savedTs).toLocaleDateString()
            : '—';

        const shareBlock = isLocal ? '' : `
                    <button class="profile-icon-btn share-btn" data-id="${profile.id}" title="Share Build">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                    </button>`;

        item.innerHTML = `
                <div class="profile-info">
                    <h3>${this.escapeHtml(profile.name)}</h3>
                    ${characterInfo ? `<p class="character-info">${this.escapeHtml(characterInfo)}</p>` : ''}
                    <p class="saved-date">Saved ${this.escapeHtml(savedLabel)}${isLocal ? ' <span class="local-build-badge">This device</span>' : ''}</p>
                </div>
                <div class="profile-actions">
                    <button class="profile-icon-btn load-btn" data-id="${profile.id}" title="Load Build">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    <button class="profile-icon-btn edit-btn" data-id="${profile.id}" title="Edit Build">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>${shareBlock}
                    <button class="profile-icon-btn delete-btn" data-id="${profile.id}" title="Delete Build">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            `;

        item.querySelector('.load-btn').addEventListener('click', () => {
            this.loadProfile(profile.id);
        });
        item.querySelector('.edit-btn').addEventListener('click', () => {
            this.editProfile(profile.id);
        });
        item.querySelector('.share-btn')?.addEventListener('click', () => {
            this.openShareModal(profile);
        });
        item.querySelector('.delete-btn').addEventListener('click', () => {
            this.deleteProfile(profile.id);
        });

        return item;
    }

    renderProfiles() {
        const list = document.getElementById('profiles-list');
        if (!list) return;
        list.innerHTML = '';

        this.profiles = this.profiles.filter(p => p && p.id);
        this.localBuilds = this.localBuilds.filter(p => p && p.id);

        const appendSectionTitle = (title) => {
            const h = document.createElement('h3');
            h.className = 'profiles-section-title';
            h.textContent = title;
            list.appendChild(h);
        };

        if (this.profiles.length > 0) {
            if (this.localBuilds.length > 0) {
                appendSectionTitle('Cloud saves');
            }
            for (const profile of this.profiles) {
                list.appendChild(this._createProfileListItem(profile, false));
            }
        }

        if (this.localBuilds.length > 0) {
            appendSectionTitle('Local builds');
            for (const profile of this.localBuilds) {
                list.appendChild(this._createProfileListItem(profile, true));
            }
        }
    }

    openSaveProfileDialog() {
        this.clearStaleCloudEditingState();
        const dialog = document.getElementById('save-profile-dialog');
        const input = document.getElementById('profile-name-input');
        const buildName = this.getBuildName();

        // If editing an existing build, prompt overwrite vs. save-as-new
        if (this.editingProfileId) {
            const profile = this.findBuildById(this.editingProfileId);
            const originalName = profile ? profile.name : 'this build';
            const overwriteMsg = document.getElementById('save-overwrite-msg');
            if (overwriteMsg) {
                overwriteMsg.textContent = `"${originalName}" is already saved. Overwrite it or save as a new build?`;
            }
            document.getElementById('save-overwrite-dialog').style.display = 'flex';
            return;
        }

        // No existing build — save immediately if name is already set
        if (buildName) {
            input.value = buildName;
            setTimeout(() => this.saveProfile(), 0);
            return;
        }

        input.value = '';
        dialog.style.display = 'flex';
        input.focus();
    }

    async saveProfile() {
        const name = document.getElementById('profile-name-input').value.trim();

        if (!name) {
            notify.error('Please enter a profile name');
            return;
        }

        this.clearStaleCloudEditingState();

        const editingLocal = this.editingProfileId && this.isLocalProfileId(this.editingProfileId);
        if (!this.user || editingLocal) {
            await this.saveLocalProfile(name);
            return;
        }

        try {
            // Get current build data from the app
            const buildData = window.buildManager?.getBuildData() || {};

            // Check if we're editing an existing profile
            if (this.editingProfileId) {
                // Update existing profile
                const response = await fetch(`/profiles/${encodeURIComponent(this.editingProfileId)}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        buildData
                    })
                });

                const data = await response.json();
                console.log('Update profile response:', data);

                if (data.success) {
                    // Update profile in local array
                    const profileIndex = this.profiles.findIndex(p => this.sameProfileId(p.id, this.editingProfileId));
                    if (profileIndex !== -1) {
                        this.profiles[profileIndex] = data.profile;
                    }

                    // Clear editing mode
                    this.editingProfileId = null;

                    // Update build title to show the new name (no longer editing)
                    this.showBuildTitle(name, false);

                    document.getElementById('save-profile-dialog').style.display = 'none';
                    this.renderProfiles();
                    this.syncBuildListUI();
                    notify.success('Build updated successfully!');
                } else {
                    notify.error('Failed to update build: ' + data.error);
                }
            } else {
                // Create new profile
                const response = await fetch('/profiles', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        buildData
                    })
                });

                const data = await response.json();
                console.log('Save profile response:', data);

                if (data.success) {
                    console.log('Profile to add:', data.profile);
                    if (data.profile) {
                        this.profiles.push(data.profile);

                        // Show build title with the saved name
                        this.showBuildTitle(name, false);

                        document.getElementById('save-profile-dialog').style.display = 'none';
                        this.renderProfiles();
                        this.syncBuildListUI();
                        notify.success('Build saved successfully!');
                    } else {
                        console.error('Profile is undefined in response');
                        notify.error('Failed to save build: Invalid server response');
                    }
                } else {
                    notify.error('Failed to save build: ' + data.error);
                }
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            notify.error('Failed to save build');
        }
    }

    /** Persist current build to localStorage (guest users, or editing a local_* build while logged in). */
    async saveLocalProfile(name) {
        const buildData = window.buildManager?.getBuildData() || {};
        const wasUpdate = !!(this.editingProfileId && this.isLocalProfileId(this.editingProfileId));
        const updateId = this.editingProfileId;

        if (wasUpdate) {
            const idx = this.localBuilds.findIndex(p => this.sameProfileId(p.id, updateId));
            if (idx === -1) {
                notify.error('Local build not found');
                this.editingProfileId = null;
                return;
            }
            this.localBuilds[idx] = {
                ...this.localBuilds[idx],
                name,
                buildData,
                updatedAt: new Date().toISOString()
            };
            this.editingProfileId = null;
        } else {
            this.localBuilds.push({
                id: this.newLocalBuildId(),
                name,
                buildData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        this.persistLocalBuilds();
        this.showBuildTitle(name, false);
        document.getElementById('save-profile-dialog').style.display = 'none';
        this.renderProfiles();
        this.syncBuildListUI();
        notify.success(wasUpdate ? 'Build updated on this device' : 'Build saved on this device');
    }

    /** Resolve build JSON from a profile (handles legacy gearBuild/talentBuild shape). */
    normalizeProfileBuildData(profile) {
        let buildData = profile.buildData;
        if (!buildData && (profile.gearBuild || profile.talentBuild || profile.characterData)) {
            buildData = {
                class: profile.characterData?.class || '',
                race: profile.characterData?.race || '',
                attackerLevel: profile.characterData?.level || 63,
                characterName: '',
                server: 'nordanaar',
                gear: profile.gearBuild || {},
                enchants: profile.gearBuild?.enchants || {},
                talents: profile.talentBuild || {},
                buffs: []
            };
        }
        return buildData;
    }

    /**
     * @param {string} profileId
     * @param {{ silent?: boolean }} [options] - silent: no success toast (e.g. startup default load)
     * @returns {Promise<boolean>}
     */
    async loadProfile(profileId, options = {}) {
        const silent = !!options.silent;
        const profile = this.findBuildById(profileId);
        if (!profile) return false;

        try {
            const buildData = this.normalizeProfileBuildData(profile);

            if (buildData && window.buildManager) {
                if (typeof window.buildManager.addTabWithLoadedBuild === 'function') {
                    await window.buildManager.addTabWithLoadedBuild(profile.name, buildData);
                } else {
                    await window.buildManager.loadBuildData(buildData);
                    this.showBuildTitle(profile.name);
                }
                this.editingProfileId = profile.id;

                document.getElementById('profiles-modal').style.display = 'none';
                if (!silent) notify.success('Build loaded successfully!');
                return true;
            }
            if (!silent) notify.error('Failed to load build: Invalid data');
            return false;
        } catch (error) {
            console.error('Error loading profile:', error);
            if (!silent) notify.error('Failed to load build');
            return false;
        }
    }

    async editProfile(profileId) {
        const profile = this.findBuildById(profileId);
        if (!profile) return;

        try {
            const buildData = this.normalizeProfileBuildData(profile);

            if (buildData && window.buildManager) {
                await window.buildManager.loadBuildData(buildData);

                // Set editing mode
                this.editingProfileId = profile.id;

                // Show build title with editing indicator
                this.showBuildTitle(profile.name, true);

                // Close modal
                document.getElementById('profiles-modal').style.display = 'none';

                // Show notification
                notify.success(`Editing build: ${profile.name}. Click Save Build to update.`);
            } else {
                notify.error('Failed to load build: Invalid data');
            }
        } catch (error) {
            console.error('Error loading profile for editing:', error);
            notify.error('Failed to load build for editing');
        }
    }

    async deleteProfile(profileId) {
        const confirmed = await notify.confirm(
            'This profile will be permanently deleted.',
            'Delete Profile',
            { confirmText: 'Delete', cancelText: 'Cancel' }
        );

        if (!confirmed) {
            return;
        }

        if (this.isLocalProfileId(profileId)) {
            this.localBuilds = this.localBuilds.filter(p => !this.sameProfileId(p.id, profileId));
            this.persistLocalBuilds();
            this.renderProfiles();
            this.syncBuildListUI();
            notify.success('Build deleted');
            return;
        }

        try {
            const response = await fetch(`/profiles/${encodeURIComponent(profileId)}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (data.success) {
                this.profiles = this.profiles.filter(p => !this.sameProfileId(p.id, profileId));
                this.renderProfiles();
                this.syncBuildListUI();
            } else {
                notify.error('Failed to delete profile: ' + data.error);
            }
        } catch (error) {
            console.error('Error deleting profile:', error);
            notify.error('Failed to delete profile');
        }
    }

    openShareModal(profile) {
        const modal = document.getElementById('share-modal');
        const input = document.getElementById('recipient-id-input');
        const messageInput = document.getElementById('share-message-input');

        input.value = '';
        messageInput.value = '';
        modal.dataset.profileId = profile.id;
        modal.dataset.kind = profile.kind === 'gearPlan' ? 'gearPlan' : 'build';
        modal.style.display = 'flex';
        input.focus();
    }

    async shareBuild() {
        const modal = document.getElementById('share-modal');
        const profileId = modal.dataset.profileId;
        const shareKind = modal.dataset.kind;
        const recipientId = document.getElementById('recipient-id-input').value.trim();
        const message = document.getElementById('share-message-input').value.trim();
        const status = document.getElementById('share-status');

        if (!recipientId) {
            status.textContent = 'Please enter a recipient username or Discord ID';
            status.style.display = 'block';
            status.style.backgroundColor = '#ff4444';
            return;
        }

        if (shareKind === 'gearPlan') {
            try {
                const plans = await this.fetchGearPlans();
                const plan = plans.find(p => String(p.id) === String(profileId));
                if (!plan) {
                    status.textContent = 'Gear plan not found';
                    status.style.display = 'block';
                    status.style.backgroundColor = '#ff4444';
                    return;
                }
                const data = await this.shareGearPlan(plan, recipientId, message);
                if (data.success) {
                    status.textContent = 'Gear plan shared successfully!';
                    status.style.display = 'block';
                    status.style.backgroundColor = '#44ff44';
                    setTimeout(() => {
                        modal.style.display = 'none';
                        status.style.display = 'none';
                    }, 2000);
                } else {
                    status.textContent = 'Failed to share: ' + (data.error || 'unknown');
                    status.style.display = 'block';
                    status.style.backgroundColor = '#ff4444';
                }
            } catch (error) {
                console.error('Error sharing gear plan:', error);
                status.textContent = 'Failed to share gear plan';
                status.style.display = 'block';
                status.style.backgroundColor = '#ff4444';
            }
            return;
        }

        const profile = this.profiles.find(p => this.sameProfileId(p.id, profileId));
        if (!profile) return;

        try {
            // Use new buildData format if available, otherwise fall back to old format
            let buildDataToShare;
            if (profile.buildData) {
                // New format - send directly with profile name
                buildDataToShare = {
                    ...profile.buildData,
                    profileName: profile.name
                };
            } else {
                // Old format - send legacy fields
                buildDataToShare = {
                    gearBuild: profile.gearBuild,
                    talentBuild: profile.talentBuild,
                    characterData: profile.characterData,
                    profileName: profile.name
                };
            }

            const response = await fetch('/share', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientId,
                    buildData: buildDataToShare,
                    message
                })
            });

            const data = await response.json();

            if (data.success) {
                status.textContent = 'Build shared successfully!';
                status.style.display = 'block';
                status.style.backgroundColor = '#44ff44';
                setTimeout(() => {
                    modal.style.display = 'none';
                    status.style.display = 'none';
                }, 2000);
            } else {
                status.textContent = 'Failed to share build: ' + data.error;
                status.style.display = 'block';
                status.style.backgroundColor = '#ff4444';
            }
        } catch (error) {
            console.error('Error sharing build:', error);
            status.textContent = 'Failed to share build';
            status.style.display = 'block';
            status.style.backgroundColor = '#ff4444';
        }
    }

    openInboxModal() {
        const modal = document.getElementById('inbox-modal');
        const list = document.getElementById('inbox-list');
        const empty = document.getElementById('inbox-empty');

        if (this.inboxMessages.length === 0) {
            list.innerHTML = '';
            empty.style.display = 'block';
        } else {
            empty.style.display = 'none';
            this.renderInbox();
        }

        modal.style.display = 'flex';
    }

    renderInbox() {
        const list = document.getElementById('inbox-list');
        list.innerHTML = '';

        this.inboxMessages.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'inbox-item' + (msg.read ? '' : ' unread');

            const senderAvatar = msg.from.avatar
                ? `https://cdn.discordapp.com/avatars/${msg.from.id}/${msg.from.avatar}.png`
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

            item.innerHTML = `
                <div class="inbox-header">
                    <img src="${senderAvatar}" class="inbox-avatar" alt="${this.escapeHtml(msg.from.username)}">
                    <div class="inbox-info">
                        <strong>${this.escapeHtml(msg.from.username)}</strong>
                        <span class="inbox-date">${new Date(msg.timestamp).toLocaleString()}</span>
                    </div>
                </div>
                <div class="inbox-message">${this.escapeHtml(msg.message || 'No message')}</div>
                <div class="inbox-build-info">
                    <strong>Build:</strong> ${this.escapeHtml(msg.buildData.profileName || 'Shared Build')}
                </div>
                <div class="inbox-actions">
                    <button class="inbox-btn load-btn" data-id="${msg.id}" title="Load Build">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    <button class="inbox-btn save-btn" data-id="${msg.id}" title="Save to My Builds">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                    </button>
                    ${!msg.read ? `<button class="inbox-btn read-btn" data-id="${msg.id}" title="Mark as Read">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="22 13 16 13 14 16 10 16 8 13 2 13"></polyline>
                            <path d="M5.47 5.19L2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.47-7.81A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.83 1.19z"></path>
                        </svg>
                    </button>` : ''}
                    <button class="inbox-btn delete-btn" data-id="${msg.id}" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            // Load button
            item.querySelector('.load-btn').addEventListener('click', async () => {
                await this.loadSharedBuild(msg);
                await this.markAsReadAndRemove(msg.id);
                this.renderInbox();
            });

            // Save button
            item.querySelector('.save-btn').addEventListener('click', async () => {
                await this.saveSharedBuild(msg);
                await this.markAsReadAndRemove(msg.id);
                this.renderInbox();
            });

            // Mark as Read button
            item.querySelector('.read-btn')?.addEventListener('click', async () => {
                await this.markAsRead(msg.id);
                this.renderInbox();
            });

            // Delete button
            item.querySelector('.delete-btn').addEventListener('click', async () => {
                await this.deleteInboxMessage(msg.id);
            });

            list.appendChild(item);
        });
    }

    async loadSharedBuild(message) {
        try {
            let buildData = message.buildData;

            if (!buildData) {
                notify.error('Failed to load build: No build data');
                return;
            }

            if (buildData.kind === 'gearPlan') {
                if (typeof window.setGearPlan === 'function') {
                    window.setGearPlan(buildData);
                }
                if (typeof window.setAppMode === 'function') {
                    window.setAppMode('gearPlanner');
                }
                const modal = document.getElementById('inbox-modal');
                if (modal) modal.style.display = 'none';
                this.closeInboxDropdown();
                notify.success('Gear plan loaded!');
                return;
            }

            // Check if build is already in new format (has gear/class directly)
            const isNewFormat = buildData.gear || buildData.class || buildData.talents;
            
            // Check if build is in old format (has gearBuild/talentBuild/characterData)
            const isOldFormat = buildData.gearBuild || buildData.talentBuild || buildData.characterData;
            
            if (!isNewFormat && !isOldFormat) {
                // Build has no usable data - was shared with broken format
                console.error('[Build Import] Build has no usable data:', buildData);
                notify.error('This build was shared with an older broken format. Please ask the sender to reshare it.');
                return;
            }

            // Convert old format to new format if needed
            if (!isNewFormat && isOldFormat) {
                const orig = buildData;
                // Old format - convert to new format
                buildData = {
                    class: orig.characterData?.class || '',
                    race: orig.characterData?.race || '',
                    attackerLevel: orig.characterData?.level || 63,
                    characterName: orig.characterData?.characterName || '',
                    server: orig.characterData?.server || 'nordanaar',
                    gear: orig.gearBuild || {},
                    enchants: orig.gearBuild?.enchants || {},
                    talents: orig.talentBuild || {},
                    buffs: orig.characterData?.buffs || [],
                    shamanDpsPriority: orig.characterData?.shamanDpsPriority || null,
                    profileName: orig.profileName
                };
                if (orig.statWeights) buildData.statWeights = orig.statWeights;
                if (orig.statWeightsAoe) buildData.statWeightsAoe = orig.statWeightsAoe;
            }

            if (window.buildManager) {
                const name = buildData.profileName || `Build from ${message.from.username}`;
                if (typeof window.buildManager.addTabWithLoadedBuild === 'function') {
                    await window.buildManager.addTabWithLoadedBuild(name, buildData);
                } else {
                    await window.buildManager.loadBuildData(buildData);
                    if (buildData.profileName) this.showBuildTitle(buildData.profileName);
                }
                const modal = document.getElementById('inbox-modal');
                if (modal) modal.style.display = 'none';
                this.closeInboxDropdown();
                notify.success('Build loaded successfully!');
            } else {
                notify.error('Failed to load build: Build manager not available');
            }
        } catch (error) {
            console.error('Error loading shared build:', error);
            notify.error('Failed to load build: ' + error.message);
        }
    }

    async markAsRead(messageId) {
        try {
            const response = await fetch(`/api/inbox/${messageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: true })
            });

            this._localReadIds.add(String(messageId));

            const msg = this.inboxMessages.find(m => m.id == messageId);
            if (msg && !msg.read) {
                msg.read = true;
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                this.updateInboxBadge();
                this.updateUnreadBadge();
            }

            if (!response.ok) {
                console.error('Mark as read failed:', response.status, await response.text().catch(() => ''));
            }
        } catch (error) {
            console.error('Error marking message as read:', error);
            notify.error('Failed to mark as read');
        }
    }

    async markAsReadAndRemove(messageId) {
        try {
            this._localReadIds.add(String(messageId));

            // Mark as read on server
            await fetch(`/api/inbox/${messageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: true })
            });

            // Update local state - mark as read but keep in list
            const msg = this.inboxMessages.find(m => m.id == messageId);
            if (msg && !msg.read) {
                msg.read = true;
                this.unreadCount--;
            }
            this.updateInboxBadge();
            this.updateUnreadBadge();
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    }

    async saveSharedBuild(message) {
        try {
            let buildData = message.buildData;

            if (!buildData) {
                notify.error('Failed to save build: No build data');
                return;
            }

            // Check if build is in old format and convert if needed
            const isNewFormat = buildData.gear || buildData.class || buildData.talents;
            const isOldFormat = buildData.gearBuild || buildData.talentBuild || buildData.characterData;

            if (!isNewFormat && isOldFormat) {
                const orig = buildData;
                buildData = {
                    class: orig.characterData?.class || '',
                    race: orig.characterData?.race || '',
                    attackerLevel: orig.characterData?.level || 63,
                    characterName: orig.characterData?.characterName || '',
                    server: orig.characterData?.server || 'nordanaar',
                    gear: orig.gearBuild || {},
                    enchants: orig.gearBuild?.enchants || {},
                    talents: orig.talentBuild || {},
                    buffs: orig.characterData?.buffs || [],
                    shamanDpsPriority: orig.characterData?.shamanDpsPriority || null,
                    profileName: orig.profileName
                };
                if (orig.statWeights) buildData.statWeights = orig.statWeights;
                if (orig.statWeightsAoe) buildData.statWeightsAoe = orig.statWeightsAoe;
            }

            // Use the build name from the shared build, or generate one
            const buildName = buildData.profileName || `Build from ${message.from.username}`;

            // Save to profiles
            const response = await fetch('/profiles', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: buildName,
                    buildData: buildData
                })
            });

            const data = await response.json();

            if (data.success && data.profile) {
                this.profiles.push(data.profile);
                this.syncBuildListUI();
                notify.success(`Build "${buildName}" saved to your builds!`);
            } else {
                notify.error('Failed to save build: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error saving shared build:', error);
            notify.error('Failed to save build: ' + error.message);
        }
    }

    async deleteInboxMessage(messageId) {
        const confirmed = await notify.confirm(
            'This message will be permanently deleted.',
            'Delete Message',
            { confirmText: 'Delete', cancelText: 'Cancel' }
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/inbox/${messageId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (data.success) {
                const msg = this.inboxMessages.find(m => m.id === messageId);
                if (msg && !msg.read) {
                    this.unreadCount--;
                }

                this.inboxMessages = this.inboxMessages.filter(m => m.id !== messageId);
                this.renderInbox();
                this.updateInboxBadge();

                if (this.inboxMessages.length === 0) {
                    document.getElementById('inbox-empty').style.display = 'block';
                }
            } else {
                notify.error('Failed to delete message: ' + data.error);
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            notify.error('Failed to delete message');
        }
    }

    startInboxPolling() {
        if (this._inboxPollInterval != null) return;
        this._inboxPollInterval = setInterval(async () => {
            await this.loadInbox();
        }, 30000);
    }

    showBuildTitle(buildName, isEditing = false) {
        const nameInput = document.getElementById('build-name-input');

        if (nameInput) {
            nameInput.value = buildName || '';
        }
    }

    hideBuildTitle() {
        const nameInput = document.getElementById('build-name-input');

        if (nameInput) {
            nameInput.value = '';
        }
    }

    getBuildName() {
        const nameInput = document.getElementById('build-name-input');
        return nameInput ? nameInput.value.trim() : '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Shaman DPS Gear Compare — list saved shaman builds (cloud profiles + localStorage local builds).
     * Each entry has cloned `buildData` (safe to hand to compare sim without mutating storage).
     * @returns {Array<{ id: string, name: string, buildData: object }>}
     */
    getShamanSavedBuildsForCompare() {
        this.loadLocalBuildsFromStorage();
        const cloneBuild = (obj) => {
            try {
                return typeof structuredClone === 'function'
                    ? structuredClone(obj)
                    : JSON.parse(JSON.stringify(obj));
            } catch (e) {
                console.warn('[Profiles] getShamanSavedBuildsForCompare: clone failed', e);
                return null;
            }
        };
        const isShaman = (profile) => {
            const bd = this.normalizeProfileBuildData(profile);
            return bd && String(bd.class || '').toLowerCase() === 'shaman';
        };
        const out = [];
        const push = (profile) => {
            if (!profile?.id || !isShaman(profile)) return;
            const raw = this.normalizeProfileBuildData(profile);
            const buildData = cloneBuild(raw);
            if (!buildData) return;
            out.push({
                id: String(profile.id),
                name: (profile.name && String(profile.name).trim()) || 'Unnamed',
                buildData
            });
        };
        for (const p of this.profiles) push(p);
        for (const p of this.localBuilds) push(p);
        return out;
    }
}

/** Shaman Build Compare picker — saved builds only (see `ProfileManager.getShamanSavedBuildsForCompare`). */
window.getShamanSavedBuildsForCompare = function getShamanSavedBuildsForCompare() {
    return typeof window.profileManager?.getShamanSavedBuildsForCompare === 'function'
        ? window.profileManager.getShamanSavedBuildsForCompare()
        : [];
};

ProfileManager.prototype.fetchGearPlans = async function fetchGearPlans() {
    if (!this.user) return [];
    try {
        const res = await fetch('/user-gear-plans', { credentials: 'include' });
        const data = await res.json();
        return data.success ? (data.gearPlans || []) : [];
    } catch (e) {
        console.error('[Profiles] fetchGearPlans:', e);
        return [];
    }
};

ProfileManager.prototype.saveGearPlan = async function saveGearPlan(plan) {
    if (!this.user) return null;
    try {
        const res = await fetch('/user-gear-plans', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan }),
        });
        const data = await res.json();
        if (!data.success) {
            if (data.code === 'NOT_AUTHOR' || res.status === 403) {
                window.notify?.error?.(data.error || 'Only the original author can overwrite this plan', 4500, 'Gear Planner');
            }
            return null;
        }
        return data.plan || plan;
    } catch (e) {
        console.error('[Profiles] saveGearPlan:', e);
        return null;
    }
};

ProfileManager.prototype.deleteGearPlan = async function deleteGearPlan(id) {
    if (!this.user || !id) return false;
    try {
        const res = await fetch(`/user-gear-plans/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        const data = await res.json();
        return !!data.success;
    } catch (e) {
        console.error('[Profiles] deleteGearPlan:', e);
        return false;
    }
};

ProfileManager.prototype.setGearPlanFavorite = async function setGearPlanFavorite(id) {
    if (!this.user || !id) return false;
    try {
        const res = await fetch(`/user-gear-plans/${encodeURIComponent(id)}/favorite`, {
            method: 'PATCH',
            credentials: 'include',
        });
        const data = await res.json();
        return !!data.success;
    } catch (e) {
        console.error('[Profiles] setGearPlanFavorite:', e);
        return false;
    }
};

ProfileManager.prototype.fetchCommunityGearPlans = async function fetchCommunityGearPlans(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.q) params.set('q', filters.q);
        if (filters.class) params.set('class', filters.class);
        if (filters.role) params.set('role', filters.role);
        if (filters.spec) params.set('spec', filters.spec);
        if (filters.sort) params.set('sort', filters.sort);
        if (filters.voterId) params.set('voterId', filters.voterId);
        if (filters.all) params.set('all', '1');
        if (filters.limit != null) params.set('limit', String(filters.limit));
        if (filters.offset != null) params.set('offset', String(filters.offset));
        const qs = params.toString();
        const res = await fetch(`/community-gear-plans${qs ? `?${qs}` : ''}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) return { plans: [], total: 0, hasMore: false, offset: 0, limit: 0 };
        return {
            plans: data.plans || [],
            total: Number(data.total) || 0,
            hasMore: !!data.hasMore,
            offset: Number(data.offset) || 0,
            limit: Number(data.limit) || 0,
        };
    } catch (e) {
        console.error('[Profiles] fetchCommunityGearPlans:', e);
        return { plans: [], total: 0, hasMore: false, offset: 0, limit: 0 };
    }
};

ProfileManager.prototype.fetchCommunityGearPlan = async function fetchCommunityGearPlan(id, voterId) {
    if (!id) return null;
    try {
        const vid = voterId || (this.user?.id ? `discord:${this.user.id}` : null);
        const qs = vid ? `?voterId=${encodeURIComponent(vid)}` : '';
        const res = await fetch(`/community-gear-plans/${encodeURIComponent(id)}${qs}`, { credentials: 'include' });
        const data = await res.json();
        return data.success ? (data.plan || null) : null;
    } catch (e) {
        console.error('[Profiles] fetchCommunityGearPlan:', e);
        return null;
    }
};

ProfileManager.prototype.voteCommunityGearPlan = async function voteCommunityGearPlan(id, direction, voterId) {
    if (!id) return null;
    try {
        const res = await fetch(`/community-gear-plans/${encodeURIComponent(id)}/vote`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction, voterId }),
        });
        const data = await res.json();
        return data.success ? (data.plan || null) : null;
    } catch (e) {
        console.error('[Profiles] voteCommunityGearPlan:', e);
        return null;
    }
};

ProfileManager.prototype.shareGearPlan = async function shareGearPlan(plan, recipientId, message = '') {
    const buildDataToShare = { ...plan, profileName: plan.name };
    const response = await fetch('/share', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, buildData: buildDataToShare, message }),
    });
    return response.json();
};

// Initialize profile manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.profileManager = new ProfileManager();
        window.profileManager.init();
    });
} else {
    window.profileManager = new ProfileManager();
    window.profileManager.init();
}
