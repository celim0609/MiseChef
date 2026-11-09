import { createRoot } from 'react-dom/client';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getDoc, doc } from 'firebase/firestore';
import { auth, db, firebaseApp, functions } from '../src/firebase';
import StoreOrdersPanel from '../src/modules/store/StoreOrdersPanel';
import { getStorePermissions } from '../src/modules/team/permissions';
import '../src/index.css';

const root = createRoot(document.getElementById('root')!);
const email = new URLSearchParams(location.search).get('account');
async function start() {
  if (!auth || !db || !functions || firebaseApp?.options.projectId !== 'demo-misechef-preview'
    || !auth.emulatorConfig || !['owner', 'manager'].includes(email ?? '')) {
    throw new Error('Synthetic emulator session required');
  }
  const { user } = await signInWithEmailAndPassword(auth, `${email}@example.test`, 'LocalSyntheticOnly42!');
  const membership = await getDoc(doc(db, 'workspaceMembers', `store-qa_${user.uid}`));
  const role = membership.data()?.role;
  if (role !== 'Owner' && role !== 'Manager') throw new Error('Synthetic membership missing');
  const verified = await httpsCallable<unknown, { role: string }>(functions, 'verifyQaSession')();
  if (verified.data.role !== role) throw new Error('Synthetic role mismatch');
  const permissions = getStorePermissions(role);
  root.render(<main>
    <p data-testid="qa-role">{role}</p>
    <StoreOrdersPanel storeId="store-qa" workspaceId="store-qa" country="MY" currency="MYR"
      storeName="GG Grab&Go" focusOrderId="" notifications={[]} onNotificationClick={() => {}}
      canProcessOrders={permissions.processOrders} canPreviewWhatsApp={permissions.manageStoreSettings}
      canReviewPayments={false} />
  </main>);
}
start().catch(error => root.render(<p role="alert">{String(error)}</p>));
