/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Camera, Download, RotateCcw, Upload } from 'lucide-react';
import type { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ChefProfile, DEFAULT_CHEF_PROFILE, Recipe, RecipeCategory } from '../types';
import { isLocalImageDataUrl, uploadUserProfilePhoto } from '../services/storage';
import { getChefProfileStorageKey } from '../utils/authenticatedUser';

const APPEARANCE_STORAGE_KEY = 'ce_lims_kitchen_appearance_v1';
const APP_VERSION = '0.0.0';

type AppearanceMode = 'light' | 'dark' | 'system';

interface SettingsTabProps {
  mode?: 'profile' | 'settings';
  recipes: Recipe[];
  categories: RecipeCategory[];
  onImportAppData: (data: ImportedAppData, mode: 'merge' | 'replace') => void;
  onResetApp: () => void;
  onOpenLogin: () => void;
  currentUser: User | null;
  profile?: ChefProfile;
  customAvatarUrl?: string;
  onCustomAvatarChange?: (avatarUrl: string) => void;
  onProfileChange?: (profile: ChefProfile) => void;
  onSignOut: () => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export interface ImportedAppData {
  recipes: Recipe[];
  categories: RecipeCategory[];
  profile?: Partial<ChefProfile>;
}

const applyAppearanceMode = (mode: AppearanceMode) => {
  document.documentElement.dataset.appearance = mode;
};

const cropProfileImageDataUrl = (
  imageDataUrl: string,
  cropX: number,
  cropY: number,
  zoom: number
) => new Promise<string>((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const outputSize = 512;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Image crop could not be prepared.'));
      return;
    }

    canvas.width = outputSize;
    canvas.height = outputSize;
    const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const sourceX = ((image.naturalWidth - cropSize) * cropX) / 100;
    const sourceY = ((image.naturalHeight - cropSize) * cropY) / 100;

    ctx.drawImage(
      image,
      Math.max(0, sourceX),
      Math.max(0, sourceY),
      cropSize,
      cropSize,
      0,
      0,
      outputSize,
      outputSize
    );

    resolve(canvas.toDataURL('image/jpeg', 0.82));
  };
  image.onerror = () => reject(new Error('Unable to read selected profile photo.'));
  image.src = imageDataUrl;
});

