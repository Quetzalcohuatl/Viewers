// import React, { useState } from 'react';

// const ChatPanel = ({ servicesManager }) => {
//   const [prompt, setPrompt] = useState('');
//   const [response, setResponse] = useState('');
//   const [loading, setLoading] = useState(false);
//   const { cornerstoneViewportService } = servicesManager.services;

//   const handleAskAI = async () => {
//     setLoading(true);
//     setResponse("Thinking...");

//     try {
//       // 1. Get the current active viewport
//       const viewportId = cornerstoneViewportService.getActiveViewportId();
//       const viewport = cornerstoneViewportService.getViewport(viewportId);

//       // 2. Get the canvas and convert to Image
//       const canvas = viewport.element.querySelector('canvas');
//       const imageData = canvas.toDataURL('image/jpeg', 0.8);

//       // 3. Send to your Python backend (we'll build this next)
//       const res = await fetch('http://127.0.0.1:8000/ask', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ image: imageData, question: prompt })
//       });

//       const data = await res.json();
//       setResponse(data.answer);
//     } catch (err) {
//       setResponse("Error: Is the Python backend running?");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div style={{ padding: '16px', color: 'white' }}>
//       <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>AI Copilot</h2>
//       <textarea
//         value={prompt}
//         onChange={(e) => setPrompt(e.target.value)}
//         placeholder="Ask about this scan..."
//         style={{ width: '100%', padding: '8px', color: 'black', borderRadius: '4px' }}
//         rows={4}
//       />
//       <button
//         onClick={handleAskAI}
//         disabled={loading}
//         style={{
//           width: '100%', marginTop: '10px', padding: '10px',
//           backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '4px'
//         }}
//       >
//         {loading ? 'Analyzing...' : 'Ask AI'}
//       </button>
//       <div style={{ marginTop: '20px', backgroundColor: '#222', padding: '10px', borderRadius: '4px' }}>
//         <strong>AI Response:</strong>
//         <p style={{ marginTop: '5px' }}>{response}</p>
//       </div>
//     </div>
//   );
// };

// export default ChatPanel;


import React, { useState } from 'react';

const ChatPanel = ({ servicesManager }) => {
  type Message = { id: string; role: 'user' | 'assistant'; content: string };
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Destructure the services we need
  const { 
    cornerstoneViewportService, 
    viewportGridService 
  } = servicesManager.services;

  const handleAskAI = async () => {
    if (!prompt || !prompt.trim()) return;
    console.log("--- AI Copilot: Start handleAskAI (Session Mode) ---");

    const userId = `u-${Date.now()}`;
    const assistantId = `a-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const userMsg: Message = { id: userId, role: 'user', content: prompt };
    const assistantPlaceholder: Message = { id: assistantId, role: 'assistant', content: 'Thinking...' };

    // Append user message and placeholder assistant message to the history
    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setPrompt('');
    setLoading(true);

    try {
      const { 
        cornerstoneViewportService, 
        viewportGridService,
        displaySetService,
        studyMetadataManager // Adding another service as backup
      } = servicesManager.services;

      // 1. Get the Grid State
      const gridState = viewportGridService.getState();
      const viewportId = gridState.activeViewportId;
      
      console.log("Current Grid State:", gridState);

      let studyInstanceUID = null;

      // STRATEGY A: Try to get it from the Active Viewport
      if (viewportId) {
        // Handle Map vs Object (OHIF versions vary)
        const viewports = gridState.viewports;
        const activeViewport = viewports instanceof Map ? viewports.get(viewportId) : viewports[viewportId];
        
        const dsUIDs = activeViewport?.displaySetInstanceUIDs;
        if (dsUIDs && dsUIDs.length > 0) {
          const displaySet = displaySetService.getDisplaySetByUID(dsUIDs[0]);
          studyInstanceUID = displaySet?.StudyInstanceUID;
        }
      }

      // STRATEGY B: Fallback - Get the first study currently loaded in the viewer
      // This is very reliable for prototypes since you usually only open one patient at a time
      if (!studyInstanceUID) {
        console.log("Strategy A failed, trying Strategy B (Metadata Manager)...");
        const allStudies = studyMetadataManager.all(); // Get all studies in memory
        if (allStudies && allStudies.length > 0) {
          studyInstanceUID = allStudies[0].studyInstanceUID;
        }
      }

      if (!studyInstanceUID) {
        throw new Error("Could not find any Study ID. Try opening a study first.");
      }
      
      console.log("Using StudyInstanceUID for Session:", studyInstanceUID);

      // 2. Capture Canvas (The part that worked)
      let element = null;
      if (typeof cornerstoneViewportService.getViewportElement === 'function') {
        element = cornerstoneViewportService.getViewportElement(viewportId);
      } else {
        const vp = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        element = vp?.element;
      }

      const canvas = element?.querySelector('canvas');
      if (!canvas) throw new Error("Canvas not found. Click the image to select it.");
      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      // 3. Send to Python
      const res = await fetch('http://localhost:8000/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            image: imageData, 
            question: prompt,
            studyInstanceUID: studyInstanceUID 
        })
      });

      const data = await res.json();
      const answer = data.answer || JSON.stringify(data);

      // Replace the assistant placeholder with the real answer
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: answer } : m)));

    } catch (err) {
      console.error("Session Identification Error:", err);
      const errMsg = `Error: ${err?.message || String(err)}`;
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: errMsg } : m)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '16px', color: 'white' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>AI Copilot</h2>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ask about this scan..."
        style={{ width: '100%', padding: '8px', color: 'black', borderRadius: '4px' }}
        rows={4}
      />
      <button
        onClick={handleAskAI}
        disabled={loading}
        style={{
          width: '100%', marginTop: '10px', padding: '10px',
          backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {loading ? 'Analyzing...' : 'Ask AI'}
      </button>
      <div style={{ marginTop: '20px', backgroundColor: '#222', padding: '10px', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto' }}>
        <strong>Conversation:</strong>
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {messages.map((m) => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '12px', color: '#999' }}>{m.role === 'user' ? 'You' : 'AI'}</div>
              <div style={{
                marginTop: '2px',
                padding: '8px',
                backgroundColor: m.role === 'user' ? '#0b4b86' : '#333',
                color: 'white',
                borderRadius: '6px',
                whiteSpace: 'pre-wrap'
              }}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;