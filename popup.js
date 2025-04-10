// Wait for the popup to fully load before doing anything
document.addEventListener('DOMContentLoaded', () => {
  // Grab all the elements we need from the page
  const websiteInput = document.getElementById('website-input');  // The text box where you type websites
  const addWebsiteButton = document.getElementById('add-website');  // The + button to add sites
  const blockedWebsitesList = document.getElementById('blocked-websites');  // The list showing all blocked sites
  const toggleButton = document.getElementById('toggle-mode');  // The on/off switch at the top
  const historySuggestions = document.getElementById('history-suggestions');  // Where we show sites from your history
  const themeToggle = document.getElementById('theme-toggle');
  const scheduleToggle = document.getElementById('schedule-toggle');
  const scheduleOptions = document.getElementById('schedule-options');
  const startTimeInput = document.getElementById('start-time');
  const endTimeInput = document.getElementById('end-time');
  const dayCheckboxes = document.querySelectorAll('.days-checkboxes input[type="checkbox"]');
  const currentTimeElement = document.getElementById('current-time');
  const scheduleStatusElement = document.getElementById('schedule-status');
  const timeProgressElement = document.querySelector('.time-progress');

  // Load saved settings and theme
  chrome.storage.sync.get(['blockedWebsites', 'enabled', 'theme', 'schedule'], (data) => {
    console.log('Getting all your saved stuff:', data);
    // If you had any sites blocked before, let's show them
    if (data.blockedWebsites) {
      // Make sure we don't have any duplicate sites
      const uniqueSites = [...new Set(data.blockedWebsites)];
      // Add each site to the list one by one
      uniqueSites.forEach(website => addWebsiteToList(website));
      // Check which category buttons should be highlighted
      updateCategoryStates();
    }
    // If Focus Mode was turned on before, keep it on
    if (data.enabled) {
      toggleButton.classList.add('enabled');
    }
    // Set up the theme
    if (data.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeToggle.textContent = 'Light';
      themeToggle.title = 'Switch to light mode';
    } else {
      themeToggle.textContent = 'Dark';
      themeToggle.title = 'Switch to dark mode';
    }
    
    // Load schedule settings
    if (data.schedule) {
      if (data.schedule.enabled) {
        scheduleToggle.classList.add('enabled');
        scheduleOptions.classList.add('active');
      }
      
      if (data.schedule.startTime) {
        startTimeInput.value = data.schedule.startTime;
      }
      
      if (data.schedule.endTime) {
        endTimeInput.value = data.schedule.endTime;
      }
      
      if (data.schedule.days && data.schedule.days.length) {
        dayCheckboxes.forEach(checkbox => {
          checkbox.checked = data.schedule.days.includes(checkbox.value);
        });
      }
    }
  });

  // Clean up website URLs to make them consistent
  // Like turning "https://www.youtube.com/watch?v=whatever" into just "youtube.com"
  function normalizeUrl(url) {
    url = url.toLowerCase().trim();  // Make everything lowercase and remove spaces
    url = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');  // Remove http:// and www.
    url = url.split('/')[0];  // Get rid of everything after the main domain
    return url;
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
  function addWebsite(website) {
    if (!website) return;  // Don't do anything if the input is empty
    
    website = normalizeUrl(website);  // Clean up the URL
    if (!website) return;  // If it's still empty after cleaning, don't continue

    chrome.storage.sync.get(['blockedWebsites'], (data) => {
      const blockedWebsites = data.blockedWebsites || [];
      
      // Only add it if we're not already blocking it
      if (!isWebsiteBlocked(website, blockedWebsites)) {
        blockedWebsites.push(website);
        console.log('Adding this to your blocklist:', website);
        chrome.storage.sync.set({ blockedWebsites }, () => {
          addWebsiteToList(website);  // Show it in the list
          websiteInput.value = '';  // Clear the input box
          updateSuggestionStates();  // Update the suggestions
        });
      } else {
        websiteInput.value = '';  // Clear the input if it's already blocked
      }
    });
  }

  // When you click the + button to add a site
  addWebsiteButton.addEventListener('click', () => {
    addWebsite(websiteInput.value.trim());
  });

  // When you press Enter in the input box
  websiteInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addWebsite(websiteInput.value.trim());
    }
  });

  // Add a website to the visual list on screen
  function addWebsiteToList(website) {
    const li = document.createElement('li');
    // Create the list item with the site name and a remove button
    li.innerHTML = `
      <span>${website}</span>
      <div class="site-controls">
        <button class="schedule-site-btn" title="Schedule blocking for this site">Schedule</button>
        <button title="Remove from block list">Remove</button>
      </div>
    `;
    
    // Setup remove button
    const removeButton = li.querySelector('button[title="Remove from block list"]');
    removeButton.addEventListener('click', () => {
      chrome.storage.sync.get(['blockedWebsites'], (data) => {
        // Filter out this website from the blocked list
        const blockedWebsites = data.blockedWebsites.filter(w => normalizeUrl(w) !== normalizeUrl(website));
        console.log('Taking this off your blocklist:', website);
        chrome.storage.sync.set({ blockedWebsites }, () => {
          li.remove();  // Remove it from the screen
          updateSuggestionStates();  // Update the suggestions
          updateCategoryStates();  // Update category buttons
        });
      });
    });
    
    // Setup schedule button
    const scheduleButton = li.querySelector('.schedule-site-btn');
    scheduleButton.addEventListener('click', () => {
      showSiteScheduleModal(website);
    });

    blockedWebsitesList.appendChild(li);  // Add the new item to the list
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
    // Create a new suggestion bubble
    const suggestion = document.createElement('div');
    suggestion.className = 'suggestion';
    suggestion.textContent = hostname;
    
    // When you click a suggestion, block that site
    suggestion.addEventListener('click', () => {
      if (!suggestion.classList.contains('already-blocked')) {
        addWebsite(hostname);
      }
    });

    historySuggestions.appendChild(suggestion);
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

  // Handle the on/off switch at the top
  toggleButton.addEventListener('click', () => {
    chrome.storage.sync.get(['enabled'], (data) => {
      const newState = !data.enabled;  // Flip the switch
      console.log('Turning Focus Mode', newState ? 'on' : 'off');
      chrome.storage.sync.set({ enabled: newState }, () => {
        // Just toggle the enabled class, no text content change
        toggleButton.classList.toggle('enabled', newState);
      });
    });
  });

  // Handle theme toggle
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    // Show what clicking will do next
    themeToggle.textContent = newTheme === 'dark' ? 'Light' : 'Dark';
    themeToggle.title = newTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    
    chrome.storage.sync.set({ theme: newTheme });
  });

  // Handle schedule toggle
  scheduleToggle.addEventListener('click', () => {
    const isEnabled = scheduleToggle.classList.contains('enabled');
    scheduleToggle.classList.toggle('enabled');
    
    if (!isEnabled) {
      scheduleOptions.classList.add('active');
      saveScheduleSettings(true);
      
      // Show a message that scheduling will override manual toggle
      const scheduleMessage = document.createElement('div');
      scheduleMessage.className = 'schedule-message';
      scheduleMessage.textContent = 'Scheduling will automatically enable Focus Mode during set hours';
      
      // Remove any existing message first
      const existingMessage = document.querySelector('.schedule-message');
      if (existingMessage) {
        existingMessage.remove();
      }
      
      // Add the message after the schedule options
      scheduleOptions.appendChild(scheduleMessage);
      
      // Update time display to reflect new schedule state
      updateTimeDisplay();
    } else {
      scheduleOptions.classList.remove('active');
      saveScheduleSettings(false);
      
      // Remove the message if it exists
      const scheduleMessage = document.querySelector('.schedule-message');
      if (scheduleMessage) {
        scheduleMessage.remove();
      }
      
      // Update time display to reflect new schedule state
      updateTimeDisplay();
    }
  });
  
  // Save schedule settings when they change
  function saveScheduleSettings(enabled = true) {
    const days = Array.from(dayCheckboxes)
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);
      
    const scheduleData = {
      enabled: enabled,
      startTime: startTimeInput.value,
      endTime: endTimeInput.value,
      days: days
    };
    
    chrome.storage.sync.set({ schedule: scheduleData });
  }
  
  // Save schedule settings when inputs change
  startTimeInput.addEventListener('change', () => {
    saveScheduleSettings();
    updateTimeDisplay();
  });
  
  endTimeInput.addEventListener('change', () => {
    saveScheduleSettings();
    updateTimeDisplay();
  });
  
  dayCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      saveScheduleSettings();
      updateTimeDisplay();
    });
  });

  // Function to show site-specific schedule modal
  function showSiteScheduleModal(website) {
    alert(`Schedule feature for ${website} will be implemented soon!`);
    // This would normally open a modal with site-specific scheduling options
    // For now we're keeping the interface simple with just global scheduling
  }

  // Function to update current time display
  function updateTimeDisplay() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTimeString = `${hours}:${minutes}`;
    
    // Update the time display
    currentTimeElement.textContent = currentTimeString;
    
    // Check schedule status
    chrome.storage.sync.get(['schedule', 'enabled'], (data) => {
      if (!data.schedule || !data.schedule.enabled) {
        scheduleStatusElement.textContent = 'Schedule inactive';
        scheduleStatusElement.classList.remove('active');
        timeProgressElement.style.width = '0%';
        return;
      }
      
      const isWithinSchedule = isTimeWithinSchedule(now, data.schedule);
      if (isWithinSchedule) {
        scheduleStatusElement.textContent = 'Focus Mode active';
        scheduleStatusElement.classList.add('active');
        
        // Calculate progress through scheduled time
        const progress = calculateScheduleProgress(now, data.schedule);
        timeProgressElement.style.width = `${progress}%`;
      } else {
        const nextScheduleTime = getNextScheduleTime(now, data.schedule);
        if (nextScheduleTime) {
          const timeUntil = formatTimeUntil(nextScheduleTime);
          scheduleStatusElement.textContent = `Starting in ${timeUntil}`;
          scheduleStatusElement.classList.remove('active');
          timeProgressElement.style.width = '0%';
        } else {
          scheduleStatusElement.textContent = 'No upcoming schedule';
          scheduleStatusElement.classList.remove('active');
          timeProgressElement.style.width = '0%';
        }
      }
    });
  }
  
  // Function to check if current time is within scheduled hours
  function isTimeWithinSchedule(now, schedule) {
    if (!schedule || !schedule.enabled) return false;
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = dayNames[now.getDay()];
    
    // Check if today is in the scheduled days
    if (!schedule.days.includes(currentDay)) {
      return false;
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
  
  // Calculate progress percentage through scheduled time
  function calculateScheduleProgress(now, schedule) {
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
    
    const startTime = new Date(now);
    startTime.setHours(startHour, startMinute, 0, 0);
    
    const endTime = new Date(now);
    endTime.setHours(endHour, endMinute, 0, 0);
    
    const totalDuration = endTime - startTime;
    const elapsedTime = now - startTime;
    
    return Math.min(100, Math.max(0, (elapsedTime / totalDuration) * 100));
  }
  
  // Get the next schedule time
  function getNextScheduleTime(now, schedule) {
    if (!schedule || !schedule.enabled || schedule.days.length === 0) return null;
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = dayNames[now.getDay()];
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    
    // Check if today's schedule is upcoming
    if (schedule.days.includes(currentDay)) {
      const startTime = new Date(now);
      startTime.setHours(startHour, startMinute, 0, 0);
      
      if (startTime > now) {
        return startTime;
      }
    }
    
    // Find the next scheduled day
    let daysToCheck = 7; // Limit to one week
    let nextDate = new Date(now);
    
    while (daysToCheck > 0) {
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDay = dayNames[nextDate.getDay()];
      
      if (schedule.days.includes(nextDay)) {
        const nextTime = new Date(nextDate);
        nextTime.setHours(startHour, startMinute, 0, 0);
        return nextTime;
      }
      
      daysToCheck--;
    }
    
    return null;
  }
  
  // Format time until next schedule
  function formatTimeUntil(futureTime) {
    const now = new Date();
    const diff = futureTime - now;
    
    if (diff < 0) return 'Now';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
  
  // Initialize time display and update every minute
  updateTimeDisplay();
  setInterval(updateTimeDisplay, 30000); // Update every 30 seconds
}); 