export default function SettingsTab({
  mode = 'settings',
  recipes,
  categories,
  onImportAppData,
  onResetApp,
  onOpenLogin,
  currentUser,
  profile: sharedProfile,
  customAvatarUrl = '',
  onCustomAvatarChange,
  onProfileChange,
  onSignOut,
  onNotify
}: SettingsTabProps) {
  const [profile, setProfile] = useState<ChefProfile>(DEFAULT_CHEF_PROFILE);
  const [savedProfile, setSavedProfile] = useState<ChefProfile>(DEFAULT_CHEF_PROFILE);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>('system');
  const [dataMessage, setDataMessage] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [cropImageDataUrl, setCropImageDataUrl] = useState('');
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [cropZoom, setCropZoom] = useState(1);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const authDisplayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || '';
  const authEmail = currentUser?.email || '';
  const profileAvatarUrl = profile.photo || customAvatarUrl || currentUser?.photoURL || '';
  const isProfileDirty = JSON.stringify(profile) !== JSON.stringify(savedProfile);
  const profileInitials = (profile.name || authDisplayName || 'CL')
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'CL';

  useEffect(() => {
    const cachedProfile = localStorage.getItem(getChefProfileStorageKey(currentUser?.uid));
    const cachedAppearance = localStorage.getItem(APPEARANCE_STORAGE_KEY) as AppearanceMode | null;

    if (cachedProfile) {
      try {
        const nextProfile = {
          ...DEFAULT_CHEF_PROFILE,
          ...JSON.parse(cachedProfile)
        };
        setProfile(nextProfile);
        setSavedProfile(nextProfile);
      } catch (err) {
        setProfile(DEFAULT_CHEF_PROFILE);
        setSavedProfile(DEFAULT_CHEF_PROFILE);
      }
    } else {
      setSavedProfile(DEFAULT_CHEF_PROFILE);
    }

    if (cachedAppearance && ['light', 'dark', 'system'].includes(cachedAppearance)) {
      setAppearanceMode(cachedAppearance);
      applyAppearanceMode(cachedAppearance);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!sharedProfile) return;

    const nextProfile = {
      ...DEFAULT_CHEF_PROFILE,
      ...sharedProfile
    };
    setProfile(nextProfile);
    setSavedProfile(nextProfile);
  }, [sharedProfile]);

  const updateProfile = (field: keyof ChefProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setProfileMessage('');
  };

  const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      if (event.target?.result) {
        setCropImageDataUrl(event.target.result as string);
        setCropX(50);
        setCropY(50);
        setCropZoom(1);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleApplyCroppedPhoto = async () => {
    if (!cropImageDataUrl) return;

    try {
      setIsApplyingCrop(true);
      const croppedPhoto = await cropProfileImageDataUrl(cropImageDataUrl, cropX, cropY, cropZoom);
      updateProfile('photo', croppedPhoto);
      setCropImageDataUrl('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to crop profile photo.';
      setProfileMessage(message);
      onNotify?.(message, 'error');
    } finally {
      setIsApplyingCrop(false);
    }
  };

  const validateProfile = () => {
    if (!profile.name.trim()) return 'Name is required.';
    if (!profile.jobTitle.trim()) return 'Job title is required.';
    if (!profile.yearsExperience.trim()) return 'Years of experience is required.';
    if (!profile.bio.trim()) return 'Bio is required.';
    return '';
  };

  const handleSaveProfile = async () => {
    const validationError = validateProfile();
    if (validationError) {
      setProfileMessage(validationError);
      onNotify?.(validationError, 'error');
      return;
    }

    try {
      setIsSavingProfile(true);
      let savedPhoto = profile.photo;

      if (currentUser && db && isLocalImageDataUrl(profile.photo)) {
        savedPhoto = await uploadUserProfilePhoto({
          userId: currentUser.uid,
          imageDataUrl: profile.photo
        });
      }

      const nextProfile: ChefProfile = {
        photo: savedPhoto,
        name: profile.name.trim(),
        jobTitle: profile.jobTitle.trim(),
        yearsExperience: profile.yearsExperience.trim(),
        bio: profile.bio.trim(),
        quote: profile.quote.trim()
      };

      localStorage.setItem(getChefProfileStorageKey(currentUser?.uid), JSON.stringify(nextProfile));

      if (currentUser && db) {
        await setDoc(doc(db, 'users', currentUser.uid), {
          profile: nextProfile,
          displayName: nextProfile.name,
          photoURL: nextProfile.photo || currentUser.photoURL || '',
          email: currentUser.email || '',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      onCustomAvatarChange?.(nextProfile.photo || '');
      onProfileChange?.(nextProfile);
      setProfileMessage('Profile updated successfully.');
      onNotify?.('Profile updated successfully.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Profile update failed.';
      setProfileMessage(message);
      onNotify?.(message, 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAppearanceChange = (mode: AppearanceMode) => {
    setAppearanceMode(mode);
    localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
    applyAppearanceMode(mode);
  };

  const handleExportRecipes = () => {
    const payload = {
      app: "MiseChef",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        recipes,
        categories,
        profile
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `misechef-recipes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setDataMessage(`Exported ${recipes.length} recipes, ${categories.length} categories, and profile.`);
  };

  const parseImportedAppData = (parsed: any): ImportedAppData => {
    const data = parsed?.data || parsed;
    const importedRecipes = Array.isArray(data) ? data : data?.recipes;
    const importedCategories = data?.categories;
    const importedProfile = data?.profile;

    if (!Array.isArray(importedRecipes)) {
      throw new Error('Import file must contain a recipes array.');
    }

    return {
      recipes: importedRecipes as Recipe[],
      categories: Array.isArray(importedCategories) ? importedCategories as RecipeCategory[] : [],
      profile: importedProfile && typeof importedProfile === 'object' ? importedProfile as Partial<ChefProfile> : undefined
    };
  };

  const handleImportRecipesFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const parsed = JSON.parse(String(event.target?.result || ''));
        const importedData = parseImportedAppData(parsed);

        if (!window.confirm("Import this MiseChef data file?")) {
          return;
        }

        const importMode = window.confirm(
          'Replace existing recipes, categories, and profile?\\n\\nOK = Replace existing data\\nCancel = Merge with existing data'
        )
          ? 'replace'
          : 'merge';

        if (importedData.profile) {
          const nextProfile = {
            ...DEFAULT_CHEF_PROFILE,
            ...(importMode === 'merge' ? profile : {}),
            ...importedData.profile
          };
          setProfile(nextProfile);
          setSavedProfile(nextProfile);
          localStorage.setItem(getChefProfileStorageKey(currentUser?.uid), JSON.stringify(nextProfile));
          onCustomAvatarChange?.(nextProfile.photo || '');
          importedData.profile = nextProfile;
        }

        onImportAppData(importedData, importMode);
        setDataMessage(
          `${importMode === 'replace' ? 'Replaced' : 'Merged'} ${importedData.recipes.length} recipes, ${importedData.categories.length} categories, and profile data.`
        );
      } catch (err) {
        setDataMessage(err instanceof Error ? err.message : 'Unable to import app data.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleResetApp = () => {
    if (!window.confirm("Reset MiseChef on this device? This will clear recipes, categories, profile, and settings saved here.")) {
      return;
    }

    onResetApp();
    setProfile(DEFAULT_CHEF_PROFILE);
    setSavedProfile(DEFAULT_CHEF_PROFILE);
    setAppearanceMode('system');
    applyAppearanceMode('system');
    setDataMessage('Local app data has been reset.');
  };

  const sectionTitleClass = 'font-display text-xl font-bold text-primary';
  const sectionClass = 'bg-surface-container-low border border-surface-container-high rounded-2xl p-5 sm:p-6 shadow-sm space-y-5';
  const inputClass = 'w-full bg-white border border-surface-container-high rounded-xl px-4 py-3 text-sm font-sans font-bold text-on-surface focus:ring-1 focus:ring-primary';
  const isProfileMode = mode === 'profile';

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          {isProfileMode ? 'Account' : 'Personal Cookbook'}
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight">
          {isProfileMode ? 'My Profile' : 'Settings'}
        </h2>
      </div>

      {isProfileMode && (
        <>
          <section className={sectionClass}>
            <div>
              <h3 className={sectionTitleClass}>Profile</h3>
              {authEmail ? (
                <p className="font-sans text-xs font-bold text-on-surface-variant mt-1">
                  {authDisplayName ? `${authDisplayName} · ` : ''}{authEmail}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col sm:flex-row gap-5">
              <label className="relative w-28 h-28 rounded-2xl overflow-hidden bg-primary/10 border border-surface-container-high flex items-center justify-center text-primary cursor-pointer hover:border-primary transition-colors shrink-0">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProfilePhotoChange}
                />
                {profileAvatarUrl ? (
                  <img src={profileAvatarUrl} alt={profile.name || authDisplayName || 'User profile'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="font-display text-3xl font-bold">{profileInitials}</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-primary/85 text-white text-[10px] font-sans font-bold py-1 flex items-center justify-center gap-1">
                  <Camera className="w-3 h-3" />
                  Change Photo
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                <div className="space-y-1.5">
                  <label className="font-sans font-bold text-xs text-on-surface-variant px-1">Name</label>
                  <input className={inputClass} value={profile.name} onChange={e => updateProfile('name', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="font-sans font-bold text-xs text-on-surface-variant px-1">Job Title</label>
                  <input className={inputClass} value={profile.jobTitle} onChange={e => updateProfile('jobTitle', e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="font-sans font-bold text-xs text-on-surface-variant px-1">Years of Experience</label>
                  <input className={inputClass} value={profile.yearsExperience} onChange={e => updateProfile('yearsExperience', e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="font-sans font-bold text-xs text-on-surface-variant px-1">Bio</label>
                  <textarea
                    className={`${inputClass} resize-none`}
                    rows={4}
                    value={profile.bio}
                    onChange={e => updateProfile('bio', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="font-sans font-bold text-xs text-on-surface-variant px-1">Personal Quote</label>
                  <input
                    className={inputClass}
                    value={profile.quote}
                    onChange={e => updateProfile('quote', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 border-t border-surface-container pt-4">
              {profileMessage && (
                <p className="font-sans text-xs font-bold text-secondary sm:mr-auto">
                  {profileMessage}
                </p>
              )}
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!isProfileDirty || isSavingProfile}
                className="rounded-full bg-primary disabled:bg-outline-variant disabled:cursor-not-allowed text-on-primary px-5 py-3 text-xs font-sans font-bold active:scale-95 transition-all"
              >
                {isSavingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </section>

          <section className={sectionClass}>
            <h3 className={sectionTitleClass}>Account</h3>
            <p className="font-sans text-xs font-bold text-on-surface-variant">
              {authEmail
                ? `Signed in as ${authDisplayName ? `${authDisplayName} · ` : ''}${authEmail}`
                : 'Sign in to keep your work available across devices.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onOpenLogin}
                className="rounded-full bg-surface-container text-primary px-5 py-3 text-xs font-sans font-bold"
              >
                {currentUser ? 'Manage Login' : 'Login'}
              </button>
              <button
                type="button"
                onClick={onSignOut}
                disabled={!currentUser}
                className="rounded-full bg-surface-container-high text-outline px-5 py-3 text-xs font-sans font-bold disabled:cursor-not-allowed disabled:opacity-70"
              >
                Sign Out
              </button>
            </div>
          </section>
        </>
      )}

      {isProfileMode && cropImageDataUrl && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center px-4">
          <div className="bg-background border border-surface-container-high rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-5">
            <div>
              <h3 className={sectionTitleClass}>Crop Profile Photo</h3>
              <p className="font-sans text-xs font-bold text-on-surface-variant mt-1">
                Adjust the crop before uploading your profile photo.
              </p>
            </div>

            <div className="mx-auto w-64 h-64 max-w-full aspect-square rounded-2xl overflow-hidden bg-surface-container border border-surface-container-high">
              <img
                src={cropImageDataUrl}
                alt="Profile crop preview"
                className="w-full h-full object-cover"
                style={{
                  objectPosition: `${cropX}% ${cropY}%`,
                  transform: `scale(${cropZoom})`,
                  transformOrigin: `${cropX}% ${cropY}%`
                }}
              />
            </div>

            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="font-sans font-bold text-xs text-on-surface-variant">Horizontal Position</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cropX}
                  onChange={e => setCropX(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-sans font-bold text-xs text-on-surface-variant">Vertical Position</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cropY}
                  onChange={e => setCropY(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-sans font-bold text-xs text-on-surface-variant">Zoom</span>
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={cropZoom}
                  onChange={e => setCropZoom(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-surface-container pt-4">
              <button
                type="button"
                onClick={() => setCropImageDataUrl('')}
                className="rounded-full bg-surface-container border border-surface-container-high text-primary px-5 py-3 text-xs font-sans font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyCroppedPhoto}
                disabled={isApplyingCrop}
                className="rounded-full bg-primary disabled:bg-outline-variant disabled:cursor-not-allowed text-on-primary px-5 py-3 text-xs font-sans font-bold"
              >
                {isApplyingCrop ? 'Cropping...' : 'Use Photo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isProfileMode && (
        <>
      <section className={sectionClass}>
        <h3 className={sectionTitleClass}>Appearance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { value: 'light', label: 'Light Mode' },
            { value: 'dark', label: 'Dark Mode' },
            { value: 'system', label: 'System Default' }
          ].map(option => (
            <button
              type="button"
              key={option.value}
              onClick={() => handleAppearanceChange(option.value as AppearanceMode)}
              className={`rounded-2xl px-4 py-3 text-left font-sans font-extrabold text-sm border transition-all ${
                appearanceMode === option.value
                  ? 'bg-primary text-on-primary border-primary shadow-sm'
                  : 'bg-white text-primary border-surface-container-high hover:border-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className={sectionTitleClass}>Data</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleExportRecipes}
            className="flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary px-5 py-3 text-xs font-sans font-bold active:scale-95 transition-all"
          >
            <Download className="w-4 h-4" />
            Export Recipes
          </button>
          <label className="flex items-center justify-center gap-2 rounded-full bg-white border border-surface-container-high text-primary px-5 py-3 text-xs font-sans font-bold cursor-pointer hover:border-primary active:scale-95 transition-all">
            <input type="file" accept="application/json,.json" className="hidden" onChange={handleImportRecipesFile} />
            <Upload className="w-4 h-4" />
            Import Recipes
          </label>
          <button
            type="button"
            onClick={handleResetApp}
            className="flex items-center justify-center gap-2 rounded-full bg-surface-container border border-surface-container-high text-primary px-5 py-3 text-xs font-sans font-bold active:scale-95 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset App
          </button>
        </div>
        {dataMessage && (
          <p className="font-sans text-xs font-bold text-secondary bg-secondary/10 border border-secondary/20 rounded-xl p-3">
            {dataMessage}
          </p>
        )}
      </section>

      <section className={sectionClass}>
        <h3 className={sectionTitleClass}>About</h3>
        <div className="divide-y divide-surface-container-high rounded-2xl overflow-hidden border border-surface-container-high bg-white">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="font-sans font-bold text-sm text-primary">App Version</span>
            <span className="font-sans font-bold text-xs text-on-surface-variant">{APP_VERSION}</span>
          </div>
          <button type="button" className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-container-low transition-colors">
            <span className="font-sans font-bold text-sm text-primary">Privacy Policy</span>
            <span className="font-sans font-bold text-xs text-on-surface-variant">Local-only</span>
          </button>
          <button type="button" className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-container-low transition-colors">
            <span className="font-sans font-bold text-sm text-primary">Terms of Service</span>
            <span className="font-sans font-bold text-xs text-on-surface-variant">Personal use</span>
          </button>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
