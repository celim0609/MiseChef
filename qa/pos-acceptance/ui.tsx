import React,{useState} from 'react';
import{createRoot}from'react-dom/client';
import{signInWithEmailAndPassword,onAuthStateChanged,signOut}from'firebase/auth';
import{auth,authPersistenceReady}from'/tmp/current/src/firebase';
import StorePosPage from'/tmp/current/src/modules/store/StorePosPage';
import PublicStorePage from'/tmp/current/src/modules/store/PublicStorePage';
import'/tmp/current/src/index.css';
await authPersistenceReady;
function Harness(){const[user,setUser]=useState(auth?.currentUser);const[error,setError]=useState('');React.useEffect(()=>onAuthStateChanged(auth!,setUser),[]);return <><header><strong>OFFLINE DEMO ONLY — exact candidate acceptance</strong><select aria-label="QA identity" value={user?.email?.split('@')[0]||''} onChange={async e=>{try{if(e.target.value)await signInWithEmailAndPassword(auth!,e.target.value+'@example.invalid','SyntheticOnly123!');else await signOut(auth!);}catch(x){setError(String(x));}}}><option value="">Signed out</option>{['qa-owner','qa-manager','qa-staff','qa-customer'].map(x=><option key={x}>{x}</option>)}</select><span data-testid="qa-user">{user?.uid||'signed-out'}</span><p>{error}</p></header>{location.pathname.includes('/public')?<PublicStorePage slug="qa-store" currentUser={user}/>:user?<StorePosPage key={user.uid} storeId="qa-store" workspaceId="qa-store" workspaceName="QA TEST Store" onBack={()=>{}}/>:<p>Choose synthetic identity</p>}</>}
createRoot(document.getElementById('root')!).render(<Harness/>);
