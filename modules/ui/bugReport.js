// Bug Report Module

let selectedScreenshot = null;

// Storage keys
// Note: localStorage persists across page refreshes (including hard refresh).
// It only gets cleared if the user manually clears browser data or uses incognito mode.
const SUBMITTED_REPORTS_KEY = 'ichacalc_submitted_bug_reports';
const READ_NOTIFICATIONS_KEY = 'ichacalc_read_notifications';

// Store a submitted bug report timestamp
function storeSubmittedReport(timestampDir) {
    try {
        const stored = localStorage.getItem(SUBMITTED_REPORTS_KEY);
        const reports = stored ? JSON.parse(stored) : [];
        if (!reports.includes(timestampDir)) {
            reports.push(timestampDir);
            localStorage.setItem(SUBMITTED_REPORTS_KEY, JSON.stringify(reports));
        }
    } catch (error) {
        console.error('Error storing submitted report:', error);
    }
}

// Get all submitted bug report timestamps
function getSubmittedReports() {
    try {
        const stored = localStorage.getItem(SUBMITTED_REPORTS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error reading submitted reports:', error);
        return [];
    }
}

// Get read notification timestamps
function getReadNotifications() {
    try {
        const stored = localStorage.getItem(READ_NOTIFICATIONS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error reading read notifications:', error);
        return [];
    }
}

// Mark notifications as read
function markNotificationsAsRead(timestampDirs) {
    try {
        const stored = localStorage.getItem(READ_NOTIFICATIONS_KEY);
        const read = stored ? JSON.parse(stored) : [];
        timestampDirs.forEach(dir => {
            if (!read.includes(dir)) {
                read.push(dir);
            }
        });
        localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(read));
    } catch (error) {
        console.error('Error marking notifications as read:', error);
    }
}

// Check for fixed reports that the user submitted
async function checkForNotifications() {
    try {
        const submittedReports = getSubmittedReports();
        if (submittedReports.length === 0) {
            return [];
        }

        // Force a fresh fetch by adding timestamp to prevent caching
        const response = await fetch(`/bug-report-status?dirs=${encodeURIComponent(submittedReports.join(','))}&t=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        if (!data.success || !data.reports) {
            return [];
        }

        const readNotifications = getReadNotifications();
        
        // Find fixed reports that the user submitted and haven't been read
        const fixedReports = data.reports.filter(report => {
            const status = report.status || 'open';
            const isSubmitted = submittedReports.includes(report.timestampDir);
            const isFixed = status === 'fixed';
            const isUnread = !readNotifications.includes(report.timestampDir);
            return isSubmitted && isFixed && isUnread;
        });

        return fixedReports;
    } catch (error) {
        console.error('Error checking for notifications:', error);
        return [];
    }
}

export function initBugReport() {
    const bugReportBtn = document.getElementById('bug-report-btn');
    const bugReportModal = document.getElementById('bug-report-modal');
    const bugReportClose = document.getElementById('bug-report-modal-close');
    const bugReportCancel = document.getElementById('bug-report-cancel');
    const bugReportForm = document.getElementById('bug-report-form');
    const screenshotInput = document.getElementById('bug-screenshot');
    const screenshotPreview = document.getElementById('screenshot-preview');
    const screenshotPreviewImg = document.getElementById('screenshot-preview-img');
    const removeScreenshotBtn = document.getElementById('remove-screenshot');
    const statusDiv = document.getElementById('bug-report-status');

    // Open modal
    bugReportBtn.addEventListener('click', () => {
        bugReportModal.style.display = 'flex';
    });

    // Close modal function
    const closeModal = () => {
        bugReportModal.style.display = 'none';
        bugReportForm.reset();
        selectedScreenshot = null;
        screenshotPreview.style.display = 'none';
        statusDiv.style.display = 'none';
    };

    // Close modal events
    bugReportClose.addEventListener('click', closeModal);
    bugReportCancel.addEventListener('click', closeModal);

    // Close on overlay click
    bugReportModal.addEventListener('click', (e) => {
        if (e.target === bugReportModal) {
            closeModal();
        }
    });

    // Handle screenshot selection
    screenshotInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                alert('Please select a valid image file');
                screenshotInput.value = '';
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('Image file size must be less than 5MB');
                screenshotInput.value = '';
                return;
            }

            selectedScreenshot = file;

            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                screenshotPreviewImg.src = e.target.result;
                screenshotPreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // Remove screenshot
    removeScreenshotBtn.addEventListener('click', () => {
        selectedScreenshot = null;
        screenshotInput.value = '';
        screenshotPreview.style.display = 'none';
    });

    // Handle form submission
    bugReportForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('bug-title').value.trim();
        const description = document.getElementById('bug-description').value.trim();
        const contact = document.getElementById('bug-contact').value.trim();

        if (!description) {
            showStatus('Please provide a description of the bug', 'error');
            return;
        }

        // Create FormData to handle file upload
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('contact', contact);
        formData.append('timestamp', new Date().toISOString());
        formData.append('userAgent', navigator.userAgent);

        // Add current URL and any relevant state info
        formData.append('url', window.location.href);

        if (selectedScreenshot) {
            formData.append('screenshot', selectedScreenshot);
        }

        try {
            const response = await fetch('/bug-report', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                // Store the timestamp directory from the server response for notification tracking
                // This ensures we use the exact directory name the server created
                if (data.timestampDir) {
                    storeSubmittedReport(data.timestampDir);
                } else {
                    // Fallback: use client-side timestamp if server doesn't return it
                    const timestamp = new Date().toISOString();
                    const timestampDir = timestamp.replace(/[:.]/g, '-');
                    storeSubmittedReport(timestampDir);
                }
                
                showStatus('Bug report submitted successfully! Thank you for helping improve IchaCalc.', 'success');
                setTimeout(() => {
                    closeModal();
                }, 2000);
            } else {
                showStatus(data.error || 'Failed to submit bug report. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Error submitting bug report:', error);
            showStatus('Network error. Please check your connection and try again.', 'error');
        }
    });

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = type;
        statusDiv.style.display = 'block';
    }
}

export function initBugReportsViewer() {
    const viewBtn = document.getElementById('view-bug-reports-btn');
    const viewerModal = document.getElementById('bug-reports-viewer-modal');
    const viewerClose = document.getElementById('bug-reports-viewer-close');
    const reportsList = document.getElementById('bug-reports-list');
    const loadingDiv = document.getElementById('bug-reports-loading');
    const emptyDiv = document.getElementById('bug-reports-empty');
    const tabs = document.querySelectorAll('.bug-report-tab');

    if (!viewBtn || !viewerModal || !viewerClose) return;

    let allReports = [];
    let currentTab = 'open';

    // Update notification badge
    async function updateNotificationBadge() {
        const notifications = await checkForNotifications();
        const badge = document.getElementById('bug-report-notification-badge');
        if (badge) {
            if (notifications.length > 0) {
                badge.textContent = notifications.length > 9 ? '9+' : notifications.length.toString();
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
        return notifications;
    }

    // Show notification toast
    function showNotificationToast(notifications) {
        if (notifications.length === 0) return;

        const toast = document.getElementById('bug-report-notification-toast');
        const countSpan = document.getElementById('bug-report-notification-count');
        
        if (toast && countSpan) {
            if (notifications.length === 1) {
                countSpan.textContent = 'One of your bug reports has been fixed!';
            } else {
                countSpan.textContent = `${notifications.length} of your bug reports have been fixed!`;
            }
            toast.style.display = 'block';
        }
    }

    // Close notification toast
    function closeNotification() {
        const toast = document.getElementById('bug-report-notification-toast');
        if (toast) {
            toast.style.display = 'none';
            
            // Mark all current notifications as read
            checkForNotifications().then(notifications => {
                const timestampDirs = notifications.map(n => n.timestampDir);
                if (timestampDirs.length > 0) {
                    markNotificationsAsRead(timestampDirs);
                    updateNotificationBadge();
                }
            });
        }
    }

    // Initialize notifications on page load
    async function initNotifications() {
        const notifications = await updateNotificationBadge();
        
        // Show toast if there are notifications (with a small delay for better UX)
        if (notifications.length > 0) {
            setTimeout(() => {
                showNotificationToast(notifications);
            }, 1000);
        }
    }

    // Tab switching
    if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentTab = tab.dataset.tab;
                
                // Filter and display reports
                displayBugReports(allReports);
            });
        });
    }

    // Open viewer
    viewBtn.addEventListener('click', async () => {
        // Update badge before opening
        await updateNotificationBadge();
        viewerModal.style.display = 'flex';
        await loadBugReports();
    });

    // Close viewer
    const closeViewer = () => {
        viewerModal.style.display = 'none';
    };

    viewerClose.addEventListener('click', closeViewer);
    viewerModal.addEventListener('click', (e) => {
        if (e.target === viewerModal) {
            closeViewer();
        }
    });

    async function loadBugReports() {
        if (!loadingDiv || !reportsList || !emptyDiv) {
            console.error('Bug reports viewer elements not found');
            return;
        }

        loadingDiv.style.display = 'block';
        reportsList.style.display = 'none';
        emptyDiv.style.display = 'none';

        try {
            // Force a fresh fetch by adding timestamp to prevent caching
            const response = await fetch(`/bug-reports?t=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'include',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            // Check if response is OK
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Get response text first to debug
            const responseText = await response.text();
            
            // Try to parse as JSON
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Failed to parse JSON:', parseError);
                console.error('Response text:', responseText);
                throw new Error(`Invalid JSON response: ${parseError.message}`);
            }

            loadingDiv.style.display = 'none';

            if (data.success && data.reports) {
                allReports = data.reports;
                displayBugReports(allReports);
                
                // If viewing fixed tab, mark all fixed reports as read
                if (currentTab === 'fixed') {
                    const fixedReports = allReports.filter(r => (r.status || 'open') === 'fixed');
                    const submittedReports = getSubmittedReports();
                    const userFixedReports = fixedReports.filter(r => submittedReports.includes(r.timestampDir));
                    const timestampDirs = userFixedReports.map(r => r.timestampDir);
                    if (timestampDirs.length > 0) {
                        markNotificationsAsRead(timestampDirs);
                        await updateNotificationBadge();
                    }
                }
            } else {
                allReports = [];
                displayBugReports([]);
            }
        } catch (error) {
            console.error('Error loading bug reports:', error);
            loadingDiv.style.display = 'none';
            if (emptyDiv) {
                emptyDiv.innerHTML = `<p style="color: #ff4444;">Error loading bug reports: ${error.message}. Please try again later.</p>`;
                emptyDiv.style.display = 'block';
            }
        }
    }

    async function markAsFixed(timestampDir) {
        try {
            const response = await fetch(`/bug-reports/${timestampDir}/status`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                body: JSON.stringify({ status: 'fixed' }),
                cache: 'no-store'
            });

            const data = await response.json();

            if (data.success) {
                // Reload reports to reflect the change
                await loadBugReports();
            } else {
                alert('Failed to mark bug report as fixed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error marking bug report as fixed:', error);
            alert('Network error. Please try again.');
        }
    }

    function displayBugReports(reports) {
        reportsList.innerHTML = '';

        // Filter reports by current tab
        const filteredReports = reports.filter(report => {
            const status = report.status || 'open';
            return status === currentTab;
        });

        if (filteredReports.length === 0) {
            emptyDiv.textContent = currentTab === 'open' 
                ? 'No open bug reports.' 
                : 'No fixed bug reports.';
            emptyDiv.style.display = 'block';
            reportsList.style.display = 'none';
            return;
        }

        emptyDiv.style.display = 'none';
        reportsList.style.display = 'block';

        filteredReports.forEach(report => {
            const reportItem = document.createElement('div');
            reportItem.className = 'bug-report-item';

            const timestamp = new Date(report.timestamp).toLocaleString();
            const title = report.title || 'Untitled Bug Report';

            let screenshotHtml = '';
            if (report.hasScreenshot && report.timestampDir) {
                // Use the detected screenshot filename, or default to screenshot.png
                const screenshotFile = report.screenshotFilename || 'screenshot.png';
                screenshotHtml = `
                    <div class="bug-report-screenshot">
                        <img src="/bug-reports/${report.timestampDir}/${screenshotFile}" 
                             alt="Screenshot" 
                             onclick="window.open(this.src, '_blank')">
                    </div>
                `;
            }

            let urlHtml = '';
            if (report.url) {
                urlHtml = `
                    <div class="bug-report-detail-row">
                        <span class="bug-report-detail-label">URL:</span>
                        <span class="bug-report-detail-value">
                            <a href="${report.url}" target="_blank" class="bug-report-url">${report.url}</a>
                        </span>
                    </div>
                `;
            }

            const status = report.status || 'open';
            const markFixedButton = status === 'open' ? `
                <button class="bug-report-mark-fixed" onclick="window.bugReportModule.markAsFixed('${report.timestampDir}')">
                    Mark as Fixed
                </button>
            ` : '';

            reportItem.innerHTML = `
                <div class="bug-report-header">
                    <h3 class="bug-report-title">${escapeHtml(title)}</h3>
                    <div class="bug-report-meta">
                        <div class="bug-report-timestamp">${escapeHtml(timestamp)}</div>
                        ${report.contact && report.contact !== 'No contact provided' ? 
                            `<div class="bug-report-contact">${escapeHtml(report.contact)}</div>` : ''}
                    </div>
                </div>
                <div class="bug-report-description">${escapeHtml(report.description || 'No description provided.')}</div>
                ${screenshotHtml}
                <div class="bug-report-details">
                    ${urlHtml}
                    ${report.userAgent ? `
                        <div class="bug-report-detail-row">
                            <span class="bug-report-detail-label">Browser:</span>
                            <span class="bug-report-detail-value">${escapeHtml(report.userAgent)}</span>
                        </div>
                    ` : ''}
                </div>
                ${markFixedButton}
            `;

            reportsList.appendChild(reportItem);
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize notifications when module loads
    initNotifications();

    // Expose functions to window for onclick handlers
    window.bugReportModule = {
        markAsFixed: markAsFixed,
        closeNotification: closeNotification,
        updateNotificationBadge: updateNotificationBadge,
        setAdminViewer: (isAdmin) => {
            if (viewBtn) viewBtn.style.display = isAdmin ? 'flex' : 'none';
        }
    };
}