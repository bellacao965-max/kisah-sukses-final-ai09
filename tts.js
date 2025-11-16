// Simple TTS using Web Speech API (if available)
window.playTTS = function(text){
  try{
    if('speechSynthesis' in window){
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }else console.warn('TTS not supported');
  }catch(e){console.error(e);}
};
