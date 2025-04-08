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

// This is where the magic happens - setting up our website blocker!
async function updateBlockingRules() {
  // First, let's check if blocking is turned on and what sites we're blocking
  const data = await chrome.storage.sync.get(['enabled', 'blockedWebsites']);
  console.log('Time to update our blocking rules! Here\'s what we\'ve got:', data);

  // If Focus Mode is turned off, we'll remove all blocks
  if (!data.enabled) {
    console.log('Focus Mode is off, letting all sites through!');
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1]
    });
    return;
  }

  // If we've got some sites to block, let's set that up
  if (data.blockedWebsites && data.blockedWebsites.length > 0) {
    // This is our blocking rule - it tells Chrome what to do when someone tries to visit a blocked site
    const rule = {
      id: 1,  // We just use one rule for everything
      priority: 1,
      action: { 
        type: "redirect",  // When they hit a blocked site...
        redirect: { extensionPath: "/blocked.html" }  // ...show them our blocked page instead!
      },
      condition: {
        // Match any blocked site, whether it starts with www. or not
        urlFilter: data.blockedWebsites.map(site => `*://*.${site}/*`).join('|'),
        resourceTypes: ["main_frame"]  // Only block the main page, not images or other stuff
      }
    };

    // Out with the old rules, in with the new!
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [rule]
    });
    console.log('Alright, new blocking rules are ready to go:', rule);
  }
}

// Keep an eye on what tabs are open and block any naughty sites!
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // We only care when a page is loading up
  if (changeInfo.status === 'loading' && tab.url) {
    const data = await chrome.storage.sync.get(['enabled', 'blockedWebsites']);
    
    // If Focus Mode is on and this is a blocked site...
    if (data.enabled && shouldBlockUrl(tab.url, data.blockedWebsites)) {
      // ...redirect to our blocked page!
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL('blocked.html')
      });
    }
  }
});

// Listen for any changes to our settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    console.log('Looks like something changed in our settings:', changes);
    updateBlockingRules();  // Update our blocking rules to match
  }
});

// When the extension starts up, get our blocking rules ready!
updateBlockingRules(); 