// Notification system for IchaCalc
class NotificationSystem {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Create toast container
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - success, error, warning, or info
     * @param {number} duration - Duration in ms (default 3000)
     * @param {string} title - Optional title
     */
    toast(message, type = 'info', duration = 3000, title = null) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        // Icon based on type
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ''}
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close">×</button>
            ${duration > 0 ? '<div class="toast-progress"></div>' : ''}
        `;

        // Close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toast);
        });

        // Add to container
        this.container.appendChild(toast);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toast);
            }, duration);
        }

        return toast;
    }

    removeToast(toast) {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    /**
     * Show a success toast
     */
    success(message, title = 'Success') {
        return this.toast(message, 'success', 3000, title);
    }

    /**
     * Show an error toast
     */
    error(message, title = 'Error') {
        return this.toast(message, 'error', 5000, title);
    }

    /**
     * Show a warning toast
     */
    warning(message, title = 'Warning') {
        return this.toast(message, 'warning', 4000, title);
    }

    /**
     * Show an info toast
     */
    info(message, title = null) {
        return this.toast(message, 'info', 3000, title);
    }

    /**
     * Show a confirmation dialog
     * @param {string} message - The message to display
     * @param {string} title - Dialog title
     * @param {Object} options - Options {confirmText, cancelText, type}
     * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
     */
    confirm(message, title = 'Confirm', options = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-modal-overlay';

            const confirmText = options.confirmText || 'Confirm';
            const cancelText = options.cancelText || 'Cancel';
            const type = options.type || 'warning'; // 'warning' or 'primary'

            overlay.innerHTML = `
                <div class="confirm-modal">
                    <div class="confirm-modal-header">
                        <div class="confirm-modal-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                        </div>
                        <h3 class="confirm-modal-title">${this.escapeHtml(title)}</h3>
                    </div>
                    <p class="confirm-modal-message">${this.escapeHtml(message)}</p>
                    <div class="confirm-modal-actions">
                        <button class="confirm-modal-btn confirm-modal-btn-cancel">${this.escapeHtml(cancelText)}</button>
                        <button class="confirm-modal-btn confirm-modal-btn-confirm ${type === 'primary' ? 'primary' : ''}">${this.escapeHtml(confirmText)}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const cancelBtn = overlay.querySelector('.confirm-modal-btn-cancel');
            const confirmBtn = overlay.querySelector('.confirm-modal-btn-confirm');

            const cleanup = (result) => {
                overlay.style.animation = 'fadeOut 0.2s ease-out';
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                    resolve(result);
                }, 200);
            };

            cancelBtn.addEventListener('click', () => cleanup(false));
            confirmBtn.addEventListener('click', () => cleanup(true));

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup(false);
                }
            });

            // Close on ESC key
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanup(false);
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create global instance
const notify = new NotificationSystem();

// Make available globally
window.notify = notify;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = notify;
}
