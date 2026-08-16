// onboarding.js - First-time visitor onboarding flow
import {
    SHAMAN_CONSUME_TIERS,
    SHAMAN_PRESET_SPEC_ICONS,
    SHAMAN_CONSUME_ICON_LARGE,
} from './modules/shaman/shamanConsumePresets.js';

const ONBOARDING_NO_PRESET_ICON = `${SHAMAN_CONSUME_ICON_LARGE}/inv_misc_questionmark.png`;

/** After opening DPS Sim, default inner tab to Combat Sim (not Results). */
function focusShamanDpsCombatSimSubtab() {
    try {
        localStorage.setItem('activeDPSSimTab', 'combat-sim');
    } catch (_) { /* ignore */ }
    document.querySelector('.shaman-dps-container .dps-tab-btn[data-tab="combat-sim"]')?.click();
}

export async function runOnboarding(deps) {
    // deps: { updateAllCalculations, triggerImport, getCurrentClass, getClassPickerEntries, getRacePickerEntries,
    //         setClass, setRace, applyTalentPreset, applyShamanConsumePreset }

    // --- Skip conditions ---

    // 1. Always skip for share links (?b=, ?build=, ?gp=) and Gear Planner routes
    const params = new URLSearchParams(location.search);
    if (params.has('b') || params.has('build') || params.has('gp')) return false;
    const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
    if (path === '/gear-planner' || path === '/gp') return false;

    // 2. Logged-in Discord users with a default build: load it, skip onboarding (return true so init does not run handleClassChange and wipe the load).
    let discordUser = null;
    let savedProfiles = [];
    try {
        const authResp = await fetch('/user', { credentials: 'include' });
        if (authResp.ok) {
            const authData = await authResp.json();
            if (authData.authenticated) {
                discordUser = authData.user;
            }
        }
    } catch (_) { /* offline / no server */ }

    if (discordUser) {
        // Re-fetch so we never apply default from a stale list (e.g. SW cache on GET /profiles before fix).
        if (window.profileManager?.loadProfiles) {
            try {
                await window.profileManager.loadProfiles();
            } catch (_) { /* loadProfiles logs internally */ }
        }
        savedProfiles = Array.isArray(window.profileManager?.profiles)
            ? window.profileManager.profiles.slice()
            : [];

        const defaultProfile = savedProfiles.find(p => p.isDefault);
        if (defaultProfile && window.profileManager && window.buildManager) {
            window.profileManager.profiles = savedProfiles;
            const loaded = await window.profileManager.loadProfile(defaultProfile.id, { silent: true });
            if (loaded) return true;
        }
        // No default (or load failed): continue to onboarding below
    }

    // 3. Guest with local saves: load most recently updated device build and skip onboarding (same idea as cloud default).
    if (!discordUser && window.profileManager?.localBuilds?.length > 0 && window.buildManager) {
        const builds = window.profileManager.localBuilds.slice();
        builds.sort((a, b) => {
            const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
            const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
            return tb - ta;
        });
        const pick = builds[0];
        const loaded = await window.profileManager.loadProfile(pick.id, { silent: true });
        if (loaded) return true;
    }

    // At this point we WILL show onboarding — immediately hide the loading screen
    // so it doesn't flash before the onboarding card appears.
    // (For returning Discord users we've already returned above, so they still see the loading screen.)
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => loadingScreen.remove(), 500);
    }

    // Show overlay
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.classList.remove('onboarding-overlay--build-picker');

    async function waitForBuildSessionDeps(maxMs = 5000) {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
            if (window.profileManager && window.buildManager) return true;
            await new Promise(r => setTimeout(r, 30));
        }
        return !!(window.profileManager && window.buildManager);
    }

    // Update Discord login button visibility based on auth state
    const discordLoginBtn = document.getElementById('onboarding-discord-btn');
    const discordLoggedInRow = document.getElementById('onboarding-discord-logged-in');
    if (discordUser) {
        // Already logged in — show their name instead of the login button
        if (discordLoginBtn) discordLoginBtn.style.display = 'none';
        if (discordLoggedInRow) {
            discordLoggedInRow.style.display = 'flex';
            const nameEl = document.getElementById('onboarding-discord-username');
            if (nameEl) nameEl.textContent = discordUser.username;
        }
    } else {
        if (discordLoginBtn) discordLoginBtn.style.display = 'flex';
        if (discordLoggedInRow) discordLoggedInRow.style.display = 'none';
    }

    // Step navigation helper
    function showStep(id) {
        document.querySelectorAll('.onboarding-step').forEach(s => { s.style.display = 'none'; });
        const step = typeof id === 'number'
            ? document.getElementById(`onboarding-step-${id}`)
            : document.getElementById(id);
        if (step) step.style.display = 'block';
    }

    function finishOnboardingOverlayLoadedBuild() {
        overlay.classList.add('fade-out');
        setTimeout(() => { overlay.style.display = 'none'; }, 500);
        const cls = deps.getCurrentClass();
        const targetTab = cls === 'shaman' ? 'dpssim' : 'stats';
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
        if (tabBtn && tabBtn.offsetParent !== null) tabBtn.click();
        else document.querySelector('.tab-btn[data-tab="stats"]')?.click();
        if (cls === 'shaman') {
            setTimeout(focusShamanDpsCombatSimSubtab, 120);
        }
    }

    const wantsSavedBuildPicker = discordUser
        && savedProfiles.length > 0
        && !savedProfiles.some(p => p.isDefault);

    let hasSavedBuildsNoDefault = false;
    if (wantsSavedBuildPicker) {
        await waitForBuildSessionDeps();
        hasSavedBuildsNoDefault = !!(window.profileManager && window.buildManager);
        if (wantsSavedBuildPicker && !hasSavedBuildsNoDefault) {
            console.warn('[Onboarding] Saved builds exist but profile/build manager not ready; falling back to welcome screen.');
        }
    }

    if (hasSavedBuildsNoDefault) {
        const listEl = document.getElementById('onboarding-saved-builds-list');
        const errEl = document.getElementById('onboarding-pick-build-error');
        const userLine = document.getElementById('onboarding-pick-build-user');
        if (userLine && discordUser) userLine.textContent = `Signed in as ${discordUser.username}`;
        if (errEl) errEl.textContent = '';

        if (listEl) {
            overlay.classList.add('onboarding-overlay--build-picker');
            showStep('onboarding-step-pick-build');
            listEl.innerHTML = '';
            for (const p of savedProfiles) {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'onboarding-saved-build-row';
                row.dataset.profileId = String(p.id);
                const nameSpan = document.createElement('span');
                nameSpan.className = 'onboarding-saved-build-name';
                nameSpan.textContent = (p.name && String(p.name).trim()) ? p.name : 'Unnamed build';
                row.appendChild(nameSpan);
                listEl.appendChild(row);
            }

            const newBtn = document.getElementById('onboarding-new-build-btn');
            const pickResult = await new Promise(resolve => {
                newBtn?.addEventListener('click', () => resolve({ kind: 'new' }), { once: true });
                listEl.querySelectorAll('.onboarding-saved-build-row').forEach(row => {
                    row.addEventListener('click', async () => {
                        const id = row.dataset.profileId;
                        const profile = savedProfiles.find(x => String(x.id) === id);
                        if (!profile) return;
                        if (errEl) errEl.textContent = '';
                        listEl.querySelectorAll('.onboarding-saved-build-row').forEach(r => { r.disabled = true; });
                        if (newBtn) newBtn.disabled = true;
                        window.profileManager.profiles = savedProfiles;
                        const ok = await window.profileManager.loadProfile(profile.id, { silent: true });
                        listEl.querySelectorAll('.onboarding-saved-build-row').forEach(r => { r.disabled = false; });
                        if (newBtn) newBtn.disabled = false;
                        if (ok) resolve({ kind: 'loaded' });
                        else if (errEl) errEl.textContent = 'Could not load that build. Try another or use New character setup.';
                    });
                });
            });

            if (pickResult.kind === 'loaded') {
                overlay.classList.remove('onboarding-overlay--build-picker');
                finishOnboardingOverlayLoadedBuild();
                if (window.notify?.info) {
                    window.notify.info('Set a default under My Builds anytime to skip this step next visit.', 4500, 'Saved builds');
                }
                return true;
            }
            overlay.classList.remove('onboarding-overlay--build-picker');
        }
    }

    // STEP 1: Import or skip (full welcome onboarding)
    showStep(1);

    // Discord login button: redirect to OAuth (page reloads, onboarding re-runs)
    document.getElementById('onboarding-discord-btn')?.addEventListener('click', () => {
        sessionStorage.setItem('ichacalc_discord_onboarding', '1');
        window.location.href = '/auth/discord';
    });

    let didImport = false;
    await new Promise(resolve => {
        document.getElementById('onboarding-import-btn').addEventListener('click', async () => {
            const name = document.getElementById('onboarding-char-name').value.trim();
            const server = document.getElementById('onboarding-server-select').value;
            if (!name) {
                document.getElementById('onboarding-import-error').textContent = 'Please enter a character name.';
                return;
            }
            document.getElementById('onboarding-import-error').textContent = '';
            const importBtn = document.getElementById('onboarding-import-btn');
            importBtn.textContent = 'Importing...';
            importBtn.disabled = true;
            try {
                await deps.triggerImport(name, server);
                didImport = true;
                resolve();
            } catch (e) {
                document.getElementById('onboarding-import-error').textContent = 'Import failed. Try again or create custom.';
                importBtn.textContent = 'Import from Armory';
                importBtn.disabled = false;
            }
        });
        document.getElementById('onboarding-skip-import-btn').addEventListener('click', () => resolve());
        document.getElementById('onboarding-gear-planner-btn')?.addEventListener('click', () => {
            window.location.assign('/gear-planner');
        });
    });

    // STEP 2 (conditional): Class selection — only for custom chars (armory import sets class automatically)
    if (!didImport) {
        showStep('onboarding-step-class');
        const classGrid = document.getElementById('onboarding-class-grid');
        classGrid.innerHTML = '';
        await new Promise(resolve => {
            const entries = typeof deps.getClassPickerEntries === 'function'
                ? deps.getClassPickerEntries()
                : [];
            if (entries.length === 0) { resolve(); return; }
            entries.forEach((entry) => {
                const clone = document.createElement('div');
                clone.className = 'onboarding-class-icon';
                const img = document.createElement('img');
                img.src = entry.icon;
                img.alt = entry.name || '';
                clone.appendChild(img);
                clone.title = entry.name || entry.id || '';
                clone.addEventListener('click', async () => {
                    document.querySelectorAll('.onboarding-class-icon').forEach(c => c.classList.remove('selected'));
                    clone.classList.add('selected');
                    await deps.setClass(entry.id);
                    setTimeout(resolve, 150);
                });
                classGrid.appendChild(clone);
            });
        });
    }

    // STEP 3: Race selection — only for custom chars (armory import sets race on the main race icons)
    const detectedClass = deps.getCurrentClass();
    if (!didImport) {
        showStep(3);
        const raceGrid = document.getElementById('onboarding-race-grid');
        raceGrid.innerHTML = '';
        await new Promise(resolve => {
            const entries = typeof deps.getRacePickerEntries === 'function'
                ? deps.getRacePickerEntries(deps.getCurrentClass())
                : [];
            if (entries.length === 0) { resolve(); return; }
            entries.forEach((entry) => {
                const clone = document.createElement('div');
                clone.className = 'onboarding-race-icon';
                const img = document.createElement('img');
                img.src = entry.icon;
                img.alt = entry.name || '';
                clone.appendChild(img);
                clone.title = entry.name || entry.id || '';
                clone.addEventListener('click', () => {
                    document.querySelectorAll('.onboarding-race-icon').forEach(r => r.classList.remove('selected'));
                    clone.classList.add('selected');
                    if (typeof deps.setRace === 'function') {
                        deps.setRace(entry.id);
                    }
                    setTimeout(resolve, 200);
                });
                raceGrid.appendChild(clone);
            });
        });
    }

    // STEP 4: Preset (Shaman only)
    let selectedPreset = null;
    /** @type {'budget'|'standard'|'max'|null} */
    let selectedConsumeTier = null;

    const consumeTierDefs = SHAMAN_CONSUME_TIERS.map((t) => ({
        key: t.key,
        label: t.key === 'max' ? 'Max' : t.label,
        icon: t.icon,
    }));

    if (detectedClass === 'shaman') {
        showStep(2);
        const presets = [
            'DPS - Physhance', 'Tank - Physhance', 'DPS - Spellhance', 'Tank - Spellhance', 'Elemental', 'No Preset',
        ];
        const grid = document.getElementById('onboarding-preset-cards');
        grid.innerHTML = '';
        await new Promise(resolve => {
            presets.forEach(name => {
                const opt = document.createElement('div');
                opt.className = 'onboarding-preset-option';
                opt.setAttribute('role', 'button');
                opt.tabIndex = 0;
                const img = document.createElement('img');
                img.className = 'onboarding-preset-option-icon';
                img.alt = '';
                img.src = name === 'No Preset'
                    ? ONBOARDING_NO_PRESET_ICON
                    : (SHAMAN_PRESET_SPEC_ICONS[name] || ONBOARDING_NO_PRESET_ICON);
                const cap = document.createElement('span');
                cap.className = 'onboarding-preset-option-label';
                cap.textContent = name;
                opt.appendChild(img);
                opt.appendChild(cap);
                const pick = () => {
                    document.querySelectorAll('.onboarding-preset-option').forEach(c => c.classList.remove('selected'));
                    opt.classList.add('selected');
                    selectedPreset = name;
                    setTimeout(resolve, 200);
                };
                opt.addEventListener('click', pick);
                opt.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick();
                    }
                });
                grid.appendChild(opt);
            });
        });
    }

    if (detectedClass === 'shaman' && selectedPreset && selectedPreset !== 'No Preset') {
        showStep('onboarding-step-consumables');
        const cgrid = document.getElementById('onboarding-consume-tier-cards');
        cgrid.innerHTML = '';
        await new Promise(resolve => {
            consumeTierDefs.forEach(def => {
                const opt = document.createElement('div');
                opt.className = 'onboarding-consume-tier-option';
                opt.dataset.tier = def.key;
                opt.setAttribute('role', 'button');
                opt.tabIndex = 0;
                const img = document.createElement('img');
                img.className = 'onboarding-consume-tier-option-icon';
                img.src = def.icon;
                img.alt = '';
                const cap = document.createElement('span');
                cap.className = 'onboarding-consume-tier-option-label';
                cap.textContent = def.label;
                opt.appendChild(img);
                opt.appendChild(cap);
                const pick = () => {
                    document.querySelectorAll('.onboarding-consume-tier-option').forEach(c => c.classList.remove('selected'));
                    opt.classList.add('selected');
                    selectedConsumeTier = def.key;
                    setTimeout(resolve, 200);
                };
                opt.addEventListener('click', pick);
                opt.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick();
                    }
                });
                cgrid.appendChild(opt);
            });
        });
    }

    // Apply talent + priority preset, then consumable buffs (Shaman only)
    if (selectedPreset && selectedPreset !== 'No Preset') {
        await deps.applyTalentPreset(selectedPreset);
    }
    if (
        typeof deps.applyShamanConsumePreset === 'function'
        && selectedPreset
        && selectedPreset !== 'No Preset'
        && selectedConsumeTier
    ) {
        deps.applyShamanConsumePreset(selectedPreset, selectedConsumeTier);
    }

    deps.updateAllCalculations();

    // Auto-save as default if logged in and had no default build when onboarding started
    if (discordUser && !savedProfiles.some(p => p.isDefault)) {
        try {
            const buildData = window.buildManager?.getBuildData() || {};
            const resp = await fetch('/profiles', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Default', buildData, isDefault: true })
            });
            let data = {};
            try {
                data = await resp.json();
            } catch (_) { /* non-JSON body */ }
            if (window.profileManager) {
                if (resp.ok && data.success) {
                    await window.profileManager.loadProfiles();
                } else {
                    console.warn('[Onboarding] Auto-save default profile failed:', resp.status, data);
                    await window.profileManager.loadProfiles();
                }
            }
        } catch (e) {
            console.warn('[Onboarding] Auto-save default profile error:', e);
        }
    }

    overlay.classList.add('fade-out');
    setTimeout(() => { overlay.style.display = 'none'; }, 500);

    // Navigate to appropriate tab
    const targetTab = detectedClass === 'shaman' ? 'dpssim' : 'stats';
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
    if (tabBtn && tabBtn.offsetParent !== null) {
        tabBtn.click();
    } else {
        document.querySelector('.tab-btn[data-tab="stats"]')?.click();
    }
    if (detectedClass === 'shaman') {
        setTimeout(focusShamanDpsCombatSimSubtab, 120);
    }

    // Return true so the caller knows onboarding ran and already called handleClassChange.
    // This prevents the app init from calling it again (which would wipe the talent tree).
    return true;
}
