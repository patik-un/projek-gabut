import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import './BoothStatusToast.css';

export default function BoothStatusToast({message,fullscreen=false}) {
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    setVisible(Boolean(message));
    if (!message) return undefined;
    let active=true;
    const timer=window.setTimeout(()=>{if(active)setVisible(false);},4000);
    return ()=>{active=false;window.clearTimeout(timer);};
  },[message]);
  if (!message || !visible) return null;
  return createPortal(<aside className={`booth-status-toast${fullscreen?' is-fullscreen':''}`} role="status" aria-live="polite" aria-atomic="true">
    <span>{message}</span>
    <button type="button" aria-label="Tutup pemberitahuan" onClick={()=>setVisible(false)}>×</button>
  </aside>,document.body);
}
