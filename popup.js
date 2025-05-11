// Wait for the popup to fully load before doing anything
document.addEventListener('DOMContentLoaded', () => {
  // Get all the elements we need
  const websiteInput = document.getElementById('website-input');
  const addWebsiteButton = document.getElementById('add-website');
  const blockedWebsitesList = document.getElementById('blocked-websites');
  const statusBadge = document.getElementById('status-badge');
  const suggestionsDropdown = document.getElementById('suggestions-dropdown');
  const scheduleToggle = document.getElementById('schedule-toggle');
  const scheduleOptions = document.getElementById('schedule-options');
  const startTimeInput = document.getElementById('start-time');
  const endTimeInput = document.getElementById('end-time');
  const startTimeFormatSpan = startTimeInput.parentElement.querySelector('.time-format');
  const endTimeFormatSpan = endTimeInput.parentElement.querySelector('.time-format');
  const dayCheckboxes = document.querySelectorAll('.days-checkboxes input[type="checkbox"]');
  const currentTimeElement = document.getElementById('current-time');
  const scheduleStatusElement = document.getElementById('schedule-status');
  const timeProgressElement = document.querySelector('.time-progress');

  const dayToggles = document.querySelectorAll('.day-toggle');

  let isEnabled = false;
  let blockedWebsites = [];
  let schedule = {
    enabled: false,
    startTime: '09:00',
    endTime: '17:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  };

  let manuallyEnabled = false;

  // Initialize collapsible sections
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const collapsible = header.parentElement;
      collapsible.classList.toggle('active');
    });
  });

  // Handle status badge click (replaces toggle button)
  statusBadge.addEventListener('click', () => {
    manuallyEnabled = !isEnabled;
    isEnabled = !isEnabled;
    updateStatus();
    chrome.storage.sync.set({ isEnabled });
    // Notify background script to update blocking
    chrome.runtime.sendMessage({ type: 'updateBlocking', isEnabled });
  });

  // Show suggestions when input is focused
  websiteInput.addEventListener('focus', () => {
    suggestionsDropdown.classList.add('active');
    updateSuggestions(websiteInput.value);
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!websiteInput.contains(e.target) && !suggestionsDropdown.contains(e.target)) {
      suggestionsDropdown.classList.remove('active');
    }
  });

  // Update suggestions as user types
  websiteInput.addEventListener('input', () => {
    updateSuggestions(websiteInput.value);
  });

  function updateStatus() {
    const statusText = isEnabled ? 'Active' : 'Inactive';
    statusBadge.querySelector('.status-text').textContent = `FlowGuard: ${statusText}`;
    statusBadge.classList.toggle('active', isEnabled);
  }

  function addWebsite(website) {
    if (!blockedWebsites.includes(website)) {
      blockedWebsites.push(website);
      updateBlockedWebsitesList();
      chrome.storage.sync.set({ blockedWebsites });
    }
  }

  function removeWebsite(website) {
    blockedWebsites = blockedWebsites.filter(site => site !== website);
    updateBlockedWebsitesList();
    chrome.storage.sync.set({ blockedWebsites });
  }

  function updateBlockedWebsitesList() {
    blockedWebsitesList.innerHTML = '';
    blockedWebsites.forEach(website => {
      const li = createWebsiteListItem(website);
      blockedWebsitesList.appendChild(li);
    });
  }

  async function updateSuggestions(input) {
    if (!input) {
      suggestionsDropdown.innerHTML = '';
      suggestionsDropdown.classList.remove('active');
      return;
    }

    suggestionsDropdown.classList.add('active');
    
    // First try browser history
    const oneWeekAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
    const history = await chrome.history.search({
      text: input,
      startTime: oneWeekAgo,
      maxResults: 100
    });

    // Process history results
    let suggestions = history
      .map(item => {
        try {
          return new URL(item.url).hostname.replace(/^www\./, '');
        } catch (e) {
          return null;
        }
      })
      .filter(domain => 
        domain && 
        domain.toLowerCase().includes(input.toLowerCase()) && 
        !blockedWebsites.includes(domain) &&
        !domain.includes('google.com') && 
        !domain.startsWith('chrome://')
      );

    // Remove duplicates
    suggestions = [...new Set(suggestions)];

    // If we have few suggestions, add Google search results
    if (suggestions.length < 3) {
      try {
        const response = await fetch(`https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(input + ' site:')}`);
        const [, googleSuggestions] = await response.json();
        
        // Extract domains from Google suggestions
        const googleDomains = googleSuggestions
          .map(suggestion => {
            const match = suggestion.match(/site:(\S+)/i);
            return match ? match[1].replace(/^www\./, '') : null;
          })
          .filter(domain => 
            domain && 
            !blockedWebsites.includes(domain) && 
            !suggestions.includes(domain)
          );
        
        suggestions = [...suggestions, ...googleDomains].slice(0, 5);
      } catch (error) {
        console.log('Error fetching Google suggestions:', error);
      }
    } else {
      suggestions = suggestions.slice(0, 5);
    }

    // Update the dropdown UI
    suggestionsDropdown.innerHTML = '';
    if (suggestions.length > 0) {
      suggestions.forEach(suggestion => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
          <img src="https://www.google.com/s2/favicons?domain=${suggestion}&sz=32" alt="favicon">
          <span>${suggestion}</span>
        `;
        
        // Add click handler
        div.addEventListener('click', () => {
          websiteInput.value = suggestion;
          addWebsite(suggestion);
          suggestionsDropdown.innerHTML = '';
          suggestionsDropdown.classList.remove('active');
          websiteInput.value = '';
        });
        
        suggestionsDropdown.appendChild(div);
      });
    } else {
      // Show "no results" message
      const noResults = document.createElement('div');
      noResults.className = 'suggestion-item no-results';
      noResults.textContent = 'No matching sites found. Press Enter to add as-is.';
      suggestionsDropdown.appendChild(noResults);
    }
  }

  // Initialize day toggles
  function initializeDayToggles() {
    dayToggles.forEach(toggle => {
      const day = toggle.dataset.day;
      if (schedule.days.includes(day)) {
        toggle.classList.add('active');
      }
      
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        
        // Update schedule days
        if (toggle.classList.contains('active')) {
          if (!schedule.days.includes(day)) {
            schedule.days.push(day);
          }
        } else {
          schedule.days = schedule.days.filter(d => d !== day);
        }
        
        updateScheduleUI();
        saveSchedule();
      });
    });
  }

  // Handle schedule toggle
  scheduleToggle.addEventListener('click', () => {
    schedule.enabled = !schedule.enabled;
    scheduleToggle.classList.toggle('enabled', schedule.enabled);
    scheduleOptions.classList.toggle('active', schedule.enabled);
    updateScheduleUI();
    saveSchedule();
  });
  
  // Save schedule settings when they change
  function saveSchedule() {
    chrome.storage.sync.set({ schedule });
    // Notify background script of schedule change
    chrome.runtime.sendMessage({
      type: 'scheduleUpdated',
      schedule: schedule,
      isEnabled: isEnabled
    });
  }

  // Time Input Handlers
  startTimeInput.addEventListener('change', () => {
    schedule.startTime = startTimeInput.value;
    updateScheduleUI();
    saveSchedule();
  });
  
  endTimeInput.addEventListener('change', () => {
    schedule.endTime = endTimeInput.value;
    updateScheduleUI();
    saveSchedule();
  });

  // Add input event listeners for immediate AM/PM feedback
  startTimeInput.addEventListener('input', () => {
    updateTimeFormat(startTimeInput, startTimeFormatSpan);
  });

  endTimeInput.addEventListener('input', () => {
    updateTimeFormat(endTimeInput, endTimeFormatSpan);
  });

  // Load initial state
  chrome.storage.sync.get(['isEnabled', 'blockedWebsites', 'schedule'], (data) => {
    isEnabled = data.isEnabled === true;
    blockedWebsites = Array.isArray(data.blockedWebsites) ? data.blockedWebsites : [];

    const defaultSchedule = {
      enabled: false,
      startTime: '09:00',
      endTime: '17:00',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    };

    // Ensure schedule object and its properties are valid, otherwise use defaults
    if (data.schedule && typeof data.schedule === 'object') {
      schedule.enabled = data.schedule.enabled === true;
      
      schedule.startTime = (typeof data.schedule.startTime === 'string' && /^\d{2}:\d{2}$/.test(data.schedule.startTime))
        ? data.schedule.startTime
        : defaultSchedule.startTime;
      
      schedule.endTime = (typeof data.schedule.endTime === 'string' && /^\d{2}:\d{2}$/.test(data.schedule.endTime))
        ? data.schedule.endTime
        : defaultSchedule.endTime;
      
      schedule.days = (Array.isArray(data.schedule.days) && data.schedule.days.every(day => typeof day === 'string'))
        ? data.schedule.days
        : defaultSchedule.days;
      if (schedule.days.length === 0 && defaultSchedule.days.length > 0) { // Ensure days are not empty if defaults are not
          schedule.days = defaultSchedule.days;
      }

    } else {
      schedule = { ...defaultSchedule };
    }

    updateStatus();
    updateBlockedWebsitesList();
    updateScheduleUI();
    initializeDayToggles();
  });

  // Clean up website URLs to make them consistent
  // Like turning "https://www.youtube.com/watch?v=whatever" into just "youtube.com"
  function normalizeUrl(url) {
    try {
      // If it's already a domain (no protocol), add a temporary one
      if (!url.includes('://')) {
        url = 'http://' + url;
      }
      
      // Parse the URL
      const parsedUrl = new URL(url);
      let hostname = parsedUrl.hostname.toLowerCase();
      
      // Remove 'www.' prefix
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      
      return hostname;
    } catch (e) {
      // If there's any error in parsing, just clean it manually
      url = url.toLowerCase().trim();
      url = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');
      url = url.split('/')[0];
      return url;
    }
  }

  // Check if we're already blocking a website
  // This helps us avoid adding the same site twice
  function isWebsiteBlocked(website, blockedSites) {
    const normalizedNew = normalizeUrl(website);
    return blockedSites.some(site => normalizeUrl(site) === normalizedNew);
  }

  // See if all the websites in a category (like Social Media) are blocked
  // This is how we know whether to highlight the category button
  function isCategoryActive(button, blockedSites) {
    const sites = JSON.parse(button.dataset.sites);  // Get the list of sites for this category
    return sites.every(site => isWebsiteBlocked(site, blockedSites));  // Check if ALL of them are blocked
  }

  // Look at all category buttons and highlight them if all their sites are blocked
  function updateCategoryStates() {
    chrome.storage.sync.get(['blockedWebsites'], (data) => {
      const blockedWebsites = data.blockedWebsites || [];
      // Go through each category button
      document.querySelectorAll('.action-btn').forEach(button => {
        // Make it black if all its sites are blocked, gray if not
        button.classList.toggle('active', isCategoryActive(button, blockedWebsites));
      });
    });
  }

  // What happens when you click a category button (like "Social Media" or "Gaming")
  document.querySelectorAll('.action-btn').forEach(button => {
    button.addEventListener('click', () => {
      // Get all the websites in this category
      const sites = JSON.parse(button.dataset.sites);
      chrome.storage.sync.get(['blockedWebsites'], (data) => {
        const currentBlocked = new Set(data.blockedWebsites || []);
        let added = false;
        
        // If everything in this category is already blocked, unblock it all
        if (isCategoryActive(button, Array.from(currentBlocked))) {
          sites.forEach(site => {
            currentBlocked.delete(site);  // Remove each site
          });
          button.classList.remove('active');  // Un-highlight the button
        } else {
          // Otherwise, block all sites in this category
          sites.forEach(site => {
            if (!isWebsiteBlocked(site, Array.from(currentBlocked))) {
              currentBlocked.add(site);
              added = true;
            }
          });
          button.classList.add('active');  // Highlight the button
        }

        // Save all changes and update everything on screen
        const newBlockedSites = Array.from(currentBlocked);
        chrome.storage.sync.set({ blockedWebsites: newBlockedSites }, () => {
          blockedWebsitesList.innerHTML = '';  // Clear the list
          newBlockedSites.forEach(site => addWebsiteToList(site));  // Rebuild it
          updateSuggestionStates();  // Update the suggestions
          updateCategoryStates();  // Update category buttons
        });
      });
    });
  });

  // Add a new website to your block list
  function addWebsiteToList(website) {
    const listItem = createWebsiteListItem(website);
    blockedWebsitesList.appendChild(listItem);
  }

  // Update how the suggestions look based on what's already blocked
  function updateSuggestionStates() {
    chrome.storage.sync.get(['blockedWebsites'], (data) => {
      const blockedWebsites = data.blockedWebsites || [];
      // Go through each suggestion
      document.querySelectorAll('.suggestion').forEach(suggestion => {
        const hostname = suggestion.textContent;
        if (isWebsiteBlocked(hostname, blockedWebsites)) {
          // If it's blocked, gray it out and add a strikethrough
          suggestion.classList.add('already-blocked');
          suggestion.title = 'Already blocked';
        } else {
          // If it's not blocked, make it clickable
          suggestion.classList.remove('already-blocked');
          suggestion.title = 'Click to block this site';
        }
      });
    });
  }

  // Add a suggestion from your browser history
  function addHistorySuggestion(url) {
    const hostname = normalizeUrl(url);
    const suggestionItem = createSuggestionItem(hostname);
    historySuggestions.appendChild(suggestionItem);
  }

  // Look through your browser history to find suggestions
  chrome.history.search({
    text: '',  // Search for everything
    maxResults: 50,  // Get up to 50 results
    startTime: Date.now() - (7 * 24 * 60 * 60 * 1000)  // From the last 7 days
  }, (historyItems) => {
    // Count how many times you visited each site
    const domainCounts = {};
    historyItems.forEach(item => {
      try {
        const hostname = normalizeUrl(item.url);
        domainCounts[hostname] = (domainCounts[hostname] || 0) + 1;
      } catch (e) {
        console.error('Oops, had trouble with this URL:', e);
      }
    });

    // Sort by most visited and take the top 10
    const suggestions = Object.entries(domainCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([domain]) => domain);

    // Clear old suggestions and add the new ones
    historySuggestions.innerHTML = '';
    [...new Set(suggestions)].forEach(domain => {
      addHistorySuggestion('https://' + domain);
    });

    updateSuggestionStates();  // Update how they look
  });

  // Function to show site-specific schedule modal
  function showSiteScheduleModal(website) {
    alert(`Schedule feature for ${website} will be implemented soon!`);
    // This would normally open a modal with site-specific scheduling options
    // For now we're keeping the interface simple with just global scheduling
  }

  // Update schedule UI and check if blocking should be active
  function updateScheduleUI() {
    scheduleToggle.classList.toggle('enabled', schedule.enabled);
    scheduleOptions.classList.toggle('active', schedule.enabled);
    
    // Display times in 24-hour format internally, let input field handle display
    startTimeInput.value = schedule.startTime;
    endTimeInput.value = schedule.endTime;

    // Update AM/PM display based on the current input values
    updateTimeFormat(startTimeInput, startTimeFormatSpan);
    updateTimeFormat(endTimeInput, endTimeFormatSpan);
    
    // Update day toggles
    dayToggles.forEach(toggle => {
      const day = toggle.dataset.day;
      toggle.classList.toggle('active', schedule.days.includes(day));
    });
    
    // Check if we should be blocking right now
    const now = new Date();
    const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
    
    const isScheduledDay = schedule.days.includes(currentDay);
    const isWithinScheduledTime = isTimeInRange(currentTime, schedule.startTime, schedule.endTime);
    const shouldBlock = schedule.enabled && isScheduledDay && isWithinScheduledTime;
    
    // Update UI to reflect current state
    if (shouldBlock) {
      scheduleStatusElement.textContent = 'Schedule active';
      scheduleStatusElement.classList.add('active');
      if (!isEnabled) {
        isEnabled = true;
        updateStatus();
        chrome.storage.sync.set({ isEnabled });
        // Notify background script to update blocking
        chrome.runtime.sendMessage({ type: 'updateBlocking', isEnabled: true });
      }
    } else if (schedule.enabled) {
      scheduleStatusElement.textContent = 'Schedule inactive';
      scheduleStatusElement.classList.remove('active');
      if (isEnabled && !manuallyEnabled) {
        isEnabled = false;
        updateStatus();
        chrome.storage.sync.set({ isEnabled });
        // Notify background script to update blocking
        chrome.runtime.sendMessage({ type: 'updateBlocking', isEnabled: false });
      }
    } else {
      scheduleStatusElement.textContent = 'Scheduling disabled';
      scheduleStatusElement.classList.remove('active');
    }
    
    // Update progress bar
    updateTimeProgress();
  }

  // Helper function to check if current time is within range
  function isTimeInRange(current, start, end) {
    const parseTime = (timeStr) => {
      if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
        // console.warn(`[parseTime] Invalid time string format: "${timeStr}"`);
        return NaN;
      }
      const parts = timeStr.split(':');
      if (parts.length !== 2) {
        // console.warn(`[parseTime] Invalid time string parts: "${timeStr}"`);
        return NaN;
      }
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);

      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        // console.warn(`[parseTime] Invalid hours/minutes in time string: "${timeStr}" (parsed as ${hours}:${minutes})`);
        return NaN;
      }
      return hours * 60 + minutes;
    };
    
    const currentMinutes = parseTime(current);
    const startMinutes = parseTime(start);
    const endMinutes = parseTime(end);
    
    // console.log(`[isTimeInRange] Comparing: Current=${current}(${currentMinutes}), Start=${start}(${startMinutes}), End=${end}(${endMinutes})`);

    if (isNaN(currentMinutes) || isNaN(startMinutes) || isNaN(endMinutes)) {
      // console.error(`[isTimeInRange] One or more parsed times are NaN. current: ${currentMinutes}, start: ${startMinutes}, end: ${endMinutes}. Aborting comparison.`);
      return false; 
    }
    
    if (endMinutes < startMinutes) {
      // Handle overnight schedules
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // Update time progress bar
  function updateTimeProgress() {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    currentTimeElement.textContent = currentTime;

    // Convert times to minutes for progress calculation
    const current24h = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    const [currentHour, currentMinute] = current24h.split(':').map(Number);
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number);

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    let progress = 0;
    if (isTimeInRange(current24h, schedule.startTime, schedule.endTime)) {
      if (endMinutes < startMinutes) {
        // Handle overnight schedules
        const totalMinutes = (24 * 60) - startMinutes + endMinutes;
        const elapsedMinutes = currentMinutes >= startMinutes ? 
          currentMinutes - startMinutes : 
          (24 * 60) - startMinutes + currentMinutes;
        progress = (elapsedMinutes / totalMinutes) * 100;
      } else {
        const totalMinutes = endMinutes - startMinutes;
        progress = ((currentMinutes - startMinutes) / totalMinutes) * 100;
      }
    }

    timeProgressElement.style.width = `${progress}%`;
  }

  // Function to get high quality favicon URL for a website
  function getFaviconUrl(website) {
    // Try multiple sources for the best possible icon
    const sources = [
      // Direct favicon.ico from the website (highest quality usually)
      `https://${website}/favicon.ico`,
      // Apple touch icon (usually high quality)
      `https://${website}/apple-touch-icon.png`,
      // Google's favicon service as fallback (reliable but lower quality)
      `https://www.google.com/s2/favicons?domain=${website}&sz=64`
    ];
    
    return sources[2]; // Using Google's service for now as it's most reliable
  }

  // Function to create a website list item with enhanced favicon
  function createWebsiteListItem(website) {
    const li = document.createElement('li');
    
    // Create favicon container for better styling
    const faviconContainer = document.createElement('div');
    faviconContainer.className = 'favicon-container';
    
    // Create favicon image with enhanced size
    const favicon = document.createElement('img');
    favicon.src = getFaviconUrl(website);
    favicon.className = 'website-favicon';
    favicon.alt = `${website} icon`;
    
    // Add error handling for favicon loading
    favicon.onerror = () => {
      // If favicon fails to load, try Google's service as fallback
      favicon.src = `https://www.google.com/s2/favicons?domain=${website}&sz=64`;
    };
    
    faviconContainer.appendChild(favicon);
    
    // Create website text with better spacing
    const websiteText = document.createElement('span');
    websiteText.textContent = website;
    websiteText.className = 'website-text';
    
    // Create controls container
    const controls = document.createElement('div');
    controls.className = 'site-controls';
    
    // Create a simple remove button with proper × HTML entity
    const removeButton = document.createElement('button');
    removeButton.className = 'remove-website';
    removeButton.innerHTML = '&times;'; // Proper multiplication/times symbol
    removeButton.title = 'Remove';
    removeButton.onclick = () => removeWebsite(website);
    
    // Add remove button to controls
    controls.appendChild(removeButton);
    
    // Add all elements to list item
    li.appendChild(faviconContainer);
    li.appendChild(websiteText);
    li.appendChild(controls);
    
    return li;
  }

  // Function to create a suggestion item with enhanced favicon
  function createSuggestionItem(website) {
    const div = document.createElement('div');
    div.className = 'suggestion';
    
    // Create favicon container
    const faviconContainer = document.createElement('div');
    faviconContainer.className = 'favicon-container';
    
    // Create favicon image with enhanced size
    const favicon = document.createElement('img');
    favicon.src = getFaviconUrl(website);
    favicon.className = 'suggestion-favicon';
    favicon.alt = `${website} icon`;
    
    // Add error handling for favicon loading
    favicon.onerror = () => {
      favicon.src = `https://www.google.com/s2/favicons?domain=${website}&sz=64`;
    };
    
    faviconContainer.appendChild(favicon);
    
    // Create website text with better spacing
    const websiteText = document.createElement('span');
    websiteText.textContent = website;
    websiteText.className = 'website-text';
    
    // Add elements to suggestion
    div.appendChild(faviconContainer);
    div.appendChild(websiteText);
    
    // Add click handler
    div.onclick = () => addWebsite(website);
    
    return div;
  }

  // Update every minute
  setInterval(() => {
    updateScheduleUI();
    updateTimeProgress();
  }, 60000);

  // Convert 24h to 12h format
  function formatTime12Hour(time24) {
    const [hours24, minutes] = time24.split(':');
    const hours = hours24 % 12 || 12;
    const ampm = hours24 < 12 ? 'AM' : 'PM';
    return `${hours}:${minutes} ${ampm}`;
  }

  // Convert 12h to 24h format
  function formatTime24Hour(time12) {
    if (!time12.includes(':')) return time12; // Already in 24h
    const [time, modifier] = time12.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours);
    
    if (modifier === 'PM' && hours < 12) hours = hours + 12;
    if (modifier === 'AM' && hours === 12) hours = 0; // Midnight case
    
    if (isNaN(hours) || isNaN(parseInt(minutes))) return '00:00'; // Fallback for bad input

    return `${hours.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }

  // --- AM/PM label updater for time inputs ---
  function updateTimeFormat(inputElement, formatSpanElement) {
    if (!inputElement) {
      return;
    }

    const timeValue = inputElement.value; // HH:MM format or empty string

    if (!timeValue || !/^\d{2}:\d{2}$/.test(timeValue)) {
      // Reset any styling if time is invalid
      inputElement.classList.remove('am-time', 'pm-time');
      return;
    }

    const [hourString] = timeValue.split(':');
    const hour = parseInt(hourString, 10);

    if (isNaN(hour) || hour < 0 || hour > 23) {
      // Reset any styling if hour is invalid
      inputElement.classList.remove('am-time', 'pm-time');
      return;
    }
    
    // Remove both classes first
    inputElement.classList.remove('am-time', 'pm-time');
    
    // Add the appropriate class for color-coding directly to the input
    const isAM = hour < 12;
    inputElement.classList.add(isAM ? 'am-time' : 'pm-time');
  }
}); 