import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { BadgeCheck, Link2, UserRoundCheck } from 'lucide-react';
import type { ApprovedProduct } from '../../../types';
import { adminUserService } from '../services/adminUserService';
import { approvedProductService } from '../../products/services/approvedProductService';
import {
  creatorAffiliateAdminService,
  normalizeCreatorCode,
  type CreatorAffiliateProfileWithLinks
} from '../../products/services/creatorAffiliateAdminService';
import type { AdminUserRecord } from '../types';

export function CreatorAffiliatePilotPanel({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [products, setProducts] = useState<ApprovedProduct[]>([]);
  const [profiles, setProfiles] = useState<CreatorAffiliateProfileWithLinks[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profileUserId, setProfileUserId] = useState('');
  const [profileCode, setProfileCode] = useState('');
  const [linkCreatorCode, setLinkCreatorCode] = useState('');
  const [linkProductId, setLinkProductId] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [subIdConfirmed, setSubIdConfirmed] = useState(false);
  const [clickReportConfirmed, setClickReportConfirmed] = useState(false);
  const [recipeId, setRecipeId] = useState('');
  const [recipeCreatorCode, setRecipeCreatorCode] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [loadedUsers, loadedProducts, loadedProfiles] = await Promise.all([
        adminUserService.listUsers(),
        approvedProductService.listAdminProducts(),
        creatorAffiliateAdminService.listProfiles()
      ]);
      setUsers(loadedUsers);
      setProducts(loadedProducts);
      setProfiles(loadedProfiles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load creator affiliate settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProfile = profiles.find(profile => profile.creatorCode === linkCreatorCode);
  const selectedProduct = products.find(product => product.id === linkProductId);
  const selectedLink = selectedProfile?.links.find(link => link.productId === linkProductId);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);

  useEffect(() => {
    setLinkUrl(selectedLink?.affiliateUrl || '');
    setSubIdConfirmed(false);
    setClickReportConfirmed(false);
  }, [selectedLink]);

  const runAction = async (action: () => Promise<void>, message: string) => {
    if (isSaving) return false;
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(message);
      await load();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to save creator affiliate settings.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const createProfile = async (event: FormEvent) => {
    event.preventDefault();
    const code = normalizeCreatorCode(profileCode);
    const saved = await runAction(
      () => creatorAffiliateAdminService.createProfile({
        creatorCode: code,
        userId: profileUserId,
        active: true,
        adminUserId: currentUser.uid
      }),
      `${code} was assigned.`
    );
    if (saved) {
      setProfileCode('');
      setProfileUserId('');
    }
  };

  const saveLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProduct) {
      setError('Select an approved product.');
      return;
    }
    await runAction(
      () => creatorAffiliateAdminService.saveUnverifiedProductLink({
        creatorCode: linkCreatorCode,
        product: selectedProduct,
        affiliateUrl: linkUrl,
        adminUserId: currentUser.uid
      }),
      `${selectedProduct.name} was saved inactive pending Shopee verification.`
    );
  };

  const verifyLink = async () => {
    if (!selectedLink || !selectedProduct) return;
    await runAction(
      () => creatorAffiliateAdminService.verifyAndActivateProductLink({
        creatorCode: linkCreatorCode,
        productId: selectedProduct.id,
        adminUserId: currentUser.uid,
        subIdConfirmed,
        clickReportConfirmed
      }),
      `${selectedProduct.name} was verified and activated for ${linkCreatorCode}.`
    );
  };

  const assignRecipe = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await runAction(
      () => creatorAffiliateAdminService.assignRecipeCreator({
        recipeId,
        creatorCode: recipeCreatorCode
      }),
      `${recipeId.trim()} was explicitly assigned to ${recipeCreatorCode}.`
    );
    if (saved) setRecipeId('');
  };

  return (
    <section className="mt-6 rounded-2xl border border-surface-container-high bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-primary/10 p-3 text-primary"><UserRoundCheck className="h-5 w-5" /></span>
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Pilot</p>
          <h3 className="mt-1 font-display text-2xl font-bold text-primary">Creator Affiliate Attribution</h3>
          <p className="mt-2 max-w-3xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
            Assign one non-personal creator code and verify each Shopee link before it becomes available to the chef.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-2xl bg-error/10 px-4 py-3 font-sans text-sm font-bold text-error">{error}</p>}
      {success && <p role="status" className="mt-5 rounded-2xl bg-primary/10 px-4 py-3 font-sans text-sm font-bold text-primary">{success}</p>}
      {isLoading ? <p className="mt-6 font-sans text-sm font-bold text-on-surface-variant">Loading creator pilot…</p> : (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <form onSubmit={createProfile} className="space-y-4 rounded-2xl border border-surface-container-high bg-surface-container-low p-5">
            <h4 className="font-display text-xl font-bold text-primary">Assign Creator Code</h4>
            <label className="block">
              <span className="font-sans text-xs font-extrabold text-primary">Chef Account</span>
              <select value={profileUserId} onChange={event => setProfileUserId(event.target.value)} disabled={isSaving} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary">
                <option value="">Select chef</option>
                {users.map(user => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="font-sans text-xs font-extrabold text-primary">Creator Code</span>
              <input value={profileCode} onChange={event => setProfileCode(event.target.value.toUpperCase())} placeholder="MC002" disabled={isSaving} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold uppercase text-primary" />
            </label>
            <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary disabled:opacity-60">Assign Code</button>
          </form>

          <form onSubmit={assignRecipe} className="space-y-4 rounded-2xl border border-surface-container-high bg-surface-container-low p-5">
            <h4 className="font-display text-xl font-bold text-primary">Explicit Recipe Assignment</h4>
            <p className="font-sans text-xs font-bold leading-relaxed text-on-surface-variant">Super-admin only. This never changes the recipe’s selected products.</p>
            <label className="block">
              <span className="font-sans text-xs font-extrabold text-primary">Recipe ID</span>
              <input value={recipeId} onChange={event => setRecipeId(event.target.value)} disabled={isSaving} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary" />
            </label>
            <label className="block">
              <span className="font-sans text-xs font-extrabold text-primary">Creator</span>
              <select value={recipeCreatorCode} onChange={event => setRecipeCreatorCode(event.target.value)} disabled={isSaving} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary">
                <option value="">Select creator</option>
                {profiles.filter(profile => profile.active).map(profile => <option key={profile.creatorCode} value={profile.creatorCode}>{profile.creatorCode} — {userById.get(profile.userId)?.name || 'Chef'}</option>)}
              </select>
            </label>
            <button type="submit" disabled={isSaving} className="rounded-full border border-primary px-5 py-3 font-sans text-sm font-extrabold text-primary disabled:opacity-60">Assign Attribution</button>
          </form>

          <form onSubmit={saveLink} className="space-y-4 rounded-2xl border border-surface-container-high bg-surface-container-low p-5 xl:col-span-2">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-secondary" />
              <h4 className="font-display text-xl font-bold text-primary">Creator Product Link</h4>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="font-sans text-xs font-extrabold text-primary">Creator</span>
                <select value={linkCreatorCode} onChange={event => setLinkCreatorCode(event.target.value)} disabled={isSaving} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary">
                  <option value="">Select creator</option>
                  {profiles.map(profile => <option key={profile.creatorCode} value={profile.creatorCode}>{profile.creatorCode} — {userById.get(profile.userId)?.name || 'Chef'}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="font-sans text-xs font-extrabold text-primary">Approved Product</span>
                <select value={linkProductId} onChange={event => setLinkProductId(event.target.value)} disabled={isSaving} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary">
                  <option value="">Select product</option>
                  {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="font-sans text-xs font-extrabold text-primary">Creator-Specific Shopee Link</span>
                <input type="url" value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://s.shopee.sg/..." disabled={isSaving} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary" />
              </label>
            </div>
            <button type="submit" disabled={isSaving} className="rounded-full border border-primary px-5 py-3 font-sans text-sm font-extrabold text-primary disabled:opacity-60">
              Save Inactive Link
            </button>

            {selectedLink && (
              <div className="rounded-2xl border border-surface-container-high bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-sans text-sm font-extrabold text-primary">{selectedProduct?.name || productById.get(selectedLink.productId)?.name}</p>
                    <p className="mt-1 font-sans text-xs font-bold text-outline">{selectedLink.active ? 'Verified and active' : 'Inactive — verification required'}</p>
                  </div>
                  {selectedLink.active && (
                    <button type="button" onClick={() => void runAction(
                      () => creatorAffiliateAdminService.deactivateProductLink(linkCreatorCode, selectedLink.productId, currentUser.uid),
                      `${selectedProduct?.name || 'Product link'} was deactivated.`
                    )} disabled={isSaving} className="rounded-full bg-surface-container-low px-4 py-2 font-sans text-xs font-bold text-primary">Deactivate</button>
                  )}
                </div>
                {!selectedLink.active && (
                  <div className="mt-4 space-y-3 border-t border-surface-container-high pt-4">
                    <label className="flex items-start gap-3 font-sans text-sm font-bold text-primary">
                      <input type="checkbox" checked={subIdConfirmed} onChange={event => setSubIdConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" />
                      I confirmed this link was generated with Shopee creator Sub_id {linkCreatorCode}.
                    </label>
                    <label className="flex items-start gap-3 font-sans text-sm font-bold text-primary">
                      <input type="checkbox" checked={clickReportConfirmed} onChange={event => setClickReportConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" />
                      I confirmed a controlled click appears under {linkCreatorCode} in Shopee’s Click Report.
                    </label>
                    <button type="button" onClick={() => void verifyLink()} disabled={isSaving || !subIdConfirmed || !clickReportConfirmed} className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary disabled:opacity-50"><BadgeCheck className="h-4 w-4" /> Verify and Activate</button>
                  </div>
                )}
              </div>
            )}
          </form>

          <div className="space-y-3 xl:col-span-2">
            {profiles.map(profile => (
              <article key={profile.creatorCode} className="flex flex-col gap-3 rounded-2xl border border-surface-container-high p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-sans text-sm font-extrabold text-primary">{profile.creatorCode} — {userById.get(profile.userId)?.name || 'Chef'}</p>
                  <p className="mt-1 font-sans text-xs font-bold text-outline">{profile.links.filter(link => link.active).length} active product link(s) · {profile.active ? 'Creator active' : 'Creator inactive'}</p>
                </div>
                <button type="button" onClick={() => void runAction(
                  () => creatorAffiliateAdminService.setProfileActive(profile.creatorCode, !profile.active, currentUser.uid),
                  `${profile.creatorCode} is now ${profile.active ? 'inactive' : 'active'}.`
                )} disabled={isSaving} className="rounded-full bg-surface-container-low px-4 py-2 font-sans text-xs font-bold text-primary">{profile.active ? 'Deactivate Creator' : 'Activate Creator'}</button>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
