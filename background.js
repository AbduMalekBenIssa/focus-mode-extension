// This is the behind-the-scenes stuff that runs even when the popup is closed!

// Hey, should we block this website the user is trying to visit?
// We check if the URL matches any of our blocked sites
function shouldBlockUrl(url, blockedWebsites) {
  // If we're not blocking anything yet, let everything through
  if (!blockedWebsites || blockedWebsites.length === 0) return false;
  
  // Get just the main part of the website address (like 'facebook.com')
  const hostname = new URL(url).hostname;
  
  // See if this website matches any of our blocked sites
  return blockedWebsites.some(website => hostname.includes(website));
}

// This file runs in the background, even when the popup is closed
console.log('Focus Mode: background script running');

// When the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('FlowGuard installed or updated');
  
  // Set up default values
  chrome.storage.sync.get(['blockedWebsites', 'isEnabled', 'schedule'], (data) => {
    if (!data.blockedWebsites) {
      chrome.storage.sync.set({ blockedWebsites: [] });
    }
    if (data.isEnabled === undefined) {
      chrome.storage.sync.set({ isEnabled: false });
    }
    if (!data.schedule) {
      chrome.storage.sync.set({
        schedule: {
          enabled: false,
          startTime: '09:00',
          endTime: '17:00',
          days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        }
      });
    }
    updateBlockingRules();
  });
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  if (message.type === 'updateBlocking') {
    updateBlockingRules();
  } else if (message.type === 'scheduleUpdated') {
    updateBlockingRules();
  }
});

// Handle blocking based on schedules
function shouldBlockBasedOnSchedule(schedule) {
  if (!schedule || !schedule.enabled) {
    return false;
  }
  
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDay = dayNames[now.getDay()];
  
  if (!schedule.days || !Array.isArray(schedule.days) || !schedule.days.includes(currentDay)) {
    return false;
  }
  
  // Robust time parsing helper
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !/^\d{2}:\d{2}$/.test(timeStr)) {
      return NaN; // Invalid format
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return NaN; // Invalid numbers
    }
    return hours * 60 + minutes;
  };

  const startMinutes = parseTimeToMinutes(schedule.startTime);
  const endMinutes = parseTimeToMinutes(schedule.endTime);

  if (isNaN(startMinutes) || isNaN(endMinutes)) {
    // If start or end time is invalid, the schedule is not active for time-based blocking
    return false;
  }
  
  const currentTimeStr = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  });
  // current time string from toLocaleTimeString should be reliable, but parse it robustly too for consistency
  const currentMinutes = parseTimeToMinutes(currentTimeStr); 
  
  if (isNaN(currentMinutes)) {
    // Should not happen with toLocaleTimeString, but as a safeguard
    console.error('Failed to parse current time:', currentTimeStr);
    return false; 
  }
  
  if (endMinutes < startMinutes) {
    // Handle overnight schedules
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// This is where the magic happens - setting up our website blocker!
async function updateBlockingRules() {
  try {
    // Get current state
    const data = await chrome.storage.sync.get(['isEnabled', 'blockedWebsites', 'schedule']);
    console.log('Current state:', data);

    // Check if we should block based on schedule
    const shouldBlockNow = data.schedule && data.schedule.enabled && shouldBlockBasedOnSchedule(data.schedule);

    // If schedule is enabled and we're in scheduled hours, enforce blocking
    // Otherwise, respect the manual toggle
    const shouldEnforce = shouldBlockNow || (data.isEnabled && (!data.schedule || !data.schedule.enabled));

    // Remove all existing rules first
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: Array.from({ length: 100 }, (_, i) => i + 1)
    });

    // If blocking is not enabled, we're done
    if (!shouldEnforce || !data.blockedWebsites || data.blockedWebsites.length === 0) {
      console.log('Blocking disabled or no sites to block');
      return;
    }

    // Create rules for each blocked website
    const rules = data.blockedWebsites.map((site, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { extensionPath: "/blocked.html" }
      },
      condition: {
        urlFilter: `||${site}`,
        resourceTypes: ["main_frame"]
      }
    }));

    // Apply the new rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rules
    });
    
    console.log('Updated blocking rules:', rules);
  } catch (error) {
    console.error('Error updating blocking rules:', error);
  }
}

// Listen for any changes to our settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    console.log('Settings changed:', changes);
    updateBlockingRules();
  }
});

// Check schedule periodically (every minute)
setInterval(() => {
  updateBlockingRules();
}, 60000);

// When the extension starts up, get our blocking rules ready!
updateBlockingRules();

// Keep an eye on what tabs are open and update blocking as needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url) {
    updateBlockingRules();
  }
}); 