import React, { useEffect } from 'react';

function NotificationOverlay({ type = 'success', message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 2500); // Auto-hide after 2.5 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="notification-overlay">
      <div className="notification-content">
        {type === 'success' ? (
          <div className="checkmark-circle">
            <div className="checkmark draw"></div>
          </div>
        ) : (
          <div className="cross-circle">
            <div className="cross draw"></div>
          </div>
        )}
        <p className="notification-message">{message}</p>
      </div>
    </div>
  );
}

export default NotificationOverlay;
