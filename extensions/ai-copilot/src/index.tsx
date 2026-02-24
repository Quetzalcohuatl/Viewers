import React from 'react';
import ChatPanel from './components/ChatPanel';
import id from './id';

/**
 * The extension entry point.
 * OHIF looks for this default export to load your functionality.
 */
export default {
  /**
   * Only required property. Should be a unique value across all extensions.
   * The 'id' is imported from the generated id.js file in this folder.
   */
  id,

  /**
   * getPanelModule: defines the UI panels that will be available to 'Modes'.
   */
  getPanelModule({ servicesManager, commandsManager }) {
    return [
      {
        name: 'ai-copilot-panel',
        iconName: 'list', // Try 'info' or 'list' for a default icon
        iconLabel: 'AI Chat',
        label: 'AI Copilot',
        component: (props) => (
          <ChatPanel 
            {...props} 
            servicesManager={servicesManager} 
            commandsManager={commandsManager} 
          />
        ),
      },
    ];
  },
};