// Chat history helper - saves last 50 messages to localStorage
(function(){
  const KEY = 'anjasmara_chat_history_v1';
  window.saveChatMessage = function(role, text){
    try{
      const raw = localStorage.getItem(KEY) || '[]';
      const arr = JSON.parse(raw);
      arr.push({role, text, t: Date.now()});
      if(arr.length>50) arr.splice(0, arr.length-50);
      localStorage.setItem(KEY, JSON.stringify(arr));
    }catch(e){console.warn('saveChatMessage error',e);}
  };
  window.loadChatHistory = function(){
    try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch(e){return [];}
  };
})();
