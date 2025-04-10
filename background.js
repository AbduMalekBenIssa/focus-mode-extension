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
  console.log('Focus Mode installed or updated');
  
  // Set up default values
  chrome.storage.sync.get(['blockedWebsites', 'enabled', 'theme', 'schedule'], (data) => {
    if (!data.blockedWebsites) {
      chrome.storage.sync.set({ blockedWebsites: [] });
    }
    if (data.enabled === undefined) {
      chrome.storage.sync.set({ enabled: false });
    }
    if (!data.theme) {
      chrome.storage.sync.set({ theme: 'light' });
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
  });
});

// Handle blocking based on schedules
function shouldBlockBasedOnSchedule(schedule) {
  if (!schedule || !schedule.enabled) {
    return true; // If scheduling is disabled, blocking depends only on whether Focus Mode is enabled
  }
  
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDay = dayNames[now.getDay()];
  
  // Check if today is in the scheduled days
  if (!schedule.days.includes(currentDay)) {
    return false; // Don't block on days not in the schedule
  }
  
  // Parse times
  const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
  const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
  
  // Create Date objects for the start and end times today
  const startTime = new Date(now);
  startTime.setHours(startHour, startMinute, 0);
  
  const endTime = new Date(now);
  endTime.setHours(endHour, endMinute, 0);
  
  // Check if current time is within the scheduled block time
  return now >= startTime && now <= endTime;
}

// This is where the magic happens - setting up our website blocker!
async function updateBlockingRules() {
  // First, let's check if blocking is turned on and what sites we're blocking
  const data = await chrome.storage.sync.get(['enabled', 'blockedWebsites', 'schedule']);
  console.log('Time to update our blocking rules! Here\'s what we\'ve got:', data);

  // Check if we should block based on schedule
  const shouldBlockNow = data.schedule && data.schedule.enabled && shouldBlockBasedOnSchedule(data.schedule);

  // If schedule is enabled and we're in scheduled hours, enforce blocking regardless of manual toggle
  // Otherwise, respect the user's manual setting
  const shouldEnforce = shouldBlockNow || (data.enabled && (!data.schedule || !data.schedule.enabled));

  // If we should not enforce blocking, remove all blocks
  if (!shouldEnforce) {
    console.log('Focus Mode is off or outside scheduled hours, letting all sites through!');
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: Array.from({ length: 100 }, (_, i) => i + 1)
    });
    return;
  }

  // If we've got some sites to block, let's set that up
  if (data.blockedWebsites && data.blockedWebsites.length > 0) {
    // Create individual rules for each website for more reliable blocking
    const rules = data.blockedWebsites.map((site, index) => {
      return {
        id: index + 1,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { extensionPath: "/blocked.html" }
        },
        condition: {
          urlFilter: `*://*.${site}*`,
          resourceTypes: ["main_frame"]
        }
      };
    });

    // Clear any existing rules first
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: Array.from({ length: 100 }, (_, i) => i + 1),
      addRules: rules
    });
    
    console.log('Blocking rules updated:', rules);
  }
}

// Listen for any changes to our settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    console.log('Looks like something changed in our settings:', changes);
    updateBlockingRules();  // Update our blocking rules to match
  }
});

// Check schedule periodically (every minute)
setInterval(() => {
  updateBlockingRules();
  updateFocusModeUI();
}, 60000); // 60000 ms = 1 minute

// Update the UI to reflect scheduled state
function updateFocusModeUI() {
  chrome.storage.sync.get(['enabled', 'schedule'], (data) => {
    if (!data.schedule || !data.schedule.enabled) return;
    
    const shouldBlockNow = isScheduleActive(data.schedule);
    
    // If we're in scheduled hours, ensure UI shows Focus Mode as enabled
    if (shouldBlockNow && !data.enabled) {
      chrome.storage.sync.set({ enabled: true });
    }
  });
}

// Check if schedule is currently active
function isScheduleActive(schedule) {
  if (!schedule || !schedule.enabled) return false;
  
  const now = new Date();
  return shouldBlockBasedOnSchedule(schedule);
}

// When the extension starts up, get our blocking rules ready!
updateBlockingRules();
// Also check if we should enable focus mode based on schedule
updateFocusModeUI();

// Keep an eye on what tabs are open and update blocking as needed
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // We only care when a page is loading up
  if (changeInfo.status === 'loading' && tab.url) {
    // Force an immediate check to see if we should block this tab
    const data = await chrome.storage.sync.get(['enabled', 'blockedWebsites', 'schedule']);
    
    // Check if Focus Mode is enabled directly or by schedule
    const shouldBlockBySchedule = data.schedule && data.schedule.enabled && shouldBlockBasedOnSchedule(data.schedule);
    const isEnabled = shouldBlockBySchedule || (data.enabled && (!data.schedule || !data.schedule.enabled));
    
    // If enabled and this URL matches a blocked site, redirect immediately
    if (isEnabled && data.blockedWebsites && data.blockedWebsites.length > 0) {
      try {
        const url = new URL(tab.url);
        const hostname = url.hostname.toLowerCase();
        
        // Check each blocked site
        for (const site of data.blockedWebsites) {
          // Match the domain part (accounting for www. or not)
          if (hostname === site || hostname === `www.${site}` || hostname.endsWith(`.${site}`)) {
            console.log(`Blocking direct access to: ${hostname}`);
            chrome.tabs.update(tabId, {
              url: chrome.runtime.getURL('blocked.html')
            });
            break;
          }
        }
      } catch (e) {
        console.error('Error checking URL:', e);
      }
    }
    
    // Also update general rules
    updateBlockingRules();
  }
}); 