import React, { useState } from 'react';

const AiHelpBot = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      content: 'Hello! I\'m your Tech Pack Assistant. How can I help you today?\n\nYou can ask me about:\n- How to upload tech packs\n- Required file formats\n- Status tracking\n- General guidelines',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    // Add user message
    setMessages(prev => [...prev, {
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    }]);

    // Simulate bot response
    setTimeout(() => {
      const botResponses = {
        default: "I'll help you with that! Could you please provide more details?",
        upload: "To upload a tech pack:\n1. Fill in the required fields:\n   - Select Season (e.g., SS 25)\n   - Choose Article Type (e.g., T-Shirts)\n   - Select Gender\n2. Click 'Upload PDFs' to select your files\n3. Review your selection\n4. Click 'Next' to proceed\n5. Choose a brand manager to submit to",
        format: "Tech packs should be in PDF format and include:\n- Product specifications\n- Material details\n- Construction notes\n- Measurements\n- Artwork placement\n\nMake sure your PDFs are clear and properly formatted before uploading.",
        status: "You can track your tech pack status in the Past Uploads section.\n\nStatus types:\n- DRAFT: Initial upload\n- SUBMITTED: Sent to brand manager\n- IN REVIEW: Under evaluation\n- APPROVED: Ready for production",
        fields: "Required fields for upload:\n1. Season (e.g., SS 25, FW 24)\n2. Article Type (T-Shirts, Pants, etc.)\n3. Gender (Men, Women, Unisex, Kids)\n\nAll fields must be filled before proceeding."
      };

      let botResponse = botResponses.default;
      const lowercaseInput = inputMessage.toLowerCase();
      
      if (lowercaseInput.includes('upload') || lowercaseInput.includes('submit') || lowercaseInput.includes('how')) {
        botResponse = botResponses.upload;
      } else if (lowercaseInput.includes('format') || lowercaseInput.includes('requirement') || lowercaseInput.includes('file')) {
        botResponse = botResponses.format;
      } else if (lowercaseInput.includes('status') || lowercaseInput.includes('track')) {
        botResponse = botResponses.status;
      } else if (lowercaseInput.includes('field') || lowercaseInput.includes('required') || lowercaseInput.includes('fill')) {
        botResponse = botResponses.fields;
      }

      setMessages(prev => [...prev, {
        type: 'bot',
        content: botResponse,
        timestamp: new Date()
      }]);
    }, 1000);

    setInputMessage('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-xl flex flex-col relative">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-medium">Tech Pack Assistant</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
 
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60vh]">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <p className="whitespace-pre-line text-sm">{message.content}</p>
                <span className="text-xs opacity-75 mt-1 block">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your question here..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiHelpBot; 