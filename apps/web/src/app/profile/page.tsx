'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth0 } from '@auth0/auth0-react';
import {
  getCurrentUser,
  removeAvatar,
  toAbsoluteAvatarUrl,
  updateCurrentUser,
  uploadAvatar,
} from '@/editor/collaboration/sharedProjectApi';
import { useSubscription } from '@/editor/collaboration/useSubscription';

const AVATAR_MAX_DIMENSION = 256;

export default function ProfilePage() {
  const { user } = useAuth0();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<Blob | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [removeAvatarOnSave, setRemoveAvatarOnSave] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<'profile' | 'subscription'>('profile');
  const subscription = useSubscription();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const savedDisplayNameRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((profile) => {
        if (!cancelled) {
          const stored = profile.displayName ?? '';
          setDisplayName(stored || user?.name || user?.nickname || '');
          savedDisplayNameRef.current = stored;
          setAvatarUrl(profile.avatarUrl);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load profile.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pendingAvatarPreview) {
        URL.revokeObjectURL(pendingAvatarPreview);
      }
    };
  }, [pendingAvatarPreview]);

  async function pickAvatar(file: File) {
    setError(null);
    try {
      const blob = await resizeImageToBlob(file, AVATAR_MAX_DIMENSION);
      if (pendingAvatarPreview) {
        URL.revokeObjectURL(pendingAvatarPreview);
      }
      setPendingAvatar(blob);
      setPendingAvatarPreview(URL.createObjectURL(blob));
      setRemoveAvatarOnSave(false);
    } catch {
      setError('Unable to read that image.');
    }
  }

  function clearAvatar() {
    if (pendingAvatarPreview) {
      URL.revokeObjectURL(pendingAvatarPreview);
    }
    setPendingAvatar(null);
    setPendingAvatarPreview(null);
    setRemoveAvatarOnSave(true);
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const trimmedName = displayName.trim();
      let latest = null;

      if (trimmedName !== savedDisplayNameRef.current) {
        latest = await updateCurrentUser({ displayName: trimmedName });
      }

      if (pendingAvatar) {
        latest = await uploadAvatar(pendingAvatar);
      } else if (removeAvatarOnSave) {
        latest = await removeAvatar();
      }

      if (latest) {
        savedDisplayNameRef.current = latest.displayName ?? '';
        setDisplayName(latest.displayName ?? '');
        setAvatarUrl(latest.avatarUrl);
      }

      if (pendingAvatarPreview) {
        URL.revokeObjectURL(pendingAvatarPreview);
      }
      setPendingAvatar(null);
      setPendingAvatarPreview(null);
      setRemoveAvatarOnSave(false);
      setSavedAt(new Date().toLocaleString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setIsSaving(false);
    }
  }

  const savedAvatar = removeAvatarOnSave ? null : toAbsoluteAvatarUrl(avatarUrl);
  const avatarPreview =
    pendingAvatarPreview ?? savedAvatar ?? user?.picture ?? null;
  const hasAvatar = Boolean(pendingAvatarPreview ?? savedAvatar);

  return (
    <main className='min-h-screen bg-[#0f1213] py-12 px-6 text-[#e7e9ec]'>
      <div className='mx-auto w-[min(980px,100%)]'>
        <div className='mb-6'>
          <Link
            href='/'
            className='inline-flex items-center gap-2 rounded-md border border-[#273230] bg-[#0f1413] px-3 py-2 text-sm font-semibold text-[#9aa1ab] hover:border-[#4aa391] hover:text-[#dff3ea]'
          >
            ← Home
          </Link>
        </div>
        <header className='mb-8 text-center'>
          <h1 className='bg-linear-to-r from-[#4aa391] via-[#6fd6c1] to-[#d9f5ee] bg-clip-text text-transparent text-4xl font-extrabold'>
            Settings
          </h1>
          <p className='mt-2 text-sm text-[#9aa1ab]'>
            Manage your profile and subscription.
          </p>
        </header>

        <div className='grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]'>
          <nav className='rounded-xl border border-[#273230] bg-[#0f1413] p-4'>
            <ul className='flex flex-col gap-2'>
              <li>
                <button
                  className={`w-full rounded-md px-3 py-2 text-left font-semibold ${section === 'profile' ? 'bg-[#152a26] text-[#dff3ea]' : 'text-[#9aa1ab] hover:bg-[#0f201b]'}`}
                  onClick={() => setSection('profile')}
                >
                  Profile
                </button>
              </li>
              <li>
                <button
                  className={`w-full rounded-md px-3 py-2 text-left font-semibold ${section === 'subscription' ? 'bg-[#152a26] text-[#dff3ea]' : 'text-[#9aa1ab] hover:bg-[#0f201b]'}`}
                  onClick={() => setSection('subscription')}
                >
                  Subscription
                </button>
              </li>
            </ul>
          </nav>

          <div>
            {section === 'profile' ? (
              <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6'>
                <h2 className='mb-4 text-lg font-bold text-[#f2f4f7]'>
                  Profile
                </h2>

                <div className='mb-4 flex items-center gap-4'>
                  <div className='h-20 w-20 overflow-hidden rounded-full border border-[#30353d] bg-[#0b0d0d]'>
                    {avatarPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarPreview}
                        alt='avatar'
                        className='h-full w-full object-cover'
                      />
                    ) : (
                      <div className='grid h-full w-full place-items-center text-sm text-[#9aa1ab]'>
                        No avatar
                      </div>
                    )}
                  </div>
                  <div className='flex flex-col gap-2'>
                    <button
                      type='button'
                      disabled={isSaving}
                      onClick={() => avatarInputRef.current?.click()}
                      className='rounded-4xl border border-[#4aa391] bg-[#203731] px-3 py-1 text-sm font-semibold text-[#eef1f4] disabled:opacity-60'
                    >
                      Upload avatar
                    </button>
                    {hasAvatar ? (
                      <button
                        type='button'
                        disabled={isSaving}
                        onClick={clearAvatar}
                        className='rounded-4xl border border-[#3a414a] bg-transparent px-3 py-1 text-sm font-semibold text-[#9aa1ab] disabled:opacity-60'
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type='file'
                    accept='image/*'
                    className='hidden'
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void pickAvatar(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </div>

                <label className='mb-2 block text-xs font-semibold text-[#9aa1ab]'>
                  Display name
                </label>
                <input
                  value={displayName}
                  disabled={isSaving}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className='mb-4 w-full rounded-md border border-[#30353d] bg-[#0b0d0d] px-3 py-2 text-sm text-[#eef1f4] disabled:opacity-60'
                  placeholder='How others see you'
                />

                {error ? (
                  <p className='mb-3 text-sm font-bold text-[#ffb9b9]'>{error}</p>
                ) : null}

                <div className='flex gap-3'>
                  <button
                    onClick={save}
                    disabled={isSaving}
                    className='min-w-40 rounded-4xl border border-[#4aa391] bg-[#203731] px-4 py-2 font-extrabold text-[#eef1f4] disabled:opacity-60'
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>

                {savedAt ? (
                  <p className='mt-3 text-xs text-[#8b929b]'>
                    Last saved: {savedAt}
                  </p>
                ) : null}
              </section>
            ) : (
              <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6'>
                <h2 className='mb-4 text-lg font-bold text-[#f2f4f7]'>
                  Subscription
                </h2>

                {subscription.loading ? (
                  <p className='text-sm text-[#9aa1ab]'>Loading subscription...</p>
                ) : (
                  <>
                    <div className='mb-4 flex flex-wrap items-center gap-3'>
                      <span className='rounded-md border border-[#3b424b] bg-[#202329] px-3 py-1 text-sm font-extrabold uppercase text-[#cfd4da]'>
                        {subscription.isPro ? 'Pro' : 'Free'}
                      </span>
                      {subscription.data?.status ? (
                        <span className='text-sm text-[#9aa1ab]'>
                          Status: {subscription.data.status}
                        </span>
                      ) : null}
                    </div>

                    {subscription.error ? (
                      <p className='mb-3 text-sm font-bold text-[#ffb9b9]'>
                        {subscription.error}
                      </p>
                    ) : null}

                    <Link
                      href='/billing'
                      className='inline-block rounded-4xl border border-[#4aa391] bg-[#203731] px-4 py-2 font-extrabold text-[#eef1f4]'
                    >
                      Manage subscription
                    </Link>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function resizeImageToBlob(file: File, maxDimension: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Unable to encode image'));
          }
        },
        'image/jpeg',
        0.85,
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to load image'));
    };

    image.src = objectUrl;
  });
}
