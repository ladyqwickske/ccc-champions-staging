/**
 * cCc Legends Site Configuration
 */

const SITE_CONFIG = {
  // Clan Identity
  clanName: 'cCc Legends',
  clanAbbr: 'leg',

  // Branding (customize later)
  primaryColor: '#26c2baff',
  secondaryColor: '#232526',
  favicon: 'logo.png',

  // Authentication
  // TODO: Replace with your own Google OAuth Client ID (create a new one, or add this site's URL as an authorized origin on the existing client)
  googleClientId: '47674606892-0m90hd0cd01kijo69ssuqtn1j3igp32i.apps.googleusercontent.com',

  // Members hidden from progress stats when not logged in
  maskedMembers: [
    'Legendary CQ'
  ],

  // Navigation Pages
  pages: [
    { name: 'Dashboard', file: 'dashboard.html', icon: '📊' },
    { name: 'Events', file: 'events.html', icon: '⚔️' },
    { name: 'Members', file: 'members.html', icon: '👥' },
    { name: 'Warnings', file: 'warnings.html', icon: 'warning.png' },
    { name: 'Calendar', file: 'calendar.html', icon: '📅' }
  ]
};
